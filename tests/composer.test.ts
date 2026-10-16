import { describe, it, expect, vi } from "vitest";

// compose() resolves with headers, then the body stalls forever
vi.mock("@elevenlabs/elevenlabs-js", () => ({
  ElevenLabsClient: class {
    music = { compose: async () => new ReadableStream<Uint8Array>({ start() {} }) };
  },
}));

describe("composeAll", () => {
  it("fails a track whose audio stream stalls instead of hanging", async () => {
    process.env.ELEVENLABS_TIMEOUT_MS = "200";
    const { composeAll } = await import("@/lib/composer");
    const plan = { variant: "brand" as const, global_styles: [], negative_styles: [], sections: [{ name: "A", duration_ms: 5000, styles: [] }] };
    const { tracks, errors } = await composeAll([plan]);
    expect(tracks).toHaveLength(0);
    expect(errors[0].message).toMatch(/timed out/);
  }, 5000);
});
