// Smoke test without a local clip: generate a 20s video with 3 scene cuts and a beat inside the sandbox.
import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { withJobSandbox, uploadScripts, WORK } from "../src/lib/sandbox";

config({ path: ".env.local" });

const GEN =
  "ffmpeg -y -hide_banner -loglevel error " +
  "-f lavfi -i color=c=red:s=640x360:d=6 -f lavfi -i color=c=blue:s=640x360:d=5 " +
  "-f lavfi -i color=c=green:s=640x360:d=5 -f lavfi -i color=c=yellow:s=640x360:d=4 " +
  "-f lavfi -i \"aevalsrc='0.6*sin(2*PI*220*t)*exp(-8*mod(t,0.5))':d=20\" " +
  "-filter_complex \"[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[v]\" -map \"[v]\" -map 4:a -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest in.mp4";

async function main() {
  const t0 = Date.now();
  await withJobSandbox(async (sb) => {
    console.log(`sandbox ready in ${Math.round((Date.now() - t0) / 1000)}s`);
    await uploadScripts(sb);
    await sb.exec(GEN, 120);
    console.log(await sb.exec("python analyze.py in.mp4 out", 300));
    await writeFile("samples-smoke.mp3", await sb.download(`${WORK}/out/audio.mp3`));
    await mkdir("samples", { recursive: true });
    await writeFile("samples/synthetic.mp4", await sb.download(`${WORK}/in.mp4`));
    await sb.exec("cp out/audio.mp3 track.mp3 && bash mux.sh in.mp4 track.mp3 out/preview.mp4 0 20", 120);
    const prev = await sb.download(`${WORK}/out/preview.mp4`);
    console.log(`mux ok, preview ${prev.length} bytes`);
  });
  console.log(`total ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
