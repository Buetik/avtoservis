// Per-frame compositor. Static layers come from buildArt() once; every frame only the tiny night sea in the
// pupil is redrawn, plus a few cheap composites. Pipeline per frame:
//   eye buffer (2x output res):  eye disc (breathing scale s, Catmull-Rom) + gold warmth + gold glow + moving
//                                fiber sheen + pupil scene (vector, scale s*d = slight dilation) + ruff/tips
//                                (Catmull-Rom, s*d) + corneal highlight + broad sheen
//   output (1x):                 background + twinkling bg stars + eye buffer (exact 2:1 downsample)
//                                + title overlay (HTML-rendered PNG) + lyric line + live film grain
// Time: phi = (t mod T)/T. Every periodic term is sin/cos(2*pi*n*phi) with integer n, so frame N == frame 0.
// Most terms are "anchored": f(phi)-f(0), so frame 0 reproduces the static cover exactly.
var TAU=Math.PI*2;
// Separable Catmull-Rom scaler about a centre (pixel-centre convention identical to canvas setTransform).
// It is interpolating: at s=1 it is an exact copy, and it stays sharp at every sub-pixel phase. Chrome's own
// scaled drawImage switches to a softer cubic filter as soon as s!=1, which made frame 0 visibly crisper than
// frame 1 and produced a one-frame "pop" at the loop seam.
function Resampler(canvas){
  var g=canvas.getContext('2d',{willReadFrequently:true});
  this.w=canvas.width; this.h=canvas.height;
  this.src=g.getImageData(0,0,this.w,this.h).data;
  this.tmp=new Float32Array(this.w*this.h*4);
  this.out=new ImageData(this.w,this.h);
}
function crTaps(n,c,s){
  var idx=new Int32Array(n*4), wt=new Float32Array(n*4);
  for(var x=0;x<n;x++){
    var u=c+(x+0.5-c)/s-0.5, i0=Math.floor(u), t=u-i0, t2=t*t, t3=t2*t;
    wt[4*x]=(-t3+2*t2-t)/2; wt[4*x+1]=(3*t3-5*t2+2)/2; wt[4*x+2]=(-3*t3+4*t2+t)/2; wt[4*x+3]=(t3-t2)/2;
    for(var k=0;k<4;k++){var ii=i0-1+k; idx[4*x+k]=ii<0?0:(ii>=n?n-1:ii);}
  }
  return [idx,wt];
}
Resampler.prototype.run=function(s,cx,cy){
  var w=this.w,h=this.h,S=this.src,T=this.tmp,O=this.out.data;
  if(s===1){O.set(S);return this.out;}
  var H=crTaps(w,cx,s), hi=H[0], hw=H[1], V=crTaps(h,cy,s), vi=V[0], vw=V[1], W4=w*4;
  for(var y=0;y<h;y++){
    var row=y*W4;
    for(var x=0;x<w;x++){
      var q=4*x, a0=row+4*hi[q], a1=row+4*hi[q+1], a2=row+4*hi[q+2], a3=row+4*hi[q+3];
      var w0=hw[q],w1=hw[q+1],w2=hw[q+2],w3=hw[q+3], o=row+q;
      T[o]=S[a0]*w0+S[a1]*w1+S[a2]*w2+S[a3]*w3;
      T[o+1]=S[a0+1]*w0+S[a1+1]*w1+S[a2+1]*w2+S[a3+1]*w3;
      T[o+2]=S[a0+2]*w0+S[a1+2]*w1+S[a2+2]*w2+S[a3+2]*w3;
      T[o+3]=S[a0+3]*w0+S[a1+3]*w1+S[a2+3]*w2+S[a3+3]*w3;
    }
  }
  for(var y=0;y<h;y++){
    var q=4*y, r0=vi[q]*W4, r1=vi[q+1]*W4, r2=vi[q+2]*W4, r3=vi[q+3]*W4, w0=vw[q],w1=vw[q+1],w2=vw[q+2],w3=vw[q+3], o=y*W4;
    for(var x=0;x<W4;x++) O[o+x]=T[r0+x]*w0+T[r1+x]*w1+T[r2+x]*w2+T[r3+x]*w3;
  }
  return this.out;
};
function Anim(cfg){
  var A=this; A.cfg=cfg;
  var P=cfg.P, art=A.art=buildArt(P);
  var WX=P.win[0], WY=P.win[1];
  var wf=A.wf=cfg.wf, ao=wf/2, OW=cfg.OW, OH=cfg.OH;
  function mk(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function hq(g){g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';}
  // ---- background at output res (same 2:1 'high' downsample as the static page) ----
  A.bgOut=mk(OW,OH); var g=A.bgOut.getContext('2d'); hq(g);
  g.drawImage(art.L.bg.c,0,0,art.L.bg.w,art.L.bg.h,0,0,art.L.bg.w*ao,art.L.bg.h*ao);
  // ---- static layers -> work grid (work px = (art - WIN0) * wf; work = 2x output) ----
  function toWork(Ly,pad){
    pad=pad||0;
    var fx=(Ly.x-WX)*wf, fy=(Ly.y-WY)*wf;
    var x=Math.floor(fx/2)*2-pad, y=Math.floor(fy/2)*2-pad;
    var w=Math.ceil(Ly.w*wf+fx-x)+pad, h=Math.ceil(Ly.h*wf+fy-y)+pad; w+=w&1; h+=h&1;
    var c=mk(w,h), q=c.getContext('2d'); hq(q);
    if(wf===1) q.drawImage(Ly.c,fx-x,fy-y); else q.drawImage(Ly.c,0,0,Ly.w,Ly.h,fx-x,fy-y,Ly.w*wf,Ly.h*wf);
    return {c:c,x:x,y:y,w:w,h:h};
  }
  A.eyeW=toWork(art.L.eye,8); A.goldW=toWork(art.L.gold); A.sheenW=toWork(art.L.sheen);
  A.layerBW=toWork(art.L.layerB); A.hlW=toWork(art.L.hl);
  // gold glow: blurred, amber-tinted gold fibers + ruff/tips, stored at half work res
  var gw=A.goldW, G=mk(gw.w/2,gw.h/2), gg=G.getContext('2d'); hq(gg);
  var tmp=mk(gw.w,gw.h), tg=tmp.getContext('2d');
  tg.drawImage(gw.c,0,0); tg.globalCompositeOperation='lighter';
  tg.drawImage(A.layerBW.c,A.layerBW.x-gw.x,A.layerBW.y-gw.y);
  gg.filter='blur('+(9*art.k*wf/2).toFixed(1)+'px)'; gg.drawImage(tmp,0,0,gw.w/2,gw.h/2); gg.filter='none';
  gg.globalCompositeOperation='source-atop'; gg.fillStyle='rgba(255,158,64,0.70)'; gg.fillRect(0,0,gw.w/2,gw.h/2);
  A.glowH={c:G,x:gw.x,y:gw.y,w:gw.w,h:gw.h};
  // eye buffer = work-res region of the eye layer; sheen scratch canvas
  A.EB={x:A.eyeW.x,y:A.eyeW.y,w:A.eyeW.w,h:A.eyeW.h}; A.EB.c=mk(A.EB.w,A.EB.h); A.EB.g=A.EB.c.getContext('2d');
  A.Cw=[(art.CX-WX)*wf-A.EB.x,(art.CY-WY)*wf-A.EB.y];
  A.T=mk(A.EB.w,A.EB.h); A.Tg=A.T.getContext('2d');
  // sharp scalers for the two layers that carry fine fibers
  A.eyeRS=new Resampler(A.eyeW.c);
  var Bw=A.layerBW, Bk=mk(Bw.w,Bw.h), bq=Bk.getContext('2d');   // additive layer -> premultiplied RGB on black
  bq.fillStyle='#000'; bq.fillRect(0,0,Bw.w,Bw.h); bq.drawImage(Bw.c,0,0);
  A.BRS=new Resampler(Bk); A.Btmp=mk(Bw.w,Bw.h); A.Btg=A.Btmp.getContext('2d');
  A.CwB=[(art.CX-WX)*wf-Bw.x,(art.CY-WY)*wf-Bw.y];
  // sheen lobe stops: two opposite anisotropic lobes (radial fibers light up along a line through the centre)
  A.lobe=[]; for(var i=0;i<=96;i++){var u=i/96,an=TAU*u;
    A.lobe.push([u,Math.pow(Math.max(0,Math.cos(an)),5)+0.6*Math.pow(Math.max(0,Math.cos(an-Math.PI)),5)]);}
  // ---- background star sprites at output res, pixel aligned ----
  A.stars=art.bgStars.map(function(s,i){
    var rad=s.r*5+2, ox=Math.floor((s.x-rad-WX)*ao)-1, oy=Math.floor((s.y-rad-WY)*ao)-1;
    var ow=Math.ceil(2*rad*ao)+3, oh=ow;
    var big=mk(ow*2,oh*2), bg=big.getContext('2d');
    bg.setTransform(wf,0,0,wf,-(ox*2)-WX*wf,-(oy*2)-WY*wf); art.drawBgStar(bg,s,1);
    var c=mk(ow,oh), q=c.getContext('2d'); hq(q); q.drawImage(big,0,0,ow,oh);
    return {c:c,x:ox,y:oy,n:1+(i%3),ph:0};
  });
  // independent stream for animation phases (never touches the art stream)
  var r2=mulberry32((P.seed^0x5EEDF00D)>>>0);
  A.stars.forEach(function(s){s.n=1+Math.floor(r2()*3);s.ph=r2()*TAU;});
  art.farStars.forEach(function(s){s.n=1+Math.floor(r2()*4);s.ph=r2()*TAU;});
  art.ripples.forEach(function(s){s.ph=r2()*TAU;s.ph2=r2()*TAU;});
  art.glints.forEach(function(L){L.forEach(function(s){s.m=2+Math.floor(r2()*4);s.ph=r2()*TAU;s.ph2=r2()*TAU;});});
  A.out=mk(OW,OH); A.og=A.out.getContext('2d',{willReadFrequently:true});
  A.title=null; A.lyrics=cfg.lyrics||[];
}
Anim.prototype.setTitle=function(img,dx,dy){
  var c=document.createElement('canvas');c.width=this.cfg.OW;c.height=this.cfg.OH;var g=c.getContext('2d');
  g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';
  g.drawImage(img,0,0,img.width,img.height,dx,dy,this.cfg.OW,this.cfg.OW*img.height/img.width);
  this.title=c;
};
// smooth accent envelope for the chorus: ease in over `rise` s, cosine release over `fall` s
function accentEnv(t,t0,rise,fall){
  var x=t-t0; if(x<=0) return 0;
  if(x<rise){var u=x/rise; return Math.sin(u*Math.PI/2)*Math.sin(u*Math.PI/2);}
  x-=rise; if(x>=fall) return 0; return 0.5+0.5*Math.cos(Math.PI*x/fall);
}
Anim.prototype.state=function(t){
  var c=this.cfg, T=c.T||8;
  var phi=((t%T)+T)%T/T;
  var tSong=(c.clipStart==null?null:c.clipStart+t);
  var acc=(c.accentAt!=null&&tSong!=null)?accentEnv(tSong,c.accentAt,c.accentRise||0.9,c.accentFall||5.0):0;
  if(c.forceAccent!=null) acc=c.forceAccent;
  var b=0.5-0.5*Math.cos(TAU*phi); // breath 0..1..0, 0 at the loop seam
  return {t:t,phi:phi,acc:acc,b:b,
    s:1+0.012*b,                       // whole eye 1.000 -> 1.012 -> 1.000
    d:1+0.010*b,                       // pupil dilates ~1% more
    wGold:0.045*b+0.26*acc,             // warm gain on gold fibers
    wGlow:0.05*b+0.42*acc,             // soft amber bloom
    sheenI:0.30*b*(1-0.4*acc),         // anisotropic sheen intensity
    sheenTh:-2.3+0.55*Math.sin(TAU*phi),
    tw0:1+0.10*Math.sin(TAU*2*phi)+0.05*Math.sin(TAU*5*phi),
    tw1:1-0.10*Math.sin(TAU*3*phi)+0.05*Math.sin(TAU*7*phi),
    hlx:5*Math.sin(TAU*phi), hly:-3.5*b, hlI:1+0.15*b};
};
// g: eye-buffer context with the art->buffer transform (scale s*d) already set
Anim.prototype.drawPupil=function(S,g){
  var A=this, art=A.art, k=art.k, B=art.L.pupilBase, phi=S.phi, acc=S.acc, rgba=art.rgba;
  var CX=art.CX, HY=art.HY, BOT=art.BOT;
  g.globalCompositeOperation='source-over'; g.globalAlpha=1;
  g.save(); art.pupilPath(g,0); g.clip();
  g.drawImage(B.c,B.x,B.y);
  g.globalCompositeOperation='lighter';
  art.drawHairline(g);
  // far stars: slow independent twinkle
  g.save(); var sr=art.skyRect; g.beginPath(); g.rect(sr[0],sr[1],sr[2],sr[3]); g.clip();
  art.farStars.forEach(function(s){
    var m=(1+0.38*(Math.sin(TAU*s.n*phi+s.ph)-Math.sin(s.ph)))*(1+0.5*acc);
    g.fillStyle=rgba(s.c,s.a*m); g.beginPath(); g.arc(s.x,s.y,s.r,0,TAU); g.fill();
  });
  g.restore();
  // faint ripple lines: swell bands travel towards the viewer, lines sway a few px
  var kap=TAU/(46*k);
  art.ripples.forEach(function(s){
    var m=1+0.55*(Math.sin(kap*s.dy-TAU*phi+s.ph)-Math.sin(kap*s.dy+s.ph));
    var x=s.x+4*k*(Math.sin(TAU*phi+s.ph2)-Math.sin(s.ph2));
    g.fillStyle=rgba([120,140,200],s.a*Math.max(0,m)); g.beginPath(); g.ellipse(x,s.y,s.w/2,0.9*k,0,0,TAU); g.fill();
  });
  // glitter paths: each glint shimmers with its own integer frequency, the column wobbles on a travelling wave
  var tw=[S.tw0,S.tw1], kap2=TAU/(38*k), kap3=TAU/(64*k);
  for(var q=0;q<2;q++){
    var p=art.pair[q], sx=p[0], pp=p[3]*(0.45+0.55*tw[q])*(1+0.9*acc);
    var gw=g.createRadialGradient(0,0,0,0,0,1);
    g.save(); g.translate(sx,HY+70*k); g.scale(16*k,120*k);
    gw.addColorStop(0,'rgba(255,214,150,'+Math.min(1,0.11*pp).toFixed(3)+')'); gw.addColorStop(1,'rgba(255,214,150,0)');
    g.fillStyle=gw; g.beginPath(); g.arc(0,0,1,0,TAU); g.fill(); g.restore();
    var amp=(0.45+0.55*tw[q])*(1+0.9*acc);
    art.glints[q].forEach(function(s){
      var wave=Math.sin(kap3*s.dy-TAU*2*phi)-Math.sin(kap3*s.dy);
      var m=1+0.55*(Math.sin(TAU*s.m*phi+s.ph)-Math.sin(s.ph))+0.30*wave;
      var ax=(0.55+0.016*s.dy/k)*k;
      var x=s.x+ax*(Math.sin(kap2*s.dy-TAU*2*phi+s.ph2)-Math.sin(kap2*s.dy+s.ph2));
      var w=s.w*(1+0.22*(Math.sin(TAU*s.m*phi+s.ph+1.7)-Math.sin(s.ph+1.7)));
      g.fillStyle=rgba([255,214,150],s.a*Math.max(0,m)*amp); g.beginPath(); g.ellipse(x,s.y,Math.max(0.3*k,w/2),s.hh,0,0,TAU); g.fill();
    });
  }
  // the two stars: soft breathing halos, cores almost steady
  for(var q=0;q<2;q++){
    var p=art.pair[q], x=p[0], y=p[1], r=p[2]*(1+0.30*(tw[q]-1)+0.22*acc), pw=p[3], hm=tw[q]*(1+1.1*acc);
    var h1=g.createRadialGradient(x,y,0,x,y,r*17);
    h1.addColorStop(0,rgba([255,226,168],0.12*pw*hm));h1.addColorStop(0.3,rgba([255,214,150],0.04*pw*hm));h1.addColorStop(1,rgba([255,214,150],0));
    g.fillStyle=h1;g.beginPath();g.arc(x,y,r*17,0,TAU);g.fill();
    var h2=g.createRadialGradient(x,y,0,x,y,r*6);
    h2.addColorStop(0,rgba([255,222,160],0.44*pw*hm));h2.addColorStop(0.22,rgba([255,214,146],0.24*pw*hm));h2.addColorStop(0.55,rgba([246,200,128],0.07*pw*hm));h2.addColorStop(1,rgba([246,200,128],0));
    g.fillStyle=h2;g.beginPath();g.arc(x,y,r*6,0,TAU);g.fill();
    var c=g.createRadialGradient(x,y,0,x,y,r*1.25);
    c.addColorStop(0,'rgba(255,250,236,1)');c.addColorStop(0.22,'rgba(255,240,206,0.95)');c.addColorStop(0.55,'rgba(255,220,156,0.55)');c.addColorStop(1,'rgba(255,214,146,0)');
    g.fillStyle=c;g.beginPath();g.arc(x,y,r*1.25,0,TAU);g.fill();
  }
  g.restore();
  g.globalCompositeOperation='source-over';
  var RP=art.RP, rs=g.createRadialGradient(CX,art.CY,RP*0.74,CX,art.CY,RP+10*k);
  rs.addColorStop(0,'rgba(2,4,12,0)');rs.addColorStop(1,'rgba(2,4,12,0.72)');
  g.fillStyle=rs; art.pupilPath(g,0); g.fill();
};
Anim.prototype.render=function(frame,opt){
  opt=opt||{};
  var A=this, c=A.cfg, art=A.art, wf=A.wf, fps=c.fps||30;
  var S=A.state(frame/fps);
  var E=A.EB, g=E.g, Cw=A.Cw;
  function setWork(ctx,sc){ctx.setTransform(sc,0,0,sc,(1-sc)*Cw[0],(1-sc)*Cw[1]);}
  function setArt(ctx,sc){ctx.setTransform(sc*wf,0,0,sc*wf,Cw[0]-sc*wf*art.CX,Cw[1]-sc*wf*art.CY);}
  function dw(ctx,L){ctx.drawImage(L.c,L.x-E.x,L.y-E.y);}
  g.imageSmoothingEnabled=true; g.imageSmoothingQuality='high';
  g.setTransform(1,0,0,1,0,0); g.globalAlpha=1; g.globalCompositeOperation='source-over';
  // eye disc: sharp Catmull-Rom scale (exact copy at s=1)
  g.putImageData(A.eyeRS.run(S.s,Cw[0],Cw[1]),0,0);
  // soft additive layers always go through the same (filtered) path: never an identity transform
  var sF=S.s+1e-4;
  g.globalCompositeOperation='lighter';
  if(S.wGold>0.001){setWork(g,sF); g.globalAlpha=Math.min(1,S.wGold); dw(g,A.goldW);}
  if(S.wGlow>0.001){setWork(g,sF); g.globalAlpha=Math.min(1,S.wGlow); g.drawImage(A.glowH.c,A.glowH.x-E.x,A.glowH.y-E.y,A.glowH.w,A.glowH.h);}
  if(S.sheenI>0.002){
    var T=A.Tg; T.setTransform(1,0,0,1,0,0); T.globalCompositeOperation='source-over'; T.globalAlpha=1; T.clearRect(0,0,E.w,E.h);
    T.imageSmoothingEnabled=true; T.imageSmoothingQuality='high';
    setWork(T,sF); dw(T,A.sheenW);
    T.setTransform(1,0,0,1,0,0); T.globalCompositeOperation='destination-in';
    var cg=T.createConicGradient(S.sheenTh,Cw[0],Cw[1]);
    A.lobe.forEach(function(l){cg.addColorStop(l[0],'rgba(255,255,255,'+l[1].toFixed(4)+')');});
    T.fillStyle=cg; T.fillRect(0,0,E.w,E.h);
    g.setTransform(1,0,0,1,0,0); g.globalAlpha=Math.min(1,S.sheenI); g.drawImage(A.T,0,0);
  }
  g.globalAlpha=1;
  // pupil scene: vector, drawn straight into the buffer at scale s*d (crisp at any scale)
  g.save(); setArt(g,S.s*S.d); A.drawPupil(S,g); g.restore();
  // ruff + fiber tips follow the pupil edge (sharp scale s*d, additive)
  var sB=S.s*S.d, Bw=A.layerBW;
  A.Btg.putImageData(A.BRS.run(sB,A.CwB[0],A.CwB[1]),0,0);
  g.setTransform(1,0,0,1,0,0); g.globalCompositeOperation='lighter'; g.globalAlpha=1;
  g.drawImage(A.Btmp,Bw.x-E.x,Bw.y-E.y);
  if(S.wGold>0.001){g.globalAlpha=Math.min(1,S.wGold*1.2); g.drawImage(A.Btmp,Bw.x-E.x,Bw.y-E.y); g.globalAlpha=1;}
  // corneal highlight (drifts a few px) + broad corneal sheen, both 'screen' like the cover
  g.globalCompositeOperation='screen';
  setWork(g,sF); g.translate(S.hlx*art.k*wf,S.hly*art.k*wf);
  g.globalAlpha=Math.min(1,S.hlI); dw(g,A.hlW); g.globalAlpha=1;
  setArt(g,S.s);
  var R=art.R, sh=g.createRadialGradient(art.CX-R*0.42,art.CY-R*0.5,0,art.CX-R*0.42,art.CY-R*0.5,R*0.75);
  sh.addColorStop(0,'rgba(200,215,255,0.05)');sh.addColorStop(1,'rgba(200,215,255,0)');
  g.fillStyle=sh; g.beginPath(); g.arc(art.CX,art.CY,R,0,TAU); g.fill();
  g.globalCompositeOperation='source-over'; g.setTransform(1,0,0,1,0,0);

  // ---- output ----
  var o=A.og; o.setTransform(1,0,0,1,0,0); o.globalAlpha=1; o.globalCompositeOperation='source-over';
  o.imageSmoothingEnabled=true; o.imageSmoothingQuality='high';
  o.drawImage(A.bgOut,0,0);
  var phi=S.phi;
  A.stars.forEach(function(s){
    var m=1+0.45*(Math.sin(TAU*s.n*phi+s.ph)-Math.sin(s.ph));
    if(m<=1){o.globalAlpha=Math.max(0.08,m); o.drawImage(s.c,s.x,s.y);}
    else{o.globalAlpha=1; o.drawImage(s.c,s.x,s.y); o.globalCompositeOperation='lighter'; o.globalAlpha=Math.min(1,m-1); o.drawImage(s.c,s.x,s.y); o.globalCompositeOperation='source-over';}
  });
  o.globalAlpha=1;
  o.drawImage(E.c,0,0,E.w,E.h,E.x/2,E.y/2,E.w/2,E.h/2);
  if(A.title && !opt.noText) o.drawImage(A.title,0,0);
  if(A.lyrics.length && !opt.noText) A.drawLyrics(o,S.t);
  var im=o.getImageData(0,0,c.OW,c.OH);
  if(!opt.noGrain && c.grain) A.grain(im.data,frame);
  return im;
};
Anim.prototype.drawLyrics=function(o,t){
  var c=this.cfg, st=c.lyricStyle, fade=st.fade||0.25;
  for(var i=0;i<this.lyrics.length;i++){
    var L=this.lyrics[i]; if(t<L.t0||t>L.t1) continue;
    var ain=Math.min(1,(t-L.t0)/fade), aout=Math.min(1,(L.t1-t)/fade);
    var e=function(u){u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
    var a=e(ain)*e(aout); if(a<=0.001) continue;
    var rise=(1-e(ain))*st.rise;
    o.save(); o.globalAlpha=a*st.alpha;
    var size=st.size; o.font='italic 500 '+size+'px CGL';
    if(o.letterSpacing!==undefined) o.letterSpacing=st.ls+'px';
    var w=o.measureText(L.text).width;
    if(w>st.maxW){size=size*st.maxW/w; o.font='italic 500 '+size.toFixed(2)+'px CGL'; w=o.measureText(L.text).width;}
    var y=st.y+rise;
    var gr=o.createLinearGradient(0,y-size*0.75,0,y+size*0.1);
    gr.addColorStop(0,st.c0); gr.addColorStop(1,st.c1);
    o.fillStyle=gr; o.textAlign='center'; o.textBaseline='alphabetic';
    o.fillText(L.text,c.OW/2,y);
    o.restore();
  }
};
// film grain, same model as drawGrain() of the cover (white/black specks, alpha 2..2+amp/255).
// Video uses a lower amplitude than the stills (amp 11 is ~80 Mbps of incompressible noise); the tone is
// compensated so the mean brightness equals the cover's grain: v' = v + dA*(127.5 - v), dA = E[a_ref]-E[a].
// seed: frame 0 of the loop uses the cover's seed, other frames a hashed seed of (frame mod loop)
Anim.prototype.grain=function(d,frame){
  var c=this.cfg, L=c.grainLoop||240, f=((frame%L)+L)%L, base=c.grain.seed>>>0, amp=c.grain.amp, ref=c.grain.refAmp||amp;
  var s32=base;
  if(f>0){var h=(base+Math.imul(f,0x9E3779B9))>>>0;h^=h>>>16;h=Math.imul(h,0x85EBCA6B)>>>0;h^=h>>>13;h=Math.imul(h,0xC2B2AE35)>>>0;h^=h>>>16;s32=(h>>>0)||1;}
  function lutFor(A){var l=new Float32Array(16);for(var i=0;i<16;i++) l[i]=Math.min(255,Math.round(i*A/15+2))/255;return l;}
  function mean(l){var s=0;for(var i=0;i<16;i++)s+=l[i];return s/16;}
  var lut=lutFor(amp), dA=mean(lutFor(ref))-mean(lut), k1=1-dA, k0=127.5*dA;
  for(var p=0;p<d.length;p+=4){
    s32^=s32<<13;s32>>>=0;s32^=s32>>>17;s32^=s32<<5;s32>>>=0;
    var a=lut[(s32>>>8)&15], on=(s32&255)>127?255*a:0, ia=1-a;
    d[p]=(d[p]*k1+k0)*ia+on; d[p+1]=(d[p+1]*k1+k0)*ia+on; d[p+2]=(d[p+2]*k1+k0)*ia+on; // Uint8ClampedArray rounds
  }
};
