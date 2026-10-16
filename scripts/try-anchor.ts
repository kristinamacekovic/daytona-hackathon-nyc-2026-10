import { config } from "dotenv";
import { fetchWithAnchor } from "../src/lib/ingest-link";

config({ path: ".env.local" });

async function main() {
  const t0 = Date.now();
  const buf = await fetchWithAnchor(process.argv[2]);
  console.log(`anchor got ${buf.length} bytes in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
