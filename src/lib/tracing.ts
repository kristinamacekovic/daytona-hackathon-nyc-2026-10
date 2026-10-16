import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

const tracer = trace.getTracer("music-swap");

export async function withSpan<T>(
  name: string,
  kind: "CHAIN" | "TOOL" | "LLM" | "EVALUATOR",
  input: unknown,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("openinference.span.kind", kind);
    span.setAttribute("input.value", typeof input === "string" ? input : JSON.stringify(input));
    try {
      const out = await fn(span);
      span.setAttribute("output.value", typeof out === "string" ? out : JSON.stringify(out ?? null).slice(0, 8000));
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      throw e;
    } finally {
      span.end();
    }
  });
}
