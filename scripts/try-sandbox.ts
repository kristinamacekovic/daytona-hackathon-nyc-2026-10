import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { withJobSandbox, uploadScripts, WORK } from "../src/lib/sandbox";

config({ path: ".env.local" });

async function main() {
  const [video, track] = process.argv.slice(2);
  if (!video) throw new Error("usage: npx tsx scripts/try-sandbox.ts clip.mp4 [track.mp3]");
  await withJobSandbox(async (sb) => {
    await uploadScripts(sb);
    await sb.upload(await readFile(video), `${WORK}/in.mp4`);
    console.log(await sb.exec("python analyze.py in.mp4 out", 300));
    if (track) {
      await sb.upload(await readFile(track), `${WORK}/track.mp3`);
      await sb.exec("bash mux.sh in.mp4 track.mp3 out/preview.mp4 '[1:a]anull[a]'", 120);
      await writeFile("preview.mp4", await sb.download(`${WORK}/out/preview.mp4`));
      console.log("wrote preview.mp4");
    }
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
