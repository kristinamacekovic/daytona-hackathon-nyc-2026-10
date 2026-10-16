import { describe, it, expect } from "vitest";
import { sectionSlots, normalizePlan, validateDuration, effectiveBpm } from "@/lib/timing";
import type { Plan } from "@/lib/types";

const sum = (xs: { duration_ms: number }[]) => xs.reduce((n, x) => n + x.duration_ms, 0);

describe("sectionSlots", () => {
  it("splits at scene cuts and peaks, merged and sorted", () => {
    const slots = sectionSlots({ duration_ms: 20000, scene_cuts_ms: [12000, 5000], energy_peaks_ms: [8000] });
    expect(slots).toEqual([
      { start_ms: 0, duration_ms: 5000 },
      { start_ms: 5000, duration_ms: 3000 },
      { start_ms: 8000, duration_ms: 4000 },
      { start_ms: 12000, duration_ms: 8000 },
    ]);
  });
  it("drops boundaries closer than 3s to the previous one or to the end", () => {
    const slots = sectionSlots({ duration_ms: 15000, scene_cuts_ms: [1000, 4000, 5500, 13000], energy_peaks_ms: [] });
    expect(slots.map((s) => s.start_ms)).toEqual([0, 4000]);
    expect(sum(slots)).toBe(15000);
  });
  it("returns one full-length section when there are no cuts or peaks (silent/static clip)", () => {
    expect(sectionSlots({ duration_ms: 9000, scene_cuts_ms: [], energy_peaks_ms: [] })).toEqual([
      { start_ms: 0, duration_ms: 9000 },
    ]);
  });
  it("ignores out-of-range and duplicate boundaries", () => {
    const slots = sectionSlots({ duration_ms: 10000, scene_cuts_ms: [-5, 0, 5000, 5000, 10000, 12000], energy_peaks_ms: [5000] });
    expect(slots).toEqual([
      { start_ms: 0, duration_ms: 5000 },
      { start_ms: 5000, duration_ms: 5000 },
    ]);
  });
  it("rounds fractional input and always sums to duration", () => {
    const slots = sectionSlots({ duration_ms: 17333.6, scene_cuts_ms: [6100.4], energy_peaks_ms: [11999.5] });
    expect(sum(slots)).toBe(17334);
    expect(slots.every((s) => s.duration_ms >= 3000)).toBe(true);
  });
});

const plan = (durations: number[]): Plan => ({
  variant: "faithful",
  global_styles: ["lofi"],
  negative_styles: [],
  sections: durations.map((d, i) => ({ name: `S${i}`, duration_ms: d, styles: [] })),
});

describe("normalizePlan", () => {
  it("leaves a correct plan unchanged", () => {
    expect(normalizePlan(plan([5000, 5000]), 10000).sections.map((s) => s.duration_ms)).toEqual([5000, 5000]);
  });
  it("rescales to the video duration exactly", () => {
    const p = normalizePlan(plan([4000, 4000, 4000]), 15000);
    expect(sum(p.sections)).toBe(15000);
  });
  it("merges sections that end up under 3s", () => {
    const p = normalizePlan(plan([9000, 1000]), 10000);
    expect(p.sections).toHaveLength(1);
    expect(p.sections[0].duration_ms).toBe(10000);
  });
  it("creates one section when the plan has none", () => {
    const p = normalizePlan(plan([]), 8000);
    expect(p.sections).toEqual([{ name: "Main", duration_ms: 8000, styles: [] }]);
  });
});

describe("validateDuration", () => {
  it("rejects clips shorter than 3s or longer than 90s", () => {
    expect(validateDuration(2500)).toMatch(/at least 3 seconds/);
    expect(validateDuration(91000)).toMatch(/90 seconds or shorter/);
  });
  it("accepts 3s to 90s", () => {
    expect(validateDuration(3000)).toBeNull();
    expect(validateDuration(90000)).toBeNull();
  });
});

describe("effectiveBpm", () => {
  it("falls back when librosa finds no tempo", () => {
    expect(effectiveBpm(0)).toBe(100);
    expect(effectiveBpm(NaN)).toBe(100);
    expect(effectiveBpm(123.4)).toBe(123);
  });
});
