# Automated music replacement for brand content: design

Daytona HackSprint w/ Arize AI, NYC, 2026-10-16. Submission deadline 3:30 PM (Devpost).

## Problem

Creators collaborating with brands can't use proprietary (copyrighted) music in sponsored content. Replacing the track by hand is slow, and generic stock music rarely fits the edit: cuts, drops and energy shifts no longer line up.

## What we build

A web app where a creator uploads a video (or pastes a link), picks the brand the content is for, and gets back 3 newly generated, rights-free music options that fit the video's timing and the brand's taste. Each option is previewed muxed onto the video. One option is marked as recommended; the user decides, previews, and downloads the chosen video.

### Success criteria

- A 15–30s clip goes from upload to 3 previewable options in one flow, live on stage.
- The recommended track audibly changes at the video's scene cuts / key moments.
- Picking an option updates that brand's memory, and a rerun reflects it.
- All five sponsors (Daytona, Arize, ElevenLabs, SurrealDB, Anchor) are used meaningfully and can be shown in the demo.

### Non-goals

Hosted production deployment, user accounts, long-form video (> ~60s), stem separation (keeping original voice-over while removing music), editing tracks after generation.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Stack | Next.js + TypeScript, one app (UI + API routes) | fastest to ship; all sponsors have TS SDKs |
| UI | shadcn/ui + Tailwind, sleek and minimal | polished look fast; presentation is 25% of judging |
| Media processing | One Daytona sandbox per job, running Python (ffmpeg + librosa) | isolates untrusted media, reproducible env, clear Daytona story |
| Analysis | DSP for timing + Claude for the brief + Gemini style tag | LLMs estimate timestamps/BPM poorly; DSP gives exact numbers. Claude can't hear audio, Gemini can |
| Generation | ElevenLabs Music with composition plans | per-section `duration_ms` lets music change exactly on cuts |
| Options | 3 variants: faithful / brand-guided / wildcard | gives a real choice, not 3 near-duplicates |
| Recommendation | Claude judge scores each option | explainable, loggable as an Arize eval |
| Memory | SurrealDB Agent Memory keyed on brand profiles | fits the brand-collab story; facts supersede rather than overwrite |
| Observability | Arize tracing on every step, judge scores as evals | debugging + sponsor usage |
| Link ingestion | Anchor cloud browser fetches video from a social link | gives Anchor a real job; first thing cut if short on time |
| Demo runtime | `next dev` locally | hosted body-size limits (~4.5MB on Vercel) break video upload |
| Job state | In-memory on the Next.js server, UI polls | no DB needed beyond SurrealDB memory |

## Architecture

```
Browser (Next.js UI)
  │ 1. upload mp4  OR  paste link ──► Anchor browser fetches video
  │    + pick brand
  ▼
Next.js API (/api/jobs)
  │ 2. create Daytona sandbox, push video + analyze.py
  ▼
Daytona sandbox (one per job)
  │ ffmpeg: extract audio, scene-cut timestamps, keyframes per chunk
  │ librosa: BPM, beat grid, energy curve, peak moments
  │ Gemini: listens to audio → 1-line style tag
  │ returns analysis.json + keyframes
  ▼
Claude "Analyst" (analysis.json + keyframes + brand memory from SurrealDB)
  │ 3. music brief + 3 composition plans (sections w/ exact ms, BPM, mood)
  │    A: faithful to original style · B: brand-guided · C: wildcard
  ▼
ElevenLabs Music API ×3 (parallel) ──► 3 tracks
  ▼
Daytona sandbox: mux each track onto the video → 3 preview mp4s
  ▼
Claude "Judge" scores each vs brief + brand rules → recommended pick
  ▼
UI: 3 option cards, recommended badge, preview player, download
  │ user picks one ──► SurrealDB: brand memory updated (new pref supersedes old)

Arize: traces every LLM / ElevenLabs / Daytona step; judge scores logged as evals
```

## Components

Each unit has one job and communicates through the typed JSON below.

| Unit | Responsibility | Input → Output |
|---|---|---|
| `ingest` | Save upload, or fetch video from a link via Anchor | file / URL → `video.mp4` |
| `sandbox` | Daytona lifecycle: create per job, upload files, exec scripts, download results, delete | job → sandbox handle |
| `analyze.py` (in sandbox) | ffmpeg scene detection + keyframes per chunk; librosa BPM, beats, energy curve, peaks; Gemini style tag | `video.mp4` → `analysis.json`, `frames/` |
| `analyst` (Claude) | Write the music brief and 3 composition plans from analysis + keyframes + brand facts | `Analysis`, frames, brand facts → `Brief`, `Plan[3]` |
| `composer` (ElevenLabs) | Generate 3 tracks in parallel from plans | `Plan` → `track.mp3` |
| `mux.sh` (in sandbox) | Replace the video's audio with a generated track | video + track → `preview_<variant>.mp4` |
| `judge` (Claude) | Score each option vs brief and brand rules, choose recommended | `Brief`, `Plan[3]`, brand facts → `Score[3]` |
| `memory` (SurrealDB) | Read brand facts; write a new fact on pick/reject | brand → facts; pick → fact |
| `tracing` (Arize) | Span per step; log judge scores as evals | n/a |

## Data types

```ts
type Analysis = {
  duration_ms: number
  bpm: number
  beats_ms: number[]
  scene_cuts_ms: number[]
  energy_peaks_ms: number[]
  style_tag: string            // from Gemini; "unknown" if unavailable
  keyframes: string[]          // paths, one or more per chunk
}

type Brief = {
  summary: string              // what the content is
  mood: string
  avoid: string[]              // from brand memory and content
  key_moments: { at_ms: number; why: string }[]
}

type Plan = {
  variant: "faithful" | "brand" | "wildcard"
  global_styles: string[]
  negative_styles: string[]
  sections: { name: string; duration_ms: number; styles: string[] }[]  // sums to duration_ms
}

type Option = {
  variant: Plan["variant"]
  plan: Plan
  track_url: string
  preview_url: string
  score: number                // 0–10 from judge
  rationale: string
  recommended: boolean
}

type Job = {
  id: string
  brand: string
  status: "ingesting" | "analyzing" | "composing" | "muxing" | "judging" | "ready" | "failed"
  failed_step?: string
  options: Option[]
}
```

## Data flow details

**Timing fit.** The analyst derives section boundaries from `scene_cuts_ms` and `energy_peaks_ms` (merging boundaries closer than the ElevenLabs minimum section length). Each section's `duration_ms` goes into the composition plan, so the music changes exactly where the video does. Plans are normalised before sending: if section durations don't sum to `duration_ms`, the last section is stretched or trimmed.

**Three variants.**
- *Faithful*: matches the original track's feel (style tag, BPM, energy curve) without copying it.
- *Brand-guided*: driven by the brand's stored preferences and rules.
- *Wildcard*: a deliberate contrast that still respects timing and brand "avoid" rules.

**Brand memory.** Facts are typed and time-aware, e.g. "Glossier prefers soft, airy pop" / "Glossier rejected trap beats (2026-10-16)". Picking an option writes a new fact that supersedes older conflicting preferences; history stays queryable. The analyst and judge both read the same brand memory.

**API surface.**
- `POST /api/jobs` (multipart file or `{ url }`, plus `brand`) → `{ id }`
- `GET /api/jobs/:id` → `Job`
- `POST /api/jobs/:id/pick` (`{ variant }`) → updates memory
- `GET /api/jobs/:id/preview/:variant` → streams preview mp4 (download uses the same route)
- `GET /api/brands` → brands with memory

## Error handling

| Failure | Behaviour |
|---|---|
| Sandbox step fails (bad file, ffmpeg error) | Job → `failed` with `failed_step`; UI offers retry; sandbox always deleted |
| One ElevenLabs call fails or times out (~90s) | Show the options that succeeded; fail only if zero |
| Plan durations don't sum to video length | Normalise before sending (stretch/trim last section) |
| Gemini, SurrealDB or Arize unavailable | Degrade: style tag "unknown", empty memory, no tracing. Pipeline continues |
| Anchor link fetch fails | Ask the user to upload the file instead |
| Venue wifi / live failure | One fully finished job cached on disk as demo fallback |

## Testing

- Unit tests for logic that is easy to get wrong: plan duration normalisation, section splitting from cuts/peaks, judge output parsing.
- `analyze.py` checked manually on 2 sample clips (BPM and cuts verified by ear).
- One end-to-end run on a 20s clip before 2:30 PM.

## Demo script (3 min pitch)

1. **Problem (20s):** creators can't use copyrighted music on brand deals; manual swaps take hours.
2. **Live (90s):** paste a reel with a trending song, choose brand "Glossier", job steps tick through, 3 options appear with one recommended. Play it and point out the beat change landing on the cut.
3. **Memory (30s):** pick option B, show the new SurrealDB fact superseding the old one, rerun shifts the recommendation.
4. **Under the hood (40s):** Arize trace of the full pipeline with judge scores, Daytona sandbox per job, sponsor list.

## Scope and time plan

Cut order if behind: (1) Anchor link input, (2) Gemini style tag, (3) memory rerun in demo, (4) Arize evals (keep basic tracing). Never cut: upload → analysis → 3 tracks → preview → pick.

| Until | Work |
|---|---|
| 12:30 | Scaffold, sponsor keys, `analyze.py` |
| 1:30 | Analyst, composer, mux, UI |
| 2:15 | Judge, memory, Arize |
| 2:45 | Anchor, polish |
| 3:15 | Demo video, Devpost |
| 3:30 | Deadline |

## Sponsor usage summary (for Devpost)

- **Daytona**: isolated sandbox per job for media analysis (ffmpeg, librosa) and muxing previews.
- **ElevenLabs**: music generation from composition plans timed to the video's cuts.
- **Arize**: end-to-end tracing of the pipeline; judge scores logged as evals.
- **SurrealDB Agent Memory**: brand profiles as typed, time-aware facts that supersede on new picks, shared by analyst and judge agents.
- **Anchor**: cloud browser fetches source videos from social links.

## Open risks

- ElevenLabs composition plan limits (minimum section length, max sections, latency) need confirming against current docs at build time; section merging handles short gaps.
- SurrealDB Agent Memory API shape is unverified; the `memory` unit isolates it behind a small read/write interface.
- Generation latency for 3 parallel tracks may stretch the live demo; the cached job is the fallback.
