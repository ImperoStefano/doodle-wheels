// Intro: sul foglio a quadretti della prima schermata (titolo incluso, se il font è caricato) arriva
// l'avatar con il suo pennellone: cammina e spennella a tre passate, e dove passa il pennello (inchiostro
// nero "a setole" che si asciuga a strisce) compare la gara con le bici in griglia. Solo grafica locale:
// fisica e rete non c'entrano. Un tocco la salta.
const Intro = (() => {
  const DUR = 4750;                                  // durata totale (ms); il 3-2-1 parte dopo
  const LEAD = 400, LANE = 4500, PAUSE = 150;
  const LANES = [0.29, 0.53, 0.78];                  // altezza della punta (frazione di H)
  const BANDS = [0.58, 0.40, 0.52];                  // spessore della pennellata per corsia (frazione di H)
  const INK = '#0b0b0d';

  // --- sprite (coordinate nel "foglio" originale 1100x1100 dei tuoi frame) ---------------------------
  const PERSON = { x: 343, y: 142, w: 454, h: 838, grip: [745, 405], hip: [480, 575], split: 476, feetY: 976 };
  const BRUSH = [   // bbox nel foglio, punto di presa (sul manico, vicino alla cima), punta
    { x: 341, y: 120, w: 418, h: 860, grip: [707, 210], tip: [345, 890] },
    { x: 289, y: 66, w: 389, h: 862, grip: [629, 156], tip: [292, 845] },
    { x: 342, y: 115, w: 416, h: 869, grip: [703, 205], tip: [345, 885] },
  ];
  const KB = 0.7, ROT = -0.44;                       // scala del pennello rispetto all'avatar, inclinazione base
  const imgs = { av: [], br: [] }; let ready = 0;
  for (let i = 1; i <= 3; i++) ['av', 'br'].forEach(k => { const im = new Image(); im.onload = () => ready++; im.src = `img/${k}${i}.png?v=20261022b`; imgs[k].push(im); });

  let cv = null, ctx = null, paper = null, pctx = null, W = 0, H = 0, dpr = 1, s = 1;
  let killer = 0, fixedT = null, raf = 0, t0 = 0, running = false, lastT = 0, chunks = [], drops = [], lastCh = null;
  const R = Array.from({ length: 12 }, (_, i) => (Math.sin(i * 12.9898) * 43758.5453) % 1), rnd = i => Math.abs(R[i % 12]);

  const enabled = () => { try { return localStorage.getItem('dw_intro') !== 'off'; } catch (e) { return true; } };

  // posizione della punta rispetto alla presa (unità del foglio, già specchiata e ruotata)
  function tipRel(rot) {
    const b = BRUSH[0], dx = -(b.tip[0] - b.grip[0]) * KB, dy = (b.tip[1] - b.grip[1]) * KB, c = Math.cos(rot), n = Math.sin(rot);
    return [dx * c - dy * n, dx * n + dy * c];
  }
  const rotAt = ph => ROT + Math.sin(ph / (s * 400)) * 0.07;

  // stato al tempo T (ms): corsia, direzione, punto di presa, punta
  function state(T) {
    for (let i = 0; i < LANES.length; i++) {
      const st = LEAD + i * (LANE + PAUSE), en = st + LANE;
      if (T >= st && T <= en) {
        const p = (T - st) / LANE, dir = i % 2 === 0 ? 1 : -1;
        const L = 410 * s, Rr = 480 * s;                      // sporgenza dell'avatar a sinistra/destra della presa
        const a = dir > 0 ? -Rr : W + L, b = dir > 0 ? W + L : -Rr;
        const ax = a + (b - a) * p, ph = Math.abs(ax - a);
        const tr = tipRel(rotAt(ph));
        const tipY = LANES[i] * H;
        return { walking: true, lane: i, dir, ax, ay: tipY - tr[1] * s, tx: ax + dir * tr[0] * s, ty: tipY, ph };
      }
    }
    return { walking: false, lane: -1, tx: 0, ty: 0 };
  }

  function buildPaper() {
    paper.width = W; paper.height = H;
    const g = pctx, gs = 24 * dpr;
    g.fillStyle = '#f0f4f8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d9e2ec';
    for (let x = 0; x < W; x += gs) g.fillRect(Math.round(x), 0, Math.max(1, Math.round(dpr)), H);
    for (let y = 0; y < H; y += gs) g.fillRect(0, Math.round(y), W, Math.max(1, Math.round(dpr)));
    // titolo SOLO se il font originale (Kalam) è davvero caricato; nessun sottotitolo
    let okFont = false; try { okFont = !!(document.fonts && document.fonts.check('700 48px Kalam')); } catch (e) {}
    if (okFont) {
      g.fillStyle = '#102a43'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const portrait = W < H * 0.8, fs = portrait ? Math.min(W * 0.3, H * 0.14) : Math.min(W * 0.12, H * 0.2);
      g.font = `700 ${fs}px Kalam, cursive`;
      if (portrait) { g.fillText('Doodle', W / 2, H * 0.44 - fs * 0.5); g.fillText('Wheels', W / 2, H * 0.44 + fs * 0.55); }
      else g.fillText('Doodle Wheels', W / 2, H * 0.46);
    }
  }

  // cancella il foglio e lascia l'inchiostro lungo il cammino della punta
  function paint(Ta, Tb) {
    pctx.globalCompositeOperation = 'destination-out'; pctx.lineCap = 'round'; pctx.lineJoin = 'round';
    let prev = state(Ta);
    for (let T = Ta + 10; T <= Tb + 9; T += 10) {
      const q = state(Math.min(T, Tb));
      if (prev.walking && q.walking && prev.lane === q.lane) {
        const bw = H * BANDS[q.lane];
        pctx.lineWidth = bw * 0.8; pctx.beginPath(); pctx.moveTo(prev.tx, prev.ty); pctx.lineTo(q.tx, q.ty); pctx.stroke();
        for (let j = 0; j < 9; j++) {                      // setole: strisce con interruzioni (pennello "asciutto")
          if (rnd(Math.floor(T / 30) * 3 + j * 7) > 0.8) continue;
          const side = j % 2 ? 1 : -1, o = side * bw * (0.40 + 0.09 * rnd(j * 5 + q.lane));
          pctx.lineWidth = bw * (0.035 + 0.03 * rnd(j * 3));
          pctx.beginPath(); pctx.moveTo(prev.tx, prev.ty + o); pctx.lineTo(q.tx, q.ty + o); pctx.stroke();
        }
        if (!chunks.length || T - chunks[chunks.length - 1].T >= 16) {
          const sx = lastCh && lastCh.lane === q.lane ? lastCh.x : prev.tx, sy = lastCh && lastCh.lane === q.lane ? lastCh.y : prev.ty;
          chunks.push({ x0: sx, y0: sy, x1: q.tx, y1: q.ty, bw, T, dir: q.dir }); lastCh = { x: q.tx, y: q.ty, lane: q.lane };
          if (drops.length < 40 && Math.random() < 0.5) drops.push({ x: q.tx, y: q.ty + bw * (Math.random() - 0.3) * 0.3, vx: -q.dir * (60 + Math.random() * 180) * dpr, vy: (-120 - Math.random() * 160) * dpr, r: (2 + Math.random() * 5) * dpr, T });
        }
      }
      prev = q;
    }
    pctx.globalCompositeOperation = 'source-over';
  }

  function drawInk(Tc) {
    const N = 11;
    while (chunks.length && Tc - chunks[0].T > 1000) chunks.shift();
    ctx.lineCap = 'butt'; ctx.strokeStyle = INK;
    for (const c of chunks) {
      const age = (Tc - c.T) / 1000;
      for (let i = 0; i < N; i++) {
        const fade0 = 0.06 + 0.55 * rnd(i * 5 + 1), a = Math.min(1, Math.max(0, 1 - (age - fade0) / 0.33));
        if (a <= 0) continue;
        const o = (i / (N - 1) - 0.5) * c.bw * 0.86 + Math.sin(c.x0 * 0.012 + i * 1.7) * c.bw * 0.03;
        ctx.globalAlpha = a; ctx.lineWidth = c.bw / N * 1.25;
        ctx.beginPath(); ctx.moveTo(c.x0 - c.dir, c.y0 + o); ctx.lineTo(c.x1 + c.dir, c.y1 + o); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.fillStyle = INK;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i], age = (Tc - d.T) / 1000;
      if (age > 0.7) { drops.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - age / 0.7; ctx.beginPath(); ctx.arc(d.x + d.vx * age, d.y + d.vy * age + 520 * dpr * age * age, d.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---- avatar che cammina: gambe tagliate dal tuo disegno e fatte ondeggiare attorno al bacino ----------
  function drawFigure(q, T) {
    const fi = [0, 1, 2, 1][Math.floor(T / 110) % 4], A = imgs.av[fi], Bi = imgs.br[fi], b = BRUSH[fi];
    const cyc = 1.5 * PERSON.h * s, phase = (q.ph / cyc) * Math.PI * 2;
    const bob = Math.abs(Math.sin(phase)) * 14, sway = Math.sin(phase) * 0.025;
    const P = PERSON, [hx, hy] = P.hip;
    ctx.save(); ctx.translate(q.ax, q.ay); ctx.scale(q.dir * s, s); ctx.translate(-P.grip[0], -P.grip[1]);
    // ombra
    ctx.fillStyle = 'rgba(16,42,67,0.16)'; ctx.beginPath(); ctx.ellipse(560, P.feetY + 6, 290, 34, 0, 0, 7); ctx.fill();
    // gambe (quella dietro prima)
    for (const back of [true, false]) {
      const th = (back ? 1 : -1) * Math.sin(phase) * 0.3, lift = Math.max(0, (back ? -1 : 1) * Math.cos(phase)) * 30;
      ctx.save(); ctx.translate(hx, hy - lift * 0.4); ctx.rotate(th); ctx.translate(-hx, -hy);
      ctx.beginPath(); if (back) ctx.rect(P.x - 40, 540, P.split - (P.x - 40), 520); else ctx.rect(P.split, 540, 500, 520); ctx.clip();
      ctx.drawImage(A, P.x, P.y, P.w, P.h); ctx.restore();
    }
    // busto (con un po' di pantaloni per coprire l'attaccatura)
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(sway); ctx.translate(-hx, -hy - bob);
    ctx.beginPath(); ctx.rect(P.x - 40, 100, 600, 490 - 100 + 100); ctx.rect(P.x + 100, 100, 600, 490); ctx.clip();
    ctx.drawImage(A, P.x, P.y, P.w, P.h); ctx.restore();
    // pennello: specchiato, inclinato in avanti, con presa sul manico
    ctx.save(); ctx.translate(P.grip[0], P.grip[1] - bob); ctx.rotate(rotAt(q.ph)); ctx.scale(-KB, KB);
    ctx.drawImage(Bi, b.x - b.grip[0], b.y - b.grip[1], b.w, b.h); ctx.restore();
    ctx.restore();
  }

  function frame() {
    if (!running) return;
    const T = fixedT !== null ? fixedT : Math.max(0, Date.now() - t0);
    if (T > lastT) { paint(lastT, Math.min(T, DUR)); lastT = T; }
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(paper, 0, 0);
    drawInk(T);
    const q = state(T);
    if (q.walking && ready >= 6) drawFigure(q, T);
    if (T >= DUR) return stop();
    raf = requestAnimationFrame(frame);
  }

  function setup(startTime) {
    cv = document.getElementById('intro-canvas'); if (!cv) return false;
    const host = cv.parentElement; dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(2, Math.round(host.clientWidth * dpr)); H = Math.max(2, Math.round(host.clientHeight * dpr));
    cv.width = W; cv.height = H; ctx = cv.getContext('2d');
    s = Math.min(0.000452 * H, 0.95 * W / 890);          // avatar ~37% dell'altezza (o 95% della larghezza in verticale)
    paper = paper || document.createElement('canvas'); pctx = paper.getContext('2d');
    buildPaper(); chunks = []; drops = []; lastCh = null; lastT = 0;
    t0 = startTime - 3500 - DUR;                              // finisce 0,5 s prima del "3"
    cv.style.display = 'block'; host.classList.add('intro-on'); running = true;
    clearTimeout(killer); killer = setTimeout(stop, Math.max(0, DUR - (Date.now() - t0)) + 60);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); return true;
  }

  // startTime = istante del VIA; forceT0 solo per i test
  function play(startTime, forceT0) {
    if (!enabled() || ready < 6) return;
    if (Date.now() > startTime - 3500) return;                // arrivato troppo tardi: niente intro
    const go = () => { if (setup(startTime) && forceT0) t0 = forceT0; };
    const fonts = document.fonts && document.fonts.load ? document.fonts.load('700 48px Kalam') : Promise.resolve();
    Promise.race([fonts, new Promise(r => setTimeout(r, 500))]).then(go, go);
  }
  function stop() { running = false; clearTimeout(killer); cancelAnimationFrame(raf); if (cv) { cv.style.display = 'none'; cv.parentElement.classList.remove('intro-on'); if (ctx) ctx.clearRect(0, 0, W, H); } }
  function init() { const c = document.getElementById('intro-canvas'); if (c) c.addEventListener('pointerdown', stop); }
  return { play, stop, init, DUR, freeze: v => { fixedT = v; }, isRunning: () => running };
})();
