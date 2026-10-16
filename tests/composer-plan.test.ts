import { describe, it, expect, vi } from "vitest";
import type { Plan } from "@/lib/types";

vi.mock("@elevenlabs/elevenlabs-js", () => ({ ElevenLabsClient: class {} }));

const planWith = (durations: number[]): Plan => ({
  variant: "brand",
  global_styles: ["airy pop", "95 BPM"],
  negative_styles: ["trap"],
  sections: durations.map((d, i) => ({ name: `S${i}`, duration_ms: d, styles: [`style${i}`] })),
});

describe("toElevenPlan", () => {
  it("wraps sections with a lead-in and tail chunk", async () => {
    const { toElevenPlan, LEAD_IN_MS, TAIL_MS } = await import("@/lib/composer");
    const p = toElevenPlan(planWith([5944, 4688]));
    expect(p.chunks.map((c) => c.durationMs)).toEqual([LEAD_IN_MS, 5944, 4688, TAIL_MS]);
    expect(LEAD_IN_MS).toBeGreaterThanOrEqual(3000);
    expect(TAIL_MS).toBeGreaterThanOrEqual(3000);
  });

  it("intro carries the first section's feel, outro the last section's", async () => {
    const { toElevenPlan } = await import("@/lib/composer");
    const p = toElevenPlan(planWith([5944, 4688]));
    expect(p.chunks[0].text).toBe("[Intro]");
    expect(p.chunks[0].positiveStyles).toEqual(expect.arrayContaining(["airy pop", "style0"]));
    expect(p.chunks.at(-1)!.text).toBe("[Outro]");
    expect(p.chunks.at(-1)!.positiveStyles).toEqual(expect.arrayContaining(["airy pop", "style1"]));
  });

  it("keeps cut-aligned boundaries once the lead-in is trimmed", async () => {
    const { toElevenPlan, LEAD_IN_MS } = await import("@/lib/composer");
    const p = toElevenPlan(planWith([5944, 4688]));
    const starts: number[] = [];
    p.chunks.reduce((t, c) => (starts.push(t), t + c.durationMs), 0);
    expect(starts.slice(1, 3).map((s) => s - LEAD_IN_MS)).toEqual([0, 5944]);
  });
});
