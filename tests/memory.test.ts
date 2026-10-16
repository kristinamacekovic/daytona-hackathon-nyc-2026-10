import { describe, it, expect } from "vitest";
import { brandScope, pickTexts } from "@/lib/memory";

describe("brandScope", () => {
  it("is stable across casing and spacing", () => {
    expect(brandScope(" Glossier ")).toBe("brand/glossier");
    expect(brandScope("GLOSSIER")).toBe("brand/glossier");
  });
});

describe("pickTexts", () => {
  it("finds text in common response shapes", () => {
    expect(pickTexts({ results: [{ text: "a" }, { fact: { text: "b" } }] })).toEqual(["a", "b"]);
    expect(pickTexts({ facts: [{ content: "c" }] })).toEqual(["c"]);
    expect(pickTexts([{ statement: "d" }])).toEqual(["d"]);
  });
  it("dedupes and ignores non-text", () => {
    expect(pickTexts({ results: [{ text: "a" }, { text: "a" }, { score: 1 }] })).toEqual(["a"]);
  });
  it("returns [] for junk", () => {
    expect(pickTexts(null)).toEqual([]);
    expect(pickTexts("oops")).toEqual([]);
  });
});
