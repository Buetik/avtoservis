#!/usr/bin/env python3
"""Convert dumped raw RGBA frames (<job>_<frame>.rgba) to PNG. usage: rgba2png.py W H file.rgba [...]"""
import sys
from PIL import Image
W, H = int(sys.argv[1]), int(sys.argv[2])
for f in sys.argv[3:]:
    im = Image.frombytes('RGBA', (W, H), open(f, 'rb').read()).convert('RGB')
    im.save(f[:-5] + '.png')
    print(f[:-5] + '.png')
