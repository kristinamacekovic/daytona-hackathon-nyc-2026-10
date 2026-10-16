import type { Brief, Plan, Score, Variant } from "./types";
import { VARIANTS } from "./types";
import { extractJson } from "./json";
import { claudeText } from "./anthropic";
import { withSpan } from "./tracing";

export function parseJudgeOutput(text: string, variants: Variant[]): Score[] {
  let raw: { variant?: unknown; score?: unknown; rationale?: unknown }[] = [];
  try {
    const parsed = extractJson(text) as { scores?: unknown };
    if (Array.isArray(parsed.scores)) raw = parsed.scores;
  } catch {
    raw = [];
  }
  const ordered = VARIANTS.filter((v) => variants.includes(v));
  const scores: Score[] = ordered.map((variant) => {
    const r = raw.find((x) => x?.variant === variant);
    const n = typeof r?.score === "number" ? Math.min(10, Math.max(0, r.score)) : 0;
    return {
      variant,
      score: n,
      rationale: r ? (typeof r.rationale === "string" ? r.rationale : "") : "not scored",
      recommended: false,
    };
  });
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a), scores[0]);
  if (best) best.recommended = true;
  return scores;
}

export async function runJudge(args: { brand: string; facts: string[]; brief: Brief; plans: Plan[] }): Promise<Score[]> {
  return withSpan("judge", "EVALUATOR", args, async (span) => {
    const prompt = `You are judging replacement music plans for a brand video.

Brand: ${args.brand}
Brand facts (newer win):
${args.facts.length ? args.facts.map((f) => `- ${f}`).join("\n") : "- none"}

Brief: ${JSON.stringify(args.brief)}

Plans:
${args.plans.map((p) => JSON.stringify(p)).join("\n")}

Score each plan 0-10 for how well it fits the brief, the key moments, and the brand facts. Respect the avoid list strictly. One sentence of rationale each, written for the creator.
Reply with only JSON: {"scores":[{"variant":"faithful","score":0,"rationale":""}]}`;
    let text = "";
    try {
      text = await claudeText([{ type: "text", text: prompt }], 1500);
    } catch (e) {
      // Tracks are already paid for; show them unscored rather than failing the job.
      console.error("[judge] failed, returning unscored options", e);
    }
    const scores = parseJudgeOutput(text, args.plans.map((p) => p.variant));
    for (const s of scores) {
      span.setAttribute(`eval.music_fit.${s.variant}.score`, s.score);
      span.setAttribute(`eval.music_fit.${s.variant}.explanation`, s.rationale);
    }
    span.setAttribute("eval.music_fit.label", scores.find((s) => s.recommended)?.variant ?? "none");
    return scores;
  });
}

// Plan score (Claude, reads the plan) and listening score (Gemini, hears the preview) averaged.
export function combineScores(plan: Score[], listen: Score[] | null): Score[] {
  if (!listen) return plan;
  const combined = plan.map((p) => {
    const l = listen.find((x) => x.variant === p.variant);
    return l
      ? { ...p, score: Math.round(((p.score + l.score) / 2) * 10) / 10, rationale: l.rationale || p.rationale, recommended: false }
      : { ...p, recommended: false };
  });
  const best = combined.reduce((a, b) => (b.score > a.score ? b : a), combined[0]);
  if (best) best.recommended = true;
  return combined;
}

export async function listenScores(args: { brief: Brief; previews: { variant: Variant; mp4: Buffer }[] }): Promise<Score[] | null> {
  if (!process.env.GEMINI_API_KEY || args.previews.length === 0) return null;
  try {
    return await withSpan("judge.listen", "EVALUATOR", { brief: args.brief, variants: args.previews.map((p) => p.variant) }, async (span) => {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        contents: [
          ...args.previews.flatMap((p) => [
            { text: `Option "${p.variant}":` },
            { inlineData: { mimeType: "video/mp4", data: p.mp4.toString("base64") } },
          ]),
          {
            text:
              `You are a music supervisor. Watch and listen to each option: the same video with a different new music track. ` +
              `Brief: ${JSON.stringify(args.brief)}\n` +
              `Score each 0-10 on how good the music sounds (production, coherence, no awkward start or ending) and how well it fits ` +
              `the video's moments and any speech. One sentence each, written for the creator, about what you actually hear.\n` +
              `Reply with only JSON: {"scores":[{"variant":"faithful","score":0,"rationale":""}]}`,
          },
        ],
      });
      const scores = parseJudgeOutput(res.text ?? "", args.previews.map((p) => p.variant)).filter((s) => s.rationale !== "not scored");
      for (const s of scores) span.setAttribute(`eval.music_fit.${s.variant}.listen_score`, s.score);
      return scores.length ? scores : null;
    });
  } catch (e) {
    console.error("[judge] listening failed, using plan scores", e);
    return null;
  }
}
