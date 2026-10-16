import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic());
export const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export async function claudeText(content: Anthropic.ContentBlockParam[], maxTokens = 4000): Promise<string> {
  const msg = await anthropic().messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
