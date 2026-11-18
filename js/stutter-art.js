// Local ink impressions. The shared road is drawn for everyone, including riders
// who jumped the gate. Only the local rider leaves extra bike impressions.
const StutterArt = (() => {
  'use strict';
  const poses = Array.from({length: 5}, () => ({at: -Infinity, x: 0, y: 0, angle: 0, scale: 1}));
  const rings = Array.from({length: 4}, () => ({at: -Infinity, x: 0, y: 0}));
  let ringNext = 0, lastIdx = -1;
  const motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  let ink = '#4d8567', road, bike, terrain, surfaceY = 0, last = -Infinity, next = 0, lastEvent = 0;

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
    clearPoses();
    terrain = zone;
    road = bike = null;
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


  // Il portale stutter si riconosce da lontano: è l'unico RETTANGOLARE (gli altri sono anelli ellittici), l'unico viola (gli altri sono verde acqua,
  // ardesia e arancio), ha i fori di una pellicola sui due montanti, copie sfasate ciano/magenta che scattano a 8 fotogrammi al secondo e
  // dietro di sé una scia di cornici sempre più sbiadite, "la scena che si ripete". Il simbolo è il riavvolgimento ◀◀.
  const VIOLET = '#6a3df0', VDARK = '#2a1a6e', FILM = '#1c1538', CREAM = '#f8f4dc', CYAN = '#18c8e8', MAGENTA = '#ff3fa4';
  const frame = (ctx, x, y, hw, H, lw) => {   // cornice aperta in basso: due montanti e l'architrave, con y = suolo
    ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x - hw, y - H); ctx.lineTo(x + hw, y - H); ctx.lineTo(x + hw, y); ctx.lineWidth = lw; ctx.stroke();
  };
  function gate(ctx, x, y, k, t, label, dim) {
    const hw = 40 * k, H = 176 * k, lw = 12 * k, calm = (motion && motion.matches) || Scenery.quality >= 2, step = calm ? 0 : Math.floor(t / 125) % 4;
    ctx.save(); ctx.globalAlpha *= dim; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    if (!calm) {
      // scia: cornici più sbiadite verso destra (verso la zona che si ripete), un passo avanti a ogni scatto
      ctx.strokeStyle = VIOLET; for (let i = 3; i >= 1; i--) { ctx.globalAlpha = dim * .2 / i; frame(ctx, x + (i * 17 + step * 2) * k, y, hw - 4 * i * k, H - 9 * i * k, lw * .7); }
      const j = (step === 1 ? 7 : step === 3 ? -5 : 2) * k;   // sfasamento cromatico a scatti
      ctx.globalAlpha = dim * .85; ctx.strokeStyle = CYAN; frame(ctx, x - j, y, hw, H, lw); ctx.strokeStyle = MAGENTA; frame(ctx, x + j, y, hw, H, lw);
    }
    ctx.globalAlpha = dim * .13; ctx.fillStyle = VIOLET; ctx.fillRect(x - hw, y - H, hw * 2, H);   // velo viola: si vede la scena attraverso
    ctx.globalAlpha = dim;
    ctx.strokeStyle = CREAM; frame(ctx, x, y, hw, H, lw + 6 * k);   // bordino crema, come gli anelli
    ctx.strokeStyle = FILM; frame(ctx, x, y, hw, H, lw);
    ctx.fillStyle = CREAM;   // fori di pellicola
    for (let i = 0; i < 7; i++) { const yy = y - H + (14 + i * 24.5) * k; for (const sx of [-hw, hw]) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + sx - 3 * k, yy, 6 * k, 10 * k, 2 * k) : ctx.rect(x + sx - 3 * k, yy, 6 * k, 10 * k); ctx.fill(); } }
    ctx.strokeStyle = VIOLET; ctx.lineWidth = 3.4 * k; ctx.beginPath(); ctx.moveTo(x - hw + 7 * k, y - H + 6 * k); ctx.lineTo(x + hw - 7 * k, y - H + 6 * k); ctx.stroke();
    // simbolo ◀◀ + barra al centro
    ctx.fillStyle = VDARK; ctx.save(); ctx.translate(x, y - H * .52); ctx.scale(k, k);
    for (const o of [-7, 15]) { ctx.beginPath(); ctx.moveTo(o + 7, -15); ctx.lineTo(o - 14, 0); ctx.lineTo(o + 7, 15); ctx.closePath(); ctx.fill(); }
    ctx.fillRect(-26, -16, 5, 32); ctx.restore();
    if (label && k > .6) {   // pastiglia come negli altri portali
      const name = I18n.t('portal.stutter'); ctx.font = '700 17px Kalam, "Comic Sans MS", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(name).width + 22, ph = 26, px = x - tw / 2, py = y - H - ph - 12;
      ctx.fillStyle = 'rgba(45,62,72,0.2)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py + 3, tw, ph, ph / 2) : ctx.rect(px, py + 3, tw, ph); ctx.fill();
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(px, py, tw, ph, ph / 2) : ctx.rect(px, py, tw, ph); ctx.fill();
      ctx.fillStyle = VDARK; ctx.fillText(name, x, py + ph / 2 + 1);
    }
    ctx.restore();
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
    if (zone.start + 140 > camX && zone.start - 90 < right) gate(ctx, zone.start - camX, baseY, 1, t, true, 1);   // l'ingresso: quello che ti riporta indietro
    if (zone.end + 90 > camX && zone.end - 90 < right) gate(ctx, zone.end - camX, baseY, .8, t, false, .5);       // l'uscita: più piccola e spenta, non fa niente
    for (let x = zone.start + zone.period; x < zone.end; x += zone.period) {   // una cornice più piccola e sbiadita a ogni ripetizione
      if (x + 50 > camX && x - 50 < right) gate(ctx, x - camX, baseY, .55, t, false, .3);
    }
    if (active) impressions(ctx, camX, w, gy, me, t);
  }
  return {prepare, draw, clearPoses};
})();
