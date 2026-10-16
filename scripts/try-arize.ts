// Sends one test span to Arize and prints whether the export was accepted.
import { config } from "dotenv";
import { NodeTracerProvider, SimpleSpanProcessor, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";

config({ path: ".env.local" });

const project = process.env.ARIZE_PROJECT || "music-swap";
const otlp = new OTLPTraceExporter({
  url: process.env.ARIZE_OTLP_URL || "https://otlp.arize.com/v1/traces",
  headers: { "arize-space-id": process.env.ARIZE_SPACE_ID!, "arize-api-key": process.env.ARIZE_API_KEY! },
});
const logging: SpanExporter = {
  export: (spans: ReadableSpan[], done) =>
    otlp.export(spans, (r) => {
      console.log(r.code === 0 ? "export ok" : `export failed: ${r.error?.message}`);
      done(r);
    }),
  shutdown: () => otlp.shutdown(),
};

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: project, [SEMRESATTRS_PROJECT_NAME]: project }),
  spanProcessors: [new SimpleSpanProcessor(logging)],
});

const span = provider.getTracer("music-swap").startSpan("arize-smoke");
span.setAttribute("openinference.span.kind", "CHAIN");
span.setAttribute("input.value", "ping");
span.setAttribute("output.value", "pong");
span.end();

provider.shutdown().then(() => console.log(`sent to ${project}`));
