# Music Quality Improvements Plan

**Goal:** The three generated options sound finished and sit naturally in the video, instead of falling flat.

**Context:** The pipeline works end to end (Daytona, Anchor, Claude, ElevenLabs, SurrealDB, Arize). Plans from the analyst are sensible. A review of the "Jira on a plane" run (10.6s reel, two sections of 5.9s and 4.7s) shows the problem is in how we generate and mix, not in the ideas.

**Spec:** `docs/superpowers/specs/2026-10-16-music-swap-design.md`. These changes stay inside it: timing still comes from measured cuts, output is still the video with new music.

## Diagnosis

| # | Cause | Evidence | Effect |
|---|---|---|---|
| 1 | Track is exactly as long as the clip, built from very short chunks | 10.6s track = chunks of 5944ms + 4688ms | Music starts cold and stops mid-phrase. Sounds like a sketch. |
| 2 | Original audio is thrown away entirely | `mux.sh` maps only the new track | Voice, room sound and comic timing are gone. Music plays in an empty room. |
| 3 | No mix or mastering | Track goes in at ElevenLabs' raw level, no fades | Level is inconsistent with social content; hard start and stop. |
| 4 | Judge reads plans, never hears audio | `runJudge` scores JSON plans | "Recommended" can point at the weakest-sounding track. |

## Order and cost

| Step | Change | Est. | Do when |
|---|---|---|---|
| A | Lead-in and tail around the clip, trimmed at mux (#1) | 20 min | Now |
| B | Loudness normalisation and fades (#3) | 10 min | Now, with A |
| C | Keep the original voice, duck music under it (#2) | 30 min | If the demo reel has speech |
| D | Gemini listens to the 3 previews and scores them (#4) | 20 min | Only after the demo video is recorded |

A and B share `mux.sh` and should land together.

---

### Step A: Lead-in and tail (generate longer, trim to the clip)

**Files:** `src/lib/composer.ts`, `src/lib/pipeline.ts`, `sandbox/mux.sh`, `tests/composer-plan.test.ts`

- Add constants `LEAD_IN_MS = 4000` and `TAIL_MS = 3000` (both meet ElevenLabs' 3000ms chunk minimum).
- `toElevenPlan(plan)` prepends a lead-in chunk and appends a tail chunk:
  - lead-in: `text: "[Intro]"`, styles = global styles + first section's styles + `"intro"`, `"establishing groove"`.
  - tail: `text: "[Outro]"`, styles = global styles + last section's styles + `"outro"`, `"resolving ending"`.
  - Middle chunks unchanged, so section boundaries still land on the cuts once the lead-in is trimmed.
- Mux trims the first `LEAD_IN_MS` of the track and cuts it to the video length. The music is already in its groove at frame 0 and the change still hits the cut.

Tests (write first, watch fail):

```ts
it("wraps sections with a lead-in and tail chunk", () => {
  const p = toElevenPlan(planWith([5944, 4688]));
  expect(p.chunks.map((c) => c.durationMs)).toEqual([4000, 5944, 4688, 3000]);
  expect(p.chunks[0].text).toBe("[Intro]");
  expect(p.chunks.at(-1)!.text).toBe("[Outro]");
});
it("keeps cut-aligned chunk boundaries after trimming the lead-in", () => {
  const p = toElevenPlan(planWith([5944, 4688]));
  const starts = p.chunks.reduce<number[]>((acc, c, i) => [...acc, i ? acc[i - 1] + p.chunks[i - 1].durationMs : 0], []);
  expect(starts.slice(1, 3).map((s) => s - 4000)).toEqual([0, 5944]);
});
```

Verify: one real job on the Jira reel. Listen at 0s (no cold start), at the cut (change lands), at the end (no mid-phrase stop).

### Step B: Loudness and fades

**Files:** `sandbox/mux.sh`, `src/lib/pipeline.ts`

`mux.sh` takes the lead-in and duration as arguments and applies one audio filter chain:

```bash
# usage: mux.sh video.mp4 track.mp3 out.mp4 lead_in_s duration_s
ffmpeg -y -hide_banner -loglevel error -i "$1" -i "$2" \
  -filter_complex "[1:a]atrim=start=$4,asetpts=PTS-STARTPTS,atrim=duration=$5,\
loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=in:d=0.15,afade=t=out:st=$(echo "$5 - 0.8" | bc):d=0.8[a]" \
  -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$3"
```

- -14 LUFS matches Instagram, TikTok and YouTube normalisation targets.
- `pipeline.ts` passes `LEAD_IN_MS / 1000` and `analysis.duration_ms / 1000`.
- Use `awk` instead of `bc` if `bc` isn't in the sandbox image (check with `which bc` in the probe script).

Verify: `ffmpeg -i preview.mp4 -af loudnorm=print_format=summary -f null -` in the sandbox reports input integrated loudness close to -14 LUFS.

### Step C: Keep the original voice, duck music under it

**Files:** `src/lib/voice.ts` (new), `src/lib/pipeline.ts`, `sandbox/mux.sh`

- After analysis, send `out/audio.mp3` to ElevenLabs voice isolation (`el().audioIsolation.convert`; check the exact method name in the SDK `.d.ts` first). It returns speech with music and background removed.
- Decide whether there is speech: measure RMS of the isolated audio in the sandbox (`ffmpeg -af volumedetect`). Below about -45 dB mean volume, treat as no speech and skip mixing.
- When there is speech, `mux.sh` mixes it with sidechain ducking:

```bash
[1:a]...music chain...[m];[2:a]asetpts=PTS-STARTPTS[v];
[m][v]sidechaincompress=threshold=0.04:ratio=8:attack=15:release=350[ducked];
[ducked][v]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5[a]
```

- Failure of voice isolation degrades to music-only (current behaviour), never fails the job.
- Risk to check by ear: residue of the copyrighted track left in the isolated voice. If audible, drop this step for the demo.

Verify: the Jira reel with talking keeps the voice clearly audible and the music dips under it.

### Step D: Judge by ear

**Files:** `src/lib/judge.ts`, `src/lib/style-tag.ts` (shared Gemini client)

- After muxing, send the three preview audio tracks to Gemini with the brief. Ask for a 0–10 score per option for musical quality and fit to the video's moments, plus one sentence.
- Final score = average of the Claude plan score and the Gemini listening score. Recommended = highest final score.
- Log both scores on the judge span in Arize (`eval.music_fit.<variant>.plan_score`, `.listen_score`).
- Gemini failure falls back to the plan-only scores (current behaviour).

## Out of scope today

- Regenerating a weak option automatically.
- Conditioning the faithful variant on the original track (`conditioningRef`): risks reproducing the copyrighted track, which is the opposite of the product's purpose.
- Stem separation beyond voice (keeping SFX).
