#!/bin/bash
# usage: render-final.sh <page.html> <out_basename> [W] [H]
# Headless Chromium's viewport is 87px shorter than --window-size, so render a window of
# W x (H+87) (viewport = W x H), crop to W x H and rebuild preview (1000px) / thumb (200px).
set -e
HTML="$1"; OUT="$2"; W="${3:-3000}"; H="${4:-3000}"
HERE=$(cd "$(dirname "$0")" && pwd)
"$HERE/render.sh" "$HTML" "$OUT" "$W" "$((H+87))" >/dev/null
python3 -I - "$OUT" "$W" "$H" <<'PY'
import sys
from PIL import Image
o=sys.argv[1]; W=int(sys.argv[2]); H=int(sys.argv[3])
im=Image.open(o+'.png').convert('RGB').crop((0,0,W,H)); im.save(o+'.png')
im.resize((1000,round(1000*H/W)),Image.LANCZOS).save(o+'-preview.png')
im.resize((200,round(200*H/W)),Image.LANCZOS).save(o+'-thumb.png')
print(f'{o}.png {im.size[0]}x{im.size[1]} {im.mode}; previews written')
PY
