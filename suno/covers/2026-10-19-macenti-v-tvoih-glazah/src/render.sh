#!/bin/bash
# usage: render.sh <path/to/page.html> <out_basename_without_ext> [width] [height]
# Renders the HTML page in headless Chromium at WxH (default 3000x3000) to <out>.png,
# then writes <out>-preview.png (1000px wide) and <out>-thumb.png (200px wide) for viewing.
set -e
HTML="$1"; OUT="$2"; W="${3:-3000}"; H="${4:-3000}"
CH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome | head -1)
DIR=$(cd "$(dirname "$HTML")" && pwd); FILE="$DIR/$(basename "$HTML")"
timeout 120 "$CH" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --force-device-scale-factor=1 \
  --virtual-time-budget=8000 --window-size=${W},${H} \
  --screenshot="${OUT}.png" "file://${FILE}" >/dev/null 2>&1
python3 -I - "$OUT" <<'PY'
import sys
from PIL import Image
o=sys.argv[1]; im=Image.open(o+'.png').convert('RGB'); im.save(o+'.png')
w,h=im.size
im.resize((1000,int(1000*h/w)),Image.LANCZOS).save(o+'-preview.png')
im.resize((200,int(200*h/w)),Image.LANCZOS).save(o+'-thumb.png')
print(f'{o}.png {w}x{h} RGB; previews written')
PY
