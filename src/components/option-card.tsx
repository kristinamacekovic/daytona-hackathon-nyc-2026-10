"use client";
import { Download, Check, Star, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Plan, Variant } from "@/lib/types";

// Renders a finished option, or a draft that is still being composed or judged.
export type CardData = { variant: Variant; plan: Plan; preview_url?: string; score?: number; rationale?: string; recommended?: boolean };

const TITLE = { faithful: "Faithful", brand: "On-brand", wildcard: "Wildcard" } as const;
const BLURB = {
  faithful: "Keeps the feel of the original track.",
  brand: "Built from what this brand likes.",
  wildcard: "A bold contrast that still hits the cuts.",
} as const;

export function OptionCard({ option, picked, ready, onPick }: { option: CardData; picked: boolean; ready: boolean; onPick: () => void }) {
  const d = option.plan.sections.reduce((n, s) => n + s.duration_ms, 0) || 1;
  return (
    <Card className={`flex flex-col overflow-hidden border-border/60 bg-card/60 pt-0 backdrop-blur transition-shadow duration-700 animate-in fade-in slide-in-from-bottom-3 ${
      option.recommended ? "shadow-[0_0_40px_-10px] shadow-primary/40 ring-2 ring-primary/70" : ""
    }`}>
      {option.preview_url ? (
        <video src={option.preview_url} controls playsInline preload="metadata" className="aspect-[9/16] max-h-[420px] w-full bg-black object-contain animate-in fade-in duration-700" />
      ) : (
        <div className="flex aspect-[9/16] max-h-[420px] w-full flex-col items-center justify-center gap-2 bg-black/60 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" />
          Composing…
        </div>
      )}
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{TITLE[option.variant]}</CardTitle>
          {option.recommended && <Badge className="gap-1"><Star className="size-3" />Recommended</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{BLURB[option.variant]}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {option.plan.global_styles.slice(0, 5).map((s) => <Badge key={s} variant="secondary" className="font-normal">{s}</Badge>)}
        </div>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
          {option.plan.sections.map((s, i) => (
            <div key={i} title={`${s.name} · ${(s.duration_ms / 1000).toFixed(1)}s`} className="bg-primary/50" style={{ width: `${(s.duration_ms / d) * 100}%` }} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{option.plan.sections.map((s) => s.name).join(" → ")}</p>
        {option.score !== undefined ? (
          <p className="text-sm animate-in fade-in duration-700"><span className="font-mono text-primary">{option.score.toFixed(1)}</span><span className="text-muted-foreground">/10 · {option.rationale}</span></p>
        ) : (
          <p className="text-sm text-muted-foreground">{option.preview_url ? "Listening and scoring…" : "Waiting for the track…"}</p>
        )}
        <div className="mt-auto flex gap-2">
          <Button className="flex-1" variant={picked ? "secondary" : "default"} onClick={onPick} disabled={picked || !ready}>
            {picked ? <><Check className="mr-2 size-4" />Picked</> : "Use this one"}
          </Button>
          <a href={option.preview_url ? `${option.preview_url}?download=1` : undefined} aria-label="Download" aria-disabled={!option.preview_url} className={`${buttonVariants({ variant: "outline", size: "icon" })} ${option.preview_url ? "" : "pointer-events-none opacity-50"}`}>
            <Download className="size-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
