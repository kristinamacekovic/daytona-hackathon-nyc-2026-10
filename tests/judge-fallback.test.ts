import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({ claudeText: async () => { throw new Error("529 overloaded"); } }));

describe("runJudge", () => {
  it("still returns options with one recommended when Claude is down", async () => {
    const { runJudge } = await import("@/lib/judge");
    const plans = (["faithful", "brand"] as const).map((variant) => ({ variant, global_styles: [], negative_styles: [], sections: [] }));
    const scores = await runJudge({ brand: "Glossier", facts: [], brief: { summary: "", mood: "", avoid: [], key_moments: [] }, plans });
    expect(scores.map((s) => s.variant)).toEqual(["faithful", "brand"]);
    expect(scores.filter((s) => s.recommended)).toHaveLength(1);
  });
});
