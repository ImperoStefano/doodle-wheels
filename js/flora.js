/*
 * Flora — i fiori (e funghi, cactus, cristalli) lungo la pista, e quello che FANNO.
 *
 * Posizioni, specie e dossi fisici arrivano da Terrain.FLOWERS (identici su tutti i dispositivi).
 * Qui c'è solo la parte visiva e animata, calcolata in locale su ogni schermo a partire dalle
 * posizioni delle ruote: non tocca la fisica e non viaggia in rete.
 *
 *  - ondeggiano nel vento (una raffica lenta che attraversa il prato);
 *  - si piegano quando una ruota passa vicino e poi rimbalzano indietro (molla smorzata);
 *  - se una ruota li travolge sprizzano petali (o spore, fiocchi di neve, schegge di ghiaccio);
 *  - i girasoli si voltano verso il sole mentre attraversa il cielo e di sera chinano la testa;
 *  - margherite e tulipani chiudono i petali al tramonto;
 *  - i funghi fanno "boing" (si schiacciano e rimbalzano), i cristalli luccicano;
 *  - qualche ape ronza attorno ai fiori di giorno e scappa quando arriva una bici;
 *  - le ninfee galleggiano sull'acqua e ondeggiano con le onde.
 */
const Flora = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fract = v => v - Math.floor(v);
  const rnd = (a, b = 0) => fract(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);
  const GROUND_Y = 520;            // stessa origine della fisica (Sim.GROUND_Y)
  const BLOOM = 1.7;               // ingrandisce solo il disegno, non il dosso fisico

  const FLOWER_PALETTE = ['#f472b6', '#f87171', '#c084fc', '#fb923c', '#60a5fa'];
  const TULIP_PALETTE = ['#e11d48', '#db2777', '#f97316', '#a21caf', '#facc15'];
  const ROSE_PALETTE = ['#be123c', '#e11d48', '#f43f5e', '#9f1239', '#fb7185'];
  const SUNFLOWER_PALETTE = ['#fbbf24', '#f59e0b', '#facc15', '#fcd34d', '#eab308'];
  const MUSH_PALETTE = ['#e11d48', '#f97316', '#a855f7', '#ef4444', '#facc15'];

  let flowers = [], st = [], lilies = [];
  let quality = 0;

  function setTrack() {
    flowers = Terrain.FLOWERS || []; lilies = Terrain.LILIES || [];
    st = flowers.map(f => ({ ang: 0, vel: 0, squash: 0, sv: 0, cool: 0, wob: 0, bee: rnd(f.x, 5) < 0.4 && (f.species === 3 || f.species === 0), flee: 0 }));
    petals.forEach(p => { p.on = false; });
  }
  function setQuality(q) { quality = q | 0; }

  // ---------- petali e schegge (pool fisso) ----------------------------------------------------
  const PN = 44;
  const petals = Array.from({ length: PN }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, life: 0, max: 1, size: 5, col: '#fff', kind: 0 }));
  function burst(f, x, hAbove, power) {
    if (quality >= 2) return;
    const n = quality ? 4 : f.species === 3 ? 9 : 7;
    let colr;
    switch (f.species) {
      case 0: colr = [FLOWER_PALETTE[f.hue % 5], '#ffffff']; break;
      case 1: colr = [TULIP_PALETTE[f.hue % 5]]; break;
      case 2: colr = [ROSE_PALETTE[f.hue % 5], ROSE_PALETTE[(f.hue + 2) % 5]]; break;
      case 3: colr = [SUNFLOWER_PALETTE[f.hue % 5], '#78350f']; break;
      case 4: colr = ['#ffffff', '#e0f2fe']; break;
      case 5: colr = ['#bae6fd', '#e0f7ff', '#7dd3fc']; break;
      case 6: colr = ['#fef3c7', '#fde68a']; break;
      default: colr = ['#f472b6', '#fb7185'];
    }
    for (let k = 0, made = 0; k < PN && made < n; k++) {
      const p = petals[k]; if (p.on) continue;
      p.on = true; made++;
      p.x = x + (Math.random() - 0.5) * 14; p.y = hAbove + Math.random() * 10;
      const dir = (Math.random() - 0.35) * 2;
      p.vx = dir * (60 + 90 * power) + 40 * power; p.vy = 120 + Math.random() * 170 * power;
      p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 12;
      p.life = 0; p.max = 1.1 + Math.random() * 0.9;
      p.size = f.species === 3 && made % 3 === 0 ? 3 : 5 + Math.random() * 3;
      p.col = colr[made % colr.length]; p.kind = f.species === 5 ? 3 : f.species === 6 ? 1 : 0;
    }
  }

  // ---------- aggiornamento ---------------------------------------------------------------------
  // racers: oggetto id -> snapshot {fwX,fwY,rwX,rwY,vx,...} (coordinate di fisica)
  function update(dt, camX, w, racers) {
    dt = Math.min(dt, 0.05);
    const t = performance.now() / 1000;
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i];
      if (f.x < camX - 150 || f.x > camX + w + 150) continue;
      const s = st[i];
      // vento: onda lenta che passa + piccoli scarti per fiore
      const wind = (Math.sin(t * 0.9 + f.x * 0.0045) * 0.5 + Math.sin(t * 0.37 + f.x * 0.011) * 0.5) * 0.045 + Math.sin(t * 2.3 + f.seed * 6.28) * 0.012;
      let push = 0, hit = 0;
      const baseY = GROUND_Y - Terrain.height(f.x);
      for (const id in racers) {
        const r = racers[id];
        for (let k = 0; k < 2; k++) {
          const wx = k ? r.rwX : r.fwX, wy = k ? r.rwY : r.fwY, d = f.x - wx, ad = Math.abs(d);
          if (ad > 135) continue;
          const lift = baseY - wy;                       // quanto in alto è il centro ruota sopra il terreno
          const gate = clamp(1 - Math.max(0, lift - 90) / 80, 0, 1);   // in volo alto: nessun contatto
          if (gate <= 0) continue;
          const sp = clamp(Math.abs(r.vx) / 6, 0.25, 1.4);
          const near = 1 - ad / 135;
          push += Math.sign(d || 1) * near * near * sp * gate * 0.9;
          if (ad < f.r + 40 && gate > 0.6 && Math.abs(r.vx) > 1.5) hit = Math.max(hit, sp * gate);
        }
      }
      // molla smorzata verso (vento + spinta)
      const target = wind + clamp(push, -0.75, 0.75);
      s.vel += (-62 * (s.ang - target) - 4.6 * s.vel) * dt;
      s.ang += s.vel * dt;
      s.sv += (-90 * s.squash - 7 * s.sv) * dt; s.squash += s.sv * dt;
      s.cool -= dt;
      if (hit > 0 && s.cool <= 0) {
        s.cool = 1.4; s.sv = 5.5 * hit; s.vel += (push >= 0 ? 1 : -1) * 3 * hit;
        burst(f, f.x, Terrain.height(f.x) + 22 * f.stemScale * 1.7, hit);
      }
      // le api scappano quando arriva una bici
      s.flee += ((Math.abs(push) > 0.25 ? 1 : 0) - s.flee) * Math.min(1, dt * 3);
    }
    for (let i = 0; i < PN; i++) {
      const p = petals[i]; if (!p.on) continue;
      p.life += dt; p.vy -= 520 * dt; p.vx *= 1 - 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.kind === 0) p.x += Math.sin(p.life * 6 + i) * 20 * dt;      // i petali svolazzano
      if (p.life > p.max || p.y < Terrain.height(p.x) - 4) p.on = false;
    }
  }

  // ---------- disegno delle specie --------------------------------------------------------------
  // Ogni funzione disegna la TESTA del fiore con origine in (0,0) (già traslata/ruotata).
  function daisy(g, r, color, open) {
    const n = 9, orbit = r * (0.28 + 0.34 * open), pr = r * (0.5 - 0.07 * (1 - open));
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU - Math.PI / 2 * (1 - open);
      g.beginPath(); g.ellipse(Math.cos(a) * orbit * 1.15, Math.sin(a) * orbit * 1.15 - (1 - open) * r * 0.25, pr * (0.7 + 0.3 * open), pr, a, 0, TAU); g.fill();
    }
    g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fillStyle = '#fde047'; g.fill();
    g.lineWidth = Math.max(1.4, r * 0.09); g.strokeStyle = '#ca8a04'; g.stroke();
  }

  function tulip(g, r, color, open) {
    const hw = r * 0.85 * (0.62 + 0.38 * open), hgt = r * 1.5;
    g.fillStyle = color; g.beginPath();
    g.moveTo(-hw * 0.55, hgt * 0.3);
    g.quadraticCurveTo(-hw * 0.85, -hgt * 0.1, -hw * 0.32, -hgt * 0.55);
    g.quadraticCurveTo(-hw * 0.14, -hgt * 0.28, 0, -hgt * 0.72);
    g.quadraticCurveTo(hw * 0.14, -hgt * 0.28, hw * 0.32, -hgt * 0.55);
    g.quadraticCurveTo(hw * 0.85, -hgt * 0.1, hw * 0.55, hgt * 0.3);
    g.quadraticCurveTo(0, hgt * 0.5, -hw * 0.55, hgt * 0.3);
    g.closePath(); g.fill();
    g.lineWidth = Math.max(1.4, r * 0.09); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.stroke();
  }

  function rose(g, r, color) {
    g.strokeStyle = color; g.lineWidth = Math.max(2.5, r * 0.24); g.lineCap = 'round'; g.beginPath();
    const turns = 2.1, steps = 26;
    for (let i = 0; i <= steps; i++) { const t = i / steps, a = t * turns * TAU, rad = r * 0.7 * (1 - t * 0.82); const px = Math.cos(a) * rad, py = Math.sin(a) * rad; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
    g.stroke();
  }

  // girasole: si volta verso il sole (turn -1..1) simulando la rotazione con uno schiacciamento orizzontale
  function sunflower(g, r, petalColor, turn, droop) {
    const c = Math.cos(turn * 0.95), off = Math.sin(turn * 0.95) * r * 0.32;
    g.save(); g.scale(Math.max(0.28, c), 1);
    const petals = 15, len = r * 0.98, wid = r * 0.4;
    g.fillStyle = petalColor;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * TAU; g.save(); g.rotate(a);
      g.beginPath(); g.ellipse(len * 0.5 + r * 0.1, 0, len * 0.5, wid * 0.5, 0, 0, TAU); g.fill(); g.restore();
    }
    g.fillStyle = '#facc15'; for (let i = 0; i < petals; i++) { const a = ((i + 0.5) / petals) * TAU; g.save(); g.rotate(a); g.beginPath(); g.ellipse(len * 0.45 + r * 0.1, 0, len * 0.4, wid * 0.4, 0, 0, TAU); g.fill(); g.restore(); }
    g.restore();
    g.save(); g.translate(off, 0); g.scale(Math.max(0.35, c), 1);
    g.beginPath(); g.arc(0, 0, r * 0.62, 0, TAU); g.fillStyle = '#78350f'; g.fill();
    g.lineWidth = Math.max(1.5, r * 0.08); g.strokeStyle = '#451a03'; g.stroke();
    g.fillStyle = '#451a03';
    for (let i = 0; i < 12; i++) { const a = i * 2.4, rad = r * 0.62 * 0.62 * ((i % 4) / 4 + 0.3); g.beginPath(); g.arc(Math.cos(a) * rad, Math.sin(a) * rad, r * 0.06, 0, TAU); g.fill(); }
    // due occhietti (come il sole): dà personalità, e capisci subito dove sta guardando
    g.fillStyle = '#fde68a'; g.beginPath(); g.arc(-r * 0.2, -r * 0.08, r * 0.075, 0, TAU); g.arc(r * 0.2, -r * 0.08, r * 0.075, 0, TAU); g.fill();
    g.strokeStyle = '#fde68a'; g.lineWidth = Math.max(1.2, r * 0.06); g.lineCap = 'round'; g.beginPath(); g.arc(0, r * 0.06, r * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    g.restore();
  }

  function snowdrop(g, r, t) {           // bucaneve: campanella bianca che pende
    g.fillStyle = '#ffffff'; g.strokeStyle = '#94a3b8'; g.lineWidth = Math.max(1.3, r * 0.07);
    g.beginPath(); g.moveTo(0, -r * 0.1); g.quadraticCurveTo(-r * 0.75, r * 0.15, -r * 0.35, r * 1.0); g.quadraticCurveTo(0, r * 1.3, r * 0.35, r * 1.0); g.quadraticCurveTo(r * 0.75, r * 0.15, 0, -r * 0.1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#86efac'; g.beginPath(); g.ellipse(0, r * 1.08, r * 0.25, r * 0.12, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-r * 0.2, r * 0.9); g.quadraticCurveTo(-r * 0.6, r * 1.1, -r * 0.55, r * 1.45); g.moveTo(r * 0.2, r * 0.9); g.quadraticCurveTo(r * 0.6, r * 1.1, r * 0.55, r * 1.45); g.strokeStyle = '#e2e8f0'; g.lineWidth = Math.max(2, r * 0.14); g.lineCap = 'round'; g.stroke();
  }

  function crystal(g, r, t, seed) {      // fiore di ghiaccio: tre cristalli e una stellina che luccica
    const sh = (x, h, w, a) => { g.save(); g.rotate(a); g.beginPath(); g.moveTo(x - w, 0); g.lineTo(x - w * 0.6, -h * 0.75); g.lineTo(x, -h); g.lineTo(x + w * 0.6, -h * 0.75); g.lineTo(x + w, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); };
    g.fillStyle = 'rgba(191,232,255,0.95)'; g.strokeStyle = '#38bdf8'; g.lineWidth = Math.max(1.2, r * 0.07);
    sh(0, r * 1.5, r * 0.34, 0); g.fillStyle = 'rgba(224,247,255,0.95)'; sh(-r * 0.32, r * 1.05, r * 0.26, -0.5); sh(r * 0.32, r * 1.0, r * 0.26, 0.5);
    const tw = 0.5 + 0.5 * Math.sin(t * 3.5 + seed * 20);
    g.strokeStyle = `rgba(255,255,255,${(0.35 + 0.65 * tw).toFixed(2)})`; g.lineWidth = 2; g.lineCap = 'round';
    const sr = r * (0.35 + 0.3 * tw); g.beginPath(); g.moveTo(-sr, -r * 1.7); g.lineTo(sr, -r * 1.7); g.moveTo(0, -r * 1.7 - sr); g.lineTo(0, -r * 1.7 + sr); g.stroke();
  }

  function mushroom(g, r, color, squash) {
    const sx = 1 + squash * 0.28, sy = 1 - squash * 0.38;
    g.save(); g.scale(sx, sy);
    g.fillStyle = '#fef3c7'; g.strokeStyle = '#a16207'; g.lineWidth = Math.max(1.3, r * 0.07);
    g.beginPath(); g.moveTo(-r * 0.28, 0); g.quadraticCurveTo(-r * 0.2, -r * 0.7, -r * 0.34, -r * 1.1); g.lineTo(r * 0.34, -r * 1.1); g.quadraticCurveTo(r * 0.2, -r * 0.7, r * 0.28, 0); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = color; g.beginPath(); g.ellipse(0, -r * 1.1, r * 1.05, r * 0.78, 0, Math.PI, TAU); g.quadraticCurveTo(0, -r * 0.9, -r * 1.05, -r * 1.1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)'; [[-0.45, -1.45, 0.17], [0.15, -1.62, 0.2], [0.55, -1.32, 0.14]].forEach(([x, y, k]) => { g.beginPath(); g.arc(x * r, y * r, k * r, 0, TAU); g.fill(); });
    g.restore();
  }

  function cactus(g, r, seed, open) {
    g.fillStyle = '#4f9a56'; g.strokeStyle = '#2f7a3c'; g.lineWidth = Math.max(1.3, r * 0.07); g.lineCap = 'round'; g.lineJoin = 'round';
    const body = (x0, y0, x1, y1, w) => { g.lineWidth = w; g.strokeStyle = '#4f9a56'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
    body(0, 0, 0, -r * 1.7, r * 0.62);
    g.lineWidth = r * 0.36; g.strokeStyle = '#4f9a56'; g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(-r * 0.62, -r * 0.7); g.lineTo(-r * 0.62, -r * 1.25); g.moveTo(0, -r * 0.95); g.lineTo(r * 0.58, -r * 0.95); g.lineTo(r * 0.58, -r * 1.4); g.stroke();
    g.strokeStyle = '#7bc17a'; g.lineWidth = Math.max(1.5, r * 0.1); g.beginPath(); g.moveTo(-r * 0.1, -r * 0.1); g.lineTo(-r * 0.1, -r * 1.55); g.stroke();
    // fiore rosa in cima: si apre di giorno
    g.fillStyle = '#f472b6'; const pr = r * (0.18 + 0.12 * open);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * pr * 1.3, -r * 1.95 + Math.sin(a) * pr * 1.3, pr, 0, TAU); g.fill(); }
    g.fillStyle = '#fde047'; g.beginPath(); g.arc(0, -r * 1.95, pr * 0.8, 0, TAU); g.fill();
  }

  // ---------- disegno principale ------------------------------------------------------------------
  function draw(ctx, camX, w, gy, S) {
    const t = performance.now() / 1000, sunX = S.sunX, open = smooth((S.day - 0.1) / 0.5);
    let bees = 0;
    for (let i = 0; i < flowers.length; i++) {
      const f = flowers[i], fx = f.x - camX;
      if (fx < -60 || fx > w + 60) continue;
      const s = st[i], by = gy - Terrain.height(f.x);
      const vr = f.r * BLOOM, sp = f.species;
      let stemH = vr * 1.6 * f.stemScale;
      if (sp === 3) stemH *= 1.25;
      if (sp === 6) stemH = vr * 0.5;           // funghi: bassi
      if (sp === 7) stemH = vr * 0.3;
      if (sp === 4) stemH *= 0.85;
      if (sp === 5) stemH = vr * 0.2;
      const ang = clamp(s.ang, -0.8, 0.8);
      const tipX = Math.sin(ang) * stemH, tipY = -Math.cos(ang) * stemH;
      const stemW = Math.max(2, vr * 0.2);

      ctx.save(); ctx.translate(fx, by);
      // stelo curvo (non per funghi/cactus/cristalli, che hanno il loro corpo)
      if (sp <= 4) {
        ctx.strokeStyle = '#16a34a'; ctx.lineWidth = stemW; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(tipX * 0.25, tipY * 0.55, tipX, tipY); ctx.stroke();
        if (sp === 2) {              // spine della rosa
          ctx.fillStyle = '#b91c1c';
          [0.35, 0.65].forEach(q => { const px = tipX * q * q, py = tipY * q, side = q < 0.5 ? -1 : 1, len = vr * 0.35; ctx.beginPath(); ctx.moveTo(px, py - vr * 0.14); ctx.lineTo(px, py + vr * 0.14); ctx.lineTo(px + side * len, py); ctx.closePath(); ctx.fill(); });
        }
        const q = 0.38, lx = tipX * q * q, ly = tipY * q, flip = sp === 1 ? 1 : -1;      // fogliolina
        ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.ellipse(lx + flip * vr * 0.5, ly, vr * 0.45, vr * 0.2, flip * -0.5 + ang, 0, TAU); ctx.fill();
      }
      // testa
      ctx.translate(sp <= 4 ? tipX : 0, sp <= 4 ? tipY : 0);
      switch (sp) {
        case 0: ctx.rotate(ang * 0.7); daisy(ctx, vr, FLOWER_PALETTE[f.hue % 5], open); break;
        case 1: ctx.rotate(ang * 0.7); tulip(ctx, vr, TULIP_PALETTE[f.hue % 5], open); break;
        case 2: ctx.rotate(ang * 0.7); rose(ctx, vr, ROSE_PALETTE[f.hue % 5]); break;
        case 3: {
          // verso il sole; di sera la testa si china
          const dx = sunX - fx, turn = clamp(dx / (w * 0.55), -1, 1) * (1 - S.night * 0.8);
          const droop = smooth((S.night - 0.1) / 0.6) * 1.15;
          ctx.rotate(ang * 0.7 + droop * (turn >= 0 ? 1 : -1) * 0.4 + droop * 0.5);
          sunflower(ctx, vr, SUNFLOWER_PALETTE[f.hue % 5], turn * (1 - droop * 0.6), droop); break;
        }
        case 4: ctx.rotate(ang * 0.5); snowdrop(ctx, vr, t); break;
        case 5: ctx.rotate(ang * 0.4); crystal(ctx, vr, t, f.seed); break;
        case 6: ctx.rotate(ang * 0.5); mushroom(ctx, vr * 1.05, MUSH_PALETTE[f.hue % 5], clamp(s.squash, -0.4, 1)); break;
        case 7: ctx.rotate(ang * 0.25); cactus(ctx, vr, f.seed, open); break;
      }
      // ape
      if (s.bee && S.day > 0.35 && bees < 5 && quality < 2) {
        bees++;
        const a = t * 3.2 + f.seed * 9, flee = s.flee;
        const bx = Math.cos(a) * vr * 1.1 + flee * 70 * Math.sign(Math.sin(f.seed * 9) || 1), by2 = Math.sin(a * 1.7) * vr * 0.5 - vr * 0.9 - flee * 60;
        ctx.globalAlpha = 1 - flee * 0.6;
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; const fl = Math.sin(t * 60 + f.seed * 20) * 0.5 + 0.5;
        ctx.beginPath(); ctx.ellipse(bx - 1, by2 - 3, 3 + fl, 1.6, -0.6, 0, TAU); ctx.ellipse(bx + 2, by2 - 3, 3 + fl, 1.6, 0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(bx, by2, 4.2, 2.8, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1f2937'; ctx.fillRect(bx - 1.6, by2 - 2.6, 1.3, 5.2); ctx.fillRect(bx + 1.2, by2 - 2.4, 1.3, 4.8);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
    // petali
    for (let i = 0; i < PN; i++) {
      const p = petals[i]; if (!p.on) continue;
      const a = Math.min(1, (p.max - p.life) / 0.4);
      ctx.save(); ctx.translate(p.x - camX, gy - p.y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = p.col;
      if (p.kind === 3) { ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.5, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.5, 0); ctx.closePath(); ctx.fill(); }
      else if (p.kind === 1) { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, TAU); ctx.fill(); }
      else { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ninfee sulla superficie dell'acqua (decorazione): ondeggiano con le onde
  function drawLilies(ctx, camX, w, gy, S) {
    const t = performance.now() / 1000;
    for (let i = 0; i < lilies.length; i++) {
      const l = lilies[i], fx = l.x - camX; if (fx < -50 || fx > w + 50) continue;
      const wl = Terrain.waterLevel(l.x); if (wl === -Infinity) continue;
      const bob = Math.sin(l.x * 0.03 + t * 2.1) * 2.2, y = gy - wl + bob, sc = l.size * 16;
      ctx.save(); ctx.translate(fx, y);
      ctx.fillStyle = '#22a35a'; ctx.strokeStyle = '#14703c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, 0, sc * 1.25, sc * 0.34, Math.sin(t * 0.6 + l.seed * 6) * 0.04, 0.12, TAU - 0.12); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (l.bloom) {
        ctx.fillStyle = '#fbcfe8'; ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 1.2;
        for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(k * sc * 0.16, -sc * 0.34, sc * 0.1, sc * 0.34, k * 0.32, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(0, -sc * 0.2, sc * 0.1, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  return { setTrack, setQuality, update, draw, drawLilies };
})(); // flora
