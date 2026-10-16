import type { Analysis, Plan, SectionSlot } from "./types";

export const MIN_SECTION_MS = 3000;
export const MAX_SECTION_MS = 120000;
export const MIN_VIDEO_MS = 3000;
export const MAX_VIDEO_MS = 90000;
export const DEFAULT_BPM = 100;

export function sectionSlots(
  a: Pick<Analysis, "duration_ms" | "scene_cuts_ms" | "energy_peaks_ms">,
): SectionSlot[] {
  const d = Math.round(a.duration_ms);
  const clean = (xs: number[]) =>
    [...new Set(xs.map(Math.round))].filter((t) => t > 0 && t < d).sort((x, y) => x - y);

  // Scene cuts first: the music must change on the cut. Energy peaks only fill gaps.
  const kept: number[] = [];
  const fits = (t: number) =>
    t >= MIN_SECTION_MS && d - t >= MIN_SECTION_MS && kept.every((k) => Math.abs(k - t) >= MIN_SECTION_MS);
  for (const t of clean(a.scene_cuts_ms)) if (fits(t)) kept.push(t);
  for (const t of clean(a.energy_peaks_ms)) if (fits(t)) kept.push(t);
  kept.sort((x, y) => x - y);

  const edges = [0, ...kept, d];
  const slots: SectionSlot[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const len = edges[i + 1] - start;
    const parts = Math.ceil(len / MAX_SECTION_MS);
    const base = Math.floor(len / parts);
    for (let p = 0; p < parts; p++) {
      slots.push({ start_ms: start + base * p, duration_ms: p === parts - 1 ? len - base * (parts - 1) : base });
    }
  }
  return slots;
}

export function normalizePlan(plan: Plan, duration_ms: number): Plan {
  const d = Math.round(duration_ms);
  const sections = plan.sections.filter((s) => s.duration_ms > 0).map((s) => ({ ...s }));
  if (sections.length === 0) return { ...plan, sections: [{ name: "Main", duration_ms: d, styles: [] }] };

  const total = sections.reduce((n, s) => n + s.duration_ms, 0);
  for (const s of sections) s.duration_ms = Math.round((s.duration_ms * d) / total);
  sections[sections.length - 1].duration_ms += d - sections.reduce((n, s) => n + s.duration_ms, 0);

  let i = 0;
  while (i < sections.length && sections.length > 1) {
    if (sections[i].duration_ms < MIN_SECTION_MS) {
      const target = i === 0 ? 1 : i - 1;
      sections[target].duration_ms += sections[i].duration_ms;
      sections.splice(i, 1);
      i = 0;
    } else {
      i++;
    }
  }
  return { ...plan, sections };
}

export function validateDuration(duration_ms: number): string | null {
  if (duration_ms < MIN_VIDEO_MS) return "Video must be at least 3 seconds long.";
  if (duration_ms > MAX_VIDEO_MS) return "Video must be 90 seconds or shorter.";
  return null;
}

export function effectiveBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? Math.round(bpm) : DEFAULT_BPM;
}
