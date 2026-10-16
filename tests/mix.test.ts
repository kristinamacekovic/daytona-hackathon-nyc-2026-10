import { describe, it, expect } from "vitest";
import { muxFilter, parseMeanVolume, hasSpeech } from "@/lib/mix";

describe("muxFilter", () => {
  it("music only: trims the lead-in, cuts to length, masters to -14 LUFS with fades", () => {
    const f = muxFilter({ leadInS: 4, durationS: 10.63, withVoice: false });
    expect(f).toContain("[1:a]atrim=start=4.000:duration=10.630");
    expect(f).toContain("loudnorm=I=-14");
    expect(f).toContain("afade=t=in:st=0:d=0.15");
    expect(f).toContain("afade=t=out:st=9.830:d=0.8");
    expect(f).not.toContain("sidechaincompress");
    expect(f.endsWith("[a]")).toBe(true);
  });
  it("with voice: ducks the music under the isolated voice and mixes both", () => {
    const f = muxFilter({ leadInS: 4, durationS: 10.63, withVoice: true });
    expect(f).toContain("[2:a]");
    expect(f).toContain("sidechaincompress");
    expect(f).toContain("amix=inputs=2:duration=first");
    expect(f.endsWith("[a]")).toBe(true);
  });
  it("never puts a fade-out before zero on very short clips", () => {
    expect(muxFilter({ leadInS: 4, durationS: 0.5, withVoice: false })).toContain("afade=t=out:st=0.000");
  });
});

describe("speech detection", () => {
  it("parses ffmpeg volumedetect output", () => {
    expect(parseMeanVolume("[Parsed_volumedetect_0 @ 0x1] mean_volume: -32.5 dB\n max_volume: -3.1 dB")).toBe(-32.5);
    expect(parseMeanVolume("nothing here")).toBeNull();
  });
  it("treats near-silent isolated audio as no speech", () => {
    expect(hasSpeech(-32.5)).toBe(true);
    expect(hasSpeech(-60)).toBe(false);
    expect(hasSpeech(null)).toBe(false);
  });
});
