import { Check, Loader2, X } from "lucide-react";
import { STEPS, type Job } from "@/lib/types";

const LABEL: Record<string, string> = {
  ingesting: "Fetching video",
  analyzing: "Measuring cuts, tempo and energy",
  composing: "Composing 3 tracks",
  muxing: "Laying tracks onto your video",
  judging: "Picking the best fit",
  ready: "Ready",
};

export function JobSteps({ job }: { job: Job }) {
  const current = job.status === "failed" ? job.failed_step ?? "analyzing" : job.status;
  const idx = STEPS.indexOf(current);
  return (
    <ol className="grid gap-3 sm:grid-cols-5">
      {STEPS.slice(0, 5).map((s, i) => {
        const done = i < idx || job.status === "ready";
        const failed = job.status === "failed" && i === idx;
        const active = !done && !failed && i === idx;
        return (
          <li key={s} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            active ? "border-primary/60 bg-primary/5" : failed ? "border-destructive/60 bg-destructive/5" : "border-border/60"
          }`}>
            {done ? <Check className="size-4 shrink-0 text-emerald-400" /> : failed ? <X className="size-4 shrink-0 text-destructive" /> :
              active ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : <span className="size-4 shrink-0 rounded-full border" />}
            <span className={done || active ? "" : "text-muted-foreground"}>{LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
