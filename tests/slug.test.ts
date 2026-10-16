import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("normalises case and whitespace to one scope", () => {
    expect(slugify("Glossier")).toBe("glossier");
    expect(slugify(" glossier ")).toBe("glossier");
    expect(slugify("GLOSSIER")).toBe("glossier");
  });
  it("turns spaces and symbols into single dashes", () => {
    expect(slugify("Liquid Death!!")).toBe("liquid-death");
    expect(slugify("Ben & Jerry's")).toBe("ben-jerry-s");
  });
  it("falls back for empty input", () => {
    expect(slugify("   ")).toBe("unknown");
  });
});
