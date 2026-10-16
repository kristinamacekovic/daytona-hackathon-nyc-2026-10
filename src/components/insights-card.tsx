import { AudioLines, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Insights } from "@/lib/types";

const lines = (s: string) =>
  s.split("\n").map((l) => l.replace(/^[-*\s]+/, "").replace(/\*\*/g, "").trim()).filter(Boolean);

export function InsightsCard({ insights }: { insights: Insights }) {
  const d = insights.duration_ms;
  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CardContent className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">What we found</p>
          <p className="text-sm"><span className="font-mono text-primary">{(d / 1000).toFixed(1)}s</span> <span className="text-muted-foreground">clip</span></p>
          <p className="text-sm"><span className="font-mono text-primary">{insights.bpm}</span> <span className="text-muted-foreground">BPM original</span></p>
          <p className="text-sm"><span className="font-mono text-primary">{insights.scene_cuts_ms.length}</span> <span className="text-muted-foreground">scene cuts</span></p>
        </div>

        <div className="relative h-8 rounded-md bg-muted/60">
          {insights.scene_cuts_ms.map((c) => (
            <div key={c} className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: `${(c / d) * 100}%` }}>
              <span className="absolute -top-5 -translate-x-1/2 font-mono text-[10px] text-muted-foreground">{(c / 1000).toFixed(1)}s</span>
            </div>
          ))}
          <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">
            {insights.scene_cuts_ms.length ? "music changes on every cut" : "no hard cuts: music follows the energy and the action"}
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {insights.listening_notes && insights.listening_notes !== "unknown" && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium"><AudioLines className="size-4 text-primary" />Original music</p>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {lines(insights.listening_notes).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          )}
          {insights.video_notes && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-sm font-medium"><Eye className="size-4 text-primary" />The video</p>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {lines(insights.video_notes).map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
