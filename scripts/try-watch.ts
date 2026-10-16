import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { watchVideo } from "../src/lib/style-tag";

config({ path: ".env.local" });

async function main() {
  console.log((await watchVideo(await readFile(process.argv[2]))) || "(no notes)");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
