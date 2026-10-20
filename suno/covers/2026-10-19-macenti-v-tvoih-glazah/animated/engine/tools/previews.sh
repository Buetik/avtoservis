#!/bin/bash
# Contact sheets (12 evenly spaced frames) + two full-size frames per video into ../../preview
set -euo pipefail
T=$(cd "$(dirname "$0")" && pwd); OUT=$(dirname "$(dirname "$T")"); P=$OUT/preview; mkdir -p "$P"
q() { python3 "$T/qa.py" sheet "$OUT/$1.mp4" "$P" "${@:2}"; }
q canvas-1080x1920-8s 0 4
q reels-loop-1080x1920-8s 0 4
q square-loop-1080x1080-8s 0 4
q reels-chorus-15s-1080x1920 1.6 7
q reels-title-to-chorus-1080x1920 1.5 19.0
