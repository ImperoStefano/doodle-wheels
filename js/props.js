/*
 * Props — gli oggetti "costruiti" lungo la pista: ponti (ad arco in pietra, sospeso di corde),
 * assi delle rampe, cartelli di zona, traguardo con festoni e palloncini.
 *
 * Sono solo disegno: la fisica conosce soltanto Terrain.height(), che sopra un ponte è
 * l'impalcato. Qui si disegna esattamente quella curva, così la ruota ci rotola sopra davvero.
 */
const Props = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const ZONE_LABEL = { hills: 'Colline', ice: 'Ghiacciaio', gravel: 'Canyon', water: 'Laguna', ramps: 'Bosco d\'autunno', finish: 'Traguardo' };

  // ---------- ponti ---------------------------------------------------------------------------
  function drawBridges(ctx, camX, w, gy, S) {
    const bs = Terrain.BRIDGES;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.end - camX < -80 || b.start - camX > w + 80) continue;
      if (b.kind === 'rope') ropeBridge(ctx, b, camX, gy, S); else archBridge(ctx, b, camX, gy, S);
    }
  }

  function samples(b, camX, gy, N) {
    const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) { const wx = b.start + (b.end - b.start) * i / N; xs[i] = wx - camX; ys[i] = gy - Terrain.height(wx); }
    return { xs, ys, N };
  }

  // ponte ad arco di pietra: sotto, l'intradosso curvo (più spesso agli appoggi), sopra strada e parapetto
  function archBridge(ctx, b, camX, gy, S) {
    const N = 28, { xs, ys } = samples(b, camX, gy, N);
    const thick = i => 16 + 54 * Math.pow(Math.abs(i / N - 0.5) * 2, 2.2);   // intradosso: sottile in chiave, spesso agli appoggi
    const night = S.night, warm = S.warm;
    const stone = [186, 179, 165], dark = '#5a5349';

    // corpo in pietra
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i]);
    for (let i = N; i >= 0; i--) ctx.lineTo(xs[i], ys[i] + thick(i));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Math.min(...ys) - 10, 0, Math.max(...ys) + 80);
    g.addColorStop(0, `rgb(${stone[0]},${stone[1]},${stone[2]})`); g.addColorStop(1, 'rgb(128,120,108)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = dark; ctx.lineJoin = 'round'; ctx.stroke();
    // conci
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(70,62,52,0.5)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i <= N; i += 2) { ctx.moveTo(xs[i], ys[i]); ctx.lineTo(xs[i], ys[i] + thick(i)); }
    for (let k = 1; k < 4; k++) { ctx.moveTo(xs[0], ys[0] + thick(0) * k / 4); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] + thick(i) * k / 4); }
    ctx.stroke(); ctx.restore();

    // strada acciottolata
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0]); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.strokeStyle = '#a58963'; ctx.lineWidth = 9; ctx.lineCap = 'butt'; ctx.stroke();
    ctx.strokeStyle = '#7d6643'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i <= N; i++) { ctx.moveTo(xs[i], ys[i] - 3); ctx.lineTo(xs[i], ys[i] + 4); }
    ctx.stroke();

    // parapetto (dietro la bici): muretto con pietra di copertura, pilastri alle estremità e al centro
    const wallH = 24;
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0] - 4);
    for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] - 4);
    for (let i = N; i >= 0; i--) ctx.lineTo(xs[i], ys[i] - wallH);
    ctx.closePath(); ctx.fillStyle = `rgb(${stone[0] - 14},${stone[1] - 14},${stone[2] - 14})`; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0] - wallH - 2); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] - wallH - 2);
    ctx.strokeStyle = '#d6d0c2'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    const post = (i, tall) => {
      const x = xs[i], y = ys[i] - 4;
      ctx.fillStyle = '#c9c2b2'; ctx.fillRect(x - 9, y - wallH - tall, 18, wallH + tall); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.strokeRect(x - 9, y - wallH - tall, 18, wallH + tall);
      ctx.fillStyle = '#d9d3c5'; ctx.fillRect(x - 12, y - wallH - tall - 6, 24, 7); ctx.strokeRect(x - 12, y - wallH - tall - 6, 24, 7);
      // lanterna: si accende al tramonto
      const lit = clamp(warm * 0.8 + night, 0, 1), ly = y - wallH - tall - 20;
      ctx.fillStyle = '#374151'; ctx.fillRect(x - 1.5, ly + 8, 3, 8);
      if (lit > 0.05) { const gl = ctx.createRadialGradient(x, ly, 2, x, ly, 46); gl.addColorStop(0, `rgba(255,220,120,${(0.7 * lit).toFixed(2)})`); gl.addColorStop(1, 'rgba(255,220,120,0)'); ctx.fillStyle = gl; ctx.fillRect(x - 46, ly - 46, 92, 92); }
      ctx.fillStyle = lit > 0.2 ? '#fde68a' : '#e5e7eb'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, ly, 7, 0, TAU); ctx.fill(); ctx.stroke();
    };
    post(0, 14); post(N >> 1, 6); post(N, 14);
  }

  // ponte sospeso: due piloni di legno, assi che cedono un po', corde con i tiranti
  function ropeBridge(ctx, b, camX, gy, S) {
    const N = 34, { xs, ys } = samples(b, camX, gy, N), t = performance.now() / 1000;
    const x0 = xs[0], x1 = xs[N], tower = 92;
    const sway = i => Math.sin(t * 1.6 + i * 0.5) * 0.8 * Math.sin(Math.PI * i / N);
    // corde maestre (dietro le assi): da cima a cima, con la pancia
    const rope = (dy, width, col) => {
      ctx.beginPath(); ctx.moveTo(x0, ys[0] - tower + dy);
      ctx.quadraticCurveTo((x0 + x1) / 2, (ys[N >> 1] - 26 + dy) * 2 - (ys[0] - tower + dy + ys[N] - tower + dy) / 2, x1, ys[N] - tower + dy);
      ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
    };
    // tiranti: dal filo alla tavola
    ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 2; i < N; i += 3) {
      const u = i / N, topY = (1 - u) * (1 - u) * (ys[0] - tower) + 2 * u * (1 - u) * (((ys[N >> 1] - 26) * 2 - (ys[0] - tower + ys[N] - tower) / 2)) + u * u * (ys[N] - tower);
      ctx.moveTo(xs[i], topY); ctx.lineTo(xs[i], ys[i] - 3);
    }
    ctx.stroke();
    rope(0, 4.5, '#caa56a'); rope(0, 1.5, '#6b4a22');
    // assi
    for (let i = 0; i < N; i++) {
      const sw = sway(i);
      ctx.strokeStyle = i % 2 ? '#a06a3c' : '#8a5630'; ctx.lineWidth = 9; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(xs[i] + 0.5, ys[i] + 4 + sw); ctx.lineTo(xs[i + 1] - 0.5, ys[i + 1] + 4 + sway(i + 1)); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xs[i + 1], ys[i + 1]); ctx.lineTo(xs[i + 1], ys[i + 1] + 9); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0] + 9); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] + 9 + sway(i)); ctx.strokeStyle = '#3f2a14'; ctx.lineWidth = 3; ctx.stroke();    // trave sotto
    // piloni a "A" di legno
    [[x0, ys[0], -1], [x1, ys[N], 1]].forEach(([x, y, d]) => {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - d * 4, y + 8); ctx.lineTo(x - d * 4, y - tower); ctx.stroke();
      ctx.strokeStyle = '#85603a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + d * 18, y + 14); ctx.lineTo(x - d * 4, y - tower + 10); ctx.stroke();
      ctx.fillStyle = '#4a3219'; ctx.beginPath(); ctx.arc(x - d * 4, y - tower, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#caa56a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - d * 4, y - tower, 8, 0.4, 5.4); ctx.stroke();
    });
  }

  // ---------- rampe: assi di legno sulla salita --------------------------------------------------
  function drawRamps(ctx, camX, w, gy) {
    const Zs = Terrain.ZONES, period = Terrain.RAMP_PERIOD, rise = Terrain.RAMP_RISE, lead = Terrain.RAMP_LEAD;
    for (let zi = 0; zi < Zs.length; zi++) {
      const z = Zs[zi]; if (z.key !== 'ramps' || z.end < camX || z.start > camX + w) continue;
      for (let sx = 0; sx <= w + 14; sx += 14) {
        const wx = sx + camX, u = wx - z.start - lead;
        if (u < 0 || wx > z.end - 200) continue;
        const ph = u % period; if (ph >= rise - 8) continue;
        const y = gy - Terrain.height(wx), sl = (Terrain.height(wx + 7) - Terrain.height(wx - 7)) / 14, a = Math.atan(sl);
        ctx.save(); ctx.translate(sx, y - 1.5); ctx.rotate(-a);
        ctx.fillStyle = (Math.floor(u / 14) % 2) ? '#a8723a' : '#94622f'; ctx.fillRect(-6.5, -3, 13, 6);
        ctx.strokeStyle = 'rgba(60,32,10,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(-6.5, -3, 13, 6);
        ctx.restore();
      }
    }
  }

  // ---------- cartelli di zona ------------------------------------------------------------------
  function drawSigns(ctx, camX, w, gy) {
    const Zs = Terrain.ZONES;
    for (let zi = 1; zi < Zs.length; zi++) {
      const z = Zs[zi], sx = z.start + 150 - camX; if (sx < -90 || sx > w + 90) continue;
      if (!ZONE_LABEL[z.key]) continue; const label = I18n.t('sign.' + z.key);
      const y = gy - Terrain.height(z.start + 150);
      ctx.save(); ctx.translate(sx, y);
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-4, -92, 8, 94); ctx.strokeStyle = '#3f2a14'; ctx.lineWidth = 1.5; ctx.strokeRect(-4, -92, 8, 94);
      ctx.font = '700 17px Kalam, "Comic Sans MS", cursive';
      const tw = ctx.measureText(label).width + 34, bw = Math.max(96, tw);
      ctx.fillStyle = '#d9a35c'; ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-bw / 2, -112); ctx.lineTo(bw / 2 - 8, -112); ctx.lineTo(bw / 2 + 12, -96); ctx.lineTo(bw / 2 - 8, -80); ctx.lineTo(-bw / 2, -80); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2f12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, -4, -95);
      ctx.restore();
    }
  }


  // ---------- terreni a tema --------------------------------------------------------------------
  // Niente icone: il tratto si riconosce dal disegno stesso del terreno (acciottolato ad archi, gradoni,
  // buche, fango, dune, tronchi). La fisica conosce solo Terrain.height(): qui si colorano quelle curve.
  function drawPatches(ctx, camX, w, gy, S) {
    const ps = Terrain.PATCHES; if (!ps || !ps.length) return;
    const t = performance.now() / 1000;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.b - camX < -60 || p.a - camX > w + 60) continue;
      const x0 = Math.max(p.a, camX - 40), x1 = Math.min(p.b, camX + w + 40);
      const H = x => gy - Terrain.height(x);
      const sub = (step, fn) => { ctx.beginPath(); let first = true; for (let x = x0; x <= x1 + 0.1; x += step) { const px = x - camX, py = fn(x); if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py); } };
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (p.kind === 'arch') archRoad(ctx, p, camX, x0, x1, H, sub);
      else if (p.kind === 'stairs') stairsRock(ctx, p, camX, x0, x1, H, sub);
      else if (p.kind === 'holes') holesPits(ctx, p, camX, x0, x1, H, sub, gy, t);
      else if (p.kind === 'ripples') rippleDunes(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'logs') logsDraw(ctx, p, camX, H);
      else if (p.kind === 'rack') rackRail(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'mud') mudBog(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'sand') sandDune(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'boulders') boulderRocks(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'whoops') whoopsMounds(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'ridges') iceRidges(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'bowl') bowlDip(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'jump') inkJump(ctx, p, camX, x0, x1, H, sub, t);
      else if (p.kind === 'drop') inkDrop(ctx, p, camX, x0, x1, H, sub, t);
    }
  }
  // ---- utilità comuni dei terreni: strati spessi con gradiente ed estremità che si assottigliano --------------
  const sm01 = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
  const tapOf = (p, L) => x => sm01((x - p.a) / (L || 110)) * sm01((p.b - x) / (L || 110));
  // riempie la fascia fra H(x)+topF(x) e H(x)+botF(x); stops = [[pos, colore], ...] (0 = cima, 1 = fondo)
  function fillSlab(ctx, camX, x0, x1, H, topF, botF, stops, step) {
    step = step || 6; let top = 1e9, bot = -1e9, first = true;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 0.1; x += step) { const y = H(x) + topF(x); if (y < top) top = y; if (first) { ctx.moveTo(x - camX, y); first = false; } else ctx.lineTo(x - camX, y); }
    for (let x = x1; x >= x0 - 0.1; x -= step) { const y = H(x) + botF(x); if (y > bot) bot = y; ctx.lineTo(x - camX, y); }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, bot + 1); stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fill();
  }
  // traccia una linea che segue la strada con scarto yF(x)
  function lineOff(ctx, camX, x0, x1, H, yF, step) {
    step = step || 6; ctx.beginPath(); let first = true;
    for (let x = x0; x <= x1 + 0.1; x += step) { const y = H(x) + yF(x); if (first) { ctx.moveTo(x - camX, y); first = false; } else ctx.lineTo(x - camX, y); }
  }

  // ---- nuovi ostacoli integrati nei biomi (solo profilo: nessun corpo fisico in più, quindi costo di disegno minimo) ----
  // Massi: tondeggianti, di varie dimensioni; muschio nelle colline, ruggine nella ghiaia, alghe nella laguna, polvere nelle rampe.
  function boulderRocks(ctx, p, camX, x0, x1, H, sub, t) {
    const pal = p.zkey === 'gravel' ? { a: '#b3a79b', b: '#8d8176', c: '#5f554c', cap: '#b9763a' } : p.zkey === 'water' ? { a: '#9fb0b3', b: '#74878b', c: '#4b5c60', cap: '#4f9a73' } : p.zkey === 'ramps' ? { a: '#d6b78c', b: '#b58f62', c: '#7d5d3a', cap: '#c9923f' } : { a: '#b8b8ac', b: '#8f8f84', c: '#5c5c52', cap: '#6f9f45' };
    for (let j = 0; j < p.rocks.length; j++) {
      const q = p.rocks[j], cx = p.a + q.c; if (cx + q.w < x0 || cx - q.w > x1) continue;
      const l = Math.max(cx - q.w, x0), r = Math.min(cx + q.w, x1), hc = H(cx), X = cx - camX;
      ctx.fillStyle = 'rgba(25,20,12,0.28)'; ctx.beginPath(); ctx.ellipse(X + 6, H(cx) + q.H * 0.0 + 3, q.w * 1.05, 6, 0, 0, TAU); ctx.fill();   // ombra a terra
      const base = H(cx) + q.H + 6; fillSlab(ctx, camX, l, r, H, () => -1.5, x => base - H(x), [[0, pal.a], [0.5, pal.b], [0.85, pal.c], [1, pal.c + '00']], 4);
      // luce a sinistra, ombra a destra
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.ellipse(X - q.w * 0.3, hc - q.H * 0.55 + 2, q.w * 0.3, q.H * 0.2, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(20,18,12,0.2)'; ctx.beginPath(); ctx.ellipse(X + q.w * 0.45, hc - q.H * 0.2, q.w * 0.3, q.H * 0.35, 0.4, 0, TAU); ctx.fill();
      // crepe e macchie
      ctx.strokeStyle = 'rgba(30,24,16,0.55)'; ctx.lineWidth = 1.3; ctx.beginPath();
      ctx.moveTo(X - q.w * 0.1, hc - q.H * 0.8); ctx.lineTo(X - q.w * 0.02, hc - q.H * 0.5); ctx.lineTo(X - q.w * 0.18, hc - q.H * 0.3);
      ctx.moveTo(X + q.w * 0.3, hc - q.H * 0.45); ctx.lineTo(X + q.w * 0.4, hc - q.H * 0.2); ctx.stroke();
      // bordo superiore con tratto scuro e muschio / calotta colorata
      lineOff(ctx, camX, l, r, H, () => -1.5, 3); ctx.strokeStyle = 'rgba(30,24,16,0.65)'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = pal.cap; ctx.beginPath(); ctx.ellipse(X - q.w * 0.12, hc - q.H - 0.5, q.w * 0.32, 4.2, 0, Math.PI, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(X + q.w * 0.22, hc - q.H * 0.9, q.w * 0.14, 2.6, 0, Math.PI, TAU); ctx.fill();
      if (p.zkey === 'ramps') { const ph = (t * 0.6 + j * 0.31) % 1; ctx.fillStyle = `rgba(214,182,130,${0.35 * (1 - ph)})`; ctx.beginPath(); ctx.arc(X + q.w * 0.8, hc - ph * 16, 4 + ph * 8, 0, TAU); ctx.fill(); }
    }
  }

  // Dossi: serie di gobbe di terra battuta con erba sul dorso e solchi di pneumatici, polvere sulle cime
  function whoopsMounds(ctx, p, camX, x0, x1, H, sub, t) {
    const dry = p.zkey === 'ramps' || p.zkey === 'gravel';
    const soil = dry ? [['#d2a46a', 0], ['#a9783f', 0.5], ['#6e4a26', 1]] : [['#a8774a', 0], ['#7d5230', 0.5], ['#4f321c', 1]];
    for (let j = 0; j < p.hs.length; j++) {
      const q = p.hs[j], a = p.a + q.s, b = a + q.l; if (b < x0 || a > x1) continue;
      const l = Math.max(a, x0), r = Math.min(b, x1);
      const base = Math.max(H(a), H(b)) + 8; fillSlab(ctx, camX, l, r, H, () => -2, x => base - H(x), [[0, soil[0][0]], [0.5, soil[1][0]], [0.85, soil[2][0]], [1, soil[2][0] + '00']], 5);
      // erba / sterpaglia sul dorso e solchi
      lineOff(ctx, camX, l, r, H, () => -2.5, 4); ctx.strokeStyle = dry ? '#c9a24a' : '#5faa44'; ctx.lineWidth = 3.5; ctx.stroke();
      lineOff(ctx, camX, l, r, H, () => 6, 4); ctx.strokeStyle = 'rgba(40,24,10,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      lineOff(ctx, camX, l, r, H, () => -5, 4); ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      // polvere che si alza dalla cima
      const cx = (a + b) / 2, ph = (t * 0.5 + j * 0.27) % 1; ctx.fillStyle = `rgba(222,196,150,${0.38 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(cx - camX + Math.sin(j) * 8, H(cx) - q.A - ph * 14 - 3, 4 + 7 * ph, 0, TAU); ctx.fill();
    }
  }

  // Creste di pressione sul ghiaccio: schegge cristalline azzurre con riflessi e luccichio
  function iceRidges(ctx, p, camX, x0, x1, H, sub, t) {
    for (let j = 0; j < p.rocks.length; j++) {
      const q = p.rocks[j], cx = p.a + q.c; if (cx + q.w < x0 || cx - q.w > x1) continue;
      const l = Math.max(cx - q.w, x0), r = Math.min(cx + q.w, x1), X = cx - camX, hc = H(cx);
      const base = hc + q.H + 6; fillSlab(ctx, camX, l, r, H, () => -1.5, x => base - H(x), [[0, '#f2fbff'], [0.5, '#a9d4ee'], [0.85, '#5f95bb'], [1, '#5f95bb00']], 3);
      // spigolo luminoso e ombra interna
      ctx.fillStyle = 'rgba(70,120,160,0.38)'; ctx.beginPath(); ctx.moveTo(X, hc - 2); ctx.lineTo(X + q.w * 0.95, H(cx + q.w * 0.95)); ctx.lineTo(X + q.w * 0.3, H(cx + q.w * 0.3) + 8); ctx.closePath(); ctx.fill();
      lineOff(ctx, camX, l, r, H, () => -1.5, 3); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(X - 3, hc + 4); ctx.lineTo(X + 2, hc + 14); ctx.moveTo(X + 7, hc + 6); ctx.lineTo(X + 11, hc + 12); ctx.stroke();
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + j * 1.7); ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.6 * tw})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X - 5, hc - 4); ctx.lineTo(X + 5, hc - 4); ctx.moveTo(X, hc - 9); ctx.lineTo(X, hc + 1); ctx.stroke();   // scintilla
    }
  }

  // Conca: avvallamento di terra scura con riva erbosa, ciottoli e una pozza sul fondo
  function bowlDip(ctx, p, camX, x0, x1, H, sub, t) {
    const a = p.a + p.s, b = a + p.L; if (b < x0 || a > x1) return;
    const l = Math.max(a - 30, x0), r = Math.min(b + 30, x1), tp = x => sm01((x - (a - 30)) / 60) * sm01(((b + 30) - x) / 60);
    const dry = p.zkey === 'gravel';
    fillSlab(ctx, camX, l, r, H, () => -2, x => 18 * tp(x) + 8, dry ? [[0, '#c9b190'], [0.5, '#a58a68'], [0.85, '#6c5942'], [1, '#6c594200']] : [[0, '#8a6038'], [0.5, '#5f3d20'], [0.85, '#34200e'], [1, '#34200e00']], 5);
    lineOff(ctx, camX, l, r, H, () => -2.5, 4); ctx.strokeStyle = dry ? '#d7c3a0' : '#5aa142'; ctx.lineWidth = 3.4; ctx.stroke();
    // ciottoli sul fondo
    ctx.fillStyle = 'rgba(190,170,140,0.8)';
    for (let k = 0; k < 9; k++) { const wx = a + 40 + ((k * 53) % Math.max(1, p.L - 80)); if (wx < x0 || wx > x1) continue; ctx.beginPath(); ctx.ellipse(wx - camX, H(wx) + 4 + (k % 3) * 3, 3 + k % 3, 2, 0, 0, TAU); ctx.fill(); }
    // pozza sul punto più basso
    const cx = a + p.L / 2, y = H(cx) + 3, X = cx - camX;
    if (cx > x0 - 80 && cx < x1 + 80) {
      ctx.fillStyle = 'rgba(30,22,12,0.5)'; ctx.beginPath(); ctx.ellipse(X, y, p.L * 0.17, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(140,190,222,0.78)'; ctx.beginPath(); ctx.ellipse(X, y - 0.5, p.L * 0.15, 4.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(X - p.L * 0.05, y - 1.8, p.L * 0.05, 1.3, 0, 0, TAU); ctx.fill();
      const ph = (t * 0.6) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - ph)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X + 10, y, 5 + p.L * 0.1 * ph, 1 + 2.2 * ph, 0, 0, TAU); ctx.stroke();
    }
  }


  // ---- inchiostro: il fossato del trampolino e il gradino in discesa sono macchie e pennellate di inchiostro nero ----
  const hz = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  // pennellata nera lungo la strada tra a e b: spessore variabile, setole chiare, riflesso
  function inkBand(ctx, camX, a, b, x0, x1, H, thick, seed, opt) {
    opt = opt || {}; const l = Math.max(a, x0), r = Math.min(b, x1); if (r <= l) return;
    const tp = x => sm01((x - a) / 40) * sm01((b - x) / 40);
    const th = x => thick * (0.78 + 0.22 * Math.sin(x * 0.045 + seed)) * (0.35 + 0.65 * tp(x));
    fillSlab(ctx, camX, l, r, H, () => -3, x => th(x), [[0, '#1b1b22'], [0.55, '#0c0c12'], [1, '#0c0c12']], 4);
    // setole: sottili strisce di carta che affiorano dentro la pennellata
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(70,70,92,0.55)'; ctx.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) { lineOff(ctx, camX, l, r, H, x => 2 + k * (thick / 4.2) * (0.35 + 0.65 * tp(x)) + 1.2 * Math.sin(x * 0.07 + k + seed), 5); ctx.stroke(); }
    // riflesso lucido sul bordo alto
    lineOff(ctx, camX, l, r, H, x => -1.4, 5); ctx.strokeStyle = 'rgba(150,150,190,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
    if (opt.drips) {   // gocce che colano dal bordo
      for (let k = 0; k < opt.drips; k++) {
        const wx = a + 20 + hz(seed + k * 3.1) * Math.max(10, b - a - 40); if (wx < x0 || wx > x1) continue; const y = H(wx) + th(wx), ln = 6 + hz(seed + k * 7.7) * 14;
        ctx.strokeStyle = '#0c0c12'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx - camX, y - 2); ctx.lineTo(wx - camX, y + ln); ctx.stroke();
        ctx.fillStyle = '#0c0c12'; ctx.beginPath(); ctx.ellipse(wx - camX, y + ln + 1, 3.4, 4.4, 0, 0, TAU); ctx.fill();
      }
    }
  }
  // schizzi d'inchiostro (gocce sparse) attorno a un punto
  function inkSplat(ctx, camX, x0, x1, H, cx, n, spread, seed) {
    ctx.fillStyle = '#0c0c12';
    for (let k = 0; k < n; k++) {
      const wx = cx + (hz(seed + k * 2.3) - 0.5) * 2 * spread; if (wx < x0 - 8 || wx > x1 + 8) continue;
      const up = hz(seed + k * 5.9), r = 1.4 + hz(seed + k * 9.1) * 3.4, y = H(wx) - 3 - up * up * 34;
      ctx.beginPath(); ctx.ellipse(wx - camX, y, r, r * (0.8 + 0.3 * hz(seed + k)), 0, 0, TAU); ctx.fill();
      if (r > 3) { ctx.fillStyle = 'rgba(150,150,190,0.7)'; ctx.beginPath(); ctx.arc(wx - camX - r * 0.3, y - r * 0.3, r * 0.25, 0, TAU); ctx.fill(); ctx.fillStyle = '#0c0c12'; }
    }
  }
  function inkJump(ctx, p, camX, x0, x1, H, sub, t) {
    const wood = p.zkey === 'ramps';
    // trampolino: assi di legno (o lastre) sopra la salita
    const ka = p.a + p.s + 10, kb = p.a + p.u1 + 4;
    if (kb >= x0 && ka <= x1) {
      const l = Math.max(ka, x0), r = Math.min(kb, x1), tp = x => sm01((x - ka) / 36) * sm01((kb - x) / 14);
      fillSlab(ctx, camX, l, r, H, () => -5, x => 4 + 7 * tp(x), wood ? [[0, '#d9a766'], [0.5, '#b17d3f'], [1, '#6e4a22']] : [[0, '#bdb5a8'], [0.5, '#8d857a'], [1, '#5a544c']], 4);
      ctx.strokeStyle = wood ? 'rgba(80,50,20,0.55)' : 'rgba(60,56,50,0.5)'; ctx.lineWidth = 1.2;
      for (let wx = ka + 14; wx < kb - 4; wx += 22) { if (wx < x0 || wx > x1) continue; const y = H(wx); ctx.beginPath(); ctx.moveTo(wx - camX, y - 4); ctx.lineTo(wx - camX, y + 9); ctx.stroke(); }
      lineOff(ctx, camX, l, r, H, () => -5, 5); ctx.strokeStyle = wood ? '#f0cf98' : '#dcd6cb'; ctx.lineWidth = 2; ctx.stroke();
      // strisce nere di pennello sul labbro (avviso)
      for (let k = 0; k < 3; k++) { const wx = kb - 10 - k * 11; if (wx < x0 || wx > x1) continue; const y = H(wx); ctx.strokeStyle = '#0c0c12'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(wx - camX - 3, y - 5); ctx.lineTo(wx - camX + 3, y + 5); ctx.stroke(); }
    }
    // la macchia: copre il fossato (pareti e fondo)
    const a = p.a + p.u1 - 4, b = p.a + p.u2 + p.rr * 0.62;
    inkBand(ctx, camX, a, b, x0, x1, H, 30, p.a * 0.01, { drips: 5 });
    // pozza che ondeggia appena
    const cx = p.a + p.u1 + p.ex + p.pw / 2; if (cx > x0 - 90 && cx < x1 + 90) {
      const y = H(cx) + 2, X = cx - camX, ph = (t * 0.5) % 1;
      ctx.strokeStyle = `rgba(190,190,230,${0.45 * (1 - ph)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X, y, 10 + p.pw * 0.3 * ph, 1.5 + 2.5 * ph, 0, 0, TAU); ctx.stroke();
    }
    inkSplat(ctx, camX, x0, x1, H, p.a + p.u1 + p.ex + p.pw / 2, 14, p.pw * 0.75, p.a * 0.013);
  }
  function inkDrop(ctx, p, camX, x0, x1, H, sub, t) {
    // la discesa è una larga pennellata nera con le gocce che colano; il piano più basso porta qualche schizzo
    const a = p.a + p.s - 8, b = p.a + p.s + p.ex + 26;
    inkBand(ctx, camX, a, b, x0, x1, H, 24, p.a * 0.01, { drips: 4 });
    const a2 = p.a + p.s2 - 10, b2 = p.a + p.s2 + p.rr * 0.5;
    inkBand(ctx, camX, a2, b2, x0, x1, H, 11, p.a * 0.017 + 2, {});
    inkSplat(ctx, camX, x0, x1, H, p.a + p.s + p.ex + 60, 10, 90, p.a * 0.011);
    // cartello a pennello: freccia verso il basso
    const wx = p.a + p.s - 34; if (wx > x0 - 20 && wx < x1 + 20) {
      const y = H(wx), X = wx - camX; ctx.strokeStyle = '#0c0c12'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X, y - 4); ctx.lineTo(X, y - 38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X, y - 14); ctx.lineTo(X - 9, y - 26); ctx.moveTo(X, y - 14); ctx.lineTo(X + 9, y - 26); ctx.stroke();
    }
  }


  // ---- portali (modalità pazza): anelli d'inchiostro; si attraversano una volta sola e poi si dissolvono ----
  //  salto  = carta chiara con vortice e freccia ↔ · specchio = nero con ⇄ bianco · uscita = anello tratteggiato con freccia a sinistra
  function drawPortals(ctx, camX, w, gy, t, st, layer) {
    const P = Terrain.PORTALS; if (!P || !P.length) return;
    for (let i = 0; i < P.length; i++) {
      const q = P[i], sx = q.x - camX; if (sx < -110 || sx > w + 110) continue;
      const g = st.gone[q.id]; let k = 1, d = 0;
      if (g) { d = (st.now - g) / 700; if (d >= 1) continue; k = 1 - d * d; }
      portalDraw(ctx, q, sx, gy - Terrain.height(q.x), t, k, d, st, layer);
    }
  }
  function portalDraw(ctx, q, sx, by, t, k, d, st, layer) {
    const ry = 92 * k, rx = 42 * k, cy = by - 92 * k - 3, seed = q.id * 1.7;
    const ring = (n, f) => { ctx.beginPath(); for (let j = 0; j <= n; j++) { const a = f + (j / n) * TAU * (f === undefined ? 1 : 1); const wob = 1 + 0.05 * Math.sin(3 * a + t * 2 + seed) + 0.035 * Math.sin(5 * a - t * 3 + seed); const x = sx + Math.cos(a) * rx * wob, y = cy + Math.sin(a) * ry * wob; if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
    const dim = q.kind === 'exit' && !(st.mirrored && st.myExit === q.id) ? 0.38 : 1;   // solo la propria uscita è in evidenza
    ctx.save(); ctx.globalAlpha = dim; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (layer === 'back') {
      // pozza d'inchiostro alla base
      ctx.fillStyle = 'rgba(12,12,18,0.55)'; ctx.beginPath(); ctx.ellipse(sx, by + 2, 34 * k, 5 * k, 0, 0, TAU); ctx.fill();
      // riempimento
      ring(36, 0);
      ctx.fillStyle = q.kind === 'mirror' ? 'rgba(14,14,22,0.88)' : q.kind === 'shift' ? 'rgba(250,247,238,0.82)' : 'rgba(250,247,238,0.45)'; ctx.fill();
      ctx.save(); ctx.clip();
      // vortice a spirale d'inchiostro, come nel riferimento: fasce ondulate piene e sovrapposte che scorrono verso il centro,
      // una spirale al centro e un'ombra più chiara sul bordo (salto: nero su carta chiara · specchio: chiaro sul nero · uscita: leggero)
      const dark = q.kind === 'mirror', ex = q.kind === 'exit', N = ex ? 4 : 7, col = dark ? '236,236,252' : '12,12,18';
      const bands = [];
      for (let j = 0; j < N; j++) bands.push({ j, f: 1 - ((j + t * 0.4) % N) / N });
      bands.sort((p, q2) => q2.f - p.f);   // dalle più grandi alle più piccole
      const blob = (e, ph, amp) => { ctx.beginPath(); for (let m = 0; m <= 30; m++) { const aa = m / 30 * TAU, wob = 1 + amp * Math.sin(3 * aa + t * 1.1 + ph + seed) + amp * 0.6 * Math.sin(5 * aa - t * 1.6 + ph * 1.7) + amp * 0.35 * Math.sin(2 * aa + t * 0.7 - ph); const x = sx + Math.cos(aa) * rx * e * wob, y = cy + Math.sin(aa) * ry * e * wob; if (m === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); };
      for (const bd of bands) {
        const e = 0.08 + 1.02 * bd.f, shade = (dark ? (bd.j % 2 ? 0.1 : 0.2) : (bd.j % 2 ? 0.04 : 0.13)) * (ex ? 0.55 : 1) * Math.min(1, bd.f * 3);
        blob(e, bd.j * 1.9, 0.10); ctx.fillStyle = `rgba(${col},${shade.toFixed(3)})`; ctx.fill();
        ctx.strokeStyle = `rgba(${col},${(0.55 + 0.4 * bd.f).toFixed(3)})`; ctx.lineWidth = 1.4 + 2.2 * bd.f; ctx.stroke();
      }
      if (!ex) {
        ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2.6; ctx.beginPath();
        for (let m = 0; m <= 46; m++) { const u = m / 46, aa = u * 8 + t * 2.2, rr = 0.02 + 0.3 * u; const x = sx + Math.cos(aa) * rx * rr, y = cy + Math.sin(aa) * ry * rr; if (m === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
      // glifo al centro
      ctx.strokeStyle = q.kind === 'mirror' ? '#f2f2ff' : '#0c0c12'; ctx.lineWidth = 3.4;
      const gy0 = cy, a = 9 * k;
      if (q.kind !== 'exit') { ctx.fillStyle = q.kind === 'mirror' ? 'rgba(14,14,22,0.94)' : 'rgba(250,247,238,0.94)'; ctx.beginPath(); ctx.ellipse(sx, gy0, rx * 0.62, 21 * k, 0, 0, TAU); ctx.fill(); }
      const arrow = (x0, y0, x1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); const s = x1 > x0 ? -1 : 1; ctx.moveTo(x1 + s * 6, y0 - 5); ctx.lineTo(x1, y0); ctx.lineTo(x1 + s * 6, y0 + 5); ctx.stroke(); };
      if (q.kind === 'shift') { arrow(sx, gy0, sx + a); arrow(sx, gy0, sx - a); }
      else if (q.kind === 'mirror') { arrow(sx - a, gy0 - 8, sx + a); arrow(sx + a, gy0 + 8, sx - a); }
      else arrow(sx + a, gy0, sx - a);
    }
    // anello (nel livello "front" solo la metà destra, così la bici sembra entrare nel portale)
    const ink = '#0c0c12';
    ctx.strokeStyle = ink; ctx.lineWidth = layer === 'back' ? 7 * (0.5 + 0.5 * k) : 5.5 * (0.5 + 0.5 * k);
    if (q.kind === 'exit') ctx.setLineDash([9, 7]);
    if (layer === 'back') { ring(36, 0); ctx.stroke(); }
    else { ctx.beginPath(); for (let j = 0; j <= 18; j++) { const a = -Math.PI / 2 + (j / 18) * Math.PI, wob = 1 + 0.05 * Math.sin(3 * a + t * 2 + seed) + 0.035 * Math.sin(5 * a - t * 3 + seed); const x = sx + Math.cos(a) * rx * wob, y = cy + Math.sin(a) * ry * wob; if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.setLineDash([]);
    if (layer === 'back') {
      // sbavatura d'inchiostro attorno al bordo e puntini che girano (come i granelli del riferimento)
      ctx.fillStyle = 'rgba(12,12,18,0.07)'; ctx.beginPath(); for (let m = 0; m <= 36; m++) { const aa = m / 36 * TAU, wob = 1.16 + 0.07 * Math.sin(4 * aa + t * 1.2 + seed); const x = sx + Math.cos(aa) * rx * wob, y = cy + Math.sin(aa) * ry * wob; if (m === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.fill();
      ctx.fillStyle = 'rgba(12,12,18,0.7)';
      for (let m = 0; m < 12; m++) { const aa = m * 0.52 + t * (0.5 + (m % 3) * 0.15) + seed, rr = 1.2 + 0.22 * ((m * 5) % 4) / 3; ctx.beginPath(); ctx.arc(sx + Math.cos(aa) * rx * rr, cy + Math.sin(aa) * ry * rr, 1.2 + (m % 3) * 0.7, 0, TAU); ctx.fill(); }
      // gocce che colano dal bordo basso
      ctx.fillStyle = ink;
      for (let j = 0; j < 3; j++) { const dx = (j - 1) * rx * 0.6, ph = (t * 0.35 + j * 0.37 + seed) % 1, ln = 6 + 14 * ph; ctx.beginPath(); ctx.ellipse(sx + dx, by - 3 + ln * 0.4, 2.2, 3 + ln * 0.35, 0, 0, TAU); ctx.fill(); }
      // dissolvenza: schizzi che cadono
      if (d > 0) for (let j = 0; j < 9; j++) { const a = j * 0.7 + seed, rr = 14 + d * 46 * (0.6 + 0.4 * ((j * 7) % 5) / 4); ctx.globalAlpha = 1 - d; ctx.beginPath(); ctx.arc(sx + Math.cos(a) * rr, by - 70 + Math.sin(a) * rr * 1.3 + d * d * 50, 3.2 * (1 - d) + 1, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }

  // Dentiera: ballast di ghiaia, traversine di legno, rotaia d'acciaio con i denti a V e i bulloni, paraurti a strisce
  function rackRail(ctx, p, camX, x0, x1, H, sub, t) {
    const tap = tapOf(p, 90);
    fillSlab(ctx, camX, x0, x1, H, () => 3, x => 3 + 22 * tap(x), [[0, '#a29e97'], [1, '#6e6a64']]);
    ctx.fillStyle = 'rgba(60,56,50,0.55)';
    for (let k = 0; k < 40; k++) { const wx = p.a + 20 + ((k * 61) % Math.max(1, p.len - 40)); if (wx < x0 - 4 || wx > x1 + 4) continue; ctx.beginPath(); ctx.arc(wx - camX, H(wx) + 8 + (k % 4) * 4, 1.3 + (k % 3) * 0.5, 0, TAU); ctx.fill(); }
    // traversine
    const k0 = Math.floor((x0 - p.a) / (p.per / 2)), k1 = Math.ceil((x1 - p.a) / (p.per / 2));
    for (let k = k0; k <= k1; k++) {
      const wx = p.a + k * p.per / 2; if (wx < p.a + 30 || wx > p.b - 30) continue; const x = wx - camX, y = H(wx);
      const g = ctx.createLinearGradient(0, y + 2, 0, y + 17); g.addColorStop(0, '#8a5d34'); g.addColorStop(1, '#4e3219');
      ctx.fillStyle = g; ctx.fillRect(x - 6, y + 2, 12, 15);
      ctx.strokeStyle = 'rgba(30,18,8,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 3, y + 4); ctx.lineTo(x - 3, y + 15); ctx.moveTo(x + 2, y + 5); ctx.lineTo(x + 2, y + 14); ctx.stroke();
    }
    // rotaia: ombra, corpo con gradiente, riflesso
    lineOff(ctx, camX, x0, x1, H, () => 3, 6); ctx.strokeStyle = 'rgba(15,18,26,0.7)'; ctx.lineWidth = 17; ctx.stroke();
    lineOff(ctx, camX, x0, x1, H, () => 1, 6); ctx.strokeStyle = '#59647a'; ctx.lineWidth = 13; ctx.stroke();
    lineOff(ctx, camX, x0, x1, H, () => -1, 6); ctx.strokeStyle = '#a3afc2'; ctx.lineWidth = 8; ctx.stroke();
    lineOff(ctx, camX, x0, x1, H, () => -3.5, 6); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    // denti: tacche nette sui picchi/valli + bulloni
    const j0 = Math.floor((x0 - p.a) / p.per), j1 = Math.ceil((x1 - p.a) / p.per);
    for (let k = j0; k <= j1; k++) {
      const wx = p.a + k * p.per; if (wx < p.a + 40 || wx > p.b - 40) continue; const x = wx - camX, y = H(wx);
      ctx.strokeStyle = 'rgba(25,30,42,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 8); ctx.stroke();
      const px = p.a + (k + 0.5) * p.per - camX, py = H(p.a + (k + 0.5) * p.per);
      ctx.fillStyle = '#2f3644'; ctx.beginPath(); ctx.arc(px, py - 1, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(px - 0.8, py - 1.8, 0.9, 0, TAU); ctx.fill();
      if (k % 3 === 0) { ctx.strokeStyle = 'rgba(170,86,30,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + 7, y + 13); ctx.stroke(); }  // colata di ruggine
    }
    // paraurti a righe gialle e nere alle due estremità
    [p.a + 12, p.b - 12].forEach((wx, i) => {
      if (wx < x0 - 30 || wx > x1 + 30) return; const x = wx - camX, y = H(wx), s = i ? -1 : 1;
      ctx.fillStyle = '#4a4f5a'; ctx.fillRect(x - 3, y - 30, 6, 32);
      ctx.save(); ctx.translate(x, y - 34); ctx.fillStyle = '#f5c518'; ctx.fillRect(-14, -9, 28, 18);
      ctx.beginPath(); ctx.rect(-14, -9, 28, 18); ctx.clip(); ctx.fillStyle = '#1d2230';
      for (let q = -3; q < 4; q++) { ctx.beginPath(); ctx.moveTo(q * 8, -9); ctx.lineTo(q * 8 + 5, -9); ctx.lineTo(q * 8 + 5 + s * 9, 9); ctx.lineTo(q * 8 + s * 9, 9); ctx.fill(); }
      ctx.restore(); ctx.strokeStyle = '#1d2230'; ctx.lineWidth = 2; ctx.strokeRect(x - 14, y - 43, 28, 18);
    });
  }

  // Strada selciata ad archi: fascia di pietra arenaria con filari di ciottoli sfalsati, chiavi di volta e muschio nelle cuspidi
  function archRoad(ctx, p, camX, x0, x1, H, sub) {
    const tap = tapOf(p, 80);
    fillSlab(ctx, camX, x0, x1, H, () => -3, x => 28 * tap(x), [[0, '#e3d3ab'], [0.55, '#c8b283'], [1, '#9b8559']], 8);
    ctx.lineWidth = 1.4;
    const rows = [6, 13, 20], cobW = p.S / 3;
    rows.forEach((off, r) => {
      lineOff(ctx, camX, x0, x1, H, x => off * tap(x), 8); ctx.strokeStyle = 'rgba(88,68,38,0.7)'; ctx.stroke();
      ctx.beginPath();
      const k0 = Math.floor((x0 - p.a) / cobW) - 1, k1 = Math.ceil((x1 - p.a) / cobW);
      for (let k = k0; k <= k1; k++) {
        const wx = p.a + (k + (r % 2 ? 0.5 : 0)) * cobW; if (wx < p.a + 10 || wx > p.b - 10 || wx < x0 || wx > x1) continue;
        const y = H(wx); ctx.moveTo(wx - camX, y + (r ? rows[r - 1] : -2)); ctx.lineTo(wx - camX, y + off);
      }
      ctx.stroke();
    });
    // luce sul bordo alto e ombra sotto
    lineOff(ctx, camX, x0, x1, H, () => -3.5, 8); ctx.strokeStyle = 'rgba(255,251,236,0.8)'; ctx.lineWidth = 2; ctx.stroke();
    lineOff(ctx, camX, x0, x1, H, x => 28 * tap(x) + 0.5, 8); ctx.strokeStyle = 'rgba(50,34,16,0.4)'; ctx.lineWidth = 2.5; ctx.stroke();
    // chiavi di volta nelle cuspidi + muschio
    const c0 = Math.ceil((x0 - p.a) / p.S), c1 = Math.floor((x1 - p.a) / p.S);
    for (let k = c0; k <= c1; k++) {
      const wx = p.a + k * p.S; if (wx < p.a + 10 || wx > p.b - 10) continue; const x = wx - camX, y = H(wx);
      ctx.fillStyle = '#7d6a45'; ctx.beginPath(); ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 5, y - 4); ctx.lineTo(x + 3, y + 14); ctx.lineTo(x - 3, y + 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,28,12,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = k % 2 ? '#6f9a45' : '#82ad55'; ctx.beginPath(); ctx.ellipse(x, y - 4, 6, 3, 0, Math.PI, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 4, y - 3, 3.5, 2, 0, Math.PI, TAU); ctx.fill();
    }
  }

  // Gradoni di pietra: blocchi con giunti sfalsati, alzate in ombra, spigoli chiari, licheni e muschio (ghiaccio: brina e cristalli)
  function stairsRock(ctx, p, camX, x0, x1, H, sub) {
    const ice = p.zkey === 'ice', gravel = p.zkey === 'gravel';
    const stops = ice ? [[0, '#eaf6fd'], [0.5, '#bcd8ea'], [1, '#7ea0b9']] : gravel ? [[0, '#dcae86'], [0.5, '#bb8a62'], [1, '#7f5a3e']] : [[0, '#c9c4b8'], [0.5, '#a39d90'], [1, '#6f695d']];
    fillSlab(ctx, camX, x0, x1, H, () => -3, () => 34, stops);
    const joint = ice ? 'rgba(70,100,130,0.6)' : 'rgba(40,30,20,0.55)';
    ctx.lineWidth = 1.3; ctx.strokeStyle = joint;
    [11, 22].forEach((off, r) => {
      lineOff(ctx, camX, x0, x1, H, () => off, 4); ctx.stroke();
      ctx.beginPath(); const k0 = Math.floor((x0 - p.a) / 38) - 1, k1 = Math.ceil((x1 - p.a) / 38);
      for (let k = k0; k <= k1; k++) { const wx = p.a + (k + (r % 2 ? 0.5 : 0)) * 38; if (wx < x0 || wx > x1 || wx < p.a || wx > p.b) continue; const y = H(wx); ctx.moveTo(wx - camX, y + (r ? 11 : -2)); ctx.lineTo(wx - camX, y + off); }
      ctx.stroke();
    });
    for (let k = 1; k <= p.n; k++) {
      const cx = p.a + k * p.T + p.rw / 2; if (cx < x0 - 30 || cx > x1 + 30) continue;
      const yTop = H(cx + p.rw / 2 + 1), yBot = H(cx - p.rw / 2 - 1), x = cx - camX;
      // alzata in ombra
      ctx.fillStyle = ice ? 'rgba(90,125,155,0.55)' : 'rgba(35,24,14,0.5)'; ctx.beginPath(); ctx.moveTo(x - p.rw / 2 - 1, yBot - 3); ctx.lineTo(x + p.rw / 2 + 1, yTop - 3); ctx.lineTo(x + p.rw / 2 + 1, yTop + 30); ctx.lineTo(x - p.rw / 2 - 1, yBot + 30); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = ice ? '#f4fbff' : '#f2ecde'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - p.rw / 2 - 1, yBot - 3); ctx.lineTo(x + p.rw / 2 + 1, yTop - 3); ctx.stroke();   // spigolo chiaro
      if (!ice) { ctx.fillStyle = k % 2 ? '#6f9a45' : '#83ad55'; ctx.beginPath(); ctx.ellipse(x - 14, yBot - 3, 9, 3.4, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = '#d6a43a'; ctx.beginPath(); ctx.arc(x + 20, yTop + 8, 2.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x + 25, yTop + 11, 1.8, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4; [[-18, -3], [16, 4]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.moveTo(x + dx - 3, yTop + dy); ctx.lineTo(x + dx + 3, yTop + dy); ctx.moveTo(x + dx, yTop + dy - 3); ctx.lineTo(x + dx, yTop + dy + 3); ctx.stroke(); }); }
    }
    lineOff(ctx, camX, x0, x1, H, () => -3.5, 4); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    lineOff(ctx, camX, x0, x1, H, () => 34.5, 6); ctx.strokeStyle = 'rgba(30,20,10,0.4)'; ctx.lineWidth = 2.5; ctx.stroke();
  }

  // Buche: bocca di terra smossa, pareti con sassi, fondo buio con pozza che riflette il cielo e anelli d'acqua
  function holesPits(ctx, p, camX, x0, x1, H, sub, gy, t) {
    for (let j = 0; j < p.k; j++) {
      const cx = p.a + (j + 0.5) * p.sp; if (cx < x0 - 140 || cx > x1 + 140) continue;
      const half = p.W / 2, y = H(cx), X = cx - camX;
      // pareti: gradiente dal terreno scuro al nero
      ctx.beginPath(); let first = true;
      for (let x = cx - half - 6; x <= cx + half + 6.1; x += 4) { const py = H(x) - 1; if (first) { ctx.moveTo(x - camX, py); first = false; } else ctx.lineTo(x - camX, py); }
      for (let x = cx + half + 6; x >= cx - half - 6.1; x -= 4) ctx.lineTo(x - camX, H(x) + 32);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, y - 4, 0, y + 34); g.addColorStop(0, 'rgba(70,40,20,0.95)'); g.addColorStop(0.5, 'rgba(32,18,9,0.97)'); g.addColorStop(1, 'rgba(10,6,3,0.98)');
      ctx.fillStyle = g; ctx.fill();
      // sassi sulle pareti
      ctx.fillStyle = 'rgba(120,98,76,0.75)';
      [[-0.72, 12], [-0.5, 22], [0.62, 16], [0.8, 8], [0.38, 26]].forEach(([f, dy], q) => { const sx = cx + f * half; ctx.beginPath(); ctx.ellipse(sx - camX, H(sx) + dy, 5 + q % 3 * 1.5, 3.2, q, 0, TAU); ctx.fill(); });
      // pozza sul fondo con riflesso e anelli
      const py = y + 10;
      ctx.fillStyle = 'rgba(110,165,205,0.75)'; ctx.beginPath(); ctx.ellipse(X, py, half * 0.5, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(210,235,250,0.65)'; ctx.beginPath(); ctx.ellipse(X - half * 0.14, py - 1, half * 0.22, 1.6, 0, 0, TAU); ctx.fill();
      const ph = (t * 0.7 + j * 0.37) % 1; ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - ph)})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X + Math.sin(j * 2 + 1) * half * 0.15, py, 4 + half * 0.3 * ph, 1 + 2.2 * ph, 0, 0, TAU); ctx.stroke();
      // bordo di terra smossa, sassolini e ciuffi che sporgono
      [-1, 1].forEach(s => {
        const ex = cx + s * (half + 3);
        ctx.fillStyle = '#7d5532'; ctx.beginPath(); ctx.ellipse(ex - camX + s * 5, H(ex) - 3, 11, 4.5, s * 0.15, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,190,0.45)'; ctx.beginPath(); ctx.ellipse(ex - camX + s * 5, H(ex) - 5, 7, 1.6, s * 0.15, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#58903a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ex - camX + s * 2, H(ex) - 4); ctx.quadraticCurveTo(ex - camX - s * 3, H(ex) - 14, ex - camX - s * 8, H(ex) - 9); ctx.stroke();
      });
      ctx.fillStyle = '#a4541e'; [[-half - 14, 0.4], [half + 16, -0.5]].forEach(([dx, r], q) => { ctx.beginPath(); ctx.ellipse(cx + dx - camX, H(cx + dx) - 3, 6, 2.6, r + q, 0, TAU); ctx.fill(); });
    }
  }

  // Dune ondulate (ghiaia): come la sabbia, ma tono ruggine e più sassi
  function rippleDunes(ctx, p, camX, x0, x1, H, sub, t) { sandDune(ctx, p, camX, x0, x1, H, sub, t || 0, { gravel: true }); }

  // Tronchi: visti di testa, semisepolti, con anelli, corteccia, muschio e funghetti
  function logsDraw(ctx, p, camX, H) {
    for (let j = 0; j < p.k; j++) {
      const cx = p.a + (j + 0.5) * p.sp, x = cx - camX, y = H(cx);
      const rx = p.w + 6, ry = p.H * 0.62 + 6, cy = y + ry * 0.35;
      ctx.fillStyle = 'rgba(25,14,6,0.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 3, rx + 6, 6, 0, 0, TAU); ctx.fill();               // ombra
      const gb = ctx.createLinearGradient(x - rx, 0, x + rx, 0); gb.addColorStop(0, '#4a2c14'); gb.addColorStop(0.5, '#7b4e28'); gb.addColorStop(1, '#3d230f');
      ctx.fillStyle = gb; ctx.strokeStyle = '#2a190b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, cy, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
      // corteccia a tacche
      ctx.strokeStyle = 'rgba(25,14,6,0.55)'; ctx.lineWidth = 1.4;
      for (let q = 0; q < 14; q++) { const a = q / 14 * TAU, r0 = 1, r1 = 0.9; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * rx * r0, cy + Math.sin(a) * ry * r0); ctx.lineTo(x + Math.cos(a) * (rx - 5) * r1, cy + Math.sin(a) * (ry - 4) * r1); ctx.stroke(); }
      // legno con anelli
      const gw = ctx.createRadialGradient(x - rx * 0.2, cy - ry * 0.2, 2, x, cy, rx); gw.addColorStop(0, '#f1cf95'); gw.addColorStop(1, '#c08d4f');
      ctx.fillStyle = gw; ctx.beginPath(); ctx.ellipse(x, cy, rx - 8, ry - 7, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(110,70,30,0.65)'; ctx.lineWidth = 1.3;
      for (let r = 1; r <= 4; r++) { ctx.beginPath(); ctx.ellipse(x, cy, (rx - 8) * r / 4.4, (ry - 7) * r / 4.4, 0, 0, TAU); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + (rx - 10) * 0.85, cy - (ry - 8) * 0.25); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(x - rx * 0.35, cy - ry * 0.45, rx * 0.22, ry * 0.12, -0.5, 0, TAU); ctx.fill();
      // muschio e funghetti
      ctx.fillStyle = '#5f8f3c'; ctx.beginPath(); ctx.ellipse(x - rx * 0.35, cy - ry + 3, 14, 4.5, -0.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#7bb04d'; ctx.beginPath(); ctx.ellipse(x - rx * 0.4, cy - ry + 1.5, 8, 2.6, -0.2, 0, TAU); ctx.fill();
      const mx = x + rx * 0.62, my = cy - ry * 0.55;
      ctx.fillStyle = '#f3ead8'; ctx.fillRect(mx - 1.5, my, 3, 7); ctx.fillStyle = '#d6443a'; ctx.beginPath(); ctx.ellipse(mx, my, 6, 4.2, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; [[-2.5, -1.6], [1.5, -2.6], [3, -0.8]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(mx + dx, my + dy, 0.9, 0, TAU); ctx.fill(); });
    }
  }

  // Fango: strato lucido e denso con gocce, bolle che scoppiano, pozze che riflettono il cielo, solchi di ruote e giunchi
  function mudBog(ctx, p, camX, x0, x1, H, sub, t) {
    const tap = tapOf(p, 100);
    fillSlab(ctx, camX, x0, x1, H, () => -3, x => 44 * tap(x) + 3.5 * Math.sin(x / 8) * tap(x), [[0, '#8a6038'], [0.25, '#5d3b1e'], [1, '#2b190b']]);
    // solchi di ruote
    [10, 19].forEach((off, i) => { lineOff(ctx, camX, x0, x1, H, x => off * tap(x) + 1.3 * Math.sin(x / 31 + i), 5); ctx.strokeStyle = 'rgba(25,14,6,0.55)'; ctx.lineWidth = 3; ctx.stroke(); ctx.save(); ctx.translate(0, 2.2); ctx.strokeStyle = 'rgba(190,140,86,0.35)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore(); });
    // lucido bagnato sul bordo alto
    lineOff(ctx, camX, x0, x1, H, () => -3.5, 4); ctx.strokeStyle = 'rgba(214,170,120,0.85)'; ctx.lineWidth = 2.4; ctx.stroke();
    // grumi sulla superficie
    ctx.fillStyle = '#6d4626';
    for (let k = 0; k < 16; k++) { const wx = p.a + 40 + ((k * 137) % Math.max(1, p.len - 80)); if (wx < x0 - 10 || wx > x1 + 10) continue; ctx.beginPath(); ctx.ellipse(wx - camX, H(wx) - 3, 5 + k % 3 * 1.5, 3, 0, Math.PI, TAU); ctx.fill(); }
    // pozze che riflettono il cielo
    for (let k = 0; k < 4; k++) {
      const wx = p.a + 110 + k * (p.len - 220) / 3; if (wx < x0 - 40 || wx > x1 + 40) continue; const x = wx - camX, y = H(wx) + 6 + (k % 2) * 6;
      ctx.fillStyle = 'rgba(40,24,12,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, 30, 5.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,205,232,0.7)'; ctx.beginPath(); ctx.ellipse(x, y - 0.5, 26, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(x - 8, y - 1.5, 9, 1.2, 0, 0, TAU); ctx.fill();
    }
    // bolle
    for (let k = 0; k < 10; k++) {
      const wx = p.a + 60 + ((k * 197) % Math.max(1, p.len - 120)); if (wx < x0 - 20 || wx > x1 + 20) continue;
      const ph = ((t * 0.55 + k * 0.37) % 1), r = 2 + 6 * Math.sin(ph * Math.PI), by = H(wx) - 3 - ph * 8;
      ctx.fillStyle = 'rgba(176,130,84,0.85)'; ctx.beginPath(); ctx.arc(wx - camX, by, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,10,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,215,0.7)'; ctx.beginPath(); ctx.arc(wx - camX - r * 0.35, by - r * 0.35, r * 0.28, 0, TAU); ctx.fill();
    }
    // giunchi (typha) alle due estremità
    [[p.a + 36, 1], [p.a + 58, 0.8], [p.b - 40, 1], [p.b - 62, 0.85]].forEach(([wx, s], i) => {
      if (wx < x0 - 20 || wx > x1 + 20) return; const x = wx - camX, y = H(wx), sw = Math.sin(t * 1.4 + i * 1.9) * 3 * s, h = 38 * s;
      ctx.strokeStyle = '#4f7a34'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + sw * 0.5, y - h * 0.5, x + sw, y - h); ctx.stroke();
      ctx.strokeStyle = '#3f6428'; ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.quadraticCurveTo(x + 8 + sw * 0.4, y - h * 0.4, x + 12 + sw, y - h * 0.8); ctx.stroke();
      ctx.fillStyle = '#6b3f1f'; ctx.beginPath(); ctx.ellipse(x + sw, y - h - 5, 2.8, 8, sw * 0.03, 0, TAU); ctx.fill();
    });
  }

  function sandDune(ctx, p, camX, x0, x1, H, sub, t, opt) {
    opt = opt || {};
    // Sabbia: strato spesso con sfumatura calda, increspature di vento, ciuffi secchi, conchiglie e sassolini,
    // granelli portati dal vento e qualche luccichio. Le estremità si assottigliano (nessun bordo netto).
    const sm = u => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };
    const tap = x => sm((x - p.a) / 120) * sm((p.b - x) / 120);
    const THICK = 54, step = 6;
    // corpo: dal pelo della strada in giù, con gradiente
    let top = 1e9, bot = -1e9;
    ctx.beginPath();
    let first = true;
    for (let x = x0; x <= x1 + 0.1; x += step) { const px = x - camX, py = H(x) - 4 * tap(x); if (py < top) top = py; if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py); }
    for (let x = x1; x >= x0 - 0.1; x -= step) { const py = H(x) + THICK * tap(x); if (py > bot) bot = py; ctx.lineTo(x - camX, py); }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, bot);
    if (opt.gravel) { g.addColorStop(0, '#ead3b0'); g.addColorStop(0.3, '#d6b085'); g.addColorStop(0.7, '#bb8c60'); g.addColorStop(1, '#8c6340'); } else { g.addColorStop(0, '#fbebbd'); g.addColorStop(0.3, '#f0d28b'); g.addColorStop(0.7, '#dcb264'); g.addColorStop(1, '#b98a45'); }
    ctx.fillStyle = g; ctx.fill();
    // ombra sotto, sul terreno scuro
    ctx.beginPath(); first = true;
    for (let x = x0; x <= x1 + 0.1; x += step) { const py = H(x) + THICK * tap(x) + 0.5; if (first) { ctx.moveTo(x - camX, py); first = false; } else ctx.lineTo(x - camX, py); }
    ctx.strokeStyle = 'rgba(92,62,24,0.35)'; ctx.lineWidth = 2.5; ctx.stroke();
    // increspature del vento: bande d'ombra morbide + creste chiare (dune in miniatura)
    for (let j = 1; j <= 5; j++) {
      const off = 5 + j * 8.5, ph = j * 1.9, wl = 26 + 7 * j;
      ctx.beginPath(); first = true;
      for (let x = x0; x <= x1 + 0.1; x += step) {
        const k = tap(x), py = H(x) + off * k + 3 * k * Math.sin(x / wl + ph);
        if (first) { ctx.moveTo(x - camX, py); first = false; } else ctx.lineTo(x - camX, py);
      }
      ctx.strokeStyle = 'rgba(150,100,38,0.16)'; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = 'rgba(160,112,44,0.5)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.save(); ctx.translate(0, -2.2); ctx.strokeStyle = 'rgba(255,248,222,0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    }
    // filo di luce sul bordo alto
    ctx.beginPath(); first = true;
    for (let x = x0; x <= x1 + 0.1; x += step) { const py = H(x) - 4 * tap(x); if (first) { ctx.moveTo(x - camX, py); first = false; } else ctx.lineTo(x - camX, py); }
    ctx.strokeStyle = 'rgba(255,251,232,0.98)'; ctx.lineWidth = 2.2; ctx.stroke();
    // ciuffi d'erba secca che ondeggiano
    for (let k = 0; k < 9; k++) {
      const wx = p.a + 70 + ((k * 211) % Math.max(1, p.len - 140)); if (wx < x0 - 20 || wx > x1 + 20) continue;
      const bx = wx - camX, by = H(wx) - 3, sw = Math.sin(t * 1.7 + k * 1.3) * 4;
      ctx.strokeStyle = k % 2 ? '#b08532' : '#cfa84e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let b = -1; b <= 1; b++) { ctx.beginPath(); ctx.moveTo(bx + b * 2, by); ctx.quadraticCurveTo(bx + b * 6 + sw * 0.5, by - 13, bx + b * 12 + sw, by - 21 + Math.abs(b) * 5); ctx.stroke(); }
    }
    // conchiglie e sassolini
    for (let k = 0; k < 8; k++) {
      const wx = p.a + 100 + ((k * 277) % Math.max(1, p.len - 200)); if (wx < x0 - 12 || wx > x1 + 12) continue;
      const bx = wx - camX, by = H(wx) - 3;
      if (k % 3 === 0) { // conchiglia a ventaglio
        ctx.fillStyle = '#f8e7e0'; ctx.strokeStyle = '#c9937f'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx - 9, by); ctx.quadraticCurveTo(bx, by - 15, bx + 9, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - 5, by - 9); ctx.moveTo(bx, by); ctx.lineTo(bx + 5, by - 9); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 11); ctx.stroke();
      } else {
        ctx.fillStyle = k % 2 ? '#a8845a' : '#bfa27a'; ctx.beginPath(); ctx.ellipse(bx, by - 1, 4.5 + (k % 3), 3.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(bx - 1, by - 2, 1.4, 0.8, 0, 0, TAU); ctx.fill();
      }
    }
    // granelli portati dal vento (verso sinistra, come la bici che li incontra)
    ctx.fillStyle = 'rgba(240,214,150,0.75)';
    for (let k = 0; k < 18; k++) {
      let wx = p.a + ((k * 97 - t * (55 + (k % 4) * 14)) % p.len + p.len) % p.len + 0; if (wx < x0 - 6 || wx > x1 + 6) continue;
      const wy = H(wx) - 6 - 14 * Math.abs(Math.sin(k * 2.1 + t * 0.9)) - (k % 3) * 3;
      ctx.beginPath(); ctx.arc(wx - camX, wy, 1 + (k % 3) * 0.5, 0, TAU); ctx.fill();
    }
    // luccichii
    for (let k = 0; k < 6; k++) {
      const wx = p.a + 60 + ((k * 313) % Math.max(1, p.len - 120)); if (wx < x0 - 8 || wx > x1 + 8) continue;
      const a = Math.max(0, Math.sin(t * 2.4 + k * 1.7)); if (a < 0.2) continue;
      const bx = wx - camX, by = H(wx) + 8 + (k % 3) * 6, s = 2.5 + 2.5 * a;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * a})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(bx - s, by); ctx.lineTo(bx + s, by); ctx.moveTo(bx, by - s); ctx.lineTo(bx, by + s); ctx.stroke();
    }
  }
  // ---------- traguardo --------------------------------------------------------------------------
  function drawFinish(ctx, camX, w, gy, S) {
    const fx = Terrain.FINISH_X, x0 = fx - camX; if (x0 < -620 || x0 > w + 620) return;
    const y = gy - Terrain.height(fx), t = performance.now() / 1000, H = 205;
    // festoni di bandierine, in entrambe le direzioni
    const cols = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#f97316'];
    [-1, 1].forEach(dir => {
      const xa = x0, xb = x0 + dir * 560, ya = y - H + 8, yb = gy - Terrain.height(fx + dir * 560) - 120;
      const sag = 46;
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const q = i / 14, px = xa + (xb - xa) * q, py = ya + (yb - ya) * q + Math.sin(q * Math.PI) * sag; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
      for (let i = 1; i < 14; i++) {
        const q = i / 14, px = xa + (xb - xa) * q, py = ya + (yb - ya) * q + Math.sin(q * Math.PI) * sag, fl = Math.sin(t * 3 + i) * 3;
        ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px + 9, py); ctx.lineTo(px + fl, py + 24); ctx.closePath(); ctx.fill();
      }
      // palo di sostegno
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(xb, yb + 4); ctx.lineTo(xb, yb + 120); ctx.stroke();
    });
    // due pilastri a scacchi e il cartellone
    const px = [x0 - 62, x0 + 62];
    px.forEach(x => {
      for (let k = 0; k < H / 18; k++) { ctx.fillStyle = k % 2 ? '#0f172a' : '#ffffff'; ctx.fillRect(x - 9, y - 18 * (k + 1), 9, 18); ctx.fillStyle = k % 2 ? '#ffffff' : '#0f172a'; ctx.fillRect(x, y - 18 * (k + 1), 9, 18); }
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.strokeRect(x - 9, y - H, 18, H);
    });
    ctx.fillStyle = '#1d4ed8'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(x0 - 92, y - H - 26, 184, 44); ctx.fill(); ctx.stroke();
    for (let k = 0; k < 18; k++) { ctx.fillStyle = k % 2 ? '#0f172a' : '#fff'; ctx.fillRect(x0 - 92 + k * 10.2, y - H - 26, 10.2, 7); ctx.fillStyle = k % 2 ? '#fff' : '#0f172a'; ctx.fillRect(x0 - 92 + k * 10.2, y - H + 11, 10.2, 7); }
    ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Kalam, "Comic Sans MS", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(I18n.t('gate'), x0, y - H - 4);
    // palloncini
    [[-86, '#ef4444'], [-110, '#facc15'], [-64, '#3b82f6'], [86, '#22c55e'], [112, '#ec4899'], [66, '#f97316']].forEach(([dx, c], i) => {
      const bx = x0 + dx, by = y - H - 40 - 36 * (i % 3) + Math.sin(t * 1.4 + i) * 5;
      ctx.strokeStyle = 'rgba(30,41,59,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.quadraticCurveTo(bx + Math.sin(t + i) * 5, by + 40, x0 + Math.sign(dx) * 62, y - H); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(bx, by, 14, 18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(bx - 5, by - 6, 3.5, 6, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.lineTo(bx - 3, by + 23); ctx.lineTo(bx + 3, by + 23); ctx.closePath(); ctx.fill();
    });
  }

  return { drawBridges, drawRamps, drawSigns, drawFinish, drawPatches, drawPortals, portalDraw };
})(); // props
