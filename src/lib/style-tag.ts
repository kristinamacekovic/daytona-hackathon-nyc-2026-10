import { GoogleGenAI } from "@google/genai";
import { withSpan } from "./tracing";

export async function styleTag(audioMp3: Buffer | null): Promise<string> {
  if (!audioMp3 || !process.env.GEMINI_API_KEY) return "unknown";
  try {
    return await withSpan("style_tag", "LLM", { bytes: audioMp3.length }, async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        contents: [
          { inlineData: { mimeType: "audio/mp3", data: audioMp3.toString("base64") } },
          {
            text:
              "You are a music producer taking listening notes on the background music so another producer can write " +
              "an original track with the same feel without copying it. Ignore speech. Reply in at most 6 short lines:\n" +
              "genre/subgenre and era; drums and groove (pattern feel, swing, hat density); bass (808, synth, upright, how it moves); " +
              "lead and texture instruments; key or tonal mood (major/minor, bright/dark) and approximate BPM; " +
              "energy arc with rough timestamps (where it builds, drops, or changes).\n" +
              "Describe feel and production, never melody lines, lyrics, or the song's name. If there is no music, reply exactly: no music",
          },
        ],
      });
      return (res.text ?? "").trim().slice(0, 700) || "unknown";
    });
  } catch (e) {
    console.error("[style-tag] failed", e);
    return "unknown";
  }
}
