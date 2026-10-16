import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { rememberBrandFact } from "@/lib/memory";
import { VARIANTS, type Variant } from "@/lib/types";


export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  if (!job || job.status !== "ready") return NextResponse.json({ error: "job not ready" }, { status: 400 });
  const { variant } = (await req.json()) as { variant: Variant };
  const picked = job.options.find((o) => o.variant === variant);
  if (!VARIANTS.includes(variant) || !picked) return NextResponse.json({ error: "unknown option" }, { status: 400 });

  const others = job.options.filter((o) => o.variant !== variant);
  const date = new Date().toISOString().slice(0, 10);
  const fact =
    `On ${date}, for ${job.brand} content about "${job.brief?.summary ?? "a video"}", the creator chose music styled ` +
    `${picked.plan.global_styles.join(", ")}` +
    (others.length ? ` and rejected ${others.map((o) => o.plan.global_styles.join(", ")).join(" / ")}.` : ".");
  await rememberBrandFact(job.brand, fact);
  await updateJob(job, { picked: variant });
  return NextResponse.json({ ok: true });
}
