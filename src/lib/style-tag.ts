import { GoogleGenAI } from "@google/genai";
import { withSpan } from "./tracing";

export const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";

export async function styleTag(audioMp3: Buffer | null): Promise<string> {
  if (!audioMp3 || !process.env.GEMINI_API_KEY) return "unknown";
  try {
    const prompt =
      "You are a music producer taking listening notes on the background music so another producer can write " +
      "an original track with the same feel without copying it. Ignore speech. Reply in at most 6 short lines:\n" +
      "genre/subgenre and era; drums and groove (pattern feel, swing, hat density); bass (808, synth, upright, how it moves); " +
      "lead and texture instruments; key or tonal mood (major/minor, bright/dark) and approximate BPM; " +
      "energy arc with rough timestamps (where it builds, drops, or changes).\n" +
      "Describe feel and production, never melody lines, lyrics, or the song's name. If there is no music, reply exactly: no music";
    return await withSpan("style_tag", "LLM", { model: geminiModel(), prompt, audio_bytes: audioMp3.length }, async (span) => {
      span.setAttribute("llm.model_name", geminiModel());
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: geminiModel(),
        contents: [
          { inlineData: { mimeType: "audio/mp3", data: audioMp3.toString("base64") } },
          { text: prompt },
        ],
      });
      return (res.text ?? "").trim().slice(0, 700) || "unknown";
    });
  } catch (e) {
    console.error("[style-tag] failed", e);
    return "unknown";
  }
}

// Gemini watches the whole original video with sound: what the analyst can't get from 8 still frames.
export async function watchVideo(mp4: Buffer): Promise<string> {
  if (!process.env.GEMINI_API_KEY || mp4.length > 18 * 1024 * 1024) return "";
  try {
    const prompt =
      "You are a video editor briefing a music supervisor. Watch the whole video with sound and reply in at most 8 short lines: " +
      "what happens and the overall tone; pacing and motion (slow, frantic, builds); anything spoken or on-screen text and what it " +
      "means for the mood (gist, not a full transcript); the key beats with timestamps (punchline, reveal, emotional turn, action) " +
      "where music should react. Ignore the background music itself.";
    return await withSpan("video_notes", "LLM", { model: geminiModel(), prompt, video_bytes: mp4.length }, async (span) => {
      span.setAttribute("llm.model_name", geminiModel());
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: geminiModel(),
        contents: [
          { inlineData: { mimeType: "video/mp4", data: mp4.toString("base64") } },
          { text: prompt },
        ],
      });
      return (res.text ?? "").trim().slice(0, 1200);
    });
  } catch (e) {
    console.error("[video-notes] failed", e);
    return "";
  }
}
