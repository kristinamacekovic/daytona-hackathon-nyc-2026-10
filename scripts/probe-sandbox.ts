import { config } from "dotenv";
import { Daytona } from "@daytona/sdk";

config({ path: ".env.local" });

async function main() {
  const d = new Daytona({ apiKey: process.env.DAYTONA_API_KEY, apiUrl: "https://app.daytona.io/api" , target: process.env.T || undefined });
  const t0 = Date.now();
  const sb = await d.create({ language: "python" });
  console.log(`created in ${Math.round((Date.now() - t0) / 1000)}s`);
  try {
    const r = await sb.process.executeCommand(
      "start=$(date +%s); pip install -q librosa soundfile 2>&1 | tail -3; python3 -c 'import librosa; print(\"librosa\", librosa.__version__)' 2>&1 | tail -1; echo took $(( $(date +%s) - start ))s",
      undefined, undefined, 300,
    );
    console.log(r.result);
  } finally {
    await sb.delete();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
