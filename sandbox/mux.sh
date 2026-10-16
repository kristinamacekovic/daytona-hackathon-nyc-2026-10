#!/usr/bin/env bash
# usage: mux.sh video.mp4 track.mp3 out.mp4 'filter_complex' [voice.mp3]
# The filter graph is built in src/lib/mix.ts; it must end in [a].
set -euo pipefail
extra=()
if [ "${5:-}" != "" ]; then extra=(-i "$5"); fi
ffmpeg -y -hide_banner -loglevel error -i "$1" -i "$2" "${extra[@]}" \
  -filter_complex "$4" -map 0:v:0 -map "[a]" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$3"
