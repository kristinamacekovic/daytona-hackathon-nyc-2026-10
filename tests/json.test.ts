import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/json";

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses JSON inside code fences and prose", () => {
    expect(extractJson('Sure! Here it is:\n```json\n{"a":[1,2]}\n```\nHope that helps')).toEqual({ a: [1, 2] });
  });
  it("throws on no JSON", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON/);
  });
});
