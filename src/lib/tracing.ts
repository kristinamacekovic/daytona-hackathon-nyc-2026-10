import { context, trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import { getAttributesFromContext, setMetadata, setSession, setTags } from "@arizeai/openinference-core";

const tracer = trace.getTracer("music-swap");

// Tags every span inside fn (ours and the Anthropic instrumentation's) with the job's session, brand and metadata.
export function withJobContext<T>(job: { id: string; brand: string }, fn: () => Promise<T>): Promise<T> {
  let ctx = context.active();
  ctx = setSession(ctx, { sessionId: job.id });
  ctx = setTags(ctx, [job.brand]);
  ctx = setMetadata(ctx, { job_id: job.id, brand: job.brand });
  return context.with(ctx, fn);
}

export async function withSpan<T>(
  name: string,
  kind: "CHAIN" | "TOOL" | "LLM" | "EVALUATOR",
  input: unknown,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(getAttributesFromContext(context.active()));
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
