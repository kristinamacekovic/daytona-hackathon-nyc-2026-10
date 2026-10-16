import { config } from "dotenv";
import { fetchVideoFromLink } from "../src/lib/ingest-link";

config({ path: ".env.local" });

async function main() {
  const t0 = Date.now();
  const buf = await fetchVideoFromLink(process.argv[2]);
  console.log(`got ${buf.length} bytes in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
