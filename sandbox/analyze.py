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
