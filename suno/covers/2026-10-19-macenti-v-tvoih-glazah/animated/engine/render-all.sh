#!/bin/bash
# Renders all five deliverables into ../ (the out/ folder).
#   ./render-all.sh                 all jobs
#   ./render-all.sh <job> [...]     only these jobs
# Needs: node 22 + playwright-core (ANIM/node_modules or $PW_CORE), headless Chromium in /opt/pw-browsers,
#        ffmpeg with libx264 + aac. Song: $SONG (default ANIM/song.m4a, opus 48 kHz).
set -euo pipefail
ENGINE=$(cd "$(dirname "$0")" && pwd)
OUT=$(dirname "$ENGINE")
ANIM=$(dirname "$OUT")
SONG=${SONG:-$ANIM/song.m4a}
TMP=$ANIM/work/final; mkdir -p "$TMP"
CRF=${CRF:-18}
JOBS=("$@")
[ ${#JOBS[@]} -eq 0 ] && JOBS=(canvas-1080x1920-8s reels-loop-1080x1920-8s square-loop-1080x1080-8s reels-chorus-15s-1080x1920 reels-title-to-chorus-1080x1920)

# audio clip: decode opus once, trim (sample-accurate output seek), fade in 0.3 s / out 1.0 s, encode AAC-LC 256k once
audio() { # name start end
  local d; d=$(python3 -c "print(round($3-$2,3))")
  local fo; fo=$(python3 -c "print(round($3-$2-1.0,3))")
  # atrim first (sample-accurate, timestamps reset), then the fades run on clip time
  ffmpeg -y -v error -i "$SONG" -map 0:a:0 \
    -af "atrim=start=$2:end=$3,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=$fo:d=1.0" \
    -c:a aac -b:a 256k -ar 48000 -ac 2 "$TMP/$1.m4a"
}

for J in "${JOBS[@]}"; do
  echo "=== $J ($(date +%T))"
  case "$J" in
    reels-chorus-15s-1080x1920)      A0=80.4; A1=95.6 ;;
    reels-title-to-chorus-1080x1920) A0=63.0; A1=95.6 ;;
    *) A0=""; A1="" ;;
  esac
  if [ -z "$A0" ]; then
    node "$ENGINE/render.js" "$J" --crf "$CRF" --out "$OUT/$J.mp4" --workers 3 --dump 0,1,238,239 --dumpdir "$TMP/dump" | grep -v '^lyrics'
  else
    [ "${MUX_ONLY:-0}" = 1 ] || node "$ENGINE/render.js" "$J" --crf "$CRF" --out "$TMP/$J.video.mp4" --workers 3 | grep -v '^lyrics'
    audio "$J" "$A0" "$A1"
    ffmpeg -y -v error -i "$TMP/$J.video.mp4" -i "$TMP/$J.m4a" -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart "$OUT/$J.mp4"
  fi
  ls -la "$OUT/$J.mp4"
done
echo "=== done $(date +%T)"
