// Checks that the Anthropic instrumentation emits an LLM span with the prompt (printed locally, not sent).
import { config } from "dotenv";
import { NodeTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from "@opentelemetry/sdk-trace-node";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

async function main() {
  const mem = new InMemorySpanExporter();
  new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(mem)] }).register();
  new AnthropicInstrumentation().manuallyInstrument(Anthropic);
  const { claudeText } = await import("../src/lib/anthropic");
  await claudeText([{ type: "text", text: "Reply with exactly: ok" }], 10);
  for (const s of mem.getFinishedSpans()) {
    const a = s.attributes;
    console.log(s.name, "| kind:", a["openinference.span.kind"], "| model:", a["llm.model_name"],
      "| prompt captured:", Object.keys(a).some((k) => k.startsWith("llm.input_messages")),
      "| tokens:", a["llm.token_count.total"]);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
