import { mkdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import type { Analysis, Job, JobStatus, Option } from "./types";
import { withJobSandbox, uploadScripts, WORK } from "./sandbox";
import { sectionSlots, validateDuration } from "./timing";
import { styleTag } from "./style-tag";
import { recallBrandFacts } from "./memory";
import { runAnalyst } from "./analyst";
import { composeAll, LEAD_IN_MS } from "./composer";
import { runJudge } from "./judge";
import { updateJob, jobDir, DEMO_DIR } from "./store";
import { withSpan } from "./tracing";
import { isCompleteRun } from "./pipeline-rules";

export async function runPipeline(job: Job, video: Buffer): Promise<void> {
  const dir = jobDir(job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "in.mp4"), video);
  let step: JobStatus = "analyzing";
  const set = async (s: JobStatus) => {
    step = s;
    await updateJob(job, { status: s });
  };

  try {
    await withSpan("pipeline", "CHAIN", { job: job.id, brand: job.brand }, () =>
      withJobSandbox(async (sb) => {
        await set("analyzing");
        await uploadScripts(sb);
        await sb.upload(video, `${WORK}/in.mp4`);
        await withSpan("sandbox.analyze", "TOOL", { bytes: video.length }, () => sb.exec("python analyze.py in.mp4 out", 300));
        const analysis = JSON.parse((await sb.download(`${WORK}/out/analysis.json`)).toString()) as Analysis;
        const tooLong = validateDuration(analysis.duration_ms);
        if (tooLong) throw new Error(tooLong);

        const [frames, audio, facts] = await Promise.all([
          Promise.all(analysis.keyframes.map((k) => sb.download(`${WORK}/out/${k}`))),
          sb.download(`${WORK}/out/audio.mp3`).catch(() => null),
          recallBrandFacts(job.brand),
        ]);
        analysis.style_tag = await styleTag(audio);
        const slots = sectionSlots(analysis);
        const { brief, plans } = await runAnalyst({ brand: job.brand, facts, analysis, slots, frames });
        await updateJob(job, { brief });

        await set("composing");
        const { tracks, errors } = await composeAll(plans);
        if (errors.length) console.error("[pipeline] compose errors", errors);
        if (tracks.length === 0) throw new Error(`Music generation failed: ${errors.map((e) => e.message).join("; ")}`);

        await set("muxing");
        for (const t of tracks) {
          await writeFile(path.join(dir, `track_${t.variant}.mp3`), t.audio);
          await sb.upload(t.audio, `${WORK}/track_${t.variant}.mp3`);
          const lead = (LEAD_IN_MS / 1000).toFixed(3);
          const dur = (analysis.duration_ms / 1000).toFixed(3);
          await sb.exec(`bash mux.sh in.mp4 track_${t.variant}.mp3 out/preview_${t.variant}.mp4 ${lead} ${dur}`, 120);
          await writeFile(path.join(dir, `preview_${t.variant}.mp4`), await sb.download(`${WORK}/out/preview_${t.variant}.mp4`));
        }

        await set("judging");
        const okPlans = plans.filter((p) => tracks.some((t) => t.variant === p.variant));
        const scores = await runJudge({ brand: job.brand, facts, brief, plans: okPlans });
        const options: Option[] = scores.map((s) => ({
          ...s,
          plan: okPlans.find((p) => p.variant === s.variant)!,
          preview_url: `/api/jobs/${job.id}/preview/${s.variant}`,
        }));
        await updateJob(job, { options, status: "ready" });
        if (isCompleteRun(options.length)) {
          await cp(dir, path.join(DEMO_DIR, "latest"), { recursive: true }).catch(() => {});
        }
      }),
    );
  } catch (e) {
    console.error("[pipeline] failed", e);
    await updateJob(job, { status: "failed", failed_step: step, error: (e as Error).message });
  }
}
