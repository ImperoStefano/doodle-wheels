/*
 * Doodle Wheels V19 — World signatures. Pure Canvas layer on top of the local
 * illustrated backdrops and below the collision terrain. No physics, no RNG,
 * no network resources, no offscreen allocation. All animation is deterministic
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
  function draw(ctx, world, w, h, gy, cam, t, quality=0) {
    if(!world || world==='classic') return;
    const small = Math.min(w/1280, h/720);
    const q = Math.max(0, Math.min(quality|0, 2));
    ctx.save();
    // The detail zone ends before the track; gameplay silhouettes never get covered.
    ctx.beginPath(); ctx.rect(0,0,w,Math.max(gy*0.88,h*0.55)); ctx.clip();
    if (world==='paradise') paradise(ctx,w,gy,cam,t,small,q);
    else if(world==='inferno') inferno(ctx,w,gy,cam,t,small,q);
    else if(world==='atlantis') atlantis(ctx,w,gy,cam,t,small,q);
    else if(world==='enchanted') enchanted(ctx,w,gy,cam,t,small,q);
    else if(world==='neon') neon(ctx,w,gy,cam,t,small,q);
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
  function neon(c,w,gy,cam,t,s,q) {
    // Iconic magenta/cyan octagonal hologram, unlike the buildings behind it.
    const hx=w*.27-mod(cam*.009,65),hy=gy*.20;
    const rr=clamp(w*.105,65,130);
    c.save();c.translate(hx,hy);c.rotate(Math.sin(t*.26)*.05);
    c.strokeStyle='rgba(100,255,246,.74)';c.lineWidth=3.5;
    c.beginPath();for(let i=0;i<=8;i++){
      const a=(i*TAU/8)-PI/8;
      const xx=Math.cos(a)*rr, yy=Math.sin(a)*rr*.67;
      if(!i)c.moveTo(xx,yy);else c.lineTo(xx,yy);
    }c.stroke();
    c.strokeStyle='rgba(255,108,228,.88)';c.lineWidth=2;
    c.beginPath();c.ellipse(0,0,rr*.76,rr*.48,0,0,TAU);c.stroke();
    c.font=`900 ${Math.round(rr*.48)}px monospace`;c.textBaseline='middle';c.textAlign='center';
    c.fillStyle='rgba(157,250,246,.95)';c.fillText('DW',0,-rr*.035);
    c.font=`700 ${Math.round(rr*.16)}px monospace`;
    c.fillStyle='#ffb4ee';c.fillText('NIGHT RUN',0,rr*.38);
    c.restore();
    // Giant building-scale billboard strip. Animated equalizer on right panel.
    const x=w*.76-mod(cam*.007,65),y=gy*.24,bw=clamp(w*.21,140,265),bh=clamp(gy*.19,65,112);
    c.fillStyle='rgba(7,15,45,.67)';c.fillRect(x-bw/2,y-bh/2,bw,bh);
    c.strokeStyle='rgba(92,240,252,.82)';c.lineWidth=3;c.strokeRect(x-bw/2,y-bh/2,bw,bh);
    c.font=`800 ${Math.round(bh*.37)}px monospace`;c.fillStyle='#fe80dc';c.textAlign='left';c.textBaseline='middle';
    c.fillText('07',x-bw*.37,y-4);
    for(let i=0;i<8;i++) {
      const bh0=(.25+.6*(.5+.5*Math.sin(t*2.4+i*1.7)))*bh*.56;
      c.fillStyle=i%2?'rgba(255,99,225,.84)':'rgba(81,236,249,.9)';
      c.fillRect(x-bw*.08+i*bw*.053,y+bh*.25-bh0,bw*.025,bh0);
    }
    // Falling digital pulses only in the upper air.
    if(q<2){
      c.globalAlpha=.48;
      for(let i=0;i<11;i++){
        const px=mod(i*w/11-cam*.018,w);const yy=mod(i*79+t*18,gy*.55);
        c.fillStyle=i%2?'#e35cec':'#54dff1';c.fillRect(px,yy,2,12+(i%4)*8);
      }
    }
  }
  return Object.freeze({draw});
})();
