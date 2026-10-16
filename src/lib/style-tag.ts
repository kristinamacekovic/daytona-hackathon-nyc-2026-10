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
          { text: "Describe the background music in one line of comma-separated tags: genre, main instruments, mood, approximate BPM. Ignore speech. If there is no music, reply exactly: no music" },
        ],
      });
      return (res.text ?? "").trim().split("\n")[0].slice(0, 200) || "unknown";
    });
  } catch (e) {
    console.error("[style-tag] failed", e);
    return "unknown";
  }
}
