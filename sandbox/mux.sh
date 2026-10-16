#!/usr/bin/env bash
# usage: mux.sh video.mp4 track.mp3 out.mp4 — replaces the video's audio with the track
set -euo pipefail
ffmpeg -y -hide_banner -loglevel error -i "$1" -i "$2" \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart "$3"
