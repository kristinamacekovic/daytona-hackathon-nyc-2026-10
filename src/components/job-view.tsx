"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { JobSteps } from "./job-steps";
import { OptionCard } from "./option-card";
import type { Job, Variant } from "@/lib/types";

export function JobView({ id, onReset }: { id: string; onReset: () => void }) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/jobs/${id}`);
      if (res.ok) {
        const j = (await res.json()) as Job;
        if (!stop) setJob(j);
        if (j.status === "ready" || j.status === "failed") return;
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
      {job.brief && job.status !== "failed" && (
        <p className="max-w-3xl text-pretty text-muted-foreground">
          <span className="text-foreground">{job.brief.summary.replace(/\.+$/, "")}.</span>{" "}
          Mood: {job.brief.mood.replace(/\.+$/, "")}.
        </p>
      )}
      {job.status === "ready" && (
        <div className="grid gap-6 md:grid-cols-3">
          {job.options.map((o) => (
            <OptionCard key={o.variant} option={o} picked={job.picked === o.variant} onPick={() => pick(o.variant)} />
          ))}
        </div>
      )}
      {["composing", "muxing", "judging"].includes(job.status) && (
        <div className="grid gap-6 md:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[9/16] max-h-[420px] w-full rounded-xl" />)}
        </div>
      )}
    </section>
  );
}
