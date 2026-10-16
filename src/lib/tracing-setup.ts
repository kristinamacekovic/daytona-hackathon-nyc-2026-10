import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

const project = process.env.ARIZE_PROJECT || "music-swap";

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: project, [SEMRESATTRS_PROJECT_NAME]: project }),
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: "https://otlp.arize.com/v1/traces",
        headers: { "arize-space-id": process.env.ARIZE_SPACE_ID!, "arize-api-key": process.env.ARIZE_API_KEY! },
      }),
    ),
  ],
});
provider.register();

// Next.js bundles server code, so auto-patching on require doesn't fire; patch the class directly.
new AnthropicInstrumentation().manuallyInstrument(Anthropic);

console.log(`[arize] tracing to project ${project}`);
