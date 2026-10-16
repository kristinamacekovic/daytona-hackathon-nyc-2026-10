import { describe, it, expect } from "vitest";
import { isCompleteMp4, ytDlpArgs } from "@/lib/ingest-link";

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

const box = (type: string, body = 0) => {
  const b = Buffer.alloc(8 + body);
  b.writeUInt32BE(8 + body, 0);
  b.write(type, 4, "latin1");
  return b;
};

describe("isCompleteMp4", () => {
  const full = Buffer.concat([box("ftyp", 8), box("moov", 16), box("mdat", 64)]);
  it("accepts a whole file", () => expect(isCompleteMp4(full)).toBe(true));
  it("rejects a truncated file", () => expect(isCompleteMp4(full.subarray(0, full.length - 10))).toBe(false));
  it("rejects a file with no moov", () => expect(isCompleteMp4(Buffer.concat([box("ftyp", 8), box("mdat", 64)]))).toBe(false));
  it("rejects non-mp4 bytes", () => expect(isCompleteMp4(Buffer.from("<html>blocked</html>"))).toBe(false));
});
