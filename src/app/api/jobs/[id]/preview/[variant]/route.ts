import { stat, open } from "node:fs/promises";
import path from "node:path";
import { jobDir } from "@/lib/store";
import { VARIANTS, type Variant } from "@/lib/types";


export async function GET(req: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params;
  if (!VARIANTS.includes(variant as Variant)) return new Response("not found", { status: 404 });
  const file = path.join(jobDir(id), `preview_${variant}.mp4`);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("not found", { status: 404 });
  }

  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
  if (new URL(req.url).searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="music-swap-${variant}.mp4"`;
  }

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const start = range?.[1] ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const fh = await open(file);
  const buf = Buffer.alloc(end - start + 1);
  await fh.read(buf, 0, buf.length, start);
  await fh.close();

  if (range) {
    return new Response(buf, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(buf.length) },
    });
  }
  return new Response(buf, { headers: { ...headers, "Content-Length": String(size) } });
}
