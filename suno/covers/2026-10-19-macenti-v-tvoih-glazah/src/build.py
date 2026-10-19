#!/usr/bin/env python3
"""Builds the two self-contained pages (square cover + vertical) from art.js and per-format layout."""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.dirname(HERE)
ART = open(os.path.join(HERE, 'art.js'), encoding='utf-8').read()

FONTS = '''@font-face{font-family:"CG";font-weight:500;font-style:normal;src:url(../fonts/Cormorant_Garamond-500-normal.woff) format("woff")}
@font-face{font-family:"CG";font-weight:500;font-style:italic;src:url(../fonts/Cormorant_Garamond-500-italic.woff) format("woff")}
@font-face{font-family:"MR";font-weight:500;font-style:normal;src:url(../fonts/Manrope-500-normal.woff) format("woff")}'''

PAGE = '''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>В твоих глазах — MACENTI</title>
<style>
{fonts}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:#040812}}
#art,#grain{{position:absolute;left:0;top:0;width:{W}px;height:{H}px}}
#grain{{z-index:5;pointer-events:none}}
.title{{position:absolute;z-index:3;left:0;width:{W}px;top:{tTop}px;text-align:center;
  font-family:"CG",serif;font-weight:500;font-style:normal;font-size:{tSize}px;line-height:1;letter-spacing:{tLs}px}}
.title span{{display:inline-block;padding:{tPadV}px {tPadH}px;
  background:linear-gradient(180deg,#f6e6bd 0%,#f2deaf 34%,#e6c78c 62%,#d6b06e 86%,#d0a964 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}}
.title i{{font-style:italic}}
.artist{{position:absolute;z-index:3;left:0;width:{W}px;top:{aTop}px;text-align:center;box-sizing:border-box;
  font-family:"MR",sans-serif;font-weight:500;font-size:{aSize}px;line-height:1;
  letter-spacing:{aLs}px;padding-left:{aLs}px;color:rgba(234,224,202,0.94)}}
</style>
</head>
<body>
<canvas id="art" width="{W}" height="{H}"></canvas>
<div class="title"><span>В твоих <i>глазах</i></span></div>
<div class="artist">MACENTI</div>
<canvas id="grain" width="{W}" height="{H}"></canvas>
<script>
{art}
(function(){{
  var P={params};
  var out=document.getElementById('art');
  if(P.ss>1){{
    // supersampled: draw at {{ss}}x on an offscreen canvas, then downsample once with high quality
    var big=document.createElement('canvas');big.width=P.W;big.height=P.H;
    drawArt(big,P);
    var o=out.getContext('2d');o.imageSmoothingEnabled=true;o.imageSmoothingQuality='high';
    o.drawImage(big,0,0,out.width,out.height);
  }} else drawArt(out,P);
  drawGrain(document.getElementById('grain'),{gseed},{gamp});
}})();
</script>
</body>
</html>
'''

def build(name, W, H, P, t, gseed, gamp):
    html = PAGE.format(fonts=FONTS, W=W, H=H, art=ART.strip(), params=json.dumps(P),
                       gseed=gseed, gamp=gamp, **t)
    path = os.path.join(OUTDIR, name)
    open(path, 'w', encoding='utf-8').write(html)
    print('wrote', path)

# ---- square 3000x3000 ----
build('cover.html', 3000, 3000,
      dict(W=3000, H=3000, ss=1, CX=1500, CY=1165, R=910, RP=370, k=1.0, seed=0x0C0FFEE5,
           bgR=2350, haze=[1500, 2470, 1500, 560], bgStars=13, margin=170,
           textZone=[330, 2170, 2670, 2800]),
      dict(tTop=2191, tSize=330, tLs=3, tPadV=60, tPadH=40, aTop=2641, aSize=94, aLs=47),
      0x9E3779B9, 15)

# ---- vertical 1080x1920 (art drawn at 2x = 2160x3840) ----
build('vertical.html', 1080, 1920,
      dict(W=2160, H=3840, ss=2, CX=1080, CY=1540, R=850, RP=346, k=850/910, seed=0x0C0FFEE5,
           bgR=2500, haze=[1080, 2780, 1300, 620], bgStars=14, margin=130,
           textZone=[150, 2500, 2010, 3060]),
      dict(tTop=1251, tSize=142, tLs=1.3, tPadV=26, tPadH=18, aTop=1444, aSize=40, aLs=20),
      0x51ED270B, 11)
