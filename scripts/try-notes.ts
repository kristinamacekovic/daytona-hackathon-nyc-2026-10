// Listening notes on a local clip; sends the mp4 itself (no local ffmpeg needed).
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { GoogleGenAI } from "@google/genai";

config({ path: ".env.local" });

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = (await readFile("src/lib/style-tag.ts", "utf8")).match(/"You are a music producer[\s\S]*?no music",/)![0];
  const text = eval(prompt.replace(/,$/, "")) as string;
  const res = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    contents: [{ inlineData: { mimeType: "video/mp4", data: (await readFile(process.argv[2])).toString("base64") } }, { text }],
  });
  console.log(res.text);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
