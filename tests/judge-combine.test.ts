import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({ claudeText: async () => "" }));
import { combineScores } from "@/lib/judge";
import type { Score } from "@/lib/types";

const plan: Score[] = [
  { variant: "faithful", score: 9, rationale: "plan says faithful", recommended: true },
  { variant: "brand", score: 6, rationale: "plan says brand", recommended: false },
  { variant: "wildcard", score: 5, rationale: "plan says wildcard", recommended: false },
];

describe("combineScores", () => {
  it("averages plan and listening scores and re-picks the recommendation", () => {
    const listen: Score[] = [
      { variant: "faithful", score: 3, rationale: "sounds muddy", recommended: false },
      { variant: "brand", score: 10, rationale: "sounds great", recommended: true },
      { variant: "wildcard", score: 5, rationale: "ok", recommended: false },
    ];
    const s = combineScores(plan, listen);
    expect(s.map((x) => x.score)).toEqual([6, 8, 5]);
    expect(s.find((x) => x.recommended)!.variant).toBe("brand");
    expect(s.find((x) => x.variant === "brand")!.rationale).toBe("sounds great");
  });
  it("keeps plan scores when listening failed", () => {
    expect(combineScores(plan, null)).toEqual(plan);
  });
  it("keeps the plan score for a variant the listener didn't score", () => {
    const listen: Score[] = [{ variant: "brand", score: 10, rationale: "great", recommended: true }];
    const s = combineScores(plan, listen);
    expect(s.find((x) => x.variant === "faithful")!.score).toBe(9);
    expect(s.filter((x) => x.recommended)).toHaveLength(1);
  });
});
