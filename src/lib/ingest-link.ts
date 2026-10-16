import { client, Sessions } from "anchorbrowser";
import { chromium } from "playwright-core";
import { withSpan } from "./tracing";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const MAX_BYTES = 100 * 1024 * 1024;
const run = promisify(execFile);

export function ytDlpArgs(url: string, out: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("not a valid link");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("not a valid link");
  // Single-file mp4 with audio: no local ffmpeg needed to merge streams.
  return ["yt-dlp", "-q", "--no-playlist", "--max-filesize", "100M", "-f", "b[ext=mp4]/b", "-o", out, "--", url];
}

// Walks the top-level MP4 boxes. A truncated or partial capture (a range chunk, an aborted
// stream, a bare DASH segment) either runs past the end or lacks moov/mdat, and ffprobe rejects it.
export function isCompleteMp4(buf: Buffer): boolean {
  const seen = new Set<string>();
  let off = 0;
  while (off < buf.length) {
    if (off + 8 > buf.length) return false;
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    if (size === 1) {
      if (off + 16 > buf.length) return false;
      size = Number(buf.readBigUInt64BE(off + 8));
    } else if (size === 0) {
      size = buf.length - off;
    }
    if (size < 8 || off + size > buf.length) return false;
    seen.add(type);
    off += size;
  }
  return seen.has("ftyp") && seen.has("moov") && (seen.has("mdat") || seen.has("moof"));
}

// Anchor first when configured; otherwise (or if it fails) yt-dlp on the app server.
// Not in the Daytona sandbox: its egress allowlist blocks Instagram/TikTok on this plan.
export async function fetchVideoFromLink(url: string): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "music-swap-"));
  const out = path.join(dir, "link.mp4");
  const args = ytDlpArgs(url, out);
  if (process.env.ANCHOR_API_KEY) {
    try {
      const buf = await fetchWithAnchor(url);
      if (isCompleteMp4(buf)) return buf;
      console.error(`[ingest] Anchor returned an incomplete video (${buf.length} bytes), falling back to yt-dlp`);
    } catch (e) {
      console.error("[ingest] Anchor failed, falling back to yt-dlp", e);
    }
  }
  try {
    return await withSpan("ingest.ytdlp", "TOOL", { url }, async () => {
      try {
        await run("uvx", args, { timeout: 120_000 });
      } catch (e) {
        console.error("[ingest] yt-dlp failed", e);
        throw new Error("couldn't download that video, it may be private or blocked");
      }
      const buf = await readFile(out);
      if (!isCompleteMp4(buf)) throw new Error("the downloaded video is incomplete or not an mp4");
      return buf;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function fetchWithAnchor(url: string): Promise<Buffer> {
  return withSpan("ingest.anchor", "TOOL", { url }, async () => {
    client.setConfig({ auth: () => process.env.ANCHOR_API_KEY! });
    const session = await Sessions.createSession();
    const cdp = session.data?.cdp_url;
    if (!cdp) throw new Error("Anchor session did not return a CDP URL");
    const browser = await chromium.connectOverCDP(cdp);
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page = context.pages()[0] ?? (await context.newPage());

      // Collect video responses while the page loads and autoplays.
      const videos: Buffer[] = [];
      page.on("response", async (res) => {
        const type = res.headers()["content-type"] ?? "";
        if (!type.startsWith("video/") || res.status() !== 200) return;
        try {
          const body = await res.body();
          if (body.length > 50_000 && body.length < MAX_BYTES) videos.push(body);
        } catch {}
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(6_000);

      if (videos.length === 0) {
        // Fallback: fetch the <video> src from inside the page (works for direct http(s) sources).
        const b64 = await page.evaluate(async () => {
          const src = document.querySelector("video")?.currentSrc || document.querySelector("video source")?.getAttribute("src");
          if (!src || src.startsWith("blob:")) return null;
          const buf = await (await fetch(src)).arrayBuffer();
          let s = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        });
        if (b64) videos.push(Buffer.from(b64, "base64"));
      }

      // Prefer a complete file over a bigger partial one.
      const complete = videos.filter(isCompleteMp4);
      const pool = complete.length > 0 ? complete : videos;
      if (pool.length === 0) throw new Error("no downloadable video found on that page");
      return pool.sort((a, b) => b.length - a.length)[0];
    } finally {
      await browser.close().catch(() => {});
    }
  });
}
