// Formats, layouts and the five deliverables. Art params are copied verbatim from src/build.py of the cover.
const path = require('path');
const fs = require('fs');

const FORMATS = {
  // vertical 1080x1920, art drawn at 2x (2160x3840) exactly like vertical.html
  vertical: {
    P: { W: 2160, H: 3840, CX: 1080, CY: 1540, R: 850, RP: 346, k: 850 / 910, seed: 0x0C0FFEE5,
         bgR: 2500, haze: [1080, 2780, 1300, 620], bgStars: 14, margin: 130, textZone: [150, 2500, 2010, 3060] },
    OW: 1080, OH: 1920, wf: 1,
    grain: { seed: 0x51ED270B, amp: 3, refAmp: 11 },
    text: { W: 1080, H: 1920, tTop: 1251, tSize: 142, tLs: 1.3, tPadV: 26, tPadH: 18, aTop: 1444, aSize: 40, aLs: 20 },
  },
  // square: the 3000x3000 cover art (k=1), composited on a 2160 work grid and output at 1080
  square: {
    P: { W: 3000, H: 3000, CX: 1500, CY: 1165, R: 910, RP: 370, k: 1.0, seed: 0x0C0FFEE5,
         bgR: 2350, haze: [1500, 2470, 1500, 560], bgStars: 13, margin: 170, textZone: [330, 2170, 2670, 2800] },
    OW: 1080, OH: 1080, wf: 0.72,
    grain: { seed: 0x9E3779B9, amp: 3, refAmp: 15 },
    text: { W: 3000, H: 3000, tTop: 2191, tSize: 330, tLs: 3, tPadV: 60, tPadH: 40, aTop: 2641, aSize: 94, aLs: 47 },
  },
};

// window = which part of art space is visible (art px). shiftOut = title overlay offset in output px.
const LAYOUTS = {
  normal: { vertical: { win: [0, 0, 2160, 3840], dy: 0 }, square: { win: [0, 0, 3000, 3000], dy: 0 } },
  // Spotify Canvas: eye moved to the exact centre of the 9:16 frame (art CY 1540 -> out y 960)
  canvas: { vertical: { win: [0, -380, 2160, 3840], dy: 190 } },
  // lyric reels: whole cover layout lifted 130 px so a lyric line fits under MACENTI, above the bottom 400 px
  lyric: { vertical: { win: [0, 260, 2160, 3840], dy: -130 } },
};

const LYRIC_STYLE = { size: 50, ls: 0.4, maxW: 800, y: 1452, rise: 7, fade: 0.25, alpha: 0.94,
                      c0: 'rgba(246,236,214,1)', c1: 'rgba(228,206,160,1)' };

function parseSrt(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const out = [];
  for (const block of txt.split(/\n\n+/)) {
    const ls = block.trim().split('\n');
    if (ls.length < 3) continue;
    const m = ls[1].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const t0 = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, t1 = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    const text = ls.slice(2).join(' ').trim();
    if (!text || text.startsWith('[') || text.startsWith('(') || t1 - t0 < 0.05) continue;
    out.push({ t0, t1, text });
  }
  return out;
}
// lines overlapping [a, b] shifted to clip time; drop tails shorter than 0.8 s at the clip start
function lyricsFor(srt, a, b) {
  return parseSrt(srt).filter(l => l.t1 > a && l.t0 < b)
    .map(l => ({ t0: Math.max(0, l.t0 - a), t1: Math.min(b - a, l.t1 - a), text: l.text, srt0: l.t0, srt1: l.t1 }))
    .filter(l => l.t1 - l.t0 >= 0.8);
}

const ANIM = path.resolve(__dirname, '..', '..');
const SRT = path.join(ANIM, 'lyrics.srt');
const CHORUS = 80.665;

const JOBS = {
  'canvas-1080x1920-8s': { fmt: 'vertical', layout: 'canvas', title: false, frames: 240, noHaze: false },
  'reels-loop-1080x1920-8s': { fmt: 'vertical', layout: 'normal', title: true, frames: 240 },
  'square-loop-1080x1080-8s': { fmt: 'square', layout: 'normal', title: true, frames: 240 },
  'reels-chorus-15s-1080x1920': { fmt: 'vertical', layout: 'lyric', title: true, clip: [80.4, 95.6], accentAt: CHORUS, lyrics: true },
  'reels-title-to-chorus-1080x1920': { fmt: 'vertical', layout: 'lyric', title: true, clip: [63.0, 95.6], accentAt: CHORUS, lyrics: true },
};

function jobConfig(name, cacheUrl) {
  const j = JOBS[name]; if (!j) throw new Error('unknown job ' + name);
  const F = FORMATS[j.fmt], Lo = LAYOUTS[j.layout][j.fmt];
  const P = Object.assign({}, F.P, { win: Lo.win, noHaze: !!j.noHaze });
  const fps = 30;
  const frames = j.frames || Math.round((j.clip[1] - j.clip[0]) * fps);
  const cfg = { job: name, P, OW: F.OW, OH: F.OH, wf: F.wf, fps, T: 8, grain: F.grain, grainLoop: 240,
    clipStart: j.clip ? j.clip[0] : null, accentAt: j.accentAt == null ? null : j.accentAt,
    accentRise: 0.9, accentFall: 5.0, frames };
  if (j.title) cfg.title = { src: cacheUrl(`title-${j.fmt}.png`), dx: 0, dy: Lo.dy };
  if (j.lyrics) { cfg.lyrics = lyricsFor(SRT, j.clip[0], j.clip[1]); cfg.lyricStyle = LYRIC_STYLE; }
  return { cfg, job: j, F };
}

module.exports = { FORMATS, LAYOUTS, JOBS, jobConfig, lyricsFor, parseSrt, SRT, ANIM, CHORUS };
