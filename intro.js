// Intro: il foglio di carta (come la schermata iniziale) copre la gara; l'avatar con il pennello
// lo "cancella" a pennellate e sotto compare la scena vera con le bici in griglia.
// È solo grafica locale: la fisica e la rete non c'entrano. Un tocco la salta.
const Intro = (() => {
  const avatar = new Image(), brush = new Image();
  let ready = 0;
  const onload = () => { ready++; };
  avatar.onload = onload; brush.onload = onload;
  avatar.src = 'img/avatar.png?v=20261021'; brush.src = 'img/brush.png?v=20261021';

  let cv = null, ctx = null, paper = null, pctx = null, W = 0, H = 0, dpr = 1;
  let raf = 0, t0 = 0, dur = 3000, running = false, lastS = 0, trail = [], k = 1;
  const INK = '#0d1b2a';

  const enabled = () => { try { return localStorage.getItem('dw_intro') !== 'off'; } catch (e) { return true; } };
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);

  // traiettoria del pennello (coordinate normalizzate 0..1): serpentina da sinistra a destra
  function path(s) {
    const x = -0.06 + 1.14 * s;
    const y = 0.56 + 0.27 * Math.sin(s * Math.PI * 2 * 2.1 + 0.4) * (1 - 0.15 * s);
    return { x: x * W, y: y * H };
  }
  const brushW = () => Math.max(H * 0.26, 70 * dpr);

  function buildPaper() {
    paper.width = W; paper.height = H;
    const g = pctx;
    g.fillStyle = '#f6efdc'; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(150,120,70,0.22)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    // cornice a mano
    g.strokeStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(2, 2.2 * dpr);
    const m = 0.035 * Math.min(W, H);
    g.beginPath(); g.moveTo(m, m * 1.2); g.lineTo(W - m * 1.1, m); g.lineTo(W - m, H - m * 1.2); g.lineTo(m * 1.2, H - m); g.closePath(); g.stroke();
    // titolo
    const fs = Math.min(W * 0.115, H * 0.2);
    g.save(); g.translate(W / 2, H * 0.22); g.rotate(-0.025);
    g.font = `700 ${fs}px Kalam, "Comic Sans MS", cursive`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = fs * 0.035; g.strokeStyle = INK; g.fillStyle = INK;
    g.fillText('DOODLE', -fs * 0.05, -fs * 0.42); g.fillText('WHEELS', fs * 0.05, fs * 0.42);
    g.restore();
    // cuoricini e spunte
    const hearts = [[0.1, 0.12], [0.88, 0.1], [0.92, 0.42], [0.06, 0.45], [0.7, 0.62], [0.3, 0.62]];
    hearts.forEach(([x, y], i) => {
      g.save(); g.translate(x * W, y * H); g.rotate((i - 3) * 0.12); g.fillStyle = '#d6262e';
      const r = Math.min(W, H) * 0.018; g.beginPath(); g.moveTo(0, r);
      g.bezierCurveTo(-r * 2, -r * 0.4, -r * 0.6, -r * 1.8, 0, -r * 0.5); g.bezierCurveTo(r * 0.6, -r * 1.8, r * 2, -r * 0.4, 0, r); g.fill(); g.restore();
    });
    g.strokeStyle = '#1f8a5b'; g.lineWidth = Math.max(2, 3 * dpr);
    [[0.2, 0.34], [0.8, 0.3], [0.5, 0.52]].forEach(([x, y]) => {
      const r = Math.min(W, H) * 0.025; g.beginPath(); g.moveTo(x * W - r, y * H); g.lineTo(x * W - r * 0.3, y * H + r * 0.8); g.lineTo(x * W + r, y * H - r * 0.8); g.stroke();
    });
    g.fillStyle = INK; g.textAlign = 'center'; g.font = `400 ${Math.min(W * 0.035, H * 0.055)}px Kalam, cursive`;
    g.fillText('tutti disegnano la propria ruota', W / 2, H * 0.55);
  }

  function erase(s0, s1) {
    const n = Math.max(1, Math.ceil((s1 - s0) / 0.004));
    const bw = brushW();
    pctx.globalCompositeOperation = 'destination-out'; pctx.lineCap = 'round'; pctx.lineJoin = 'round';
    let prev = path(s0);
    for (let i = 1; i <= n; i++) {
      const s = s0 + (s1 - s0) * i / n, p = path(s);
      pctx.lineWidth = bw; pctx.beginPath(); pctx.moveTo(prev.x, prev.y); pctx.lineTo(p.x, p.y); pctx.stroke();
      // setole: righe più sottili che sbordano, per il bordo irregolare
      for (let j = -2; j <= 2; j += 2) {
        pctx.lineWidth = bw * 0.22; const o = j * bw * 0.22 + Math.sin(s * 90 + j) * bw * 0.05;
        pctx.beginPath(); pctx.moveTo(prev.x, prev.y + o); pctx.lineTo(p.x, p.y + o); pctx.stroke();
      }
      trail.push({ x: p.x, y: p.y, px: prev.x, py: prev.y, t: performance.now() });
      prev = p;
    }
    pctx.globalCompositeOperation = 'source-over';
  }

  function frame() {
    if (!running) return;
    const now = Date.now();
    const u = (now - t0) / dur;
    const s = ease(Math.min(1, u / 0.86));
    if (s > lastS) { erase(lastS, s); lastS = s; }
    ctx.clearRect(0, 0, W, H);
    // dopo la fine del tratto il foglio rimasto svanisce
    const fade = u > 0.86 ? 1 - ease((u - 0.86) / 0.14) : 1;
    ctx.globalAlpha = fade; ctx.drawImage(paper, 0, 0); ctx.globalAlpha = 1;
    // scia d'inchiostro che sbiadisce
    const tn = performance.now(), bw = brushW();
    ctx.lineCap = 'round'; ctx.strokeStyle = INK;
    while (trail.length && tn - trail[0].t > 520) trail.shift();
    ctx.lineWidth = bw * 0.9;
    for (const q of trail) {
      const a = 1 - (tn - q.t) / 520; ctx.globalAlpha = 0.9 * a * a * fade;
      ctx.beginPath(); ctx.moveTo(q.px, q.py); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // avatar + pennello
    if (u < 0.97 && ready >= 2) {
      const p = path(s), bl = Math.min(H * 0.5, W * 0.52), bwid = bl * brush.width / brush.height;
      const rot = -0.28 + 0.1 * Math.sin(s * 40);
      const out = ease((u - 0.84) / 0.16);              // alla fine esce dal quadro
      const bob = Math.sin(u * 30) * H * 0.006;
      const ox = -out * W * 0.25, oy = out * H * 0.5;
      ctx.save(); ctx.translate(p.x + ox, p.y + bob + oy); ctx.rotate(rot);
      // la punta del pennello (in basso a sinistra dello sprite) segue il tratto
      const tipX = bwid * 0.04, tipY = bl * 0.96;
      // avatar: la mano alta afferra il manico a metà
      const aw = avatar.width * (bl / 330) * 0.95, ah = avatar.height * (bl / 330) * 0.95;
      ctx.save(); ctx.translate(bwid * 0.35 - tipX, bl * 0.48 - tipY); ctx.rotate(-rot * 0.7);
      ctx.drawImage(avatar, -aw * 0.93, -ah * 0.4, aw, ah); ctx.restore();
      ctx.drawImage(brush, -tipX, -tipY, bwid, bl);
      ctx.restore();
    }
    if (u >= 1) return stop();
    raf = requestAnimationFrame(frame);
  }

  function play(startTime, forceDur) {
    if (!enabled() || ready < 2) return;
    cv = document.getElementById('intro-canvas'); if (!cv) return;
    const host = cv.parentElement; dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(2, Math.round(host.clientWidth * dpr)); H = Math.max(2, Math.round(host.clientHeight * dpr));
    cv.width = W; cv.height = H; ctx = cv.getContext('2d');
    paper = paper || document.createElement('canvas'); pctx = paper.getContext('2d');
    buildPaper(); trail = []; lastS = 0;
    dur = forceDur || Math.min(4200, Math.max(1500, startTime - Date.now() + 300)); t0 = Date.now();
    cv.style.display = 'block'; host.classList.add('intro-on'); running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); if (cv) { cv.style.display = 'none'; cv.parentElement.classList.remove('intro-on'); if (ctx) ctx.clearRect(0, 0, W, H); } }
  function init() { const c = document.getElementById('intro-canvas'); if (c) c.addEventListener('pointerdown', stop); }
  return { play, stop, init, isRunning: () => running };
})();
