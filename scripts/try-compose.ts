import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { composeAll } from "../src/lib/composer";

config({ path: ".env.local" });

async function main() {
  const plan = {
    variant: "faithful" as const,
    global_styles: ["airy pop", "95 BPM"],
    negative_styles: [],
    sections: [
      { name: "Intro", duration_ms: 5000, styles: ["soft pads"] },
      { name: "Lift", duration_ms: 5000, styles: ["drums enter"] },
    ],
  };
  const { tracks, errors } = await composeAll([plan]);
  console.log({ ok: tracks.length, errors });
  if (tracks[0]) await writeFile("try.mp3", tracks[0].audio);
}

main().catch((e) => { console.error(e); process.exit(1); });
