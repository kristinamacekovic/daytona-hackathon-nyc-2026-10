import { describe, it, expect } from "vitest";
import { ytDlpArgs } from "@/lib/ingest-link";

describe("ytDlpArgs", () => {
  it("passes the link as one argument after --, never through a shell", () => {
    const args = ytDlpArgs("https://www.instagram.com/reel/ABC123/?igsh=xyz", "/tmp/out.mp4");
    expect(args.slice(-2)).toEqual(["--", "https://www.instagram.com/reel/ABC123/?igsh=xyz"]);
    expect(args).toContain("/tmp/out.mp4");
  });
  it("keeps shell metacharacters inert inside the single URL argument", () => {
    const url = "https://example.com/a'; rm -rf / #";
    expect(ytDlpArgs(url, "/tmp/o.mp4").at(-1)).toBe(url);
  });
  it("rejects non-http links", () => {
    expect(() => ytDlpArgs("file:///etc/passwd", "/tmp/o.mp4")).toThrow(/valid link/);
    expect(() => ytDlpArgs("not a url", "/tmp/o.mp4")).toThrow(/valid link/);
  });
});
