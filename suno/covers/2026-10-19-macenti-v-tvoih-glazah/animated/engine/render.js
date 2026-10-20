#!/usr/bin/env node
// Render driver: local HTTP server + headless Chromium workers + ffmpeg.
//
//   node render.js <job> [--out file.mp4] [--crf 16] [--workers 3] [--from 0] [--to N] [--step 1]
//                        [--nograin] [--notext] [--dump 0,1,239] [--dumpdir dir] [--noencode] [--force-accent x]
//
// Frames are rendered in parallel pages, re-ordered, and piped as raw RGBA into ffmpeg (libx264 High,
// yuv420p, BT.709, +faststart). --dump writes selected frames as .rgba for checks (see tools/rgba2png.py).
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const ENGINE = __dirname;
const { jobConfig, FORMATS, ANIM } = require('./jobs');
const PW = process.env.PW_CORE || path.join(ANIM, 'node_modules', 'playwright-core');
const { chromium } = require(PW);
function chromePath() {
  const base = '/opt/pw-browsers';
  const d = fs.readdirSync(base).filter(n => /^chromium-\d+$/.test(n)).sort().pop();
  return path.join(base, d, 'chrome-linux', 'chrome');
}

function args() {
  const a = process.argv.slice(2), o = { job: a[0] };
  for (let i = 1; i < a.length; i++) {
    const k = a[i].replace(/^--/, '');
    if (['nograin', 'notext', 'noencode'].includes(k)) o[k] = true; else o[k] = a[++i];
  }
  return o;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.woff': 'font/woff', '.css': 'text/css' };

function startServer(onFrame) {
  return new Promise(res => {
    const srv = http.createServer((req, resp) => {
      const u = new URL(req.url, 'http://x');
      if (req.method === 'POST' && u.pathname === '/frame') {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
          try { await onFrame(u.searchParams.get('job'), +u.searchParams.get('i'), Buffer.concat(chunks)); resp.end('ok'); }
          catch (e) { resp.statusCode = 500; resp.end(String(e)); }
        });
        return;
      }
      const f = path.join(ENGINE, decodeURIComponent(u.pathname));
      if (!f.startsWith(ENGINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { resp.statusCode = 404; return resp.end(); }
      resp.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream');
      fs.createReadStream(f).pipe(resp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// Title/artist overlay: the cover's own HTML/CSS (from build.py), rendered alone on a transparent page.
function titleHtml(T) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@font-face{font-family:"CG";font-weight:500;font-style:normal;src:url(../fonts/Cormorant_Garamond-500-normal.woff) format("woff")}
@font-face{font-family:"CG";font-weight:500;font-style:italic;src:url(../fonts/Cormorant_Garamond-500-italic.woff) format("woff")}
@font-face{font-family:"MR";font-weight:500;font-style:normal;src:url(../fonts/Manrope-500-normal.woff) format("woff")}
html,body{margin:0;width:${T.W}px;height:${T.H}px;overflow:hidden;background:transparent}
.title{position:absolute;z-index:3;left:0;width:${T.W}px;top:${T.tTop}px;text-align:center;
  font-family:"CG",serif;font-weight:500;font-style:normal;font-size:${T.tSize}px;line-height:1;letter-spacing:${T.tLs}px}
.title span{display:inline-block;padding:${T.tPadV}px ${T.tPadH}px;
  background:linear-gradient(180deg,#f6e6bd 0%,#f2deaf 34%,#e6c78c 62%,#d6b06e 86%,#d0a964 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.title i{font-style:italic}
.artist{position:absolute;z-index:3;left:0;width:${T.W}px;top:${T.aTop}px;text-align:center;box-sizing:border-box;
  font-family:"MR",sans-serif;font-weight:500;font-size:${T.aSize}px;line-height:1;
  letter-spacing:${T.aLs}px;padding-left:${T.aLs}px;color:rgba(234,224,202,0.94)}
</style></head><body>
<div class="title"><span>В твоих <i>глазах</i></span></div>
<div class="artist">MACENTI</div>
</body></html>`;
}
async function ensureTitle(browser, base, fmt) {
  const png = path.join(ENGINE, 'cache', `title-${fmt}.png`);
  if (fs.existsSync(png)) return;
  const T = FORMATS[fmt].text;
  fs.writeFileSync(path.join(ENGINE, 'cache', `title-${fmt}.html`), titleHtml(T));
  const page = await browser.newPage({ viewport: { width: T.W, height: T.H }, deviceScaleFactor: 1 });
  await page.goto(`${base}/cache/title-${fmt}.html`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: png, omitBackground: true });
  await page.close();
  console.log('title overlay', png);
}

function ffmpegEncoder(out, W, H, crf, extra) {
  const a = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', '30', '-i', 'pipe:0',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(crf), '-profile:v', 'high',
    '-x264-params', 'aq-mode=3:keyint=240:min-keyint=30',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-an', ...(extra || []), out];
  const p = spawn('ffmpeg', a, { stdio: ['pipe', 'inherit', 'inherit'] });
  return p;
}

(async () => {
  const o = args();
  const t0 = Date.now();
  let cfgObj;
  const srvState = { want: 0, buf: new Map(), enc: null, dump: new Set(), dumpdir: null, W: 0, H: 0, frames: [], done: null };
  const server = await startServer(async (job, i, data) => {
    if (srvState.dump.has(i)) fs.writeFileSync(path.join(srvState.dumpdir, `${job}_${String(i).padStart(5, '0')}.rgba`), data);
    srvState.buf.set(i, data);
    // write in order with back-pressure
    while (srvState.buf.has(srvState.frames[srvState.want])) {
      const fi = srvState.frames[srvState.want], b = srvState.buf.get(fi); srvState.buf.delete(fi);
      if (srvState.enc && !srvState.enc.stdin.write(b)) await new Promise(r => srvState.enc.stdin.once('drain', r));
      srvState.want++;
    }
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: chromePath(), headless: false, args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  const { cfg, job, F } = jobConfig(o.job, f => `${base}/cache/${f}`);
  if (o['force-accent'] != null) cfg.forceAccent = +o['force-accent'];
  if (cfg.title) await ensureTitle(browser, base, job.fmt);
  const from = +(o.from || 0), to = Math.min(+(o.to || cfg.frames), cfg.frames), step = +(o.step || 1);
  for (let i = from; i < to; i += step) srvState.frames.push(i);
  srvState.W = F.OW; srvState.H = F.OH;
  if (o.dump) { srvState.dump = new Set(o.dump.split(',').map(Number)); srvState.dumpdir = o.dumpdir || path.join(ANIM, 'work', 'dump'); fs.mkdirSync(srvState.dumpdir, { recursive: true }); }
  const out = o.out || path.join(ANIM, 'out', `${o.job}.mp4`);
  if (!o.noencode) srvState.enc = ffmpegEncoder(out, F.OW, F.OH, +(o.crf || 18), step > 1 ? ['-r', String(30 / step)] : []);
  const nW = +(o.workers || 3);
  const opt = { noGrain: !!o.nograin, noText: !!o.notext };
  let next = 0; const stats = [];
  const pages = await Promise.all(Array.from({ length: nW }, async () => {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
    page.on('pageerror', e => console.error('[pageerror]', e.message));
    await page.goto(`${base}/render.html`);
    const info = await page.evaluate(c => window.init(c), cfg);
    return { page, info };
  }));
  console.log(`[${o.job}] init`, JSON.stringify(pages[0].info), `frames ${srvState.frames.length}, workers ${nW}`);
  if (cfg.lyrics) console.log('lyrics', JSON.stringify(cfg.lyrics.map(l => [l.t0.toFixed(3), l.t1.toFixed(3), l.text])));
  await Promise.all(pages.map(async ({ page }) => {
    while (true) {
      if (srvState.buf.size > 10) { await new Promise(r => setTimeout(r, 20)); continue; }
      const n = next++; if (n >= srvState.frames.length) break;
      const r = await page.evaluate(([i, op]) => window.renderFrame(i, op), [srvState.frames[n], opt]);
      stats.push(r.render);
      if (stats.length % 60 === 0) console.log(`  ${stats.length}/${srvState.frames.length} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
  }));
  if (srvState.enc) { srvState.enc.stdin.end(); await new Promise(r => srvState.enc.on('close', r)); }
  await browser.close(); server.close();
  const avg = stats.reduce((a, b) => a + b, 0) / Math.max(1, stats.length);
  console.log(`[${o.job}] done: ${stats.length} frames, avg render ${avg.toFixed(0)} ms, total ${((Date.now() - t0) / 1000).toFixed(1)} s${o.noencode ? '' : ' -> ' + out}`);
})().catch(e => { console.error(e); process.exit(1); });
