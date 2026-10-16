"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobSteps } from "./job-steps";
import { OptionCard, type CardData } from "./option-card";
import { InsightsCard } from "./insights-card";
import type { Job, Variant } from "@/lib/types";

export function JobView({ id, onReset }: { id: string; onReset: () => void }) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (res.ok) {
          const j = (await res.json()) as Job;
          if (!stop) setJob(j);
          if (j.status === "ready" || j.status === "failed") return;
        }
      } catch {
        // dev server reload or network blip: keep polling
      }
      if (!stop) setTimeout(tick, 1500);
    };
    tick();
    return () => { stop = true; };
  }, [id]);

  async function pick(variant: Variant) {
    const res = await fetch(`/api/jobs/${id}/pick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ variant }),
    });
    if (!res.ok) return toast.error("Couldn't save your pick");
    setJob((j) => (j ? { ...j, picked: variant } : j));
    toast.success(`Saved. ${job?.brand}'s music memory is updated.`);
  }

  if (!job) return <Skeleton className="h-40 w-full rounded-xl" />;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">For <span className="font-medium text-foreground">{job.brand}</span></p>
        <Button variant="ghost" size="sm" onClick={onReset}><RotateCcw className="mr-2 size-4" />New video</Button>
      </div>
      <JobSteps job={job} />
      {job.status === "failed" && (
        <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-4 text-sm">
          <p className="font-medium">That didn&apos;t work.</p>
          <p className="text-muted-foreground">{job.error}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={onReset}>Try again</Button>
        </div>
      )}
      {job.insights && <InsightsCard insights={job.insights} />}
      {job.brief && job.status !== "failed" && (
        <p className="max-w-3xl text-pretty text-muted-foreground animate-in fade-in duration-700">
          <span className="text-foreground">{job.brief.summary.replace(/\.+$/, "")}.</span>{" "}
          Mood: {job.brief.mood.replace(/\.+$/, "")}.
        </p>
      )}
      {(() => {
        const ready = job.status === "ready";
        const cards: CardData[] = ready ? job.options : (job.drafts ?? []);
        if (job.status === "failed") return null;
        if (cards.length === 0) {
          return ["analyzing", "composing"].includes(job.status) && job.insights ? (
            <div className="grid gap-6 md:grid-cols-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[9/16] max-h-[420px] w-full rounded-xl" />)}
            </div>
          ) : null;
        }
        return (
          <div className="grid gap-6 md:grid-cols-3">
            {cards.map((o) => (
              <OptionCard key={o.variant} option={o} ready={ready} picked={job.picked === o.variant} onPick={() => pick(o.variant)} />
            ))}
          </div>
        );
      })()}
    </section>
  );
}
