/*
 * Doodle Wheels V19 — World signatures. Pure Canvas layer on top of the local
 * illustrated backdrops and below the collision terrain. No physics, no RNG,
 * no network resources; the three neon scenes share a small reusable sprite cache. All animation is deterministic
 * by world camera position and elapsed race time.
 */
const WorldArtV19 = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const clamp = (x, a, b) => Math.max(a, Math.min(x, b));
  const mod = (x, n) => ((x % n) + n) % n;
  const circle = (c, x, y, r, fill) => {
    c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) c.fill(); else c.stroke();
  };
  const line = (c, points) => {
    c.beginPath(); c.moveTo(points[0],points[1]);
    for(let i=2; i<points.length; i+=2) c.lineTo(points[i],points[i+1]);
    c.stroke();
  };
  function draw(ctx, world, w, h, gy, cam, t, quality=0, segment=null) {
    if(!world || world==='classic') return;
    const small = Math.min(w/1280, h/720);
    const q = Math.max(0, Math.min(quality|0, 2));
    ctx.save();
    // The detail zone ends before the track; gameplay silhouettes never get covered.
    ctx.beginPath(); ctx.rect(0,0,w,world==='neon' ? h : Math.max(gy*0.88,h*0.55)); ctx.clip();
    if (world==='paradise') paradise(ctx,w,gy,cam,t,small,q);
    else if(world==='inferno') inferno(ctx,w,gy,cam,t,small,q);
    else if(world==='atlantis') atlantis(ctx,w,gy,cam,t,small,q);
    else if(world==='enchanted') enchanted(ctx,w,gy,cam,t,small,q);
    else if(world==='neon') neon(ctx,w,h,gy,cam,t,small,q,segment);
    ctx.restore();
  }
  function paradise(c,w,gy,cam,t,s,q) {
    // Painted stained-glass rose window and sanctuary rays: recognisably sacred,
    // yet the crosses and architecture behind the racers remain unobstructed.
    const cx=w*.76-mod(cam*.004,w*.08), cy=gy*.21;
    const r=clamp(w*.112,65,148);
    if(q<2) {
      const halo=c.createRadialGradient(cx,cy,r*.35,cx,cy,r*2.7);
      halo.addColorStop(0,'rgba(255,253,216,.51)');halo.addColorStop(.48,'rgba(255,229,155,.22)');halo.addColorStop(1,'rgba(255,254,238,0)');
      c.fillStyle=halo;c.fillRect(cx-r*2.8,cy-r*2.8,r*5.6,r*5.6);
      c.save();c.translate(cx,cy);c.rotate(Math.sin(t*.15)*.018);
      c.fillStyle='rgba(255,250,216,.07)'; c.strokeStyle='rgba(255,248,198,.28)';c.lineWidth=4;
      for(let i=0;i<9;i++) {
        c.save();c.rotate((i-4)*.195);
        c.beginPath();c.moveTo(0,r*.43);c.lineTo(-r*.21,gy*.78);c.lineTo(r*.21,gy*.78);c.closePath();c.fill();c.restore();
      }
      c.restore();
    }
    c.save(); c.translate(cx,cy); c.rotate(t*.008);
    c.strokeStyle='rgba(255,251,226,.98)';c.lineWidth=3.3;
    circle(c,0,0,r);circle(c,0,0,r*.81);circle(c,0,0,r*.19);
    for(let i=0;i<12;i++) {
      const a=i*TAU/12, x=Math.cos(a)*r*.58,y=Math.sin(a)*r*.58;
      c.fillStyle=i%3===0?'rgba(255,224,135,.62)':i%2===0?'rgba(125,205,228,.50)':'rgba(248,254,237,.62)';
      c.beginPath();c.ellipse(x,y,r*.13,r*.29,a+PI/2,0,TAU);c.fill();c.stroke();
    }
    c.strokeStyle='#fff6d5';c.lineWidth=5;line(c,[0,-r*.29,0,r*.27]);line(c,[-r*.2,-r*.08,r*.2,-r*.08]);
    c.restore();
    // V22 rework: deep cobalt stained-glass windows, warm marble arcades,
    // distinct ivory/gold/azure palette. These are background shapes only.
    // Leave the riding strip unobstructed; no artificial warning icons.
    c.save();
    const drift=mod(cam*.035,300);
    for(let i=-1;i<6;i++){
      const x=i*300+145-drift,top=gy*.40;
      c.globalAlpha=.42;
      c.fillStyle='#fcf2dc';c.strokeStyle='#ceaa71';c.lineWidth=4.2;
      c.beginPath();c.moveTo(x-71,top+103);c.lineTo(x-71,top+17);
      c.quadraticCurveTo(x,top-96,x+71,top+17);
      c.lineTo(x+71,top+103);c.closePath();c.fill();c.stroke();
      c.globalAlpha=.55;
      const pg=c.createLinearGradient(x,top-68,x,top+104);
      pg.addColorStop(0,'#d1edf0');pg.addColorStop(.54,'#5f9fae');pg.addColorStop(1,'#476d93');
      c.fillStyle=pg;c.beginPath();c.moveTo(x-46,top+96);c.lineTo(x-46,top+19);
      c.quadraticCurveTo(x,top-55,x+46,top+19);c.lineTo(x+46,top+96);c.closePath();c.fill();
      c.lineWidth=3;c.strokeStyle='#ffe1a1';
      line(c,[x,top-48,x,top+95]);line(c,[x-45,top+36,x+45,top+36]);
      c.fillStyle='rgba(242,194,113,.7)';circle(c,x,top+32,7,true);
      c.globalAlpha=.68;
      c.fillStyle='#fff9e8';c.fillRect(x-87,top+100,19,gy*.14);
      c.fillRect(x+68,top+100,19,gy*.14);
      c.fillStyle='#d6b982';c.fillRect(x-93,top+94,30,8);c.fillRect(x+63,top+94,30,8);
      c.strokeStyle='rgba(111,145,170,.48)';c.lineWidth=2;
      line(c,[x-69,top+119,x-69,top+gy*.14+98]);
    }
    c.globalAlpha=1;c.restore();
    // Vertical rays: light comes from the cathedral rosette, not from random
    // translucent gradients that wash out the obstacles.
    c.save(); c.globalAlpha=q===2?.09:.18;
    for(let k=0;k<7;k++){
      c.fillStyle=k%2?'rgba(255,241,171,.55)':'rgba(255,255,245,.75)';
      const x=cx+(k-3)*24;
      c.beginPath();c.moveTo(cx,cy+r*.36);c.lineTo(x-17,gy*.87);c.lineTo(x+17,gy*.87);c.closePath();c.fill();
    }
    c.restore();
    // Floating votive lights drifting gently through the upper sky.
    const N=q<2?9:4;
    for(let i=0;i<N;i++) {
      const x=mod((i+.35)*w/N + Math.sin(t*.38+i)*14-cam*.02,w);
      const y=gy*(.07 + (i%4)*.095)+Math.sin(t*.6+i*2.1)*6;
      c.fillStyle='rgba(255,248,204,.18)';circle(c,x,y,9,true);
      c.fillStyle='rgba(255,247,197,.85)';circle(c,x,y,2.2,true);
    }
    // Floating sanctuaries and arches: the Paradise segment now feels architectural,
    // not just decorative. They stay high above the terrain silhouette.
    for(let i=0;i<3;i++) {
      const bx=mod(w*(0.18+i*0.27)-cam*(0.022+i*0.004),w+340)-120;
      const by=gy*(0.30 + (i%2)*0.07)+Math.sin(t*0.23+i*1.7)*6;
      c.save(); c.translate(bx,by);
      c.fillStyle='rgba(255,249,235,.72)';
      c.strokeStyle='rgba(240,220,164,.92)'; c.lineWidth=3;
      c.beginPath(); c.moveTo(-84,0); c.lineTo(-84,44); c.lineTo(-62,44); c.lineTo(-62,8);
      c.quadraticCurveTo(0,-48,62,8); c.lineTo(62,44); c.lineTo(84,44); c.lineTo(84,0);
      c.quadraticCurveTo(0,-63,-84,0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle='rgba(255,255,255,.92)';
      for (const dx of [-52,0,52]) { c.fillRect(dx-7, 10, 14, 34); c.beginPath(); c.arc(dx,8,10,Math.PI,0); c.fill(); }
      c.strokeStyle='rgba(183,220,241,.9)'; c.lineWidth=2;
      c.beginPath(); c.moveTo(-70,-2); c.lineTo(70,-2); c.stroke();
      c.restore();
    }
  }
  function inferno(c,w,gy,cam,t,s,q) {
    // Magnetic storm fractures the red sky; distant cathedral is left intact.
    const storm=mod(t*.18,1);
    const boltFlash=storm<.085?(.085-storm)/.085:storm>.93?(.95-storm)/.02:0;
    c.save();
    if(boltFlash>0) {
      c.fillStyle=`rgba(255,89,127,${clamp(boltFlash,0,1)*.14})`;c.fillRect(0,0,w,gy*.73);
    }
    const bx=w*.15-mod(cam*.009,w*.06), by=gy*.01;
    c.strokeStyle=`rgba(255,124,177,${.75+boltFlash*.24})`;
    c.lineJoin='round';c.lineWidth=boltFlash>0?5:3.5;
    line(c,[bx,by,bx-34,by+42,bx-6,by+77,bx-48,by+124,bx-16,by+142,bx-58,by+194]);
    c.strokeStyle=`rgba(255,166,191,${.25+boltFlash*.5})`;c.lineWidth=1.8;
    line(c,[bx-6,by+77,bx+30,by+114,bx+6,by+150]);
    // Two slow layers of blood-red storm smoke, curved rather than straight waves.
    c.globalAlpha=q===2?.18:.33;
    for(let i=0;i<3;i++) {
      const x=mod(i*w*.62-cam*.035+t*(9+i*5),w+450)-225;
      const y=gy*(.15+i*.105);
      const grad=c.createRadialGradient(x,y,12,x,y,130+i*25);
      grad.addColorStop(0,'rgba(230,63,106,.38)');grad.addColorStop(1,'rgba(64,21,58,0)');
      c.fillStyle=grad;c.beginPath();c.ellipse(x,y,210,55,0,0,TAU);c.fill();
    }
    c.globalAlpha=1;
    // A circular oath seal: cracks and rotating radial barbs. Repeats with parallax,
    // not with the collision landscape.
    const sx=w*.84-mod(cam*.005,75), sy=gy*.17, r=clamp(w*.076,42,92);
    c.strokeStyle='rgba(255,106,170,.88)';c.lineWidth=2.2;
    circle(c,sx,sy,r);circle(c,sx,sy,r*.65);
    for(let k=0;k<10;k++) {
      const a=TAU*k/10+t*.05;
      line(c,[sx+Math.cos(a)*r*.7,sy+Math.sin(a)*r*.7,sx+Math.cos(a+.10)*r*1.26,sy+Math.sin(a+.10)*r*1.26]);
    }
    c.restore();
  }
  function atlantis(c,w,gy,cam,t,s,q) {
    // Colossal manta silhouette swimming BEHIND foreground architecture, a true
    // scale cue; it never collides or hides gameplay.
    const mx=w*.69 + Math.sin(t*.19-cam*.0007)*w*.09;
    const my=gy*.20+Math.sin(t*.36)*12;
    const mscale=clamp(w/900,.80,1.7);
    c.save();c.translate(mx,my);c.scale(mscale,mscale);
    c.rotate(Math.sin(t*.33)*.025);
    c.fillStyle='rgba(1,39,58,.72)';
    c.beginPath();c.moveTo(-17,0);
    c.bezierCurveTo(-86,-12,-125,-74,-212,-45);
    c.bezierCurveTo(-158,4,-105,22,-33,24);
    c.bezierCurveTo(-28,45,-8,63,0,75);
    c.bezierCurveTo(8,60,20,41,34,22);
    c.bezierCurveTo(92,22,148,7,210,-46);
    c.bezierCurveTo(131,-67,78,-9,16,-1);c.closePath();c.fill();
    c.strokeStyle='rgba(145,245,240,.57)';c.lineWidth=2.4;
    c.beginPath();c.moveTo(-169,-30);c.quadraticCurveTo(-60,42,0,28);c.quadraticCurveTo(82,42,170,-30);c.stroke();
    c.beginPath();c.moveTo(-9,48);c.quadraticCurveTo(3,86,-8,128);c.stroke();
    c.restore();
    // Caustic shafts from the ocean's surface: pale crystalline slashes.
    c.save();c.globalCompositeOperation='screen';
    for(let i=0;i<(q<2?7:4);i++){
      const cx=mod((i+.5)*w/7+Math.sin(t*.22+i)*24-cam*.011,w+260)-130;
      const grd=c.createLinearGradient(cx,0,cx+130,gy*.74);
      grd.addColorStop(0,'rgba(212,255,233,.20)');grd.addColorStop(1,'rgba(182,254,242,0)');
      c.fillStyle=grd;c.beginPath();c.moveTo(cx-10,0);c.lineTo(cx+10,0);c.lineTo(cx+125,gy*.78);c.lineTo(cx+84,gy*.78);c.closePath();c.fill();
    }
    c.restore();
    // A submerged archaeological compass seal with pearly concentric rings.
    const x=w*.27-mod(cam*.009,70),y=gy*.26,rr=clamp(w*.055,40,72);
    c.strokeStyle='rgba(140,247,219,.6)';c.lineWidth=2;
    circle(c,x,y,rr);circle(c,x,y,rr*.73);
    for(let k=0;k<8;k++){const a=k*TAU/8+t*.07;c.beginPath();c.moveTo(x+Math.cos(a)*rr*.75,y+Math.sin(a)*rr*.75);c.lineTo(x+Math.cos(a)*rr*1.18,y+Math.sin(a)*rr*1.18);c.stroke();}
    c.fillStyle='rgba(231,255,229,.65)';circle(c,x,y,5,true);
  }
  function enchanted(c,w,gy,cam,t,s,q) {
    // Forest guardian: a translucent stag with branch-like antlers. Large enough
    // to be readable, subtle enough not to compete with the track.
    const x=w*.78-mod(cam*.006,w*.065), y=gy*.45;
    const sc=clamp(w/1020,.64,1.34);
    c.save();c.translate(x,y);c.scale(sc,sc);
    const glow=c.createRadialGradient(0,-20,8,0,-20,160);
    glow.addColorStop(0,'rgba(120,255,210,.24)');glow.addColorStop(1,'rgba(108,204,179,0)');
    c.fillStyle=glow;c.fillRect(-185,-205,370,330);
    c.fillStyle='rgba(8,52,49,.80)';
    c.beginPath();c.moveTo(0,-4);c.bezierCurveTo(-42,-26,-43,-55,-22,-81);
    c.lineTo(-19,-100);c.quadraticCurveTo(0,-113,18,-100);
    c.lineTo(23,-81);c.bezierCurveTo(47,-53,43,-22,0,-4);c.fill();
    c.strokeStyle='rgba(188,255,198,.95)';c.lineWidth=4;c.lineCap='round';
    for(let sign of [-1,1]){
      c.save();c.scale(sign,1);
      line(c,[14,-98,39,-132,45,-175,59,-209]);
      line(c,[41,-157,78,-174,92,-193]);
      line(c,[37,-135,69,-138,91,-154]);
      line(c,[54,-192,47,-223]);
      c.restore();
    }
    c.fillStyle='rgba(214,255,194,.95)';circle(c,-10,-72,3.8,true);circle(c,10,-72,3.8,true);
    c.restore();
    // A layered arch of living vines, passing behind the trees.
    const ax=w*.15+Math.sin(t*.18)*7, ay=gy*.34;
    c.strokeStyle='rgba(119,233,171,.35)';c.lineWidth=5;
    c.beginPath();c.moveTo(ax-126,ay+70);c.bezierCurveTo(ax-125,ay-130,ax+121,ay-126,ax+132,ay+70);c.stroke();
    for(let i=0;i<10;i++) {
      const a=i*PI/10+PI, px=ax+Math.cos(a)*126,py=ay+Math.sin(a)*104+6;
      c.fillStyle=i%3===0?'rgba(198,140,237,.63)':'rgba(145,236,161,.61)';
      c.beginPath();c.ellipse(px,py,7,13,a+.45,0,TAU);c.fill();
    }
    if(q<2) for(let k=0;k<12;k++) {
      const px=mod(k*w/12+Math.sin(t*.5+k)*10-cam*.012,w);
      const py=gy*(.06+((k*7)%9)*.045);
      const pulse=.45+.4*Math.sin(t*1.1+k);
      c.fillStyle=`rgba(227,255,189,${clamp(pulse,0,.9)})`;circle(c,px,py,2.2,true);
    }
  }
  // Night-line scenery is anchored between the three large panorama landmarks.
  // Baked masonry, lights and lettering stay still; only the ladle, noodles'
  // steam and train move. The actual roadway is drawn over this layer.
  const streetWidth = 460, streetHeight = 300, streetBase = 208;
  const streetArt = [];
  const streetStops = [0.31, 0.65, 0.945];
  const coal = '#272540', steel = '#565777', aqua = '#8ee8d8', cream = '#ffebbb';
  function block(c, color, x, y, w, h) {
    c.fillStyle = color; c.fillRect(x,y,w,h);
  }
  function panel(c, fill, ...points) {
    c.fillStyle = fill; c.beginPath(); c.moveTo(points[0],points[1]);
    for (let i=2; i<points.length; i+=2) c.lineTo(points[i],points[i+1]);
    c.closePath(); c.fill();
  }
  function wire(c, color, width, ...points) {
    c.strokeStyle = color; c.lineWidth = width; line(c,points);
  }
  function foundry(c) {
    // Brick bays and rooftop sawtooth skylights beneath a travelling gantry.
    block(c,'#60435b',46,136,313,171);
    for (let i=0;i<3;i++) {
      const x=46+i*104;
      panel(c,coal,x,136,x+86,96,x+103,98,x+103,139);
      wire(c,aqua,3,x+6,133,x+85,99);
      block(c,'#49394c',x+6,152,88,112);
      for (let k=0;k<4;k++) block(c,k===1?'#ffd19b':'#ef925c',x+12+k*19,158,14,32);
    }
    for (const x of [24,355]) {
      block(c,coal,x,56,13,245);
      wire(c,steel,5,x+3,61,x+54,61,x+8,111);
    }
    block(c,coal,14,32,392,31);
    for (let x=22;x<384;x+=32) wire(c,steel,3,x,56,x+14,38,x+30,56);
    block(c,'#e7a278',13,31,394,4);
    panel(c,'#594355',367,211,380,79,400,79,413,211);
    block(c,'#dc8d7d',378,76,24,8);
    for (let x=18;x<405;x+=45) block(c,'#ffca88',x,62,5,4);
  }
  function ladle(c,t) {
    const x=144+38*Math.sin(t*.52);
    block(c,steel,x-24,52,48,11);
    wire(c,'#c7acc2',2,x-13,63,x-13,88,x,101,x+13,88,x+13,63);
    c.save(); c.translate(x,102); c.rotate(-.16-.12*Math.sin(t*.70));
    panel(c,'#a16b69',-22,-4,24,-4,16,17,-15,17);
    block(c,'#ffba72',-23,-5,48,5);
    c.restore();
  }
  function nightMarket(c) {
    const plum='#493651', rose='#ed8293';
    block(c,plum,63,105,337,196); block(c,'#78576e',85,77,91,32);
    for (let i=0;i<3;i++) {
      const x=46+119*i;
      panel(c,i===1?'#4a9794':rose,x+5,130,x+100,120,x+121,143,x,151);
      for (let j=0;j<5;j++) {
        const px=x+19*j+7;
        panel(c,i===1?'#9adaca':'#fac0ac',px,132-(j*2),px+9,131-(j*2),px+13,147-(j*1.3),px,148-(j*1.3));
      }
      block(c,coal,x+6,150,7,150); block(c,coal,x+109,144,7,155);
      block(c,'#f3bb85',x+19,167,76,4);
      block(c,'#534154',x+11,188,94,92);
      block(c,i===1?aqua:rose,x+10,185,97,6);
    }
    // The rooftop sign is a restaurant icon, legible in either game language.
    c.fillStyle=coal; circle(c,242,91,38,true);
    c.strokeStyle=rose; c.lineWidth=3; circle(c,242,91,35);
    c.fillStyle=cream; c.beginPath(); c.arc(242,94,22,0,PI); c.fill();
    block(c,rose,233,112,18,4);
    wire(c,cream,2,242,91,266,72); wire(c,cream,2,248,91,271,75);
    c.strokeStyle='#2f324a'; c.lineWidth=3; c.beginPath(); c.moveTo(20,68);
    c.quadraticCurveTo(230,127,438,65);c.stroke();
    for (let i=0;i<8;i++) {
      const x=42+i*54, u=(x-20)/418, y=68+110*u*(1-u)-3*u;
      wire(c,coal,2,x,y,x,y+8); c.fillStyle=i%2?'#ffb875':'#ef858f';
      c.beginPath();c.ellipse(x,y+17,7,10,0,0,TAU);c.fill();
      block(c,'#76465c',x-4,y+24,8,3);
    }
  }
  function station(c) {
    // Girders, three piers and a stepped terminal tower with a lit clock face.
    block(c,'#3d465e',258,91,106,208);block(c,'#586483',273,52,74,187);
    panel(c,coal,268,53,283,38,337,38,354,53);
    block(c,'#8cc6c4',283,36,54,4);
    wire(c,steel,3,310,38,310,16);
    c.fillStyle=cream;circle(c,310,81,18,true);
    wire(c,coal,2.5,310,69,310,81,320,86);
    for (let i=0;i<4;i++) block(c,'#24374e',280+i*17,111,7,67);
    for (let i=0;i<4;i++) {
      const x=34+i*119;
      panel(c,'#343953',x,161,x+36,161,x+25,186,x+25,300,x+8,300,x+8,185);
      block(c,steel,x+9,182,4,118);
    }
    block(c,coal,14,148,432,20); block(c,aqua,15,146,430,3);
    for(let x=18;x<423;x+=25) wire(c,steel,2,x,163,x+11,152,x+22,163);
  }
  function train(c,t) {
    // Cars disappear into the station/tunnel at either end of this local line.
    c.save();c.beginPath();c.rect(17,96,426,51);c.clip();
    const x=mod(t*65,650)-172;
    for(let i=0;i<3;i++) {
      const a=x+i*56;
      panel(c,'#d5ddcf',a,143,a,121,a+5,117,a+45,117,a+54,126,a+54,143);
      block(c,'#c7759e',a,136,54,5);
      for(let j=0;j<4;j++) block(c,'#415979',a+5+j*11,121,8,9);
    }
    c.restore();
  }
  function bakeStreet(index) {
    if (!streetArt[index]) {
      const tile=document.createElement('canvas');
      tile.width=streetWidth;tile.height=streetHeight;
      const c=tile.getContext('2d');
      c.lineJoin='round'; c.lineCap='round';
      [foundry, nightMarket, station][index](c);
      streetArt[index]=tile;
    }
    return streetArt[index];
  }
  function neon(c,w,h,gy,cam,t,s,q,segment) {
    const start=segment ? segment.start : 0;
    const end=segment ? segment.end : Terrain.FINISH_X;
    if(end<=cam || start>=cam+w) return;
    const span=end-start, scale=Math.min(clamp(s,.70,1.28),span*.22/streetWidth);
    const width=streetWidth*scale;
    c.save();c.beginPath();c.rect(start-cam,0,span,h);c.clip();
    for (let i=0;i<streetStops.length;i++) {
      const anchor=start+span*streetStops[i], x=anchor-cam-width*.5;
      if(x+width<0 || x>w) continue;
      const y=gy-Terrain.height(anchor) - (streetBase-14)*scale;
      c.save();c.translate(x,y);c.scale(scale,scale);
      c.drawImage(bakeStreet(i),0,0);
      if(i===0) ladle(c,q===2?0:t);
      else if(i===2) train(c,q===2?4:t);
      else if(q!==2) {
        for(let j=0;j<2;j++) {
          const a=t*1.7+j*2.4;
          wire(c,cream,2,232+j*7,88,230+j*7+2*Math.sin(a),83,232+j*7,78);
        }
      }
      c.restore();
    }
    c.restore();
  }
  // V43: travel-poster vignettes for the natural biomes. Coordinates are relative
  // to the centre of the hill crest. Only the blades and cable cars move.
  function farmhouse(c,x,y,w,h) {
    block(c,'#eed1a0',x,y-h,w,h);
    panel(c,'#ad694f',x-4,y-h+1,x+w*.22,y-h-14,x+w*.79,y-h-14,x+w+5,y-h+1);
    block(c,'#806254',x+w*.67,y-11,7,11);
    for(let i=0;i<2;i++) block(c,'#6b8980',x+6+i*11,y-h+6,5,7);
  }
  function hillMill(c) {
    panel(c,'#80916a',-180,11,-145,-8,-80,-23,0,-7,60,-15,135,-10,184,10,162,36,-158,36);
    farmhouse(c,-116,-8,48,23); farmhouse(c,57,-2,68,28);
    for(let i=0;i<3;i++) {
      const x=-73+i*15,y=-14+i*2;
      block(c,'#647a65',x-1,y-10,3,12);
      c.fillStyle='#55786b';c.beginPath();c.ellipse(x,y-24,4,19-i*2,.04,0,TAU);c.fill();
    }
    panel(c,'#f5deb1',-29,4,-18,-93,10,-100,34,4);
    panel(c,'#d6b68d',9,-95,21,-92,34,4,18,4);
    panel(c,'#855844',-22,-92,-18,-105,-7,-115,4,-119,18,-103,23,-92);
    block(c,'#756555',-4,-19,10,23); block(c,'#8ba6a0',-7,-54,8,11);
    wire(c,'#c09a74',3,-19,-28,22,-28);
  }
  function millBlades(c,angle) {
    c.save();c.translate(0,-96);c.rotate(angle);
    for(let i=0;i<4;i++){
      wire(c,'#866959',3,0,0,0,-64);
      panel(c,'#e7c58e',0,-22,13,-28,11,-63,0,-64);
      for(let j=32;j<64;j+=9) wire(c,'#ab8765',1.6,1,-j,11,-j-1);
      c.rotate(PI/2);
    }
    c.fillStyle='#846452';circle(c,0,0,5,true);c.restore();
  }
  function harbor(c) {
    panel(c,'#699c94',-178,14,-139,2,-103,-9,-35,-6,8,-13,63,-14,90,-6,161,-5,181,14,153,31,-141,34);
    farmhouse(c,-123,0,45,21); farmhouse(c,-67,-3,39,19);
    panel(c,'#f7dec1',14,0,24,-111,47,-111,59,0);
    panel(c,'#ba645b',17,-36,51,-36,54,-63,20,-63);
    panel(c,'#bed1c3',43,-109,47,-109,59,0,51,0);
    block(c,'#4a7375',19,-114,34,5);block(c,'#9ab4a4',23,-130,25,16);
    block(c,'#ffe397',27,-129,15,12);block(c,'#587e7b',35,-129,2,14);
    panel(c,'#aa6258',18,-129,35,-144,53,-129); wire(c,'#6e7b70',2,35,-145,35,-151);
    wire(c,'#506e70',2,16,-116,16,-122,55,-122,55,-116);
    for(let i=0;i<2;i++) {
      const x=80+i*49, y=3-i*6;
      wire(c,'#547777',2,x,y-3,x,y-33+i*7);
      panel(c,'#fff0c9',x-2,y-31+i*7,x-4,y-7,x-20,y-7);
      panel(c,'#c77b67',x+2,y-28+i*7,x+15,y-8,x+2,y-8);
      panel(c,'#536e74',x-23,y-4,x+20,y-4,x+14,y+2,x-14,y+2);
    }
  }
  function cableStation(c) {
    panel(c,'#8c99b0',-171,14,-128,-12,-91,-16,-43,0,38,-6,105,-30,146,-21,176,12,157,33,-151,34);
    panel(c,'#e0e4e9',-167,9,-126,-16,-93,-23,-57,-8,-89,-11,-120,-7);
    for(const [x,y] of [[-137,-79],[92,-112]]) {
      panel(c,'#73859d',x-9,7,x-3,y,x+3,y,x+10,7);
      block(c,'#435775',x-10,y-3,20,6);
    }
    wire(c,'#52617d',2.4,-148,-80,-42,-90,24,-100,105,-113,156,-112);
    wire(c,'#8493a7',1.7,-148,-74,-42,-84,24,-94,105,-107,156,-106);
    block(c,'#b7c9d7',70,-37,71,27);
    panel(c,'#59718a',63,-38,90,-56,129,-56,150,-41);
    panel(c,'#f1f0e7',63,-38,90,-59,129,-59,147,-45,127,-51,91,-51);
    for(let i=0;i<3;i++) block(c,'#59748c',82+i*14,-34,10,9);
  }
  function gondola(c,f,paint) {
    const x=-137+f*229;
    const y=x<-42 ? -80-(x+148)*10/106 : x<24 ? -90-(x+42)*10/66 : -100-(x-24)*13/81;
    wire(c,'#65748a',2,x,y,x+1,y+7,x-3,y+11);
    panel(c,paint,x-10,y+10,x+9,y+10,x+13,y+17,x+11,y+27,x-11,y+27,x-13,y+17);
    block(c,'#e0ece9',x-9,y+13,7,7);block(c,'#c6dfe2',x,y+13,8,7);
  }
  function canyonArch(c) {
    const outline=[-169,16,-128,4,-105,-5,-86,-36,-79,-89,-53,-105,-35,-112,24,-112,38,-101,74,-92,87,-41,111,-10,150,3,172,18,150,42,-155,42];
    c.save();c.beginPath();c.moveTo(outline[0],outline[1]);
    for(let i=2;i<outline.length;i+=2)c.lineTo(outline[i],outline[i+1]);
    c.closePath();
    c.moveTo(-52,9);c.lineTo(-35,-26);
    c.bezierCurveTo(-29,-86,15,-88,31,-52);c.lineTo(42,-22);c.lineTo(57,9);c.closePath();
    c.fillStyle='#b57071';c.fill('evenodd');c.clip('evenodd');
    panel(c,'#d89079',-99,-97,-35,-122,27,-116,80,-95,29,-101,-36,-100,-82,-86);
    panel(c,'#ce8979',-100,-81,-61,-88,-23,-84,21,-87,82,-78,84,-72,19,-80,-25,-79,-61,-83,-98,-73);
    panel(c,'#9a6472',31,-104,59,-95,80,-80,90,-38,109,-12,132,3,85,-2,65,-25,56,-61);
    panel(c,'#cf8b79',-100,-37,-65,-46,5,-40,54,-46,83,-34,43,-37,-1,-34,-64,-39,-100,-30);
    c.restore();
    panel(c,'#b17a77',-149,28,-87,3,-66,-6,-20,10,25,8,64,-5,132,10,171,24,157,38,-150,38);
  }
  function forestLookout(c) {
    panel(c,'#956a68',-166,20,-102,1,-73,-12,-20,-3,43,-15,97,-13,159,14,146,32,-146,34);
    for(const [x,y] of [[-100,0],[-72,-2],[-39,7],[71,-3],[99,-2]]) {
      wire(c,'#8e6356',4,x,y+2,x,y-47);
      c.fillStyle=x%2===0?'#c27954':'#aa665c';c.beginPath();c.ellipse(x,y-53,13,33,x*.001,0,TAU);c.fill();
    }
    const oak='#7d5960';
    for(const x of [-22,18]) wire(c,oak,5,x+3,-8,x,-100);
    wire(c,oak,3,-19,-16,19,-65,-22,-95);
    wire(c,oak,3,18,-16,-19,-65,18,-95);
    block(c,'#b37a59',-30,-119,55,22);
    block(c,'#f7ca86',-24,-117,16,10);block(c,'#ebbe7d',-3,-117,17,10);
    panel(c,'#7f5358',-38,-118,-5,-141,30,-121,34,-117);
    block(c,'#81585a',-35,-97,64,5);
    for(let y=-80;y<-11;y+=10) wire(c,'#b49573',2,-6,y,2,y);
    wire(c,'#805d5a',2,-6,-90,-6,-9);wire(c,'#805d5a',2,2,-90,2,-9);
    wire(c,'#87626a',2,-5,-141,-5,-156);panel(c,'#dfac67',-4,-156,14,-152,-4,-148);
  }
  const countryside = { hills:hillMill, water:harbor, ice:cableStation, gravel:canyonArch, ramps:forestLookout };
  const countryTiles = new Map();
  function drawCountryside(c,kind,x,y,scale,time,detail) {
    const paint=countryside[kind];
    if (!paint) return;
    let tile=countryTiles.get(kind);
    if (!tile) {
      tile=document.createElement('canvas');tile.width=396;tile.height=228;
      const g=tile.getContext('2d');g.translate(198,178);g.lineJoin='round';g.lineCap='round';paint(g);
      countryTiles.set(kind,tile);
    }
    c.save();c.translate(x,y);c.scale(scale,scale);c.drawImage(tile,-198,-178);
    if(kind==='hills') millBlades(c,detail===2?.19:time*.24+.19);
    if(kind==='ice') {
      const f=detail===2?.30:.5-.48*Math.cos(time*.13);
      gondola(c,f,'#b65e5c');gondola(c,1-f,'#526a89');
    }
    c.restore();
  }
  // Small painted silhouettes for the sky layer, each cut from its own world palette.
  // A race only prepares the plates it will use. The same plate also prints on the postcard.
  const visitors = new Map();
  function visitorPlate(world) {
    if (visitors.has(world)) return visitors.get(world);
    const plate = document.createElement('canvas'); plate.width = 200; plate.height = 126;
    const c = plate.getContext('2d'), {sky, ink} = RouteStamps.colors(world);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const wash = (path, color) => { c.fillStyle = color; c.fill(new Path2D(path)); };
    if (world === 'classic') {
      wash('M44 41 C41 0 111 -5 119 32 C124 55 103 69 92 88 L73 88 C66 72 45 61 44 41Z',ink);
      wash('M50 42 C46 19 60 8 72 6 C58 26 59 51 78 84 C60 70 53 55 50 42Z','#d67e5c');
      wash('M76 6 C92 2 107 15 110 31 C114 49 99 69 90 83 C99 54 100 24 76 6Z',sky);
      wash('M71 8 C64 28 64 49 82 82 C72 43 81 26 84 8Z','#ecc18f');
      wire(c,ink,1.8,71,85,78,101,88,101,94,85);
      panel(c,'#865242',76,100,91,100,89,110,78,110);
      block(c,'#ddaf79',77,101,12,3);
    } else if (world === 'atlantis') {
      wash('M12 39 Q36 19 83 42 Q101 48 108 40 Q124 24 165 13 Q148 43 123 57 Q105 67 98 73 Q85 78 74 68 Q37 53 12 39Z',ink);
      wash('M20 38 Q54 27 85 45 Q90 49 97 53 Q67 46 51 45Z','#76b9b2');
      wash('M100 60 Q124 44 157 19 Q142 45 121 54Z',sky);
      c.strokeStyle = ink; c.lineWidth=3; c.beginPath(); c.moveTo(93,69); c.bezierCurveTo(110,90,142,81,169,111); c.stroke();
      for (let i=0;i<5;i++) {
        const x=15+i*14, y=83+(i%3)*6;
        wash('M'+x+' '+y+'q6 -5 13 -1q-5 7 -13 1l-4 2 1 -5Z','#d4e7c0');
      }
    } else if (world === 'enchanted') {
      wash('M100 60 Q75 30 37 28 Q36 50 58 70 Q37 64 56 86 Q70 109 55 119 Q76 112 88 87 L99 74 Q116 99 140 105 Q149 111 149 119 Q165 102 143 79 Q164 66 170 34 Q132 34 106 59Z',ink);
      wash('M95 59 Q65 32 42 32 Q47 60 78 73Z',sky);
      wash('M112 60 Q142 36 165 37 Q155 62 129 70Z','#d3c1ce');
      for (const [x,y] of [[72,54],[138,55],[75,84],[132,85]]) { c.fillStyle='#bc925f';circle(c,x,y,4,true); c.fillStyle=ink;circle(c,x,y,1.7,true); }
      wire(c,'#e6be81',4,101,58,105,82);wire(c,sky,1.5,101,61,98,49,90,43);wire(c,sky,1.5,104,61,110,48,117,44);
    } else if (world === 'neon') {
      wash('M19 53 Q46 17 113 26 Q147 31 163 47 L184 33 L178 54 L188 65 L161 59 Q109 87 44 72 Q25 68 19 53Z',ink);
      wash('M26 51 Q55 23 112 30 Q136 32 149 40 Q83 34 40 54Z',sky);
      wash('M30 59 Q88 72 155 48 Q110 80 49 69Z','#b17b8f');
      panel(c,ink,77,74,120,70,116,86,85,89);block(c,'#d3cfaa',88,79,21,3);
      for(let i=0;i<5;i++)block(c,'#95e6da',52+15*i,52-i,8,2);
    } else {
      // Long-necked ibis, pale doves and dark swifts have different wing and body proportions.
      for (let i=0;i<3;i++) {
        c.save(); c.translate(16+i*54,41+(i===1?27:0)); c.scale(1-i*.16,1-i*.16);
        const plumage=world==='paradise'?'#fff7df':world==='egypt'?'#d7bc9b':'#65394d';
        wash('M1 32 Q17 24 27 26 Q14 13 7 1 Q30 5 39 22 Q51 10 67 7 Q56 23 46 28 Q40 36 29 32 L8 38Z',plumage);
        wash('M7 1 Q26 8 39 22 L33 26 Q17 15 7 1Z',ink);
        if(world==='egypt') {
          c.strokeStyle=ink;c.lineWidth=2.3;c.beginPath();c.moveTo(43,28);c.quadraticCurveTo(59,31,65,24);c.quadraticCurveTo(70,20,75,26);c.stroke();
        } else panel(c,sky,43,26,53,24,48,29);
        c.restore();
      }
    }
    visitors.set(world,plate);
    return plate;
  }
  function drawVisitor(ctx, world, x, y, width) {
    ctx.drawImage(visitorPlate(world),x-width/2,y,width,width*.63);
  }
  return Object.freeze({draw,drawCountryside,drawVisitor});
})();
