import { NextResponse } from "next/server";
import { readFile, cp } from "node:fs/promises";
import path from "node:path";
import { createJob, updateJob, jobDir, DEMO_DIR } from "@/lib/store";
import { addBrand } from "@/lib/brands";
import { runPipeline } from "@/lib/pipeline";
import type { Job } from "@/lib/types";

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const brand = String(form.get("brand") ?? "").trim();
  if (!brand) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });

  if (form.get("demo") === "1") {
    const job = createJob(brand);
    try {
      const saved = JSON.parse(await readFile(path.join(DEMO_DIR, "latest", "job.json"), "utf8")) as Job;
      await cp(path.join(DEMO_DIR, "latest"), jobDir(job.id), { recursive: true });
      const options = saved.options.map((o) => ({ ...o, preview_url: `/api/jobs/${job.id}/preview/${o.variant}` }));
      await updateJob(job, { ...saved, id: job.id, options, picked: undefined });
      return NextResponse.json({ id: job.id });
    } catch {
      return NextResponse.json({ error: "No cached demo yet. Run one real job first." }, { status: 404 });
    }
  }

  await addBrand(brand);
  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  let video: Buffer;

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("video/")) return NextResponse.json({ error: "That file isn't a video." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Video is over 100MB." }, { status: 400 });
    video = Buffer.from(await file.arrayBuffer());
  } else if (url) {
    try {
      const { fetchVideoFromLink } = await import("@/lib/ingest-link");
      video = await fetchVideoFromLink(url);
    } catch (e) {
      return NextResponse.json({ error: `Couldn't fetch that link (${(e as Error).message}). Upload the file instead.` }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Upload a video or paste a link." }, { status: 400 });
  }

  const job = createJob(brand);
  void runPipeline(job, video);
  return NextResponse.json({ id: job.id });
}
