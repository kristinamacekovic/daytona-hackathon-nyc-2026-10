import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { withSpan } from "./tracing";

// Strips music and background from the original audio, keeping speech. Never throws: null means music-only.
export async function isolateVoice(audioMp3: Buffer | null): Promise<Buffer | null> {
  if (!audioMp3 || !process.env.ELEVENLABS_API_KEY) return null;
  try {
    return await withSpan("voice.isolate", "TOOL", { bytes: audioMp3.length }, async () => {
      const el = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
      const stream = await el.audioIsolation.convert(
        { audio: { data: audioMp3, filename: "audio.mp3" } },
        { abortSignal: AbortSignal.timeout(60_000) },
      );
      const chunks: Buffer[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    });
  } catch (e) {
    console.error("[voice] isolation failed, using music only", e);
    return null;
  }
}
