import { config } from "dotenv";
import { claudeText, MODEL } from "../src/lib/anthropic";

config({ path: ".env.local" });

async function main() {
  console.log(MODEL(), "→", await claudeText([{ type: "text", text: "Reply with exactly: ok" }], 10));
}

main().catch((e) => { console.error(e.status ?? "", e.message); process.exit(1); });
