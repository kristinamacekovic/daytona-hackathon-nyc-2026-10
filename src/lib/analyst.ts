import type { Analysis, Brief, Plan, SectionSlot, Variant } from "./types";
import { VARIANTS } from "./types";
import { extractJson } from "./json";
import { effectiveBpm, normalizePlan } from "./timing";
import { claudeText } from "./anthropic";
import { withSpan } from "./tracing";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function analystPrompt({ brand, facts, analysis, slots, videoNotes }: {
  brand: string; facts: string[]; analysis: Analysis; slots: SectionSlot[]; videoNotes?: string;
}): string {
  return `You are a music supervisor replacing copyrighted music in a short brand video with new, original, instrumental music.

Brand: ${brand}
What we know about this brand's music preferences (newer facts win):
${facts.length ? facts.map((f) => `- ${f}`).join("\n") : "- nothing yet"}

Measured video analysis:
- duration: ${analysis.duration_ms}ms
- original track tempo: ${effectiveBpm(analysis.bpm)} BPM
- original track, producer's listening notes:
${analysis.style_tag}
- scene cuts (ms): ${analysis.scene_cuts_ms.join(", ") || "none"}
- energy peaks (ms): ${analysis.energy_peaks_ms.join(", ") || "none"}
The attached images are keyframes in chronological order.

A viewer watched the full video with sound (motion, pacing, what is said, comedic or emotional beats):
${videoNotes?.trim() ? videoNotes.trim() : "viewing notes: none"}

The music must change at these fixed section boundaries:
${slots.map((s, i) => `${i + 1}. starts ${s.start_ms}ms, lasts ${s.duration_ms}ms`).join("\n")}

Write:
1. A brief: what the content is, the mood the music should carry, things to avoid, and the key moments.
2. Three music plans, one per variant:
   - "faithful": rebuilds the original track's feel from the listening notes (groove, bass, instrument palette, energy arc, tempo) as a new composition: never its melody, hook or lyrics
   - "brand": follows the brand's preferences above
   - "wildcard": a deliberate creative contrast that still respects the timing and the brand's avoid list
   Each plan has global_styles (genre, instruments, BPM, mood; 3-8 short tags), negative_styles, and exactly ${slots.length} sections in the order above, each with a short name and 2-5 style tags for how the music changes there.

Reply with only JSON in this shape:
{"brief":{"summary":"","mood":"","avoid":[],"key_moments":[{"at_ms":0,"why":""}]},
 "plans":[{"variant":"faithful","global_styles":[],"negative_styles":[],"sections":[{"name":"","styles":[]}]}]}`;
}

export function parseAnalystOutput(text: string, slots: SectionSlot[], duration_ms: number): { brief: Brief; plans: Plan[] } {
  const raw = extractJson(text) as { brief?: Record<string, unknown>; plans?: Record<string, unknown>[] };
  const b = raw.brief ?? {};
  const brief: Brief = {
    summary: str(b.summary),
    mood: str(b.mood),
    avoid: strs(b.avoid),
    key_moments: Array.isArray(b.key_moments)
      ? (b.key_moments as Record<string, unknown>[])
          .filter((m) => typeof m?.at_ms === "number")
          .map((m) => ({ at_ms: m.at_ms as number, why: str(m.why) }))
      : [],
  };

  const plans = VARIANTS.map((variant: Variant) => {
    const p = (raw.plans ?? []).find((x) => x?.variant === variant);
    if (!p) throw new Error(`analyst output missing plan for variant "${variant}"`);
    const secs = Array.isArray(p.sections) ? (p.sections as Record<string, unknown>[]) : [];
    const plan: Plan = {
      variant,
      global_styles: strs(p.global_styles),
      negative_styles: strs(p.negative_styles),
      sections: slots.map((slot, i) => ({
        name: str(secs[i]?.name) || `Part ${i + 1}`,
        duration_ms: slot.duration_ms,
        styles: strs(secs[i]?.styles),
      })),
    };
    return normalizePlan(plan, duration_ms);
  });

  return { brief, plans };
}

export async function runAnalyst(args: {
  brand: string; facts: string[]; analysis: Analysis; slots: SectionSlot[]; frames: Buffer[]; videoNotes?: string;
}): Promise<{ brief: Brief; plans: Plan[] }> {
  return withSpan("analyst", "CHAIN", { brand: args.brand, facts: args.facts, slots: args.slots }, async () => {
    const content = [
      ...args.frames.map((f) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.toString("base64") },
      })),
      { type: "text" as const, text: analystPrompt(args) },
    ];
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await claudeText(content);
      try {
        return parseAnalystOutput(text, args.slots, args.analysis.duration_ms);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`analyst returned unusable output: ${(lastErr as Error).message}`);
  });
}
