# Automated Music Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app where a creator uploads a short video (or pastes a link), picks a brand, and gets 3 newly generated, rights-free music options timed to the video's cuts, each previewed on the video, one recommended, downloadable, with the pick feeding brand memory.

**Architecture:** Next.js (App Router, TS) orchestrates. Media work (ffmpeg, librosa) runs in one Daytona sandbox per job. Claude writes a brief and 3 ElevenLabs composition plans whose section boundaries come from measured scene cuts and energy peaks. A Claude judge picks the recommended option. SurrealDB Agent Memory stores brand facts. Arize traces the pipeline. Anchor fetches videos from links. Gemini adds a style tag for the original track.

**Tech Stack:** Next.js + TypeScript, Tailwind, shadcn/ui, vitest, `@daytona/sdk`, `@elevenlabs/elevenlabs-js`, `@anthropic-ai/sdk`, `@google/genai`, SurrealDB Agent Memory REST, `anchorbrowser` + `playwright-core`, OpenTelemetry + Arize OpenInference. Python 3.12 in sandbox: ffmpeg, librosa, scipy.

**Spec:** `docs/superpowers/specs/2026-10-16-music-swap-design.md`

## Global Constraints

- Hard deadline: Devpost submission 3:30 PM 2026-10-16. Cut order if behind: (1) Anchor link input, (2) Gemini style tag, (3) memory rerun in demo, (4) Arize evals (keep basic tracing). Never cut: upload → analysis → 3 tracks → preview → pick.
- Demo runs locally with `next dev`. Do not deploy.
- Accepted video length: 3s to 90s. Target demo clips: 15–30s.
- ElevenLabs section duration: 3000–120000 ms each. Generated music is instrumental.
- Variants are exactly `"faithful" | "brand" | "wildcard"`.
- Claude model from env `ANTHROPIC_MODEL`, default `claude-sonnet-5-5`. Gemini model from env `GEMINI_MODEL`, default `gemini-3.8-flash`.
- Optional services (Gemini, SurrealDB, Arize) degrade silently: style tag `"unknown"`, empty brand facts, no tracing. They never fail a job.
- API keys stay on the Next.js server. Nothing secret is sent into the Daytona sandbox. So the Gemini style tag is called from the server on the sandbox's `out/audio.mp3`, not from inside the sandbox as the spec diagram shows. Same result, no key in the sandbox.
- UI: shadcn/ui + Tailwind, sleek and minimal, dark by default.
- SDK details marked "verify" below were sourced from docs but never run. Each has a concrete check step; follow it before coding against that SDK.

## Review Focus

1. **Clip too short or too long** (under 3s, over 90s). Expect a clear message before any credits are spent, not a failed ElevenLabs call. Pinned in Task 2 (`validateDuration`) and Task 9 (pipeline rejects).
2. **Original audio is silent or has no scene cuts.** librosa returns tempo 0 and no peaks. Expect one section covering the whole clip and a sane default BPM, not a crash. Pinned in Task 2 (`sectionSlots` with no candidates) and Task 4 (prompt uses fallback BPM).
3. **Claude returns JSON wrapped in prose or code fences, or the wrong number of sections.** Expect the parser to recover and section durations to always come from measured slots. Pinned in Task 4 tests.
4. **All three ElevenLabs calls fail.** Expect the job to end `failed` at step `composing` with a readable error, never stuck on a spinner. Pinned in Task 5 (`composeAll` reports) and Task 9 (pipeline throws when zero tracks).
5. **Same brand typed differently** (`"Glossier"`, `" glossier "`, `"GLOSSIER"`). Expect one memory scope. Pinned in Task 1 (`slugify` tests).

---

## File Structure

```
sandbox/
  analyze.py            # runs in Daytona: ffmpeg + librosa → out/analysis.json, out/frames/*.jpg, out/audio.mp3
  mux.sh                # runs in Daytona: replace video audio with a track
src/
  lib/
    types.ts            # shared types (Analysis, Brief, Plan, Option, Job...)
    slug.ts             # brand → memory scope slug
    json.ts             # extract JSON object from LLM text
    tracing.ts          # withSpan helper (no-op without a provider)
    tracing-setup.ts    # Arize exporter + Anthropic instrumentation (Task 11)
    timing.ts           # sectionSlots, normalizePlan, validateDuration
    sandbox.ts          # Daytona lifecycle wrapper
    anthropic.ts        # shared Claude client + text helper
    analyst.ts          # prompt + parse + run
    composer.ts         # ElevenLabs compose ×3
    judge.ts            # prompt + parse + run
    memory.ts           # SurrealDB Agent Memory REST
    style-tag.ts        # Gemini style tag
    ingest-link.ts      # Anchor browser video fetch
    store.ts            # in-memory jobs + .data/ files
    brands.ts           # brand list
    pipeline.ts         # orchestrates a job end to end
  app/
    page.tsx
    layout.tsx
    api/jobs/route.ts
    api/jobs/[id]/route.ts
    api/jobs/[id]/pick/route.ts
    api/jobs/[id]/preview/[variant]/route.ts
    api/brands/route.ts
  components/
    new-job-form.tsx
    job-view.tsx
    job-steps.tsx
    option-card.tsx
  instrumentation.ts
tests/
  slug.test.ts  json.test.ts  timing.test.ts  analyst.test.ts  judge.test.ts  memory.test.ts
scripts/
  try-sandbox.ts        # manual check of analyze.py + mux.sh in Daytona
```

**Parallelism:** after Task 1, Tasks 2, 3, 7, 8, 10 and 12 are independent. Tasks 4 and 6 need Task 2. Task 9 needs 2–8. Task 11 needs 9.

---

### Task 1: Scaffold, shared types, small utilities

**Files:**
- Create: Next.js app at repo root, `src/lib/types.ts`, `src/lib/slug.ts`, `src/lib/json.ts`, `src/lib/tracing.ts`, `.env.example`, `vitest.config.ts`
- Test: `tests/slug.test.ts`, `tests/json.test.ts`

**Interfaces:**
- Produces: all types below; `slugify(s: string): string`; `extractJson(text: string): unknown`; `withSpan<T>(name: string, kind: "CHAIN"|"TOOL"|"LLM"|"EVALUATOR", input: unknown, fn: (span: Span) => Promise<T>): Promise<T>`

- [ ] **Step 1: Scaffold Next.js into a temp dir and move it to the root** (repo root already has `docs/`, which create-next-app refuses)

```bash
npx create-next-app@latest .scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
rsync -a .scaffold/ ./ && rm -rf .scaffold
npx shadcn@latest init -d
npx shadcn@latest add button card input label select badge progress tabs separator skeleton sonner
npm i -D vitest
npm i @opentelemetry/api
```

Add to `package.json` scripts: `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Add to `.gitignore`: `.data/` and `.env.local`.

- [ ] **Step 2: Create `.env.example`**

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5
ELEVENLABS_API_KEY=
ELEVENLABS_MODEL=music_v2_5
DAYTONA_API_KEY=
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_TARGET=us
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
SURREAL_MEMORY_URL=
SURREAL_MEMORY_CONTEXT_ID=
SURREAL_MEMORY_API_KEY=
ARIZE_SPACE_ID=
ARIZE_API_KEY=
ARIZE_PROJECT=music-swap
ANCHOR_API_KEY=
```

Copy to `.env.local` and fill in the keys (sponsor coupons are in the spec's event notes: Daytona `DAYTONA_NYC_HACK_RDPTPZ4U`, Arize `HackSprintNYC26`, SurrealDB `HACKSPRINTNYC50`, Anchor `ANCHOR_HACKSPRINT_10_16_26`, ElevenLabs via their Discord).

- [ ] **Step 3: Create `src/lib/types.ts`**

```ts
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
  options: Option[];
  picked?: Variant;
  created_at: string;
};
```

- [ ] **Step 4: Write failing tests `tests/slug.test.ts` and `tests/json.test.ts`**

```ts
// tests/slug.test.ts
import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("normalises case and whitespace to one scope", () => {
    expect(slugify("Glossier")).toBe("glossier");
    expect(slugify(" glossier ")).toBe("glossier");
    expect(slugify("GLOSSIER")).toBe("glossier");
  });
  it("turns spaces and symbols into single dashes", () => {
    expect(slugify("Liquid Death!!")).toBe("liquid-death");
    expect(slugify("Ben & Jerry's")).toBe("ben-jerry-s");
  });
  it("falls back for empty input", () => {
    expect(slugify("   ")).toBe("unknown");
  });
});
```

```ts
// tests/json.test.ts
import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/json";

describe("extractJson", () => {
  it("parses bare JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses JSON inside code fences and prose", () => {
    expect(extractJson('Sure! Here it is:\n```json\n{"a":[1,2]}\n```\nHope that helps')).toEqual({ a: [1, 2] });
  });
  it("throws on no JSON", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON/);
  });
});
```

- [ ] **Step 5: Run tests, expect failure**

Run: `npm test`
Expected: FAIL, cannot resolve `@/lib/slug` and `@/lib/json`.

- [ ] **Step 6: Implement `src/lib/slug.ts` and `src/lib/json.ts`**

```ts
// src/lib/slug.ts
export function slugify(s: string): string {
  const slug = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "unknown";
}
```

```ts
// src/lib/json.ts
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found in model output");
  return JSON.parse(text.slice(start, end + 1));
}
```

- [ ] **Step 7: Create `src/lib/tracing.ts`** (works as a no-op until Task 11 registers a provider)

```ts
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

const tracer = trace.getTracer("music-swap");

export async function withSpan<T>(
  name: string,
  kind: "CHAIN" | "TOOL" | "LLM" | "EVALUATOR",
  input: unknown,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttribute("openinference.span.kind", kind);
    span.setAttribute("input.value", typeof input === "string" ? input : JSON.stringify(input));
    try {
      const out = await fn(span);
      span.setAttribute("output.value", typeof out === "string" ? out : JSON.stringify(out ?? null).slice(0, 8000));
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (e) {
      span.recordException(e as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
      throw e;
    } finally {
      span.end();
    }
  });
}
```

- [ ] **Step 8: Run tests, expect pass, and check the app boots**

Run: `npm test` → Expected: PASS (6 tests).
Run: `npm run dev`, open http://localhost:3000 → Next.js starter page renders. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + shadcn/ui, shared types and utils"
```

---

### Task 2: Timing logic (sections, normalisation, duration limits)

**Files:**
- Create: `src/lib/timing.ts`
- Test: `tests/timing.test.ts`

**Interfaces:**
- Consumes: `Analysis`, `SectionSlot`, `Plan` from `src/lib/types.ts`
- Produces: `MIN_SECTION_MS = 3000`, `MAX_SECTION_MS = 120000`, `MIN_VIDEO_MS = 3000`, `MAX_VIDEO_MS = 90000`, `DEFAULT_BPM = 100`, `sectionSlots(a: Pick<Analysis,"duration_ms"|"scene_cuts_ms"|"energy_peaks_ms">): SectionSlot[]`, `normalizePlan(plan: Plan, duration_ms: number): Plan`, `validateDuration(duration_ms: number): string | null`, `effectiveBpm(bpm: number): number`

- [ ] **Step 1: Write failing tests `tests/timing.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { sectionSlots, normalizePlan, validateDuration, effectiveBpm } from "@/lib/timing";
import type { Plan } from "@/lib/types";

const sum = (xs: { duration_ms: number }[]) => xs.reduce((n, x) => n + x.duration_ms, 0);

describe("sectionSlots", () => {
  it("splits at scene cuts and peaks, merged and sorted", () => {
    const slots = sectionSlots({ duration_ms: 20000, scene_cuts_ms: [12000, 5000], energy_peaks_ms: [8000] });
    expect(slots).toEqual([
      { start_ms: 0, duration_ms: 5000 },
      { start_ms: 5000, duration_ms: 3000 },
      { start_ms: 8000, duration_ms: 4000 },
      { start_ms: 12000, duration_ms: 8000 },
    ]);
  });
  it("drops boundaries closer than 3s to the previous one or to the end", () => {
    const slots = sectionSlots({ duration_ms: 15000, scene_cuts_ms: [1000, 4000, 5500, 13000], energy_peaks_ms: [] });
    expect(slots.map((s) => s.start_ms)).toEqual([0, 4000]);
    expect(sum(slots)).toBe(15000);
  });
  it("returns one full-length section when there are no cuts or peaks (silent/static clip)", () => {
    expect(sectionSlots({ duration_ms: 9000, scene_cuts_ms: [], energy_peaks_ms: [] })).toEqual([
      { start_ms: 0, duration_ms: 9000 },
    ]);
  });
  it("ignores out-of-range and duplicate boundaries", () => {
    const slots = sectionSlots({ duration_ms: 10000, scene_cuts_ms: [-5, 0, 5000, 5000, 10000, 12000], energy_peaks_ms: [5000] });
    expect(slots).toEqual([
      { start_ms: 0, duration_ms: 5000 },
      { start_ms: 5000, duration_ms: 5000 },
    ]);
  });
  it("rounds fractional input and always sums to duration", () => {
    const slots = sectionSlots({ duration_ms: 17333.6, scene_cuts_ms: [6100.4], energy_peaks_ms: [11999.5] });
    expect(sum(slots)).toBe(17334);
    expect(slots.every((s) => s.duration_ms >= 3000)).toBe(true);
  });
});

const plan = (durations: number[]): Plan => ({
  variant: "faithful",
  global_styles: ["lofi"],
  negative_styles: [],
  sections: durations.map((d, i) => ({ name: `S${i}`, duration_ms: d, styles: [] })),
});

describe("normalizePlan", () => {
  it("leaves a correct plan unchanged", () => {
    expect(normalizePlan(plan([5000, 5000]), 10000).sections.map((s) => s.duration_ms)).toEqual([5000, 5000]);
  });
  it("rescales to the video duration exactly", () => {
    const p = normalizePlan(plan([4000, 4000, 4000]), 15000);
    expect(sum(p.sections)).toBe(15000);
  });
  it("merges sections that end up under 3s", () => {
    const p = normalizePlan(plan([9000, 1000]), 10000);
    expect(p.sections).toHaveLength(1);
    expect(p.sections[0].duration_ms).toBe(10000);
  });
  it("creates one section when the plan has none", () => {
    const p = normalizePlan(plan([]), 8000);
    expect(p.sections).toEqual([{ name: "Main", duration_ms: 8000, styles: [] }]);
  });
});

describe("validateDuration", () => {
  it("rejects clips shorter than 3s or longer than 90s", () => {
    expect(validateDuration(2500)).toMatch(/at least 3 seconds/);
    expect(validateDuration(91000)).toMatch(/90 seconds or shorter/);
  });
  it("accepts 3s to 90s", () => {
    expect(validateDuration(3000)).toBeNull();
    expect(validateDuration(90000)).toBeNull();
  });
});

describe("effectiveBpm", () => {
  it("falls back when librosa finds no tempo", () => {
    expect(effectiveBpm(0)).toBe(100);
    expect(effectiveBpm(NaN)).toBe(100);
    expect(effectiveBpm(123.4)).toBe(123);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test -- tests/timing.test.ts`
Expected: FAIL, cannot resolve `@/lib/timing`.

- [ ] **Step 3: Implement `src/lib/timing.ts`**

```ts
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
  const candidates = [...new Set([...a.scene_cuts_ms, ...a.energy_peaks_ms].map(Math.round))]
    .filter((t) => t > 0 && t < d)
    .sort((x, y) => x - y);

  const kept: number[] = [];
  let prev = 0;
  for (const t of candidates) {
    if (t - prev >= MIN_SECTION_MS && d - t >= MIN_SECTION_MS) {
      kept.push(t);
      prev = t;
    }
  }

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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- tests/timing.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timing.ts tests/timing.test.ts
git commit -m "feat: section timing from cuts and peaks, plan normalisation"
```

---

### Task 3: Sandbox scripts and Daytona wrapper

**Files:**
- Create: `sandbox/analyze.py`, `sandbox/mux.sh`, `src/lib/sandbox.ts`, `scripts/try-sandbox.ts`
- Test: manual run via `scripts/try-sandbox.ts` on 2 sample clips

**Interfaces:**
- Produces:
  - `withJobSandbox<T>(fn: (sb: JobSandbox) => Promise<T>): Promise<T>` (always deletes the sandbox)
  - `type JobSandbox = { upload(buf: Buffer, path: string): Promise<void>; exec(cmd: string, timeoutSec?: number): Promise<string>; download(path: string): Promise<Buffer> }`
  - `WORK = "/tmp/job"`; `uploadScripts(sb: JobSandbox): Promise<void>`
  - In sandbox: `python analyze.py in.mp4 out` writes `out/analysis.json` (shape = `Analysis` with `style_tag: "unknown"`), `out/frames/f_XX.jpg`, `out/audio.mp3`. `bash mux.sh in.mp4 track.mp3 out.mp4`.

- [ ] **Step 1: Install and verify the Daytona SDK**

```bash
npm i @daytona/sdk || npm i @daytonaio/sdk
npm i -D tsx dotenv
```

Verify the package name that installed, and the `executeCommand` signature:

```bash
ls node_modules/@daytona/sdk 2>/dev/null && echo "@daytona/sdk" || echo "@daytonaio/sdk"
grep -rn "executeCommand(" node_modules/@daytona*/sdk/dist --include=*.d.ts | head -5
```

The code below assumes `executeCommand(command, cwd?, env?, timeoutSec?)` returning `{ exitCode, result }`. If the `.d.ts` shows an options object instead, change the one call in `exec()` to `executeCommand(cmd, { cwd: WORK, timeout: timeoutSec })` using the unit the type comment states. If the package is `@daytonaio/sdk`, change the import.

- [ ] **Step 2: Create `sandbox/analyze.py`**

```python
import json, os, re, subprocess, sys

import librosa
import numpy as np
from scipy.signal import find_peaks

src, out = sys.argv[1], sys.argv[2]
os.makedirs(f"{out}/frames", exist_ok=True)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


probe = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", src])
duration_ms = round(float(json.loads(probe.stdout)["format"]["duration"]) * 1000)

# Scene cuts: ffmpeg scene score > 0.3, timestamps parsed from showinfo on stderr.
scene = subprocess.run(
    ["ffmpeg", "-hide_banner", "-i", src, "-filter:v", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"],
    capture_output=True, text=True,
)
scene_cuts_ms = [round(float(t) * 1000) for t in re.findall(r"pts_time:([0-9.]+)", scene.stderr)]

# Keyframes: up to 8 evenly spaced, 512px wide.
n_frames = 8
step = max(duration_ms / 1000 / n_frames, 1.0)
run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src,
     "-vf", f"fps=1/{step:.3f},scale=512:-2", "-frames:v", str(n_frames), "-q:v", "4",
     f"{out}/frames/f_%02d.jpg"])
keyframes = sorted(f"frames/{f}" for f in os.listdir(f"{out}/frames") if f.endswith(".jpg"))

# Audio: wav for librosa, small mp3 for Gemini.
has_audio = subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", src],
    capture_output=True, text=True,
).stdout.strip() != ""

bpm, beats_ms, energy_peaks_ms = 0.0, [], []
if has_audio:
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "22050", f"{out}/audio.wav"])
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", src, "-ac", "1", "-b:a", "64k", f"{out}/audio.mp3"])
    y, sr = librosa.load(f"{out}/audio.wav", sr=22050)
    if np.max(np.abs(y)) > 1e-4:
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(np.atleast_1d(tempo)[0])
        beats_ms = [round(t * 1000) for t in librosa.frames_to_time(beat_frames, sr=sr)]
        rms = librosa.feature.rms(y=y)[0]
        smooth = np.convolve(rms, np.ones(20) / 20, mode="same")
        hop_s = 512 / sr
        peaks, props = find_peaks(smooth, prominence=np.max(smooth) * 0.15, distance=int(3 / hop_s))
        top = sorted(peaks[np.argsort(props["prominences"])[::-1][:5]])
        energy_peaks_ms = [round(p * hop_s * 1000) for p in top]

analysis = {
    "duration_ms": duration_ms,
    "bpm": bpm,
    "beats_ms": beats_ms,
    "scene_cuts_ms": scene_cuts_ms,
    "energy_peaks_ms": energy_peaks_ms,
    "style_tag": "unknown",
    "keyframes": keyframes,
}
with open(f"{out}/analysis.json", "w") as f:
    json.dump(analysis, f)
print(json.dumps({k: v for k, v in analysis.items() if k != "beats_ms"}))
```

- [ ] **Step 3: Create `sandbox/mux.sh`**

```bash
#!/usr/bin/env bash
# usage: mux.sh video.mp4 track.mp3 out.mp4 — replaces the video's audio with the track
set -euo pipefail
ffmpeg -y -hide_banner -loglevel error -i "$1" -i "$2" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$3"
```

- [ ] **Step 4: Create `src/lib/sandbox.ts`**

```ts
import { Daytona, Image } from "@daytona/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const WORK = "/tmp/job";

export type JobSandbox = {
  upload(buf: Buffer, remotePath: string): Promise<void>;
  exec(cmd: string, timeoutSec?: number): Promise<string>;
  download(remotePath: string): Promise<Buffer>;
};

// Built once by Daytona and cached; first job of the day takes longer.
const image = Image.debianSlim("3.12")
  .runCommands("apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*")
  .pipInstall(["librosa==0.10.2.post1", "numpy", "scipy", "soundfile"]);

let client: Daytona | null = null;
const daytona = () => (client ??= new Daytona());

export async function withJobSandbox<T>(fn: (sb: JobSandbox) => Promise<T>): Promise<T> {
  const sandbox = await daytona().create({ image }, { onLogs: (l: string) => console.log("[daytona]", l) });
  const sb: JobSandbox = {
    async upload(buf, remotePath) {
      await sandbox.fs.uploadFile(buf, remotePath);
    },
    async exec(cmd, timeoutSec = 300) {
      const r = await sandbox.process.executeCommand(cmd, WORK, undefined, timeoutSec);
      if (r.exitCode !== 0) throw new Error(`sandbox command failed (${r.exitCode}): ${cmd}\n${r.result}`);
      return r.result;
    },
    async download(remotePath) {
      return Buffer.from(await sandbox.fs.downloadFile(remotePath));
    },
  };
  try {
    await sandbox.process.executeCommand(`mkdir -p ${WORK}`);
    return await fn(sb);
  } finally {
    await sandbox.delete().catch((e: unknown) => console.error("[daytona] delete failed", e));
  }
}

export async function uploadScripts(sb: JobSandbox) {
  for (const f of ["analyze.py", "mux.sh"]) {
    await sb.upload(await readFile(path.join(process.cwd(), "sandbox", f)), `${WORK}/${f}`);
  }
}
```

- [ ] **Step 5: Create `scripts/try-sandbox.ts`**

```ts
import { config } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { withJobSandbox, uploadScripts, WORK } from "../src/lib/sandbox";

config({ path: ".env.local" });

async function main() {
  const [video, track] = process.argv.slice(2);
  if (!video) throw new Error("usage: npx tsx scripts/try-sandbox.ts clip.mp4 [track.mp3]");
  await withJobSandbox(async (sb) => {
    await uploadScripts(sb);
    await sb.upload(await readFile(video), `${WORK}/in.mp4`);
    console.log(await sb.exec("python analyze.py in.mp4 out", 300));
    if (track) {
      await sb.upload(await readFile(track), `${WORK}/track.mp3`);
      await sb.exec("bash mux.sh in.mp4 track.mp3 out/preview.mp4", 120);
      await writeFile("preview.mp4", await sb.download(`${WORK}/out/preview.mp4`));
      console.log("wrote preview.mp4");
    }
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Run it on 2 sample clips**

Put two 15–30s clips with music in `samples/` (add `samples/` and `preview.mp4` to `.gitignore`). Then:

```bash
npx tsx scripts/try-sandbox.ts samples/clip1.mp4
npx tsx scripts/try-sandbox.ts samples/clip2.mp4 samples/any-track.mp3
```

Expected: JSON with plausible `duration_ms`, `bpm` (check by tapping along), `scene_cuts_ms` that match visible cuts, 1–5 `energy_peaks_ms`, and 8 keyframes. Second run writes `preview.mp4` that plays with the new audio.

If image build fails on `runCommands`/`pipInstall` names, check `grep -n "runCommands\|pipInstall" node_modules/@daytona*/sdk/dist/**/Image.d.ts` and adjust. If the image build is too slow (>3 min), fall back to the default sandbox plus `exec("pip install librosa scipy soundfile && (which ffmpeg || sudo apt-get install -y ffmpeg)")` at the start of `withJobSandbox`.

- [ ] **Step 7: Commit**

```bash
git add sandbox src/lib/sandbox.ts scripts/try-sandbox.ts .gitignore package.json package-lock.json
git commit -m "feat: Daytona sandbox with ffmpeg/librosa analysis and mux"
```

---

### Task 4: Analyst (Claude brief + 3 composition plans)

**Files:**
- Create: `src/lib/anthropic.ts`, `src/lib/analyst.ts`
- Test: `tests/analyst.test.ts`

**Interfaces:**
- Consumes: `extractJson`, `normalizePlan`, `effectiveBpm`, `withSpan`, types
- Produces:
  - `claudeText(content: Anthropic.ContentBlockParam[], maxTokens?: number): Promise<string>`
  - `analystPrompt(args: { brand: string; facts: string[]; analysis: Analysis; slots: SectionSlot[] }): string`
  - `parseAnalystOutput(text: string, slots: SectionSlot[], duration_ms: number): { brief: Brief; plans: Plan[] }`
  - `runAnalyst(args: { brand: string; facts: string[]; analysis: Analysis; slots: SectionSlot[]; frames: Buffer[] }): Promise<{ brief: Brief; plans: Plan[] }>`

- [ ] **Step 1: Install**

```bash
npm i @anthropic-ai/sdk
```

- [ ] **Step 2: Write failing tests `tests/analyst.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseAnalystOutput, analystPrompt } from "@/lib/analyst";
import type { Analysis, SectionSlot } from "@/lib/types";

const slots: SectionSlot[] = [
  { start_ms: 0, duration_ms: 6000 },
  { start_ms: 6000, duration_ms: 9000 },
];

const good = {
  brief: { summary: "skincare routine", mood: "calm", avoid: ["trap"], key_moments: [{ at_ms: 6000, why: "product reveal" }] },
  plans: ["faithful", "brand", "wildcard"].map((v) => ({
    variant: v,
    global_styles: ["airy pop", "95 BPM"],
    negative_styles: ["heavy bass"],
    sections: [{ name: "Intro", styles: ["soft pads"] }, { name: "Reveal", styles: ["lift"] }],
  })),
};

describe("parseAnalystOutput", () => {
  it("parses fenced JSON and takes durations from slots, not the model", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```";
    const { brief, plans } = parseAnalystOutput(text, slots, 15000);
    expect(brief.mood).toBe("calm");
    expect(plans.map((p) => p.variant)).toEqual(["faithful", "brand", "wildcard"]);
    expect(plans[0].sections).toEqual([
      { name: "Intro", duration_ms: 6000, styles: ["soft pads"] },
      { name: "Reveal", duration_ms: 9000, styles: ["lift"] },
    ]);
  });

  it("fills missing sections when the model returns too few", () => {
    const short = structuredClone(good);
    short.plans[1].sections = [{ name: "Only", styles: [] }];
    const { plans } = parseAnalystOutput(JSON.stringify(short), slots, 15000);
    expect(plans[1].sections.map((s) => s.name)).toEqual(["Only", "Part 2"]);
    expect(plans[1].sections.reduce((n, s) => n + s.duration_ms, 0)).toBe(15000);
  });

  it("ignores extra sections beyond the slots", () => {
    const long = structuredClone(good);
    long.plans[2].sections.push({ name: "Extra", styles: [] });
    const { plans } = parseAnalystOutput(JSON.stringify(long), slots, 15000);
    expect(plans[2].sections).toHaveLength(2);
  });

  it("throws when a variant is missing", () => {
    const missing = structuredClone(good);
    missing.plans = missing.plans.slice(0, 2);
    expect(() => parseAnalystOutput(JSON.stringify(missing), slots, 15000)).toThrow(/wildcard/);
  });

  it("defaults brief fields that are missing", () => {
    const noBrief = { ...good, brief: {} };
    const { brief } = parseAnalystOutput(JSON.stringify(noBrief), slots, 15000);
    expect(brief).toEqual({ summary: "", mood: "", avoid: [], key_moments: [] });
  });
});

describe("analystPrompt", () => {
  it("uses fallback BPM and lists every slot", () => {
    const analysis: Analysis = {
      duration_ms: 15000, bpm: 0, beats_ms: [], scene_cuts_ms: [6000], energy_peaks_ms: [],
      style_tag: "unknown", keyframes: [],
    };
    const p = analystPrompt({ brand: "Glossier", facts: [], analysis, slots });
    expect(p).toContain("100 BPM");
    expect(p).toContain("1. starts 0ms, lasts 6000ms");
    expect(p).toContain("2. starts 6000ms, lasts 9000ms");
    expect(p).toContain("exactly 2 sections");
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

Run: `npm test -- tests/analyst.test.ts`
Expected: FAIL, cannot resolve `@/lib/analyst`.

- [ ] **Step 4: Implement `src/lib/anthropic.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
export const anthropic = () => (client ??= new Anthropic());
export const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export async function claudeText(content: Anthropic.ContentBlockParam[], maxTokens = 4000): Promise<string> {
  const msg = await anthropic().messages.create({
    model: MODEL(),
    max_tokens: maxTokens,
    messages: [{ role: "user", content }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}
```

- [ ] **Step 5: Implement `src/lib/analyst.ts`**

```ts
import type { Analysis, Brief, Plan, SectionSlot, Variant } from "./types";
import { VARIANTS } from "./types";
import { extractJson } from "./json";
import { effectiveBpm, normalizePlan } from "./timing";
import { claudeText } from "./anthropic";
import { withSpan } from "./tracing";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function analystPrompt({ brand, facts, analysis, slots }: {
  brand: string; facts: string[]; analysis: Analysis; slots: SectionSlot[];
}): string {
  return `You are a music supervisor replacing copyrighted music in a short brand video with new, original, instrumental music.

Brand: ${brand}
What we know about this brand's music preferences (newer facts win):
${facts.length ? facts.map((f) => `- ${f}`).join("\n") : "- nothing yet"}

Measured video analysis:
- duration: ${analysis.duration_ms}ms
- original track tempo: ${effectiveBpm(analysis.bpm)} BPM
- original track style: ${analysis.style_tag}
- scene cuts (ms): ${analysis.scene_cuts_ms.join(", ") || "none"}
- energy peaks (ms): ${analysis.energy_peaks_ms.join(", ") || "none"}
The attached images are keyframes in chronological order.

The music must change at these fixed section boundaries:
${slots.map((s, i) => `${i + 1}. starts ${s.start_ms}ms, lasts ${s.duration_ms}ms`).join("\n")}

Write:
1. A brief: what the content is, the mood the music should carry, things to avoid, and the key moments.
2. Three music plans, one per variant:
   - "faithful": keeps the feel, tempo and energy of the original track without copying it
   - "brand": follows the brand's preferences above
   - "wildcard": a deliberate creative contrast that still respects the timing and the brand's avoid list
   Each plan has global_styles (genre, instruments, BPM, mood; 3-8 short tags), negative_styles, and exactly ${slots.length} sections in the order above, each with a short name and 2-5 style tags for how the music changes there.

Reply with only JSON in this shape:
{"brief":{"summary":"","mood":"","avoid":[],"key_moments":[{"at_ms":0,"why":""}]},
 "plans":[{"variant":"faithful","global_styles":[],"negative_styles":[],"sections":[{"name":"","styles":[]}]}]}`;
}

export function parseAnalystOutput(text: string, slots: SectionSlot[], duration_ms: number): { brief: Brief; plans: Plan[] } {
  const raw = extractJson(text) as { brief?: Record<string, unknown>; plans?: Record<string, unknown>[] };
  const b = raw.brief ?? {};
  const brief: Brief = {
    summary: str(b.summary),
    mood: str(b.mood),
    avoid: strs(b.avoid),
    key_moments: Array.isArray(b.key_moments)
      ? (b.key_moments as Record<string, unknown>[])
          .filter((m) => typeof m?.at_ms === "number")
          .map((m) => ({ at_ms: m.at_ms as number, why: str(m.why) }))
      : [],
  };

  const plans = VARIANTS.map((variant: Variant) => {
    const p = (raw.plans ?? []).find((x) => x?.variant === variant);
    if (!p) throw new Error(`analyst output missing plan for variant "${variant}"`);
    const secs = Array.isArray(p.sections) ? (p.sections as Record<string, unknown>[]) : [];
    const plan: Plan = {
      variant,
      global_styles: strs(p.global_styles),
      negative_styles: strs(p.negative_styles),
      sections: slots.map((slot, i) => ({
        name: str(secs[i]?.name) || `Part ${i + 1}`,
        duration_ms: slot.duration_ms,
        styles: strs(secs[i]?.styles),
      })),
    };
    return normalizePlan(plan, duration_ms);
  });

  return { brief, plans };
}

export async function runAnalyst(args: {
  brand: string; facts: string[]; analysis: Analysis; slots: SectionSlot[]; frames: Buffer[];
}): Promise<{ brief: Brief; plans: Plan[] }> {
  return withSpan("analyst", "CHAIN", { brand: args.brand, facts: args.facts, slots: args.slots }, async () => {
    const content = [
      ...args.frames.map((f) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/jpeg" as const, data: f.toString("base64") },
      })),
      { type: "text" as const, text: analystPrompt(args) },
    ];
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await claudeText(content);
      try {
        return parseAnalystOutput(text, args.slots, args.analysis.duration_ms);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`analyst returned unusable output: ${(lastErr as Error).message}`);
  });
}
```

- [ ] **Step 6: Run tests, expect pass**

Run: `npm test -- tests/analyst.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/anthropic.ts src/lib/analyst.ts tests/analyst.test.ts package.json package-lock.json
git commit -m "feat: Claude analyst writes brief and 3 timed composition plans"
```

---

### Task 5: Composer (ElevenLabs Music ×3)

**Files:**
- Create: `src/lib/composer.ts`
- Test: manual check script inline in Step 4

**Interfaces:**
- Consumes: `Plan`, `Variant`, `withSpan`
- Produces: `composeAll(plans: Plan[]): Promise<{ tracks: { variant: Variant; audio: Buffer }[]; errors: { variant: Variant; message: string }[] }>`

- [ ] **Step 1: Install and verify the composition plan field names**

```bash
npm i @elevenlabs/elevenlabs-js
grep -rln "compositionPlan\|CompositionPlan" node_modules/@elevenlabs/elevenlabs-js/dist | head
grep -rn "positiveGlobalStyles\|sectionName\|durationMs\|positiveLocalStyles\|forceInstrumental\|outputFormat" node_modules/@elevenlabs/elevenlabs-js/dist --include=*.d.ts | head -20
```

The code below uses `music.compose({ compositionPlan: { positiveGlobalStyles, negativeGlobalStyles, sections: [{ sectionName, positiveLocalStyles, negativeLocalStyles, durationMs, lines }] }, modelId, outputFormat })`. If the `.d.ts` names differ, change only `toElevenPlan()` and the `compose` call to match.

- [ ] **Step 2: Implement `src/lib/composer.ts`**

```ts
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { Plan, Variant } from "./types";
import { withSpan } from "./tracing";

let client: ElevenLabsClient | null = null;
const el = () => (client ??= new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }));

const TIMEOUT_MS = 120_000;

export function toElevenPlan(plan: Plan) {
  return {
    positiveGlobalStyles: [...plan.global_styles, "instrumental"],
    negativeGlobalStyles: [...plan.negative_styles, "vocals", "singing"],
    sections: plan.sections.map((s) => ({
      sectionName: s.name.slice(0, 100) || "Section",
      positiveLocalStyles: s.styles,
      negativeLocalStyles: [],
      durationMs: s.duration_ms,
      lines: [],
    })),
  };
}

async function toBuffer(audio: unknown): Promise<Buffer> {
  if (audio instanceof Uint8Array) return Buffer.from(audio);
  const chunks: Buffer[] = [];
  for await (const c of audio as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

async function composeOne(plan: Plan): Promise<Buffer> {
  return withSpan(`composer.${plan.variant}`, "TOOL", toElevenPlan(plan), async () => {
    const audio = await Promise.race([
      el().music.compose({
        compositionPlan: toElevenPlan(plan),
        modelId: process.env.ELEVENLABS_MODEL || "music_v2_5",
        outputFormat: "mp3_44100_128",
      } as Parameters<ElevenLabsClient["music"]["compose"]>[0]),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("ElevenLabs timed out")), TIMEOUT_MS)),
    ]);
    const buf = await toBuffer(audio);
    if (buf.length < 1000) throw new Error("ElevenLabs returned empty audio");
    return buf;
  });
}

export async function composeAll(plans: Plan[]) {
  const settled = await Promise.allSettled(plans.map(composeOne));
  const tracks: { variant: Variant; audio: Buffer }[] = [];
  const errors: { variant: Variant; message: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") tracks.push({ variant: plans[i].variant, audio: r.value });
    else errors.push({ variant: plans[i].variant, message: (r.reason as Error).message });
  });
  return { tracks, errors };
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/composer.ts`. If `compose` params don't match, fix field names per Step 1.

- [ ] **Step 4: Manual check, one real generation**

Create `scripts/try-compose.ts`:

```ts
import { config } from "dotenv";
import { writeFile } from "node:fs/promises";
import { composeAll } from "../src/lib/composer";

config({ path: ".env.local" });

async function main() {
  const plan = {
    variant: "faithful" as const,
    global_styles: ["airy pop", "95 BPM"],
    negative_styles: [],
    sections: [
      { name: "Intro", duration_ms: 5000, styles: ["soft pads"] },
      { name: "Lift", duration_ms: 5000, styles: ["drums enter"] },
    ],
  };
  const { tracks, errors } = await composeAll([plan]);
  console.log({ ok: tracks.length, errors });
  if (tracks[0]) await writeFile("try.mp3", tracks[0].audio);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run: `npx tsx scripts/try-compose.ts`

Expected: `{ ok: 1, errors: [] }`, and `try.mp3` is about 10s with an audible change at 5s. Delete `try.mp3` after listening.

- [ ] **Step 5: Commit**

```bash
git add src/lib/composer.ts scripts/try-compose.ts package.json package-lock.json
git commit -m "feat: ElevenLabs composer generates 3 tracks in parallel"
```

---

### Task 6: Judge (score options, pick recommended)

**Files:**
- Create: `src/lib/judge.ts`
- Test: `tests/judge.test.ts`

**Interfaces:**
- Consumes: `extractJson`, `claudeText`, `withSpan`, `Brief`, `Plan`, `Score`, `Variant`, `VARIANTS`
- Produces: `parseJudgeOutput(text: string, variants: Variant[]): Score[]`; `runJudge(args: { brand: string; facts: string[]; brief: Brief; plans: Plan[] }): Promise<Score[]>` (returns one `Score` per plan, exactly one `recommended: true`)

- [ ] **Step 1: Write failing tests `tests/judge.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseJudgeOutput } from "@/lib/judge";

describe("parseJudgeOutput", () => {
  it("marks the highest score as recommended", () => {
    const text = JSON.stringify({ scores: [
      { variant: "faithful", score: 7, rationale: "close to original" },
      { variant: "brand", score: 9, rationale: "on brand" },
      { variant: "wildcard", score: 5, rationale: "bold" },
    ] });
    const s = parseJudgeOutput(text, ["faithful", "brand", "wildcard"]);
    expect(s.filter((x) => x.recommended).map((x) => x.variant)).toEqual(["brand"]);
  });

  it("clamps scores to 0-10 and breaks ties in variant order", () => {
    const text = '```json\n{"scores":[{"variant":"wildcard","score":14},{"variant":"faithful","score":10}]}\n```';
    const s = parseJudgeOutput(text, ["faithful", "wildcard"]);
    expect(s.find((x) => x.variant === "wildcard")!.score).toBe(10);
    expect(s.find((x) => x.recommended)!.variant).toBe("faithful");
  });

  it("gives unscored variants 0 and only returns requested variants", () => {
    const text = JSON.stringify({ scores: [{ variant: "brand", score: 6, rationale: "ok" }, { variant: "faithful", score: 8 }] });
    const s = parseJudgeOutput(text, ["brand", "wildcard"]);
    expect(s.map((x) => x.variant)).toEqual(["brand", "wildcard"]);
    expect(s[1]).toMatchObject({ score: 0, rationale: "not scored", recommended: false });
    expect(s[0].recommended).toBe(true);
  });

  it("still recommends one option when output is garbage", () => {
    const s = parseJudgeOutput("sorry, I cannot", ["faithful", "brand"]);
    expect(s.filter((x) => x.recommended)).toHaveLength(1);
    expect(s[0].recommended).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, expect failure**

Run: `npm test -- tests/judge.test.ts`
Expected: FAIL, cannot resolve `@/lib/judge`.

- [ ] **Step 3: Implement `src/lib/judge.ts`**

```ts
import type { Brief, Plan, Score, Variant } from "./types";
import { VARIANTS } from "./types";
import { extractJson } from "./json";
import { claudeText } from "./anthropic";
import { withSpan } from "./tracing";

export function parseJudgeOutput(text: string, variants: Variant[]): Score[] {
  let raw: { variant?: unknown; score?: unknown; rationale?: unknown }[] = [];
  try {
    const parsed = extractJson(text) as { scores?: unknown };
    if (Array.isArray(parsed.scores)) raw = parsed.scores;
  } catch {
    raw = [];
  }
  const ordered = VARIANTS.filter((v) => variants.includes(v));
  const scores: Score[] = ordered.map((variant) => {
    const r = raw.find((x) => x?.variant === variant);
    const n = typeof r?.score === "number" ? Math.min(10, Math.max(0, r.score)) : 0;
    return {
      variant,
      score: n,
      rationale: r ? (typeof r.rationale === "string" ? r.rationale : "") : "not scored",
      recommended: false,
    };
  });
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a), scores[0]);
  if (best) best.recommended = true;
  return scores;
}

export async function runJudge(args: { brand: string; facts: string[]; brief: Brief; plans: Plan[] }): Promise<Score[]> {
  return withSpan("judge", "EVALUATOR", args, async (span) => {
    const prompt = `You are judging replacement music plans for a brand video.

Brand: ${args.brand}
Brand facts (newer win):
${args.facts.length ? args.facts.map((f) => `- ${f}`).join("\n") : "- none"}

Brief: ${JSON.stringify(args.brief)}

Plans:
${args.plans.map((p) => JSON.stringify(p)).join("\n")}

Score each plan 0-10 for how well it fits the brief, the key moments, and the brand facts. Respect the avoid list strictly. One sentence of rationale each, written for the creator.
Reply with only JSON: {"scores":[{"variant":"faithful","score":0,"rationale":""}]}`;
    const scores = parseJudgeOutput(await claudeText([{ type: "text", text: prompt }], 1500), args.plans.map((p) => p.variant));
    for (const s of scores) {
      span.setAttribute(`eval.music_fit.${s.variant}.score`, s.score);
      span.setAttribute(`eval.music_fit.${s.variant}.explanation`, s.rationale);
    }
    span.setAttribute("eval.music_fit.label", scores.find((s) => s.recommended)?.variant ?? "none");
    return scores;
  });
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `npm test -- tests/judge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/judge.ts tests/judge.test.ts
git commit -m "feat: Claude judge scores options and picks a recommendation"
```

---

### Task 7: Brand memory (SurrealDB Agent Memory)

**Files:**
- Create: `src/lib/memory.ts`
- Test: `tests/memory.test.ts`

**Interfaces:**
- Consumes: `slugify`, `withSpan`
- Produces: `brandScope(brand: string): string`; `pickTexts(json: unknown): string[]`; `recallBrandFacts(brand: string): Promise<string[]>` (returns `[]` on any failure or when unconfigured); `rememberBrandFact(brand: string, text: string): Promise<void>` (never throws)

- [ ] **Step 1: Set up the memory context and check the response shape**

In studio.surrealdb.com: Billing → redeem `HACKSPRINTNYC50` → Agent Memory → Deploy new context. Copy the context URL, context id and an API key into `.env.local` as `SURREAL_MEMORY_URL`, `SURREAL_MEMORY_CONTEXT_ID`, `SURREAL_MEMORY_API_KEY`. Then write one fact and query it, and look at the JSON that comes back:

```bash
set -a; source .env.local; set +a
B="$SURREAL_MEMORY_URL/api/v1/$SURREAL_MEMORY_CONTEXT_ID"
curl -s -X POST "$B/facts" -H "Authorization: Bearer $SURREAL_MEMORY_API_KEY" -H "content-type: application/json" \
  -d '{"text":"Glossier prefers soft, airy pop music","infer":"full","scopes":[["brand/glossier"]]}'
curl -s -X POST "$B/query" -H "Authorization: Bearer $SURREAL_MEMORY_API_KEY" -H "content-type: application/json" \
  -d '{"query":"music preferences","lens":[["brand/glossier"]],"k":5}'
```

If the write rejects `[["brand/glossier"]]`, use the flat form `["brand/glossier"]` for both `scopes` and `lens` in `memory.ts`. `pickTexts` below handles common response shapes; if the query response nests text under a different key, add that key to `TEXT_KEYS`.

- [ ] **Step 2: Write failing tests `tests/memory.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { brandScope, pickTexts } from "@/lib/memory";

describe("brandScope", () => {
  it("is stable across casing and spacing", () => {
    expect(brandScope(" Glossier ")).toBe("brand/glossier");
    expect(brandScope("GLOSSIER")).toBe("brand/glossier");
  });
});

describe("pickTexts", () => {
  it("finds text in common response shapes", () => {
    expect(pickTexts({ results: [{ text: "a" }, { fact: { text: "b" } }] })).toEqual(["a", "b"]);
    expect(pickTexts({ facts: [{ content: "c" }] })).toEqual(["c"]);
    expect(pickTexts([{ statement: "d" }])).toEqual(["d"]);
  });
  it("dedupes and ignores non-text", () => {
    expect(pickTexts({ results: [{ text: "a" }, { text: "a" }, { score: 1 }] })).toEqual(["a"]);
  });
  it("returns [] for junk", () => {
    expect(pickTexts(null)).toEqual([]);
    expect(pickTexts("oops")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests, expect failure**

Run: `npm test -- tests/memory.test.ts`
Expected: FAIL, cannot resolve `@/lib/memory`.

- [ ] **Step 4: Implement `src/lib/memory.ts`**

```ts
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
```

- [ ] **Step 5: Run tests, expect pass**

Run: `npm test -- tests/memory.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/memory.ts tests/memory.test.ts
git commit -m "feat: SurrealDB brand memory recall and remember"
```

---

### Task 8: Style tag (Gemini listens to the original track)

**Files:**
- Create: `src/lib/style-tag.ts`

**Interfaces:**
- Consumes: `withSpan`
- Produces: `styleTag(audioMp3: Buffer | null): Promise<string>` (returns `"unknown"` when no audio, no key, or any error)

- [ ] **Step 1: Install**

```bash
npm i @google/genai
```

- [ ] **Step 2: Implement `src/lib/style-tag.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import { withSpan } from "./tracing";

export async function styleTag(audioMp3: Buffer | null): Promise<string> {
  if (!audioMp3 || !process.env.GEMINI_API_KEY) return "unknown";
  try {
    return await withSpan("style_tag", "LLM", { bytes: audioMp3.length }, async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const res = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        contents: [
          { inlineData: { mimeType: "audio/mp3", data: audioMp3.toString("base64") } },
          { text: "Describe the background music in one line of comma-separated tags: genre, main instruments, mood, approximate BPM. Ignore speech. If there is no music, reply exactly: no music" },
        ],
      });
      return (res.text ?? "").trim().split("\n")[0].slice(0, 200) || "unknown";
    });
  } catch (e) {
    console.error("[style-tag] failed", e);
    return "unknown";
  }
}
```

- [ ] **Step 3: Manual check**

Create `scripts/try-style.ts`:

```ts
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { styleTag } from "../src/lib/style-tag";

config({ path: ".env.local" });

async function main() {
  console.log(await styleTag(await readFile(process.argv[2])));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run:

```bash
ffmpeg -y -loglevel error -i samples/clip1.mp4 -ac 1 -b:a 64k /tmp/clip1.mp3
npx tsx scripts/try-style.ts /tmp/clip1.mp3
```

Expected: one line like `upbeat pop, synths, claps, energetic, ~120 BPM`. If it prints `unknown` and logs a model error, try `GEMINI_MODEL=gemini-3.6-flash`, or switch to `ai.interactions.create({ model, input: [{ type: "text", text }, { type: "audio", data, mime_type: "audio/mp3" }] })` and read `output_text`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/style-tag.ts scripts/try-style.ts package.json package-lock.json
git commit -m "feat: Gemini style tag for the original track"
```

---

### Task 9: Job store, pipeline and API routes

**Files:**
- Create: `src/lib/store.ts`, `src/lib/brands.ts`, `src/lib/pipeline.ts`, `src/app/api/jobs/route.ts`, `src/app/api/jobs/[id]/route.ts`, `src/app/api/jobs/[id]/pick/route.ts`, `src/app/api/jobs/[id]/preview/[variant]/route.ts`, `src/app/api/brands/route.ts`
- Modify: `next.config.ts` (body size for uploads)

**Interfaces:**
- Consumes: everything from Tasks 2–8; `fetchVideoFromLink` from Task 12 (route imports it lazily so Task 12 can land later)
- Produces (HTTP):
  - `POST /api/jobs` multipart `file` or `url`, plus `brand`; or `demo=1` → `{ id }`
  - `GET /api/jobs/:id` → `Job`
  - `POST /api/jobs/:id/pick` JSON `{ variant }` → `{ ok: true }`
  - `GET /api/jobs/:id/preview/:variant[?download=1]` → `video/mp4` (supports Range)
  - `GET /api/brands` → `string[]`
- Produces (TS): `createJob(brand: string): Job`, `getJob(id: string): Promise<Job | null>`, `updateJob(job: Job, patch: Partial<Job>): Promise<void>`, `jobDir(id: string): string`, `DEMO_DIR`, `listBrands(): Promise<string[]>`, `addBrand(name: string): Promise<void>`, `runPipeline(job: Job, video: Buffer): Promise<void>`

- [ ] **Step 1: Implement `src/lib/store.ts`**

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "./types";

const DATA = path.join(process.cwd(), ".data");
export const DEMO_DIR = path.join(DATA, "demo");
export const jobDir = (id: string) => path.join(DATA, "jobs", id.replace(/[^a-z0-9-]/gi, ""));

// globalThis survives Next dev hot reloads
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const jobs = (g.__jobs ??= new Map<string, Job>());

export function createJob(brand: string): Job {
  const job: Job = { id: randomUUID(), brand, status: "ingesting", options: [], created_at: new Date().toISOString() };
  jobs.set(job.id, job);
  return job;
}

export async function updateJob(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch);
  await mkdir(jobDir(job.id), { recursive: true });
  await writeFile(path.join(jobDir(job.id), "job.json"), JSON.stringify(job, null, 2));
}

export async function getJob(id: string): Promise<Job | null> {
  const mem = jobs.get(id);
  if (mem) return mem;
  try {
    const job = JSON.parse(await readFile(path.join(jobDir(id), "job.json"), "utf8")) as Job;
    jobs.set(id, job);
    return job;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Implement `src/lib/brands.ts`**

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./slug";

const FILE = path.join(process.cwd(), ".data", "brands.json");
const SEED = ["Glossier", "Nike", "Liquid Death"];

export async function listBrands(): Promise<string[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8"));
  } catch {
    return SEED;
  }
}

export async function addBrand(name: string) {
  const brands = await listBrands();
  if (brands.some((b) => slugify(b) === slugify(name))) return;
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify([...brands, name.trim()]));
}
```

- [ ] **Step 3: Implement `src/lib/pipeline.ts`**

```ts
import { mkdir, writeFile, cp } from "node:fs/promises";
import path from "node:path";
import type { Analysis, Job, JobStatus, Option } from "./types";
import { withJobSandbox, uploadScripts, WORK } from "./sandbox";
import { sectionSlots, validateDuration } from "./timing";
import { styleTag } from "./style-tag";
import { recallBrandFacts } from "./memory";
import { runAnalyst } from "./analyst";
import { composeAll } from "./composer";
import { runJudge } from "./judge";
import { updateJob, jobDir, DEMO_DIR } from "./store";
import { withSpan } from "./tracing";

export async function runPipeline(job: Job, video: Buffer): Promise<void> {
  const dir = jobDir(job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "in.mp4"), video);
  let step: JobStatus = "analyzing";
  const set = async (s: JobStatus) => {
    step = s;
    await updateJob(job, { status: s });
  };

  try {
    await withSpan("pipeline", "CHAIN", { job: job.id, brand: job.brand }, () =>
      withJobSandbox(async (sb) => {
        await set("analyzing");
        await uploadScripts(sb);
        await sb.upload(video, `${WORK}/in.mp4`);
        await withSpan("sandbox.analyze", "TOOL", { bytes: video.length }, () => sb.exec("python analyze.py in.mp4 out", 300));
        const analysis = JSON.parse((await sb.download(`${WORK}/out/analysis.json`)).toString()) as Analysis;
        const tooLong = validateDuration(analysis.duration_ms);
        if (tooLong) throw new Error(tooLong);

        const [frames, audio, facts] = await Promise.all([
          Promise.all(analysis.keyframes.map((k) => sb.download(`${WORK}/out/${k}`))),
          sb.download(`${WORK}/out/audio.mp3`).catch(() => null),
          recallBrandFacts(job.brand),
        ]);
        analysis.style_tag = await styleTag(audio);
        const slots = sectionSlots(analysis);
        const { brief, plans } = await runAnalyst({ brand: job.brand, facts, analysis, slots, frames });
        await updateJob(job, { brief });

        await set("composing");
        const { tracks, errors } = await composeAll(plans);
        if (errors.length) console.error("[pipeline] compose errors", errors);
        if (tracks.length === 0) throw new Error(`Music generation failed: ${errors.map((e) => e.message).join("; ")}`);

        await set("muxing");
        for (const t of tracks) {
          await writeFile(path.join(dir, `track_${t.variant}.mp3`), t.audio);
          await sb.upload(t.audio, `${WORK}/track_${t.variant}.mp3`);
          await sb.exec(`bash mux.sh in.mp4 track_${t.variant}.mp3 out/preview_${t.variant}.mp4`, 120);
          await writeFile(path.join(dir, `preview_${t.variant}.mp4`), await sb.download(`${WORK}/out/preview_${t.variant}.mp4`));
        }

        await set("judging");
        const okPlans = plans.filter((p) => tracks.some((t) => t.variant === p.variant));
        const scores = await runJudge({ brand: job.brand, facts, brief, plans: okPlans });
        const options: Option[] = scores.map((s) => ({
          ...s,
          plan: okPlans.find((p) => p.variant === s.variant)!,
          preview_url: `/api/jobs/${job.id}/preview/${s.variant}`,
        }));
        await updateJob(job, { options, status: "ready" });
        await cp(dir, path.join(DEMO_DIR, "latest"), { recursive: true }).catch(() => {});
      }),
    );
  } catch (e) {
    console.error("[pipeline] failed", e);
    await updateJob(job, { status: "failed", failed_step: step, error: (e as Error).message });
  }
}
```

- [ ] **Step 4: Allow large uploads in `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@daytona/sdk", "playwright-core", "@opentelemetry/sdk-trace-node"],
  experimental: { serverActions: { bodySizeLimit: "100mb" } },
};

export default nextConfig;
```

If `@daytonaio/sdk` was installed in Task 3, use that name here.

- [ ] **Step 5: Implement `src/app/api/jobs/route.ts`**

```ts
import { NextResponse } from "next/server";
import { readFile, cp } from "node:fs/promises";
import path from "node:path";
import { createJob, updateJob, jobDir, DEMO_DIR } from "@/lib/store";
import { addBrand } from "@/lib/brands";
import { runPipeline } from "@/lib/pipeline";
import type { Job } from "@/lib/types";

export const runtime = "nodejs";
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData();
  const brand = String(form.get("brand") ?? "").trim();
  if (!brand) return NextResponse.json({ error: "Pick a brand." }, { status: 400 });

  if (form.get("demo") === "1") {
    const job = createJob(brand);
    try {
      const saved = JSON.parse(await readFile(path.join(DEMO_DIR, "latest", "job.json"), "utf8")) as Job;
      await cp(path.join(DEMO_DIR, "latest"), jobDir(job.id), { recursive: true });
      const options = saved.options.map((o) => ({ ...o, preview_url: `/api/jobs/${job.id}/preview/${o.variant}` }));
      await updateJob(job, { ...saved, id: job.id, options, picked: undefined });
      return NextResponse.json({ id: job.id });
    } catch {
      return NextResponse.json({ error: "No cached demo yet. Run one real job first." }, { status: 404 });
    }
  }

  await addBrand(brand);
  const file = form.get("file");
  const url = String(form.get("url") ?? "").trim();
  let video: Buffer;

  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("video/")) return NextResponse.json({ error: "That file isn't a video." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Video is over 100MB." }, { status: 400 });
    video = Buffer.from(await file.arrayBuffer());
  } else if (url) {
    try {
      const { fetchVideoFromLink } = await import("@/lib/ingest-link");
      video = await fetchVideoFromLink(url);
    } catch (e) {
      return NextResponse.json({ error: `Couldn't fetch that link (${(e as Error).message}). Upload the file instead.` }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Upload a video or paste a link." }, { status: 400 });
  }

  const job = createJob(brand);
  void runPipeline(job, video);
  return NextResponse.json({ id: job.id });
}
```

- [ ] **Step 6: Implement `src/app/api/jobs/[id]/route.ts` and `src/app/api/brands/route.ts`**

```ts
// src/app/api/jobs/[id]/route.ts
import { NextResponse } from "next/server";
import { getJob } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = await getJob((await params).id);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "not found" }, { status: 404 });
}
```

```ts
// src/app/api/brands/route.ts
import { NextResponse } from "next/server";
import { listBrands } from "@/lib/brands";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listBrands());
}
```

- [ ] **Step 7: Implement `src/app/api/jobs/[id]/pick/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getJob, updateJob } from "@/lib/store";
import { rememberBrandFact } from "@/lib/memory";
import { VARIANTS, type Variant } from "@/lib/types";

export const runtime = "nodejs";

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
```

- [ ] **Step 8: Implement `src/app/api/jobs/[id]/preview/[variant]/route.ts`** (Range support so the video player can seek)

```ts
import { stat, open } from "node:fs/promises";
import path from "node:path";
import { jobDir } from "@/lib/store";
import { VARIANTS, type Variant } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params;
  if (!VARIANTS.includes(variant as Variant)) return new Response("not found", { status: 404 });
  const file = path.join(jobDir(id), `preview_${variant}.mp4`);
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return new Response("not found", { status: 404 });
  }

  const headers: Record<string, string> = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes" };
  if (new URL(req.url).searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="music-swap-${variant}.mp4"`;
  }

  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const start = range?.[1] ? Number(range[1]) : 0;
  const end = range?.[2] ? Number(range[2]) : size - 1;
  const fh = await open(file);
  const buf = Buffer.alloc(end - start + 1);
  await fh.read(buf, 0, buf.length, start);
  await fh.close();

  if (range) {
    return new Response(buf, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(buf.length) },
    });
  }
  return new Response(buf, { headers: { ...headers, "Content-Length": String(size) } });
}
```

- [ ] **Step 9: Check the pipeline end to end with curl**

```bash
npm run dev
# in another terminal:
curl -s -F brand=Glossier -F file=@samples/clip1.mp4 http://localhost:3000/api/jobs
# → {"id":"..."}; then poll:
curl -s http://localhost:3000/api/jobs/<id> | head -c 600
```

Expected: status moves `analyzing` → `composing` → `muxing` → `judging` → `ready`, with 1–3 options and exactly one `"recommended": true`. Open `http://localhost:3000/api/jobs/<id>/preview/brand` in the browser and it plays.

Also check the failure path: `curl -s -F brand=Glossier -F file=@package.json http://localhost:3000/api/jobs` → `{"error":"That file isn't a video."}`. A clip shorter than 3s (`ffmpeg -i samples/clip1.mp4 -t 2 /tmp/short.mp4`) ends `failed` with `failed_step: "analyzing"` and the 3-second message.

- [ ] **Step 10: Run unit tests and commit**

Run: `npm test` → all pass.

```bash
git add src/lib/store.ts src/lib/brands.ts src/lib/pipeline.ts src/app/api next.config.ts
git commit -m "feat: job pipeline and API routes"
```

---

### Task 10: UI (shadcn/ui, sleek and minimal)

**Files:**
- Create: `src/components/new-job-form.tsx`, `src/components/job-view.tsx`, `src/components/job-steps.tsx`, `src/components/option-card.tsx`
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: the HTTP API from Task 9; `Job`, `Option`, `STEPS`, `Variant` types. Can be built against mocked JSON before Task 9 lands.
- Produces: the single-page app.

- [ ] **Step 1: Layout: dark by default, Geist font, toaster** (`src/app/layout.tsx`)

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Music Swap",
  description: "Replace copyrighted music in brand content with original tracks that fit the edit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${sans.variable} ${mono.variable} min-h-dvh bg-background font-sans antialiased`}>
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_50%_-10%,hsl(270_80%_60%/0.18),transparent)]" />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Page shell** (`src/app/page.tsx`)

```tsx
"use client";
import { useState } from "react";
import { NewJobForm } from "@/components/new-job-form";
import { JobView } from "@/components/job-view";

export default function Home() {
  const [jobId, setJobId] = useState<string | null>(null);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Music Swap</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Brand-safe music that hits every cut.
        </h1>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          Drop in your video, pick the brand. We measure the edit, write three original tracks timed to it,
          and recommend the one that fits.
        </p>
      </header>
      {jobId ? <JobView id={jobId} onReset={() => setJobId(null)} /> : <NewJobForm onCreated={setJobId} />}
    </main>
  );
}
```

- [ ] **Step 3: `src/components/new-job-form.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Link2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NEW = "__new__";

export function NewJobForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [brands, setBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [tab, setTab] = useState("upload");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/brands").then((r) => r.json()).then(setBrands).catch(() => setBrands([]));
  }, []);

  const brandName = brand === NEW ? newBrand.trim() : brand;
  const ready = brandName && (tab === "upload" ? file : url.trim());

  async function submit(demo = false) {
    setBusy(true);
    const form = new FormData();
    form.set("brand", brandName || "Glossier");
    if (demo) form.set("demo", "1");
    else if (tab === "upload" && file) form.set("file", file);
    else form.set("url", url.trim());
    const res = await fetch("/api/jobs", { method: "POST", body: form });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return toast.error(body.error ?? "Something went wrong");
    onCreated(body.id);
  }

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur">
      <CardContent className="flex flex-col gap-6 p-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-2 sm:w-80">
            <TabsTrigger value="upload"><Upload className="mr-2 size-4" />Upload</TabsTrigger>
            <TabsTrigger value="link"><Link2 className="mr-2 size-4" />Paste link</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="mt-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0] ?? null); }}
              className={`flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors ${
                drag ? "border-primary bg-primary/5" : "border-border hover:border-foreground/40"
              }`}
            >
              <Upload className="size-6 text-muted-foreground" />
              {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Drop a 3–90s video, or click to choose</span>}
            </button>
            <input ref={input} type="file" accept="video/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </TabsContent>
          <TabsContent value="link" className="mt-4">
            <Input placeholder="https://www.tiktok.com/@creator/video/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </TabsContent>
        </Tabs>

        <div className="grid gap-2 sm:max-w-sm">
          <Label>Brand</Label>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger><SelectValue placeholder="Who is this content for?" /></SelectTrigger>
            <SelectContent>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              <SelectItem value={NEW}>+ New brand</SelectItem>
            </SelectContent>
          </Select>
          {brand === NEW && <Input autoFocus placeholder="Brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} />}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={!ready || busy} onClick={() => submit()}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            Generate 3 options
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy} onClick={() => submit(true)}>
            Load cached demo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: `src/components/job-steps.tsx`**

```tsx
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
  const current = job.status === "failed" ? job.failed_step! : job.status;
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
            {done ? <Check className="size-4 text-emerald-400" /> : failed ? <X className="size-4 text-destructive" /> :
              active ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="size-4 rounded-full border" />}
            <span className={done || active ? "" : "text-muted-foreground"}>{LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 5: `src/components/option-card.tsx`**

```tsx
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
    <Card className={`flex flex-col overflow-hidden border-border/60 bg-card/60 backdrop-blur transition-shadow ${
      option.recommended ? "ring-2 ring-primary/70 shadow-[0_0_40px_-10px] shadow-primary/40" : ""
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
```

- [ ] **Step 6: `src/components/job-view.tsx`**

```tsx
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
          <p className="font-medium">That didn't work.</p>
          <p className="text-muted-foreground">{job.error}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={onReset}>Try again</Button>
        </div>
      )}
      {job.brief && job.status !== "failed" && (
        <p className="max-w-3xl text-pretty text-muted-foreground">
          <span className="text-foreground">{job.brief.summary}</span>. Mood: {job.brief.mood}.
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
```

- [ ] **Step 7: Check in the browser**

Run: `npm run dev`, open http://localhost:3000.
Expected: dark hero, upload card with tabs and brand select. Submit a sample clip: steps animate, skeleton cards show while composing, then 3 option cards appear with one glowing "Recommended". Video plays and seeks. "Use this one" shows a toast and turns into "Picked". Download saves an mp4. Resize to 375px wide: everything stacks, no horizontal scroll.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/app/layout.tsx src/components
git commit -m "feat: shadcn/ui upload flow, progress and option cards"
```

---

### Task 11: Arize tracing

**Files:**
- Create: `src/lib/tracing-setup.ts`, `src/instrumentation.ts`

**Interfaces:**
- Consumes: spans already emitted by `withSpan` (pipeline, sandbox.analyze, analyst, composer.*, judge with `eval.music_fit.*` attributes, memory.*, style_tag)
- Produces: traces in the Arize project `ARIZE_PROJECT`

- [ ] **Step 1: Install**

```bash
npm i @arizeai/openinference-instrumentation-anthropic @arizeai/openinference-semantic-conventions @opentelemetry/sdk-trace-node @opentelemetry/exporter-trace-otlp-proto @opentelemetry/resources @opentelemetry/semantic-conventions
```

In app.arize.com: create a free AX account, Settings → Billing → Pro → code `HackSprintNYC26`. Copy Space ID and API key into `.env.local`.

- [ ] **Step 2: Create `src/lib/tracing-setup.ts`**

```ts
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { SEMRESATTRS_PROJECT_NAME } from "@arizeai/openinference-semantic-conventions";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";
import Anthropic from "@anthropic-ai/sdk";

const project = process.env.ARIZE_PROJECT || "music-swap";

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: project, [SEMRESATTRS_PROJECT_NAME]: project }),
  spanProcessors: [
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: "https://otlp.arize.com/v1/traces",
        headers: { "arize-space-id": process.env.ARIZE_SPACE_ID!, "arize-api-key": process.env.ARIZE_API_KEY! },
      }),
    ),
  ],
});
provider.register();

// Next.js bundles server code, so auto-patching on require doesn't fire; patch the class directly.
const inst = new AnthropicInstrumentation();
(inst as unknown as { manuallyInstrument?: (m: unknown) => void }).manuallyInstrument?.(Anthropic);

console.log(`[arize] tracing to project ${project}`);
```

- [ ] **Step 3: Create `src/instrumentation.ts`**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ARIZE_API_KEY && process.env.ARIZE_SPACE_ID) {
    await import("./lib/tracing-setup");
  }
}
```

Add `"@arizeai/openinference-instrumentation-anthropic"` to `serverExternalPackages` in `next.config.ts`.

- [ ] **Step 4: Check traces arrive**

Run: `npm run dev` (log shows `[arize] tracing to project music-swap`), then run one job (upload or "Load cached demo" won't trace, use a real upload).
Expected in Arize → Tracing → `music-swap`: one `pipeline` trace containing `sandbox.analyze`, `memory.recall`, `style_tag`, `analyst` (with nested Anthropic LLM span if `manuallyInstrument` exists), three `composer.*`, `judge` with `eval.music_fit.<variant>.score` attributes. If the Anthropic LLM child span is missing, the manual spans still cover the step, so move on.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tracing-setup.ts src/instrumentation.ts next.config.ts package.json package-lock.json
git commit -m "feat: Arize tracing with judge scores as eval attributes"
```

---

### Task 12: Link ingestion (Anchor cloud browser)

**Files:**
- Create: `src/lib/ingest-link.ts`

**Interfaces:**
- Produces: `fetchVideoFromLink(url: string): Promise<Buffer>` (throws with a short reason; the route turns it into "upload the file instead")

- [ ] **Step 1: Install and redeem credits**

```bash
npm i anchorbrowser playwright-core
```

Redeem `ANCHOR_HACKSPRINT_10_16_26` in the Anchor dashboard, put the key in `.env.local` as `ANCHOR_API_KEY`.

- [ ] **Step 2: Implement `src/lib/ingest-link.ts`**

```ts
import { client, Sessions } from "anchorbrowser";
import { chromium } from "playwright-core";
import { withSpan } from "./tracing";

const MAX_BYTES = 100 * 1024 * 1024;

export async function fetchVideoFromLink(url: string): Promise<Buffer> {
  if (!process.env.ANCHOR_API_KEY) throw new Error("link import is not configured");
  if (!/^https?:\/\//.test(url)) throw new Error("not a valid link");

  return withSpan("ingest.anchor", "TOOL", { url }, async () => {
    client.setConfig({ auth: () => process.env.ANCHOR_API_KEY! });
    const session = await Sessions.createSession();
    const cdp = (session as { data?: { cdp_url?: string } }).data?.cdp_url;
    if (!cdp) throw new Error("Anchor session did not return a CDP URL");
    const browser = await chromium.connectOverCDP(cdp);
    try {
      const context = browser.contexts()[0] ?? (await browser.newContext());
      const page = context.pages()[0] ?? (await context.newPage());

      // Collect video responses while the page loads and autoplays.
      const videos: Buffer[] = [];
      page.on("response", async (res) => {
        const type = res.headers()["content-type"] ?? "";
        if (!type.startsWith("video/") || res.status() !== 200) return;
        try {
          const body = await res.body();
          if (body.length > 50_000 && body.length < MAX_BYTES) videos.push(body);
        } catch {}
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(6_000);

      if (videos.length === 0) {
        // Fallback: fetch the <video> src from inside the page (works for direct http(s) sources).
        const b64 = await page.evaluate(async () => {
          const src = document.querySelector("video")?.currentSrc || document.querySelector("video source")?.getAttribute("src");
          if (!src || src.startsWith("blob:")) return null;
          const buf = await (await fetch(src)).arrayBuffer();
          let s = "";
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return btoa(s);
        });
        if (b64) videos.push(Buffer.from(b64, "base64"));
      }

      if (videos.length === 0) throw new Error("no downloadable video found on that page");
      return videos.sort((a, b) => b.length - a.length)[0];
    } finally {
      await browser.close().catch(() => {});
    }
  });
}
```

Add `"anchorbrowser"` to `serverExternalPackages` in `next.config.ts`.

- [ ] **Step 3: Check with a real link**

Run: `npm run dev`, use the "Paste link" tab with a public TikTok or Instagram reel URL, brand Glossier.
Expected: the job starts and goes through the normal steps. If the site blocks it, the UI shows the toast "Couldn't fetch that link (...). Upload the file instead." That is acceptable behaviour; note which sites work for the demo. If `Sessions.createSession` doesn't exist in the installed version, check `grep -rn "createSession\|cdp_url" node_modules/anchorbrowser/dist --include=*.d.ts | head` and adjust the two calls.

- [ ] **Step 4: Commit**

```bash
git add src/lib/ingest-link.ts next.config.ts package.json package-lock.json
git commit -m "feat: import videos from social links via Anchor"
```

---

### Task 13: Demo hardening and submission

**Files:**
- Create: `README.md`

- [ ] **Step 1: Full end-to-end run on the demo clip**

Run one real job with the clip you'll use on stage (15–30s, a trending song, clear cuts) and brand Glossier. Confirm `.data/demo/latest/job.json` exists afterwards. Then click "Use this one" on the Brand option, run the same clip again, and confirm the analyst prompt now carries the new fact (visible in the Arize `analyst` span input under `facts`).

Click "Load cached demo" once to confirm the offline fallback opens instantly with playable previews.

- [ ] **Step 2: Write `README.md`** (Devpost needs the description, architecture and sponsor list; this doubles as the repo page)

```markdown
# Music Swap

Creators can't use copyrighted music on brand deals, and swapping it by hand takes hours. Music Swap measures your edit, writes three original instrumental tracks timed to its cuts, and recommends the one that fits the brand.

## How it works

1. Upload a 3–90s video or paste a social link, and pick the brand.
2. A Daytona sandbox measures the edit: scene cuts (ffmpeg), tempo, beats and energy peaks (librosa). Gemini describes the original track's style.
3. Claude reads the measurements, keyframes and the brand's memory, writes a brief and three composition plans whose sections change exactly at the cuts.
4. ElevenLabs Music generates the three tracks in parallel; the sandbox lays each onto the video.
5. A Claude judge scores each against the brief and the brand, and recommends one.
6. You preview, pick and download. Your pick becomes a new fact in the brand's memory.

## Sponsor tools

- **Daytona**: isolated sandbox per job for media analysis and muxing.
- **ElevenLabs**: music generation from composition plans timed to the video's cuts.
- **Arize**: end-to-end tracing of the pipeline; judge scores logged as eval attributes.
- **SurrealDB Agent Memory**: brand profiles as time-aware facts; new picks supersede old preferences; shared by the analyst and judge agents.
- **Anchor**: cloud browser that fetches source videos from social links.

## Run it

    cp .env.example .env.local   # fill in keys
    npm install
    npm run dev                  # http://localhost:3000
    npm test
```

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: README for Devpost"
git push
```

- [ ] **Step 4: Record the demo video (under 2 min) and submit on Devpost by 3:30 PM**

Follow the spec's demo script. Submission: https://daytona-hacksprint-nyc.devpost.com/ with team name, members (with emails/socials), the video, the README text, and the public repo URL.
