import { describe, it, expect } from "vitest";
import { parseAnalystOutput, analystPrompt } from "@/lib/analyst";
import type { Analysis, SectionSlot } from "@/lib/types";

const slots: SectionSlot[] = [
  { start_ms: 0, duration_ms: 6000 },
  { start_ms: 6000, duration_ms: 9000 },
];

const good = {
  brief: { summary: "skincare routine", mood: "calm", avoid: ["trap"], key_moments: [{ at_ms: 6000, why: "product reveal" }] },
  plans: ["faithful", "brand", "wildcard"].map((v) => ({
    variant: v,
    global_styles: ["airy pop", "95 BPM"],
    negative_styles: ["heavy bass"],
    sections: [{ name: "Intro", styles: ["soft pads"] }, { name: "Reveal", styles: ["lift"] }],
  })),
};

describe("parseAnalystOutput", () => {
  it("parses fenced JSON and takes durations from slots, not the model", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```";
    const { brief, plans } = parseAnalystOutput(text, slots, 15000);
    expect(brief.mood).toBe("calm");
    expect(plans.map((p) => p.variant)).toEqual(["faithful", "brand", "wildcard"]);
    expect(plans[0].sections).toEqual([
      { name: "Intro", duration_ms: 6000, styles: ["soft pads"] },
      { name: "Reveal", duration_ms: 9000, styles: ["lift"] },
    ]);
  });

  it("fills missing sections when the model returns too few", () => {
    const short = structuredClone(good);
    short.plans[1].sections = [{ name: "Only", styles: [] }];
    const { plans } = parseAnalystOutput(JSON.stringify(short), slots, 15000);
    expect(plans[1].sections.map((s) => s.name)).toEqual(["Only", "Part 2"]);
    expect(plans[1].sections.reduce((n, s) => n + s.duration_ms, 0)).toBe(15000);
  });

  it("ignores extra sections beyond the slots", () => {
    const long = structuredClone(good);
    long.plans[2].sections.push({ name: "Extra", styles: [] });
    const { plans } = parseAnalystOutput(JSON.stringify(long), slots, 15000);
    expect(plans[2].sections).toHaveLength(2);
  });

  it("throws when a variant is missing", () => {
    const missing = structuredClone(good);
    missing.plans = missing.plans.slice(0, 2);
    expect(() => parseAnalystOutput(JSON.stringify(missing), slots, 15000)).toThrow(/wildcard/);
  });

  it("defaults brief fields that are missing", () => {
    const noBrief = { ...good, brief: {} };
    const { brief } = parseAnalystOutput(JSON.stringify(noBrief), slots, 15000);
    expect(brief).toEqual({ summary: "", mood: "", avoid: [], key_moments: [] });
  });
});

describe("analystPrompt viewing notes", () => {
  const analysis: Analysis = {
    duration_ms: 15000, bpm: 90, beats_ms: [], scene_cuts_ms: [6000], energy_peaks_ms: [],
    style_tag: "trap", keyframes: [],
  };
  it("includes Gemini's full-video viewing notes when present", () => {
    const p = analystPrompt({ brand: "Jira", facts: [], analysis, slots, videoNotes: "0:06 she waves; says 'anyone?'" });
    expect(p).toContain("0:06 she waves; says 'anyone?'");
  });
  it("says so when there are no viewing notes", () => {
    expect(analystPrompt({ brand: "Jira", facts: [], analysis, slots })).toContain("viewing notes: none");
  });
});

describe("analystPrompt", () => {
  it("uses fallback BPM and lists every slot", () => {
    const analysis: Analysis = {
      duration_ms: 15000, bpm: 0, beats_ms: [], scene_cuts_ms: [6000], energy_peaks_ms: [],
      style_tag: "unknown", keyframes: [],
    };
    const p = analystPrompt({ brand: "Glossier", facts: [], analysis, slots });
    expect(p).toContain("100 BPM");
    expect(p).toContain("1. starts 0ms, lasts 6000ms");
    expect(p).toContain("2. starts 6000ms, lasts 9000ms");
    expect(p).toContain("exactly 2 sections");
  });
});
