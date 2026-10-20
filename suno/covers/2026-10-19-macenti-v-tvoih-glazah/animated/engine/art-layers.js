// "В твоих глазах" — MACENTI. Layered version of src/art.js for the animation engine.
//
// It consumes the seeded mulberry32 stream in EXACTLY the same order as the static drawArt(), so every
// fiber, star, ripple and glint sits where it sits on the cover. The difference: instead of painting one
// flat picture it paints separate layers and records the elements that will move:
//   bg        background gradient + haze + aura (no stars)            static, full window
//   eye       bg + iris (fibers, lacunae, furrows, limbus, rim light)  static, soft-masked disc, breathes
//   gold      gold pupillary fibers only (L2)                          additive, warmth pulse / chorus accent
//   sheen     all bright fibers (L2+L3+L4)                             additive, masked by a moving light lobe
//   pupilBase sky + water + milky band + horizon glow + hairline       static base of the tiny night sea
//   layerB    pupillary ruff + fiber tips over the pupil edge          additive, follows the pupil
//   hl        blurred corneal highlight sprite                         'screen', drifts a few px
//   records   bgStars, farStars, ripples, glints, pair (two stars)    redrawn every frame with time modulation
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function buildArt(P){
  var rnd=mulberry32(P.seed);
  var TAU=Math.PI*2, k=P.k;
  function gauss(){var u=1-rnd(),v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(TAU*v);}
  function makeNoise(K){var a=[];for(var i=0;i<K;i++)a.push(rnd());
    return function(th){var x=((th/TAU)%1+1)%1*K,i=Math.floor(x),f=x-i,s=f*f*(3-2*f);return a[i%K]+(a[(i+1)%K]-a[i%K])*s;};}
  var nA=makeNoise(19), nB=makeNoise(53), nC=makeNoise(131), nD=makeNoise(9), nE=makeNoise(37),
      nG=makeNoise(71), nP=makeNoise(17), nQ=makeNoise(41), nF=makeNoise(23);
  function dens(th){return 0.45*nA(th)+0.35*nB(th)+0.20*nC(th);}
  var W=P.W,H=P.H,CX=P.CX,CY=P.CY,R=P.R,RP=P.RP;
  function RPf(th){return RP+k*(4.2*(2*nP(th)-1)+2.6*(2*nQ(th)-1));}
  function RC(th){return RP*1.78+k*(52*(nB(th)-0.5)+24*(nC(th)-0.5));}
  function Pt(r,th){return [CX+r*Math.cos(th),CY+r*Math.sin(th)];}
  function mix(c1,c2,t){return [c1[0]+(c2[0]-c1[0])*t,c1[1]+(c2[1]-c1[1])*t,c1[2]+(c2[2]-c1[2])*t];}
  function rgba(c,a){return 'rgba('+(c[0]|0)+','+(c[1]|0)+','+(c[2]|0)+','+Math.max(0,Math.min(1,a)).toFixed(3)+')';}
  var PALE=[255,238,200], GOLD=[234,192,112], AMBER=[190,132,56], SLATE=[84,120,188], DEEP=[30,50,104];
  var crypts=[];
  for(var i=0;i<20;i++) crypts.push({th:rnd()*TAU, w:0.010+0.020*rnd(), d:0.36+0.14*rnd()});
  function cryptF(th){var f=1;for(var i=0;i<crypts.length;i++){var c=crypts[i],dt=th-c.th;dt=Math.atan2(Math.sin(dt),Math.cos(dt));var e=dt/c.w;if(e*e<9)f*=1-c.d*Math.exp(-e*e);}return f;}

  function mk(w,h){var c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  // a layer = canvas covering an axis-aligned box of art space; its context is pre-translated to art coords
  function layer(x0,y0,w,h){var c=mk(w,h),g=c.getContext('2d');g.translate(-x0,-y0);return {c:c,g:g,x:x0,y:y0,w:w,h:h};}
  var WIN=P.win; // [x0,y0,w,h] of the visible window in art coords (may extend past 0..W / 0..H)
  var L={};
  L.bg=layer(WIN[0],WIN[1],WIN[2],WIN[3]);
  var EH=Math.ceil(R*1.13), EX=Math.floor(CX-EH), EY=Math.floor(CY-EH), ES=2*EH+2;
  L.eye=layer(EX,EY,ES,ES); L.gold=layer(EX,EY,ES,ES); L.sheen=layer(EX,EY,ES,ES);

  // ---------- background (painted into bg AND under the eye layer, identical ops) ----------
  function paintBg(g,x0,y0,w,h){
    var bg=g.createRadialGradient(CX,CY,0,CX,CY+300*k,P.bgR);
    bg.addColorStop(0,'#0f1c3d');bg.addColorStop(0.42,'#0a1430');bg.addColorStop(0.78,'#060c1e');bg.addColorStop(1,'#03060e');
    g.fillStyle=bg;g.fillRect(x0,y0,w,h);
    if(!P.noHaze){
      g.save();g.translate(P.haze[0],P.haze[1]);g.scale(1,P.haze[3]/P.haze[2]);
      var hz=g.createRadialGradient(0,0,0,0,0,P.haze[2]);
      hz.addColorStop(0,'rgba(200,160,100,0.055)');hz.addColorStop(0.5,'rgba(200,160,100,0.025)');hz.addColorStop(1,'rgba(200,160,100,0)');
      g.fillStyle=hz;g.beginPath();g.arc(0,0,P.haze[2],0,TAU);g.fill();g.restore();
    }
    var au=g.createRadialGradient(CX,CY,R*0.6,CX,CY,R*1.55);
    au.addColorStop(0,'rgba(200,150,80,0.07)');au.addColorStop(0.5,'rgba(120,120,170,0.035)');au.addColorStop(1,'rgba(80,90,140,0)');
    g.fillStyle=au;g.beginPath();g.arc(CX,CY,R*1.55,0,TAU);g.fill();
  }
  paintBg(L.bg.g,WIN[0],WIN[1],WIN[2],WIN[3]);
  paintBg(L.eye.g,EX,EY,ES,ES);

  // sparse background stars: recorded (drawn per frame as twinkling sprites)
  var bgStars=[], placed=0, tries=0;
  while(placed<P.bgStars && tries<5000){
    tries++;
    var x=P.margin+rnd()*(W-2*P.margin), y=P.margin+rnd()*(H-2*P.margin);
    var dx=x-CX, dy=y-CY;
    if(Math.sqrt(dx*dx+dy*dy)<R+110*k) continue;
    var tz=P.textZone; if(x>tz[0]&&x<tz[2]&&y>tz[1]&&y<tz[3]) continue;
    var r=(1.0+0.8*rnd())*k, a=0.3+0.3*rnd(), c=rnd()<0.55?[255,232,196]:[214,224,255];
    bgStars.push({x:x,y:y,r:r,a:a,c:c});
    placed++;
  }
  function drawBgStar(g,s,m){
    var hg=g.createRadialGradient(s.x,s.y,0,s.x,s.y,s.r*5);hg.addColorStop(0,rgba(s.c,s.a*0.22*m));hg.addColorStop(1,rgba(s.c,0));
    g.fillStyle=hg;g.beginPath();g.arc(s.x,s.y,s.r*5,0,TAU);g.fill();
    g.fillStyle=rgba(s.c,s.a*m);g.beginPath();g.arc(s.x,s.y,s.r,0,TAU);g.fill();
  }

  // ---------- iris ----------
  var ge=L.eye.g;
  var base=ge.createRadialGradient(CX,CY,RP,CX,CY,R*1.03);
  base.addColorStop(0,'#3a2810');base.addColorStop(0.22,'#241c1c');base.addColorStop(0.5,'#121c3a');
  base.addColorStop(0.9,'#0b1534');base.addColorStop(1,'rgba(10,20,50,0)');
  ge.fillStyle=base;ge.beginPath();ge.arc(CX,CY,R*1.03,0,TAU);ge.fill();

  var TG=[ge];
  function fiber(th,r0,r1,w,a,cIn,cOut,wob){
    var p0=Pt(r0,th), p3=Pt(r1,th+wob*0.25),
        c1=Pt(r0+(r1-r0)*0.34,th+wob), c2=Pt(r0+(r1-r0)*0.68,th-wob*0.55);
    for(var q=0;q<TG.length;q++){
      var g=TG[q];
      var gr=g.createLinearGradient(p0[0],p0[1],p3[0],p3[1]);
      gr.addColorStop(0,rgba(cIn,a*0.5));gr.addColorStop(0.08,rgba(cIn,a));
      gr.addColorStop(0.5,rgba(mix(cIn,cOut,0.55),a*0.7));gr.addColorStop(1,rgba(cOut,0));
      g.strokeStyle=gr;g.lineWidth=w;g.beginPath();g.moveTo(p0[0],p0[1]);
      g.bezierCurveTo(c1[0],c1[1],c2[0],c2[1],p3[0],p3[1]);g.stroke();
    }
  }
  [L.eye.g,L.gold.g,L.sheen.g].forEach(function(g){
    g.lineCap='round';g.save();g.beginPath();g.arc(CX,CY,R*1.015,0,TAU);g.clip();g.globalCompositeOperation='lighter';
  });
  TG=[L.eye.g];
  for(var i=0;i<3400;i++){
    var th=rnd()*TAU, r0=RP*1.4+rnd()*R*0.3, r1=r0+(R*0.99-r0)*(0.5+0.5*rnd());
    var d2=nE(th);
    fiber(th,r0,r1,(1.0+rnd()*2.6)*k,(0.06+rnd()*0.10)*(0.6+0.8*d2),SLATE,DEEP,(rnd()-0.5)*0.03);
  }
  TG=[L.eye.g,L.gold.g,L.sheen.g];
  for(var i=0;i<11500;i++){
    var th=rnd()*TAU, d=dens(th), cf=cryptF(th);
    if(rnd()>Math.pow(d,1.4)*1.7) continue;
    var r0=RP+3*k+Math.pow(rnd(),2.4)*70*k;
    var lenF=(1+0.36*(nG(th)-0.5))*(0.88+0.24*rnd())*(0.8+0.2*cf);
    var r1=RP+(RC(th)*1.0-RP)*lenF*1.06;
    var t=rnd(), cIn=t<0.24?PALE:(t<0.78?GOLD:AMBER);
    fiber(th,r0,r1,(0.8+Math.pow(rnd(),2)*2.6)*k,(0.05+Math.pow(rnd(),1.6)*0.21)*(0.5+0.8*d)*cf,cIn,AMBER,(rnd()-0.5)*0.03);
  }
  TG=[L.eye.g,L.sheen.g];
  for(var i=0;i<9000;i++){
    var th=rnd()*TAU, d=0.55*nE(th)+0.45*nC(th*1.0+1.3);
    if(rnd()>Math.pow(d,1.5)*1.8) continue;
    var r0=RC(th)*(0.8+0.25*rnd());
    var r1=r0+(R*(0.94+0.05*rnd())-r0)*(0.35+0.65*Math.pow(rnd(),0.6));
    var t=rnd(), cIn=t<0.45?GOLD:(t<0.8?AMBER:mix(GOLD,SLATE,0.5)), cOut=t<0.5?SLATE:mix(AMBER,SLATE,0.6);
    fiber(th,r0,r1,(0.8+Math.pow(rnd(),2)*2.2)*k,(0.035+Math.pow(rnd(),1.8)*0.15)*(0.5+0.8*d)*(0.75+0.25*cryptF(th)),cIn,cOut,(rnd()-0.5)*0.045);
  }
  for(var i=0;i<650;i++){
    var th=rnd()*TAU, r0=RP+8*k+rnd()*110*k, r1=R*(0.88+rnd()*0.1);
    fiber(th,r0,r1,(0.6+rnd()*0.9)*k,(0.08+rnd()*0.16)*(0.4+0.6*cryptF(th)),PALE,mix(GOLD,SLATE,0.5),(rnd()-0.5)*0.025);
  }
  [L.eye.g,L.gold.g,L.sheen.g].forEach(function(g){g.restore();});
  TG=[L.eye.g];
  var g=L.eye.g;
  g.globalCompositeOperation='source-over';
  for(var i=0;i<crypts.length;i++){
    var c=crypts[i], rc=RC(c.th), rr=RP+(rc-RP)*(0.42+0.22*rnd());
    var len=(rc-RP)*(0.30+0.22*rnd()), wid=Math.max(7*k,c.w*rr*1.05), p=Pt(rr,c.th);
    g.save();g.translate(p[0],p[1]);g.rotate(c.th);g.scale(len/wid,1);
    var cg=g.createRadialGradient(0,0,0,0,0,wid);
    cg.addColorStop(0,'rgba(10,8,20,0.40)');cg.addColorStop(0.6,'rgba(10,8,20,0.16)');cg.addColorStop(1,'rgba(10,8,20,0)');
    g.fillStyle=cg;g.beginPath();g.arc(0,0,wid,0,TAU);g.fill();g.restore();
  }
  for(var i=0;i<14;i++){
    var th=rnd()*TAU, rr=(rnd()<0.7)?RC(th)*(1.02+0.1*rnd()):R*(0.6+0.2*rnd());
    var len=(40+rnd()*110)*k, wid=(12+rnd()*22)*k, p=Pt(rr,th);
    g.save();g.translate(p[0],p[1]);g.rotate(th);g.scale(len/wid,1);
    var cg=g.createRadialGradient(0,0,0,0,0,wid);
    cg.addColorStop(0,'rgba(5,10,30,0.40)');cg.addColorStop(0.55,'rgba(5,10,30,0.17)');cg.addColorStop(1,'rgba(5,10,30,0)');
    g.fillStyle=cg;g.beginPath();g.arc(0,0,wid,0,TAU);g.fill();g.restore();
  }
  var furrows=[0.80,0.885];
  for(var f=0;f<furrows.length;f++){
    var off=rnd()*TAU;
    for(var s=0;s<720;s++){
      var th=s/720*TAU, th2=(s+1.3)/720*TAU, v=nF(th+off);
      if(v<0.45) continue;
      var a=0.16*(v-0.45)/0.55, rr=R*furrows[f]+8*k*(nD(th)-0.5);
      var p=Pt(rr,th), q=Pt(rr,th2);
      g.strokeStyle='rgba(4,8,26,'+a.toFixed(3)+')';g.lineWidth=4*k;g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.stroke();
    }
  }
  var lim0=g.createRadialGradient(CX,CY,R*0.84,CX,CY,R*1.06);
  lim0.addColorStop(0,'rgba(5,10,28,0)');lim0.addColorStop(0.6,'rgba(5,10,28,0.30)');lim0.addColorStop(0.85,'rgba(5,10,28,0.25)');lim0.addColorStop(1,'rgba(5,10,28,0)');
  g.fillStyle=lim0;g.beginPath();g.arc(CX,CY,R*1.06,0,TAU);g.fill();
  var lim=g.createRadialGradient(CX,CY,R-56*k,CX,CY,R+16*k);
  lim.addColorStop(0,'rgba(5,10,28,0)');lim.addColorStop(0.4,'rgba(5,10,28,0.42)');lim.addColorStop(0.62,'rgba(5,10,28,0.62)');
  lim.addColorStop(0.8,'rgba(5,10,28,0.45)');lim.addColorStop(1,'rgba(5,10,28,0)');
  g.fillStyle=lim;g.beginPath();g.arc(CX,CY,R+16*k,0,TAU);g.fill();
  g.globalCompositeOperation='lighter';
  var rimL=layer(EX,EY,ES,ES), rg=rimL.g; rg.lineCap='round';
  for(var s=0;s<720;s++){
    var th=s/720*TAU, th2=(s+1.3)/720*TAU, kk=0.5+0.5*Math.cos(th-(-2.3));
    var a=(0.006+0.034*Math.pow(kk,2.4))*(0.6+0.6*nC(th*2));
    var p=Pt(R*0.965,th), q=Pt(R*0.975,th2);
    rg.strokeStyle=rgba([160,182,232],a);rg.lineWidth=20*k;rg.beginPath();rg.moveTo(p[0],p[1]);rg.lineTo(q[0],q[1]);rg.stroke();
  }
  g.save();g.filter='blur('+(7*k).toFixed(1)+'px)';g.drawImage(rimL.c,EX,EY);g.restore();g.filter='none';
  g.globalCompositeOperation='source-over';
  // soft disc mask: iris ops end at ~1.06R, stars start beyond ~1.11R -> fade 1.068R..1.098R is pure background
  g.save();g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';
  var mg=g.createRadialGradient(CX-EX,CY-EY,R*1.068,CX-EX,CY-EY,R*1.098);
  mg.addColorStop(0,'rgba(0,0,0,1)');mg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=mg;g.fillRect(0,0,ES,ES);g.restore();

  // ---------- pupil: a tiny night sea under two stars ----------
  function pupilPath(g,off){g.beginPath();for(var s=0;s<=720;s++){var th=s/720*TAU,r=RPf(th)+off;var x=CX+r*Math.cos(th),y=CY+r*Math.sin(th);if(s)g.lineTo(x,y);else g.moveTo(x,y);}g.closePath();}
  var HY=CY+RP*0.33, TOP=CY-RP-12*k, BOT=CY+RP+12*k;
  var PH=Math.ceil(RP+30*k), PX=Math.floor(CX-PH), PY=Math.floor(CY-PH), PS=2*PH+2;
  L.pupilBase=layer(PX,PY,PS,PS);
  g=L.pupilBase.g;
  var sk=g.createLinearGradient(0,TOP,0,HY);
  sk.addColorStop(0,'#040a1e');sk.addColorStop(0.55,'#08122e');sk.addColorStop(0.9,'#111c44');sk.addColorStop(1,'#1a2350');
  g.fillStyle=sk;g.fillRect(CX-RP-20*k,TOP,2*RP+40*k,HY-TOP);
  var wa=g.createLinearGradient(0,HY,0,BOT);
  wa.addColorStop(0,'#0b1330');wa.addColorStop(0.35,'#060c22');wa.addColorStop(1,'#020510');
  g.fillStyle=wa;g.fillRect(CX-RP-20*k,HY,2*RP+40*k,BOT-HY);
  g.globalCompositeOperation='lighter';
  var skyRect=[CX-RP-20*k,TOP,2*RP+40*k,HY-TOP-6*k];
  g.save();g.beginPath();g.rect(skyRect[0],skyRect[1],skyRect[2],skyRect[3]);g.clip();
  var bandA=-0.55, bcx=CX+10*k, bcy=CY-120*k;
  function onBand(spread){var u=(rnd()-0.5)*2.0*RP, v=gauss()*spread;
    return [bcx+u*Math.cos(bandA)-v*Math.sin(bandA), bcy+u*Math.sin(bandA)+v*Math.cos(bandA)];}
  for(var i=0;i<30;i++){
    var q=onBand(44*k), rr=(50+rnd()*80)*k, gl=g.createRadialGradient(q[0],q[1],0,q[0],q[1],rr);
    gl.addColorStop(0,'rgba(130,128,175,0.018)');gl.addColorStop(1,'rgba(120,120,170,0)');
    g.fillStyle=gl;g.beginPath();g.arc(q[0],q[1],rr,0,TAU);g.fill();
  }
  g.save();g.translate(CX,HY);g.scale(1,0.16);
  var hg=g.createRadialGradient(0,0,0,0,0,RP*0.95);
  hg.addColorStop(0,'rgba(226,176,120,0.20)');hg.addColorStop(0.5,'rgba(170,130,130,0.07)');hg.addColorStop(1,'rgba(120,100,140,0)');
  g.fillStyle=hg;g.beginPath();g.arc(0,0,RP*0.95,0,TAU);g.fill();g.restore();
  var SW=[255,247,230], SG=[255,220,156], SB=[205,218,255];
  var pair=[[CX-62*k,CY-60*k,9.5*k,1.0],[CX+64*k,CY-4*k,7.8*k,0.88]];
  var farStars=[];
  for(var i=0;i<32;i++){
    var x,y;
    if(rnd()<0.45){var q=onBand(60*k);x=q[0];y=q[1];}
    else{var a0=rnd()*TAU, rr=Math.sqrt(rnd())*RP; x=CX+rr*Math.cos(a0); y=CY+rr*Math.sin(a0);}
    if(y>HY-14*k){i--;continue;}
    var dp=Math.min(Math.hypot(x-pair[0][0],y-pair[0][1]),Math.hypot(x-pair[1][0],y-pair[1][1]));
    if(dp<60*k){i--;continue;}
    var r=(0.6+Math.pow(rnd(),5)*1.0)*k, t=rnd(), c=t<0.6?SW:(t<0.85?SB:SG);
    farStars.push({x:x,y:y,r:r,c:c,a:0.18+rnd()*0.34});
  }
  g.restore();
  var ripples=[];
  for(var y=HY+4*k;y<BOT;){
    var dy=y-HY, n=1+Math.floor(rnd()*3);
    for(var j=0;j<n;j++){
      var xx=CX+(rnd()-0.5)*2*RP, ww=(30+rnd()*120)*k*(1+dy/(RP*0.6));
      var a=(0.018+0.03*rnd())*Math.exp(-dy/(RP*0.8));
      ripples.push({x:xx,y:y,w:ww,a:a,dy:dy});
    }
    y+=(3+dy*0.06+rnd()*3)*k;
  }
  // horizon hairline: thin, so it is drawn as a vector every frame (crisp at any breathing scale)
  function drawHairline(g){
    var hl=g.createLinearGradient(CX-RP,0,CX+RP,0);
    hl.addColorStop(0,'rgba(200,190,230,0)');hl.addColorStop(0.25,'rgba(214,198,214,0.16)');hl.addColorStop(0.5,'rgba(244,216,170,0.48)');
    hl.addColorStop(0.75,'rgba(214,198,214,0.16)');hl.addColorStop(1,'rgba(200,190,230,0)');
    g.fillStyle=hl;g.fillRect(CX-RP,HY-0.9*k,2*RP,1.8*k);
  }
  g.globalCompositeOperation='source-over';
  var glints=[];
  function glitter(sx,sy,p){
    var list=[];
    for(var y=HY+2.5*k;y<BOT;){
      var dy=y-HY, n=1+(rnd()<0.45?1:0);
      for(var j=0;j<n;j++){
        var sp=Math.pow(rnd(),2.2);
        var a=p*(0.10+0.62*sp)*Math.exp(-dy/(120*k));
        var w=(2+dy*0.045+rnd()*7+sp*6)*k, hh=(0.55+rnd()*0.7)*k;
        var xo=sx+gauss()*(1.5+dy*0.05)*k+Math.sin(dy*0.09/k+j)*2*k;
        list.push({x:xo,y:y,w:w,hh:hh,a:a,dy:dy});
      }
      y+=(1.7+dy*0.022+rnd()*1.8)*k;
    }
    return list;
  }
  glints.push(glitter(pair[0][0],pair[0][1],pair[0][3]));
  glints.push(glitter(pair[1][0],pair[1][1],pair[1][3]));

  // ---------- above the pupil: ruff + fiber tips (additive) ----------
  var BH=Math.ceil(RP+110*k), BX=Math.floor(CX-BH), BY=Math.floor(CY-BH), BS=2*BH+2;
  L.layerB=layer(BX,BY,BS,BS);
  g=L.layerB.g; g.globalCompositeOperation='lighter'; g.lineCap='round';
  for(var s=0;s<1440;s++){
    var th=s/1440*TAU, th2=(s+1.2)/1440*TAU, a=(0.07+0.32*Math.pow(nC(th*3)*nB(th),0.8))*(0.55+0.45*cryptF(th));
    var p=Pt(RPf(th)+1.5*k,th), q=Pt(RPf(th2)+1.5*k,th2);
    g.strokeStyle=rgba(mix(PALE,GOLD,0.4),a);g.lineWidth=2.1*k;g.beginPath();g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1]);g.stroke();
  }
  TG=[L.layerB.g];
  for(var i=0;i<2600;i++){
    var th=rnd()*TAU, d=dens(th);
    if(rnd()>Math.pow(d,1.3)*1.6) continue;
    var e=RPf(th), r0=e-(3+rnd()*6)*k, r1=e+(18+rnd()*60)*k;
    var t=rnd(), cIn=t<0.4?PALE:GOLD;
    fiber(th,r0,r1,(0.7+Math.pow(rnd(),2)*1.6)*k,(0.04+Math.pow(rnd(),1.5)*0.16)*(0.5+0.7*d)*cryptF(th),cIn,AMBER,(rnd()-0.5)*0.03);
  }
  // ---------- corneal highlight sprite (blurred, composited with 'screen' per frame) ----------
  var hx=CX-245*k, hy=CY-272*k, HH=Math.ceil(140*k);
  L.hl=layer(Math.floor(hx-HH),Math.floor(hy-HH),2*HH+2,2*HH+2);
  g=L.hl.g; g.save();g.filter='blur('+(14*k).toFixed(1)+'px)';
  g.translate(hx,hy);g.rotate(-0.74);g.scale(1,0.5);
  var ch=g.createRadialGradient(0,0,0,0,0,80*k);
  ch.addColorStop(0,'rgba(255,246,228,0.14)');ch.addColorStop(0.55,'rgba(255,246,228,0.09)');ch.addColorStop(1,'rgba(255,246,228,0)');
  g.fillStyle=ch;g.beginPath();g.arc(0,0,80*k,0,TAU);g.fill();g.restore();g.filter='none';

  return {P:P,k:k,CX:CX,CY:CY,R:R,RP:RP,HY:HY,TOP:TOP,BOT:BOT,skyRect:skyRect,L:L,
          bgStars:bgStars,farStars:farStars,ripples:ripples,glints:glints,pair:pair,
          RPf:RPf,pupilPath:pupilPath,drawBgStar:drawBgStar,drawHairline:drawHairline,rgba:rgba,
          rngCheck:rnd()};
}
