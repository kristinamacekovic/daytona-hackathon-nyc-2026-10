// ffmpeg filter graph for the final preview. Input 1 = generated track, optional input 2 = isolated voice.
const SPEECH_MIN_DB = -45;

export function muxFilter({ leadInS, durationS, withVoice }: { leadInS: number; durationS: number; withVoice: boolean }): string {
  const fmt = "aformat=sample_rates=44100:channel_layouts=stereo";
  const fadeOutStart = Math.max(0, durationS - 0.8).toFixed(3);
  const music =
    `[1:a]atrim=start=${leadInS.toFixed(3)}:duration=${durationS.toFixed(3)},asetpts=PTS-STARTPTS,${fmt},` +
    `afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeOutStart}:d=0.8`;
  const master = "loudnorm=I=-14:TP=-1.5:LRA=11";
  if (!withVoice) return `${music},${master}[a]`;
  return (
    `${music}[m];` +
    `[2:a]atrim=duration=${durationS.toFixed(3)},asetpts=PTS-STARTPTS,${fmt},asplit=2[vk][vm];` +
    `[m][vk]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350[duck];` +
    `[duck][vm]amix=inputs=2:duration=first:normalize=0,${master}[a]`
  );
}

export function parseMeanVolume(ffmpegStderr: string): number | null {
  const m = ffmpegStderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? Number(m[1]) : null;
}

export const hasSpeech = (meanDb: number | null) => meanDb !== null && meanDb > SPEECH_MIN_DB;

// Gemini ends its viewing notes with "SPEECH: yes|no": talking to camera or voiceover, not singing in the music.
export function parseSpeechFlag(notes: string): boolean | null {
  const m = notes.match(/SPEECH:?\**\s*(yes|no)\b/i);
  return m ? m[1].toLowerCase() === "yes" : null;
}

// The isolator keeps any human voice, including the copyrighted song's singer. Only keep it for real talking.
export const keepVoice = (meanDb: number | null, speechFlag: boolean | null) => speechFlag === true && hasSpeech(meanDb);
