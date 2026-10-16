import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import type { Plan, Variant } from "./types";
import { withSpan } from "./tracing";

let client: ElevenLabsClient | null = null;
const el = () => (client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }));

const TIMEOUT_MS = 120_000;

export function toElevenPlan(plan: Plan): ElevenLabs.MusicPrompt {
  return {
    positiveGlobalStyles: [...plan.global_styles, "instrumental"],
    negativeGlobalStyles: [...plan.negative_styles, "vocals", "singing"],
    sections: plan.sections.map((s) => ({
      sectionName: s.name.slice(0, 100) || "Section",
      positiveLocalStyles: s.styles,
      negativeLocalStyles: [],
      durationMs: s.duration_ms,
      lines: [],
    })),
  };
}

async function toBuffer(audio: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const reader = audio.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function composeOne(plan: Plan): Promise<Buffer> {
  return withSpan(`composer.${plan.variant}`, "TOOL", toElevenPlan(plan), async () => {
    const audio = await Promise.race([
      el().music.compose({
        compositionPlan: toElevenPlan(plan),
        modelId: (process.env.ELEVENLABS_MODEL || "music_v2_5") as ElevenLabs.MusicModelId,
        outputFormat: "mp3_44100_128",
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("ElevenLabs timed out")), TIMEOUT_MS)),
    ]);
    const buf = await toBuffer(audio);
    if (buf.length < 1000) throw new Error("ElevenLabs returned empty audio");
    return buf;
  });
}

export async function composeAll(plans: Plan[]) {
  const settled = await Promise.allSettled(plans.map(composeOne));
  const tracks: { variant: Variant; audio: Buffer }[] = [];
  const errors: { variant: Variant; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") tracks.push({ variant: plans[i].variant, audio: r.value });
    else errors.push({ variant: plans[i].variant, message: (r.reason as Error).message });
  });
  return { tracks, errors };
}
