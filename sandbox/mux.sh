#!/usr/bin/env bash
# usage: mux.sh video.mp4 track.mp3 out.mp4 lead_in_s duration_s
# Replaces the video's audio with the track, skipping the track's lead-in and cutting it to the video length.
set -euo pipefail
ffmpeg -y -hide_banner -loglevel error -i "$1" -i "$2" \
  -filter_complex "[1:a]atrim=start=$4:duration=$5,asetpts=PTS-STARTPTS[a]" \
  -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -t "$5" -movflags +faststart "$3"
