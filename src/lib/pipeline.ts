import { mkdir, writeFile, readFile, cp } from "node:fs/promises";
import path from "node:path";
import type { Analysis, Job, JobStatus, Option } from "./types";
import { withJobSandbox, uploadScripts, WORK } from "./sandbox";
import { sectionSlots, validateDuration } from "./timing";
import { styleTag, watchVideo } from "./style-tag";
import { recallBrandFacts } from "./memory";
import { runAnalyst } from "./analyst";
import { composeAll, LEAD_IN_MS } from "./composer";
import { runJudge, listenScores, combineScores } from "./judge";
import { updateJob, jobDir, DEMO_DIR } from "./store";
import { withJobContext, withSpan } from "./tracing";
import { isCompleteRun } from "./pipeline-rules";
import { isolateVoice } from "./voice";
import { muxFilter, parseMeanVolume, hasSpeech } from "./mix";

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
    await withJobContext(job, () => withSpan("pipeline", "CHAIN", { job: job.id, brand: job.brand }, () =>
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
        const [notes, videoNotes] = await Promise.all([styleTag(audio), watchVideo(video)]);
        analysis.style_tag = notes;
        const slots = sectionSlots(analysis);
        const [{ brief, plans }, voice] = await Promise.all([
          runAnalyst({ brand: job.brand, facts, analysis, slots, frames, videoNotes }),
          isolateVoice(audio),
        ]);
        let withVoice = false;
        if (voice) {
          await sb.upload(voice, `${WORK}/voice.mp3`);
          const stats = await sb.exec("ffmpeg -hide_banner -i voice.mp3 -af volumedetect -f null - 2>&1 | grep mean_volume || true", 60);
          withVoice = hasSpeech(parseMeanVolume(stats));
          console.log(`[pipeline] voice ${withVoice ? "kept" : "skipped"} (${stats.trim()})`);
        }
        await updateJob(job, { brief });

        await set("composing");
        const { tracks, errors } = await composeAll(plans);
        if (errors.length) console.error("[pipeline] compose errors", errors);
        if (tracks.length === 0) throw new Error(`Music generation failed: ${errors.map((e) => e.message).join("; ")}`);

        await set("muxing");
        for (const t of tracks) {
          await writeFile(path.join(dir, `track_${t.variant}.mp3`), t.audio);
          await sb.upload(t.audio, `${WORK}/track_${t.variant}.mp3`);
          const filter = muxFilter({ leadInS: LEAD_IN_MS / 1000, durationS: analysis.duration_ms / 1000, withVoice });
          await sb.exec(
            `bash mux.sh in.mp4 track_${t.variant}.mp3 out/preview_${t.variant}.mp4 '${filter}'${withVoice ? " voice.mp3" : ""}`,
            120,
          );
          await writeFile(path.join(dir, `preview_${t.variant}.mp4`), await sb.download(`${WORK}/out/preview_${t.variant}.mp4`));
        }

        await set("judging");
        const okPlans = plans.filter((p) => tracks.some((t) => t.variant === p.variant));
        const previews = await Promise.all(
          tracks.map(async (t) => ({ variant: t.variant, mp4: await readFile(path.join(dir, `preview_${t.variant}.mp4`)) })),
        );
        const [planScores, heard] = await Promise.all([
          runJudge({ brand: job.brand, facts, brief, plans: okPlans }),
          listenScores({ brief, previews }),
        ]);
        const scores = combineScores(planScores, heard);
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
    ));
  } catch (e) {
    console.error("[pipeline] failed", e);
    await updateJob(job, { status: "failed", failed_step: step, error: (e as Error).message });
  }
}
