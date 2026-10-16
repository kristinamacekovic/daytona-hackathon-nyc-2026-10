"use client";
import { Download, Check, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Option } from "@/lib/types";

const TITLE = { faithful: "Faithful", brand: "On-brand", wildcard: "Wildcard" } as const;
const BLURB = {
  faithful: "Keeps the feel of the original track.",
  brand: "Built from what this brand likes.",
  wildcard: "A bold contrast that still hits the cuts.",
} as const;

export function OptionCard({ option, picked, onPick }: { option: Option; picked: boolean; onPick: () => void }) {
  return (
    <Card className={`flex flex-col overflow-hidden border-border/60 bg-card/60 pt-0 backdrop-blur transition-shadow ${
      option.recommended ? "shadow-[0_0_40px_-10px] shadow-primary/40 ring-2 ring-primary/70" : ""
    }`}>
      <video src={option.preview_url} controls playsInline preload="metadata" className="aspect-[9/16] max-h-[420px] w-full bg-black object-contain" />
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
        <p className="text-sm"><span className="font-mono text-primary">{option.score.toFixed(1)}</span><span className="text-muted-foreground">/10 · {option.rationale}</span></p>
        <div className="mt-auto flex gap-2">
          <Button className="flex-1" variant={picked ? "secondary" : "default"} onClick={onPick} disabled={picked}>
            {picked ? <><Check className="mr-2 size-4" />Picked</> : "Use this one"}
          </Button>
          <a href={`${option.preview_url}?download=1`} aria-label="Download" className={buttonVariants({ variant: "outline", size: "icon" })}>
            <Download className="size-4" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
