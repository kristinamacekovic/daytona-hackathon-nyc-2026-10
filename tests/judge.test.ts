import { describe, it, expect } from "vitest";
import { parseJudgeOutput } from "@/lib/judge";

describe("parseJudgeOutput", () => {
  it("marks the highest score as recommended", () => {
    const text = JSON.stringify({ scores: [
      { variant: "faithful", score: 7, rationale: "close to original" },
      { variant: "brand", score: 9, rationale: "on brand" },
      { variant: "wildcard", score: 5, rationale: "bold" },
    ] });
    const s = parseJudgeOutput(text, ["faithful", "brand", "wildcard"]);
    expect(s.filter((x) => x.recommended).map((x) => x.variant)).toEqual(["brand"]);
  });

  it("clamps scores to 0-10 and breaks ties in variant order", () => {
    const text = '```json\n{"scores":[{"variant":"wildcard","score":14},{"variant":"faithful","score":10}]}\n```';
    const s = parseJudgeOutput(text, ["faithful", "wildcard"]);
    expect(s.find((x) => x.variant === "wildcard")!.score).toBe(10);
    expect(s.find((x) => x.recommended)!.variant).toBe("faithful");
  });

  it("gives unscored variants 0 and only returns requested variants", () => {
    const text = JSON.stringify({ scores: [{ variant: "brand", score: 6, rationale: "ok" }, { variant: "faithful", score: 8 }] });
    const s = parseJudgeOutput(text, ["brand", "wildcard"]);
    expect(s.map((x) => x.variant)).toEqual(["brand", "wildcard"]);
    expect(s[1]).toMatchObject({ score: 0, rationale: "not scored", recommended: false });
    expect(s[0].recommended).toBe(true);
  });

  it("still recommends one option when output is garbage", () => {
    const s = parseJudgeOutput("sorry, I cannot", ["faithful", "brand"]);
    expect(s.filter((x) => x.recommended)).toHaveLength(1);
    expect(s[0].recommended).toBe(true);
  });
});
