import { slugify } from "./slug";
import { withSpan } from "./tracing";

const TEXT_KEYS = ["text", "content", "statement", "fact", "memory"];

export const brandScope = (brand: string) => `brand/${slugify(brand)}`;

export function pickTexts(json: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) return v.forEach((x) => visit(x, depth + 1));
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    for (const k of TEXT_KEYS) {
      if (typeof o[k] === "string") {
        out.push(o[k] as string);
        return;
      }
    }
    for (const val of Object.values(o)) if (typeof val === "object") visit(val, depth + 1);
  };
  visit(json, 0);
  return [...new Set(out)];
}

function base(): string | null {
  const { SURREAL_MEMORY_URL: url, SURREAL_MEMORY_CONTEXT_ID: ctx, SURREAL_MEMORY_API_KEY: key } = process.env;
  return url && ctx && key ? `${url.replace(/\/$/, "")}/api/v1/${ctx}` : null;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const b = base();
  if (!b) throw new Error("memory not configured");
  const res = await fetch(`${b}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SURREAL_MEMORY_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`memory ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function recallBrandFacts(brand: string): Promise<string[]> {
  if (!base()) return [];
  try {
    return await withSpan("memory.recall", "TOOL", { brand }, async () =>
      pickTexts(await post("/query", {
        query: "music preferences, rules, and past picks or rejections for this brand",
        lens: [[brandScope(brand)]],
        k: 10,
      })),
    );
  } catch (e) {
    console.error("[memory] recall failed", e);
    return [];
  }
}

export async function rememberBrandFact(brand: string, text: string): Promise<void> {
  if (!base()) return;
  try {
    await withSpan("memory.remember", "TOOL", { brand, text }, () =>
      post("/facts", { text, infer: "full", scopes: [[brandScope(brand)]] }),
    );
  } catch (e) {
    console.error("[memory] remember failed", e);
  }
}
