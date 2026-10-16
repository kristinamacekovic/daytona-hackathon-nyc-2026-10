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
      "for u in https://pypi.org https://www.instagram.com https://www.tiktok.com https://www.w3schools.com https://github.com https://www.google.com; do printf '%s ' $u; curl -s -o /dev/null -m 10 -w '%{http_code}\\n' $u || echo FAIL; done",
      undefined, undefined, 300,
    );
    console.log(r.result);
  } finally {
    await sb.delete();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
