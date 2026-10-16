import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import type { Plan, Variant } from "./types";
import { withSpan } from "./tracing";

let client: ElevenLabsClient | null = null;
const el = () => (client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }));

const TIMEOUT_MS = 120_000;

// music_v2 / music_v2_5 take a chunk-based plan: each chunk carries its own styles and exact duration.
// Global styles go on every chunk (the first chunk sets the genre), section styles add the change at each cut.
export function toElevenPlan(plan: Plan): ElevenLabs.CompositionPlan {
  const global = [...plan.global_styles, "instrumental", "great production quality"];
  const negative = [...plan.negative_styles, "vocals", "singing"];
  return {
    chunks: plan.sections.map((s) => ({
      text: `[${s.name.slice(0, 100) || "Section"}]`,
      durationMs: s.duration_ms,
      positiveStyles: [...global, ...s.styles],
      negativeStyles: negative,
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
