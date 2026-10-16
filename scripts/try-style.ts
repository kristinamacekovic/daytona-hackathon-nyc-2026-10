import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { styleTag } from "../src/lib/style-tag";

config({ path: ".env.local" });

async function main() {
  console.log(await styleTag(await readFile(process.argv[2])));
}

main().catch((e) => { console.error(e); process.exit(1); });
