#!/usr/bin/env python3
"""QA for the rendered videos.

  qa.py probe   <mp4>...                       ffprobe summary (codec/profile/size/fps/duration/audio)
  qa.py sheet   <mp4> <out_dir> [full_t1 full_t2]  12-frame contact sheet + two full-size frames
  qa.py seam    <mp4>                          loop seam: |f[N-1]-f[0]| vs consecutive diffs (grain blurred away)
  qa.py lyrics  <mp4> <job>                    lyric-band timeline vs expected srt fades
  qa.py audio   <mp4> <song> <start>           cross-correlate muxed audio against the source segment
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont


def probe(path):
    j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]))
    v = [s for s in j['streams'] if s['codec_type'] == 'video'][0]
    a = [s for s in j['streams'] if s['codec_type'] == 'audio']
    nb = subprocess.check_output(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
                                  'stream=nb_read_frames', '-of', 'csv=p=0', path]).decode().strip()
    d = dict(file=os.path.basename(path), size_mb=round(int(j['format']['size']) / 1e6, 2),
             duration=float(j['format']['duration']), v_duration=float(v.get('duration', 0)), frames=int(nb),
             codec=v['codec_name'], profile=v.get('profile'), pix_fmt=v['pix_fmt'], w=v['width'], h=v['height'],
             fps=v['r_frame_rate'], v_kbps=round(int(v.get('bit_rate', 0)) / 1000), colorspace=v.get('color_space'),
             audio=(f"{a[0]['codec_name']} {a[0].get('profile','')} {a[0]['sample_rate']}Hz {a[0]['channels']}ch "
                    f"{round(int(a[0].get('bit_rate', 0)) / 1000)}k dur {float(a[0].get('duration', 0)):.3f}") if a else None)
    # faststart: moov before mdat
    with open(path, 'rb') as f:
        head = f.read(1 << 16)
    d['faststart'] = head.find(b'moov') != -1 and (head.find(b'mdat') == -1 or head.find(b'moov') < head.find(b'mdat'))
    return d


def frames(path, w, extra='', pix='rgb24'):
    """decode all frames scaled to width w (area), optional extra filter; returns uint8 array [n,h,w,3]"""
    j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                                            'stream=width,height', '-of', 'json', path]))['streams'][0]
    h = round(j['height'] * w / j['width'])
    vf = f'scale={w}:{h}:flags=area' + (',' + extra if extra else '')
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', pix, '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)


def sheet(path, outdir, t_full=None):
    os.makedirs(outdir, exist_ok=True)
    base = os.path.splitext(os.path.basename(path))[0]
    p = probe(path)
    n = p['frames']
    idx = [round(i * (n - 1) / 11) for i in range(12)] if n > 12 else list(range(n))
    F = frames(path, 360)
    th, tw = F.shape[1], F.shape[2]
    cols = 4 if tw < th else 4
    rows = (len(idx) + cols - 1) // cols
    pad, lab = 8, 26
    W = cols * tw + (cols + 1) * pad
    H = rows * (th + lab) + (rows + 1) * pad
    S = Image.new('RGB', (W, H), (12, 14, 22))
    dr = ImageDraw.Draw(S)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 16)
    except Exception:
        font = ImageFont.load_default()
    for k, i in enumerate(idx):
        r, c = divmod(k, cols)
        x, y = pad + c * (tw + pad), pad + r * (th + lab + pad)
        S.paste(Image.fromarray(F[i]), (x, y + lab))
        dr.text((x, y + 4), f'#{i}  t={i / 30:.2f}s', fill=(220, 210, 190), font=font)
    out = os.path.join(outdir, f'{base}-contact.png')
    S.save(out)
    print(out)
    for t in (t_full or []):
        o = os.path.join(outdir, f'{base}-frame-{float(t):05.2f}s.png')
        subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', path, '-frames:v', '1', o])
        print(o)


def seam(path):
    # blur removes the per-frame grain, so the diffs measure the motion itself
    F = frames(path, 540, 'gblur=sigma=2').astype(np.float32)
    n = len(F)
    d = np.array([np.abs(F[i + 1] - F[i]).mean() for i in range(n - 1)])
    wrap = np.abs(F[0] - F[n - 1]).mean()
    raw = frames(path, 1080).astype(np.float32)
    dr = np.array([np.abs(raw[i + 1] - raw[i]).mean() for i in range(n - 1)])
    wr = np.abs(raw[0] - raw[n - 1]).mean()
    print(f'{os.path.basename(path)}: {n} frames')
    print(f'  blurred (motion): consecutive mean {d.mean():.4f}  min {d.min():.4f}  max {d.max():.4f}  | last->first {wrap:.4f}  '
          f'| last pair (N-2->N-1) {d[-1]:.4f}  first pair (0->1) {d[0]:.4f}')
    print(f'  raw (incl. grain): consecutive mean {dr.mean():.3f}  min {dr.min():.3f}  max {dr.max():.3f}  | last->first {wr:.3f}')
    return dict(cons_mean=float(d.mean()), cons_max=float(d.max()), wrap=float(wrap), last=float(d[-1]), first=float(d[0]),
                raw_cons=float(dr.mean()), raw_wrap=float(wr))


def lyrics(path, job):
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    J = json.loads(subprocess.check_output(['node', '-e', f"const j=require('{os.path.dirname(os.path.dirname(os.path.abspath(__file__)))}/jobs.js');"
                                            f"const c=j.jobConfig('{job}',f=>f).cfg;console.log(JSON.stringify({{l:c.lyrics,s:c.lyricStyle}}))"]))
    L, st = J['l'], J['s']
    F = frames(path, 1080, pix='gray') if False else None
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'crop=1080:110:0:{st["y"] - 60},format=gray',
                                   '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    G = np.frombuffer(raw, np.uint8).reshape(-1, 110, 1080).astype(np.float32)
    # text energy: pixels well above the local background
    e = np.array([(g > 90).mean() for g in G])
    t = np.arange(len(e)) / 30
    print(f'{os.path.basename(path)}: lyric band energy (fraction of bright px), expected lines:')
    ok = True
    for l in L:
        inside = e[(t > l['t0'] + 0.3) & (t < l['t1'] - 0.3)]
        plateau = np.median(inside) if len(inside) else 0
        # the previous line fades out right before this one fades in: find the dip, then the 50% rise after it
        win = np.where((t >= l['t0'] - 0.35) & (t <= l['t0'] + 0.35))[0]
        dip = win[np.argmin(e[win])] if len(win) else 0
        on = next((t[i] for i in range(dip, len(e)) if e[i] >= 0.5 * plateau), None)
        tail = np.where((t >= l['t1'] - 0.6) & (t <= l['t1'] + 0.05))[0]
        off = next((t[i] for i in tail[::-1] if e[i] >= 0.5 * plateau), None)
        print(f"  {l['t0']:7.3f}-{l['t1']:7.3f} (srt {l['srt0']:.3f}-{l['srt1']:.3f}) plateau {plateau:.4f} dip {e[dip]:.4f}@{t[dip]:.3f} "
              f"50%-on {on if on is None else round(on, 3)} (exp ~{l['t0'] + 0.125:.3f}) last>50% {off if off is None else round(off, 3)} "
              f"(exp ~{l['t1'] - 0.125:.3f})  {l['text']}")
        if on is None or abs(on - (l['t0'] + 0.125)) > 0.1 or (off is not None and l['t1'] < t[-1] - 0.1 and abs(off - (l['t1'] - 0.125)) > 0.1):
            ok = False
    print('  SYNC OK' if ok else '  SYNC MISMATCH')


def audio(path, song, start):
    sr = 16000
    a = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-f', 's16le', '-']), np.int16).astype(np.float32)
    dur = len(a) / sr
    b = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', song, '-ss', str(float(start) - 1), '-t', str(dur + 2), '-ac', '1', '-ar', str(sr),
                                               '-f', 's16le', '-']), np.int16).astype(np.float32)
    # correlate the middle 6 s of the clip (no fades) against the source with +-1 s slack
    seg = a[int(2 * sr):int(8 * sr)]
    best, bo = -1, 0
    n = len(seg)
    fa = np.fft.rfft(b, len(b) + n)
    fb = np.fft.rfft(seg[::-1], len(b) + n)
    cc = np.fft.irfft(fa * fb)[n - 1:len(b)]
    bo = int(np.argmax(cc))
    off = bo / sr - 1 - 2  # position in source minus (start + 2)
    print(f'{os.path.basename(path)}: audio {dur:.3f} s; best match offset vs requested start: {off * 1000:+.1f} ms')


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'probe':
        for p in sys.argv[2:]:
            print(json.dumps(probe(p), ensure_ascii=False))
    elif cmd == 'sheet':
        sheet(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif cmd == 'seam':
        seam(sys.argv[2])
    elif cmd == 'lyrics':
        lyrics(sys.argv[2], sys.argv[3])
    elif cmd == 'audio':
        audio(sys.argv[2], sys.argv[3], sys.argv[4])
