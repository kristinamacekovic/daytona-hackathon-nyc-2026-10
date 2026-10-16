// One-off check: will ElevenLabs accept the original reel audio as a conditioning reference?
import { config } from "dotenv";
import { createReadStream } from "node:fs";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

config({ path: ".env.local" });

async function main() {
  const el = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  const r = await el.music.upload({ file: createReadStream(process.argv[2]) });
  console.log("ACCEPTED songId:", r.songId);
}

main().catch((e) => { console.error("REJECTED:", e.statusCode ?? "", JSON.stringify(e.body ?? e.message).slice(0, 400)); process.exit(1); });
