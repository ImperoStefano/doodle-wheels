// Local ink impressions. The shared road is drawn for everyone, including riders
// who jumped the gate. Only the local rider leaves extra bike impressions.
const StutterArt = (() => {
  'use strict';
  const poses = Array.from({length: 5}, () => ({at: -Infinity, x: 0, y: 0, angle: 0, scale: 1}));
  const rings = Array.from({length: 4}, () => ({at: -Infinity, x: 0, y: 0}));
  let ringNext = 0, lastIdx = -1, off = 0, offT = 0;   // off: di quanto lo sfondo è stato "riavvolto" rispetto alla camera
  const motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  let ink = '#4d8567', road, gate, bike, terrain, surfaceY = 0, last = -Infinity, next = 0, lastEvent = 0;

  function clearPoses() {
    for (const pose of poses) pose.at = -Infinity;
    for (const ring of rings) ring.at = -Infinity;
    last = -Infinity; lastIdx = -1;
  }
  function canvas(w, h) {
    const image = document.createElement('canvas');
    image.width = w; image.height = h;
    return image;
  }

  function prepare(zone, wheel) {
    clearPoses(); off = 0; offT = 0;
    terrain = zone;
    road = gate = bike = null;
    if (!zone) return;
    const colours = RouteStamps.colors(RouteStamps.worldKey()), sky = colours.sky; ink = colours.ink;   // arco ed eco nei colori del mondo
    surfaceY = Terrain.height(zone.start);
    const p = zone.period, left = p * .44, crown = p * .66, right = p * .88;
    road = canvas(p, 57);
    const c = road.getContext('2d');
    const top = u => 30 - (Terrain.height(zone.start + u) - surfaceY);
    // A pale face, a dark fracture and a thin weathered stratum follow the
    // *physical* crest. Each copy prints this same small strip.
    c.beginPath(); c.moveTo(left, top(left));
    for (let u = left + 2; u < right; u += 2) c.lineTo(u, top(u));
    c.lineTo(right, top(right)); c.lineTo(right - 13, 43);
    c.lineTo(crown + 9, 49); c.lineTo(left + 8, 40); c.closePath();
    c.fillStyle = '#827a68'; c.fill();
    c.beginPath(); c.moveTo(left + 5, top(left + 5)); c.lineTo(crown - 4, top(crown));
    c.lineTo(crown + 12, 18); c.lineTo(crown - 13, 35); c.lineTo(left + 11, 37);
    c.closePath(); c.fillStyle = '#c7b895'; c.fill();
    c.beginPath(); c.moveTo(crown + 10, 16); c.lineTo(crown + 3, 24); c.lineTo(crown + 8, 28);
    c.moveTo(crown - 36, 34); c.lineTo(crown - 25, 33);
    c.strokeStyle = '#655a48'; c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.moveTo(left, top(left));
    for (let u = left + 2; u < right; u += 2) c.lineTo(u, top(u));
    c.lineTo(right, top(right)); c.lineWidth = 2.4; c.stroke();

    gate = canvas(119, 192);
    const g = gate.getContext('2d');
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.beginPath(); g.moveTo(41 + i * 12, 182);
      g.bezierCurveTo(6 + i * 10, 85, 26 + i * 12, 5, 53 + i * 12, 13);
      g.bezierCurveTo(74 + i * 12, 16, 89 + i * 11, 140, 62 + i * 13, 177 - i * 4);
      g.globalAlpha = i === 0 ? .9 : .35 / i;
      g.strokeStyle = sky; g.lineWidth = 10 - 2 * i; g.stroke();
      g.lineWidth = 4 - i; g.strokeStyle = ink; g.stroke();
    }

    bike = canvas(285, 150);
    const b = bike.getContext('2d');
    b.translate(142, 92); b.lineWidth = 5; b.strokeStyle = ink;
    b.lineCap = 'round'; b.lineJoin = 'round'; b.beginPath();
    for (const axle of [-80, 80]) {
      if (wheel && wheel.length >= 3) {
        b.moveTo(axle + wheel[0].x, wheel[0].y);
        for (let i = 1; i < wheel.length; ++i) b.lineTo(axle + wheel[i].x, wheel[i].y);
        b.closePath();
      } else { b.moveTo(axle + 33, 0); b.arc(axle, 0, 33, 0, Math.PI * 2); }
    }
    b.moveTo(-80, 0); b.lineTo(0, 0); b.lineTo(-22, -53); b.closePath();
    b.lineTo(-22, -53); b.lineTo(47, -44); b.lineTo(0, 0);
    b.moveTo(80, 0); b.lineTo(47, -44); b.lineTo(40, -67); b.lineTo(54, -75);
    b.moveTo(-22, -53); b.lineTo(-30, -72); b.lineTo(-45, -72); b.stroke();
  }

  function impressions(ctx, camX, w, gy, me, t) {
    if (!me || (motion && motion.matches) || Scenery.quality >= 2 || document.hidden) return;
    if (me.pe !== lastEvent) { clearPoses(); lastEvent = me.pe; }
    const idx = Math.floor(((me.fwX + me.rwX) * .5 - terrain.start) / terrain.period);
    if (idx !== lastIdx) {   // hai attraversato l'inizio di una ripetizione: un anello d'inchiostro dalla bici
      if (lastIdx >= 0) { const ring = rings[ringNext]; ringNext = (ringNext + 1) % rings.length; ring.at = t; ring.x = (me.fwX + me.rwX) * .5; ring.y = (me.fwY + me.rwY) * .5; }
      lastIdx = idx;
    }
    if (t - last >= 220) {
      const pose = poses[next];
      pose.at = last = t; pose.x = (me.fwX + me.rwX) * .5;
      pose.y = (me.fwY + me.rwY) * .5; pose.angle = me.angle; pose.scale = me.sc || 1;
      next = (next + 1) % poses.length;
    }
    for (const pose of poses) {
      const age = t - pose.at, x = pose.x - camX;
      if (age < 45 || age > 800 || x < -160 * pose.scale || x > w + 160 * pose.scale) continue;
      ctx.save(); ctx.globalAlpha *= .46 * Math.min(1, (age - 45) / 130) * (1 - age / 800);
      ctx.translate(x, pose.y + gy - Sim.GROUND_Y); ctx.rotate(pose.angle);
      ctx.scale(pose.scale, pose.scale); ctx.drawImage(bike, -142, -92); ctx.restore();
    }
    for (const ring of rings) {
      const k = (t - ring.at) / 480, x = ring.x - camX;
      if (k < 0 || k >= 1 || x < -200 || x > w + 200) continue;
      ctx.save(); ctx.globalAlpha *= .6 * (1 - k); ctx.strokeStyle = ink; ctx.lineWidth = 6 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, ring.y + gy - Sim.GROUND_Y, 30 + 120 * k, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  function draw(ctx, camX, w, gy, me, active, t) {
    const zone = Terrain.STUTTER;
    if (!zone || camX + w < zone.start - 70 || camX > zone.end + 70) return;
    if (terrain !== zone) prepare(zone, null);
    const baseY = gy - surfaceY, right = camX + w;
    for (let x = zone.start; x < zone.end; x += zone.period) {
      if (x + zone.period > camX && x < right) ctx.drawImage(road, x - camX, baseY - 30);
    }
    if (zone.start + 65 > camX && zone.start - 65 < right) ctx.drawImage(gate, zone.start - camX - 57, baseY - 181);
    if (zone.end + 65 > camX && zone.end - 65 < right) ctx.drawImage(gate, zone.end - camX - 57, baseY - 181);
    // un arco più piccolo e sbiadito a ogni ripetizione, così si vede dove ricomincia la scena
    ctx.save(); ctx.globalAlpha *= .5;
    for (let x = zone.start + zone.period; x < zone.end; x += zone.period) {
      if (x + 50 > camX && x - 50 < right) ctx.drawImage(gate, x - camX - 46, baseY - 146, 92, 148);
    }
    ctx.restore();
    if (active) impressions(ctx, camX, w, gy, me, t);
  }
  // Camera dello sfondo. Nella zona il panorama "riavvolge" di un periodo a ogni ripetizione (la scena si ripete), con uno scivolamento rapido
  // invece di un salto. Fuori dalla zona torna alla camera vera. Con movimento ridotto non fa niente.
  function bgCam(camX, w, t) {
    const z = Terrain.STUTTER, reduced = motion && motion.matches;
    let target = 0;
    if (z && !reduced) { const mid = camX + w * .4; if (mid > z.start && mid < z.end) target = -Math.floor((mid - z.start) / z.period) * z.period; }
    const dt = Math.min(.1, Math.max(0, (t - offT) / 1000)); offT = t;
    off += (target - off) * (1 - Math.exp(-dt / .05));
    if (Math.abs(off - target) < .3) off = target;
    return camX + off;
  }
  return {prepare, draw, clearPoses, bgCam};
})();
