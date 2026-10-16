# Music Swap

Creators can't use copyrighted music on brand deals, and swapping it by hand takes hours. Music Swap measures your edit, writes three original instrumental tracks timed to its cuts, and recommends the one that fits the brand.

## How it works

1. Upload a 3–90s video or paste a social link, and pick the brand.
2. A Daytona sandbox measures the edit: scene cuts (ffmpeg), tempo, beats and energy peaks (librosa). Gemini describes the original track's style.
3. Claude reads the measurements, keyframes and the brand's memory, then writes a brief and three composition plans whose sections change exactly at the cuts.
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

```bash
cp .env.example .env.local   # fill in keys
npm install
npm run dev                  # http://localhost:3000
npm test
```

Design spec and implementation plan live in `docs/superpowers/`.
