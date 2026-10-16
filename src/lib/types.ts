export type Variant = "faithful" | "brand" | "wildcard";
export const VARIANTS: Variant[] = ["faithful", "brand", "wildcard"];

export type Analysis = {
  duration_ms: number;
  bpm: number;
  beats_ms: number[];
  scene_cuts_ms: number[];
  energy_peaks_ms: number[];
  style_tag: string;
  keyframes: string[]; // relative paths inside the sandbox out/ dir, chronological
};

export type SectionSlot = { start_ms: number; duration_ms: number };

export type Brief = {
  summary: string;
  mood: string;
  avoid: string[];
  key_moments: { at_ms: number; why: string }[];
};

export type PlanSection = { name: string; duration_ms: number; styles: string[] };

export type Plan = {
  variant: Variant;
  global_styles: string[];
  negative_styles: string[];
  sections: PlanSection[];
};

export type Score = { variant: Variant; score: number; rationale: string; recommended: boolean };

export type Option = Score & { plan: Plan; preview_url: string };

// Shown while the job runs, before scores exist.
export type Draft = { variant: Variant; plan: Plan; preview_url?: string };

export type Insights = {
  duration_ms: number;
  bpm: number;
  scene_cuts_ms: number[];
  listening_notes: string;
  video_notes: string;
};

export type JobStatus =
  | "ingesting" | "analyzing" | "composing" | "muxing" | "judging" | "ready" | "failed";

export const STEPS: JobStatus[] = ["ingesting", "analyzing", "composing", "muxing", "judging", "ready"];

export type Job = {
  id: string;
  brand: string;
  status: JobStatus;
  failed_step?: JobStatus;
  error?: string;
  brief?: Brief;
  insights?: Insights;
  drafts?: Draft[];
  options: Option[];
  picked?: Variant;
  created_at: string;
};
