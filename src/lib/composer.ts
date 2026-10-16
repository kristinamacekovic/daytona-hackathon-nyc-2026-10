import { ElevenLabsClient, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import type { Plan, Variant } from "./types";
import { withSpan } from "./tracing";

let client: ElevenLabsClient | null = null;
const el = () => (client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }));

const TIMEOUT_MS = () => Number(process.env.ELEVENLABS_TIMEOUT_MS) || 120_000;

// Extra music before and after the clip, trimmed off at mux: the track is already in its
// groove at frame 0 and ends on a resolve instead of stopping mid-phrase.
export const LEAD_IN_MS = 4000;
export const TAIL_MS = 3000;

// music_v2 / music_v2_5 take a chunk-based plan: each chunk carries its own styles and exact duration.
// Global styles go on every chunk (the first chunk sets the genre), section styles add the change at each cut.
export function toElevenPlan(plan: Plan): { chunks: ElevenLabs.GenerationChunkInput[] } {
  const global = [...plan.global_styles, "instrumental", "great production quality"];
  const negative = [...plan.negative_styles, "vocals", "singing"];
  const first = plan.sections[0]?.styles ?? [];
  const last = plan.sections.at(-1)?.styles ?? [];
  return {
    chunks: [
      { text: "[Intro]", durationMs: LEAD_IN_MS, positiveStyles: [...global, ...first, "intro", "establishing groove"], negativeStyles: negative },
      ...plan.sections.map((s) => ({
        text: `[${s.name.slice(0, 100) || "Section"}]`,
        durationMs: s.duration_ms,
        positiveStyles: [...global, ...s.styles],
        negativeStyles: negative,
      })),
      { text: "[Outro]", durationMs: TAIL_MS, positiveStyles: [...global, ...last, "outro", "resolving ending"], negativeStyles: negative },
    ],
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
    // The timeout must cover the body too: the SDK stops timing once headers arrive.
    const signal = AbortSignal.timeout(TIMEOUT_MS());
    const buf = await Promise.race([
      (async () =>
        toBuffer(
          await el().music.compose(
            {
              compositionPlan: toElevenPlan(plan),
              modelId: (process.env.ELEVENLABS_MODEL || "music_v2_5") as ElevenLabs.MusicModelId,
              outputFormat: "mp3_44100_128",
            },
            { abortSignal: signal },
          ),
        ))(),
      new Promise<never>((_, rej) => signal.addEventListener("abort", () => rej(new Error("ElevenLabs timed out")))),
    ]);
    if (buf.length < 1000) throw new Error("ElevenLabs returned empty audio");
    return buf;
  });
}

const CONCURRENCY = Number(process.env.ELEVENLABS_CONCURRENCY) || 2; // Creator plan allows 2 at once

async function composeWithRetry(plan: Plan): Promise<Buffer> {
  try {
    return await composeOne(plan);
  } catch (e) {
    if (!String((e as Error).message).includes("429")) throw e;
    await new Promise((r) => setTimeout(r, 4000));
    return composeOne(plan);
  }
}

export async function composeAll(plans: Plan[]) {
  const settled: PromiseSettledResult<Buffer>[] = new Array(plans.length);
  let next = 0;
  const worker = async () => {
    while (next < plans.length) {
      const i = next++;
      settled[i] = await composeWithRetry(plans[i]).then(
        (value) => ({ status: "fulfilled", value }) as const,
        (reason) => ({ status: "rejected", reason }) as const,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, plans.length) }, worker));
  const tracks: { variant: Variant; audio: Buffer }[] = [];
  const errors: { variant: Variant; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") tracks.push({ variant: plans[i].variant, audio: r.value });
    else errors.push({ variant: plans[i].variant, message: (r.reason as Error).message });
  });
  return { tracks, errors };
}
