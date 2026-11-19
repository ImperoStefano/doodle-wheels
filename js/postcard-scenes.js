// Cartoline scaricabili: ogni volta un'illustrazione DIVERSA, generata a caso a partire da un seme (stesso seme = stessa cartolina, quindi anteprima e PNG coincidono).
// Due soli colori (cielo e inchiostro del mondo), luce dal sole: facce verso il sole chiare, le altre scure. Il caso sceglie: posizione e misura del sole, 2-3 piani di
// elementi del mondo, il modo di disporli (speculare, libero, a onda, in crescita), il ventaglio (ogni elemento ruotato attorno alla base), gli anelli rotanti attorno
// al sole, gli echi sfasati (sdoppiamento), le copie inclinate, il riflesso capovolto appeso al cielo, gli archi concentrici e la forza della dissolvenza.
// La Città al neon ha la sua skyline in stamps.js e non passa di qui.
const PostcardScenes = (() => {
  'use strict';
  const TAU = Math.PI * 2, X0 = 24, Y0 = 24, W = 952, H = 338;
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const p = rgb(a), q = rgb(b); return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const poly = (c, pts, col) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); if (col) { c.fillStyle = col; c.fill(); } };
  const disc = (c, x, y, r, col) => { c.beginPath(); c.arc(x, y, r, 0, TAU); if (col) { c.fillStyle = col; c.fill(); } };
  const rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  // ---- elementi: dk = faccia in ombra (sinistra), lt = faccia illuminata (destra); con la luce da sinistra le due tinte si scambiano ------------
  const E = {
    pine(c, h, dk, lt) { for (const [y0, y1, w] of [[0, .58, .3], [.26, .82, .24], [.54, 1, .17]]) { const m = [0, -h * y0]; poly(c, [[-h * w, -h * y0], [0, -h * y1], m], dk); poly(c, [m, [0, -h * y1], [h * w, -h * y0]], lt); } },
    mush(c, h, dk, lt, spot) {
      const w = h * .17, cy = -h * .62; c.fillStyle = dk; c.fillRect(-w, cy, w, h * .62); c.fillStyle = lt; c.fillRect(0, cy, w, h * .62);
      c.beginPath(); c.ellipse(0, cy, h * .46, h * .38, 0, Math.PI, Math.PI * 1.5); c.lineTo(0, cy); c.closePath(); c.fillStyle = dk; c.fill();
      c.beginPath(); c.ellipse(0, cy, h * .46, h * .38, 0, Math.PI * 1.5, TAU); c.lineTo(0, cy); c.closePath(); c.fillStyle = lt; c.fill();
      for (const [dx, dy, r] of [[-.22, -.8, .055], [.1, -.9, .045], [.24, -.7, .04], [-.06, -.7, .035]]) disc(c, dx * h, dy * h, r * h, spot);
    },
    pyr(c, h, dk, lt) { const w = h * 1.7; poly(c, [[-w / 2, 0], [0, -h], [0, 0]], dk); poly(c, [[0, -h], [w / 2, 0], [0, 0]], lt); },
    volc(c, h, dk, lt, glow) {
      const w = h * 1.5, cw = w * .12; poly(c, [[-w / 2, 0], [-cw, -h], [0, -h], [0, 0]], dk); poly(c, [[0, -h], [cw, -h], [w / 2, 0], [0, 0]], lt);
      if (glow) {
        const g = c.createRadialGradient(0, -h, 0, 0, -h, w * .5); g.addColorStop(0, glow); g.addColorStop(1, 'rgba(255,245,220,0)'); c.fillStyle = g; c.fillRect(-w * .5, -h - w * .5, w, w * .6);
        c.strokeStyle = glow; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const k of [-1, 1]) { c.beginPath(); c.moveTo(k * cw * .5, -h + 4); c.lineTo(k * (cw + w * .06), -h * .6); c.lineTo(k * (cw + w * .03), -h * .32); c.lineTo(k * (cw + w * .14), -4); c.stroke(); }
      }
    },
    crag(c, h, dk, lt) { const w = h * 1.1; poly(c, [[-w / 2, 0], [-w * .25, -h * .6], [-w * .1, -h * .35], [0, -h], [0, 0]], dk); poly(c, [[0, -h], [w * .15, -h * .45], [w * .3, -h * .7], [w / 2, 0], [0, 0]], lt); },
    tower(c, h, dk, lt, win) {
      const w = 44; c.fillStyle = dk; c.fillRect(-w / 2, -h, w / 2, h); c.fillStyle = lt; c.fillRect(0, -h, w / 2, h);
      c.beginPath(); c.arc(0, -h, w / 2, Math.PI, Math.PI * 1.5); c.lineTo(0, -h); c.fillStyle = dk; c.fill(); c.beginPath(); c.arc(0, -h, w / 2, Math.PI * 1.5, TAU); c.lineTo(0, -h); c.fillStyle = lt; c.fill();
      c.fillStyle = lt; c.fillRect(-1.8, -h - w / 2 - 16, 3.6, 16);
      if (win) { c.fillStyle = win; for (let i = 0; i < 3; i++) c.fillRect(-w * .3, -h + 14 + i * 14, w * .6, 3); }
    },
    spire(c, h, dk, lt) { poly(c, [[-11, 0], [-8, -h], [0, -h], [0, 0]], dk); poly(c, [[0, 0], [0, -h], [8, -h], [11, 0]], lt); poly(c, [[-8, -h], [0, -h - 40], [0, -h]], dk); poly(c, [[0, -h], [0, -h - 40], [8, -h]], lt); },
    arch(c, h, dk, lt) {
      const w = h * .9, ch = h * .66; for (const k of [-1, 1]) { c.fillStyle = dk; c.fillRect(k * w * .36 - 9, -ch, 9, ch); c.fillStyle = lt; c.fillRect(k * w * .36, -ch, 9, ch); }
      c.lineWidth = w * .13; c.strokeStyle = dk; c.beginPath(); c.arc(0, -ch, w * .36, Math.PI, Math.PI * 1.5); c.stroke(); c.strokeStyle = lt; c.beginPath(); c.arc(0, -ch, w * .36, Math.PI * 1.5, TAU); c.stroke();
    },
    obelisk(c, h, dk, lt) { const w = 36; poly(c, [[-w / 2, 0], [-w * .3, -h], [0, -h], [0, 0]], dk); poly(c, [[0, 0], [0, -h], [w * .3, -h], [w / 2, 0]], lt); poly(c, [[-w * .3, -h], [0, -h - w * .9], [0, -h]], dk); poly(c, [[0, -h], [0, -h - w * .9], [w * .3, -h]], lt); },
    crystal(c, h, dk, lt) { const w = h * .5; poly(c, [[-w / 2, 0], [-w * .3, -h * .7], [0, -h], [0, 0]], dk); poly(c, [[0, -h], [w * .3, -h * .7], [w / 2, 0], [0, 0]], lt); },
    hill(c, h, dk, lt) { const w = h * 3; c.beginPath(); c.ellipse(0, 0, w / 2, h, 0, Math.PI, Math.PI * 1.5); c.lineTo(0, 0); c.closePath(); c.fillStyle = dk; c.fill(); c.beginPath(); c.ellipse(0, 0, w / 2, h, 0, Math.PI * 1.5, TAU); c.lineTo(0, 0); c.closePath(); c.fillStyle = lt; c.fill(); },
    palm(c, h, dk, lt, lean) {
      c.save(); c.lineCap = 'round'; c.strokeStyle = dk; c.lineWidth = Math.max(6, h * .06); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(lean * .15, -h * .6, lean, -h); c.stroke();
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + (i + .5) * Math.PI / 7, L = h * (.46 + (i % 3) * .06), ex = lean + Math.cos(a) * L, ey = -h + Math.sin(a) * L * .75 + L * .38;
        c.strokeStyle = a > -Math.PI / 2 ? lt : dk; c.lineWidth = Math.max(6, h * .055); c.beginPath(); c.moveTo(lean, -h); c.quadraticCurveTo(lean + Math.cos(a) * L * .6, -h + Math.sin(a) * L * .9 - L * .12, ex, ey); c.stroke();
      }
      c.restore();
    },
  };
  // per ogni mondo: gli elementi possibili [tipo, peso, altezza min, altezza max]
  const POOL = {
    classic: [['pine', 3, 110, 210], ['hill', 1, 40, 90]],
    enchanted: [['mush', 3, 110, 220], ['crystal', 1, 90, 200]],
    egypt: [['pyr', 3, 70, 200], ['obelisk', 1, 90, 170], ['palm', 1, 90, 150]],
    inferno: [['volc', 2, 80, 150], ['crag', 2, 50, 120]],
    atlantis: [['tower', 3, 90, 210], ['spire', 1, 110, 220], ['arch', 1, 80, 150]],
    paradise: [['palm', 3, 110, 210], ['hill', 1, 40, 90]],
  };
  const MOTIFS = ['pine', 'tri', 'leaf', 'drop', 'ring', 'petal', 'diamond'];
  const pickW = (r, list) => { let t = list.reduce((s, e) => s + e[1], 0) * r(); for (const e of list) if ((t -= e[1]) <= 0) return e; return list[0]; };

  // ---- il piano di una cartolina: tutte le scelte casuali ----------------------------------------------------------------------------------------
  function plan(world, seed) {
    if (!POOL[world]) return null;
    const r = rng(seed >>> 0), pick = a => a[Math.floor(r() * a.length)];
    const sun = pick([{x: 787, y: 122}, {x: 213, y: 116}, {x: 500, y: 100}, {x: 650, y: 150}, {x: 350, y: 138}, {x: 860, y: 96}]); sun.r = 50 + Math.round(r() * 22);
    const layers = r() < .5 ? 3 : 2;
    return {
      seed, r, sun, flip: sun.x < 500,                              // flip: sole a sinistra, quindi le facce chiare sono quelle a sinistra
      mode: pick(['mirror', 'free', 'wave', 'rise']), layers,
      fan: r() < .38 ? .1 + r() * .22 : 0,                          // ventaglio: ogni elemento ruota attorno alla sua base
      rings: 2 + Math.floor(r() * 4), motif: pick(MOTIFS), spin: r() * TAU,
      echoes: Math.floor(r() * 4), echoDir: r() < .5 ? -1 : 1, tilt: r() < .7 ? .02 + r() * .06 : 0,
      mirror: r() < .72 ? .08 + r() * .16 : 0, fade: .1 + r() * .28, vignette: r() < .7,
      arcs: world === 'paradise' ? r() < .85 : r() < .3, arcX: 200 + r() * 600, density: .8 + r() * .5,
      kinds: Array.from({length: layers}, () => pickW(r, POOL[world])),
      second: Array.from({length: layers}, () => r() < .3 ? pickW(r, POOL[world]) : null),
    };
  }

  function layout(p, li, kind, second) {
    const r = p.r, n = Math.round((li === 0 ? 8 : 7) * p.density + r() * 3), items = [];
    const make = (x, k) => { const e = k, h = e[2] + (e[3] - e[2]) * r(); items.push({x, k: e[0], h}); };
    const kk = () => (second && r() < .35) ? second : kind;
    if (p.mode === 'mirror') {
      for (let i = 0, dx = 0; i < Math.ceil(n / 2); i++, dx += 60 + r() * 70) { const e = kk(), h = e[2] + (e[3] - e[2]) * r() * (i ? 1 : .6 + .4 * 1); const hh = i ? h : e[3]; items.push({x: 500 + dx, k: e[0], h: hh}); if (dx) items.push({x: 500 - dx, k: e[0], h: hh}); }
    } else {
      const step = 952 / n; for (let i = 0; i < n; i++) make(X0 + step * (i + .5) + (r() - .5) * step * .6, kk());
      if (p.mode === 'wave') { const ph = r() * TAU, f = 1.5 + r() * 2.5; for (const it of items) it.h *= .55 + .45 * (Math.sin((it.x - X0) / 952 * TAU * f + ph) * .5 + .5) * 1.3; }
      if (p.mode === 'rise') for (const it of items) { const t = (it.x - X0) / 952; it.h *= .45 + .85 * (p.sun.x > 500 ? t : 1 - t); }
    }
    return items;
  }
  function drawItem(c, it, x, b, dk, lt, sky, far, p) {
    const flip = p.flip, a = dk, d = lt; c.save(); c.translate(x, b);
    if (p.fan) c.rotate((x - 500) / 500 * p.fan);
    const D = flip ? d : a, L = flip ? a : d, k = it.k, h = it.h;
    if (k === 'mush') E.mush(c, h, D, L, mix(sky, '#ffffff', .6));
    else if (k === 'volc') E.volc(c, h, D, L, far ? null : mix(sky, '#ffffff', .45));
    else if (k === 'tower') E.tower(c, h, D, L, far ? null : mix(sky, '#ffffff', .5));
    else if (k === 'palm') E.palm(c, h, D, L, (x < 500 ? 1 : -1) * h * .18);
    else E[k](c, h, D, L);
    c.restore();
  }
  function skyline(c, p, ink, sky, b) {
    const tones = p.layers === 3 ? [[.66, .82], [.42, .64], [.22, .5]] : [[.62, .8], [.22, .5]];
    for (let li = 0; li < p.layers; li++) {
      const far = li < p.layers - 1, [td, tl] = tones[li], dk = mix(ink, sky, td), lt = mix(ink, sky, tl), sc = p.layers === 3 ? [.6, .8, 1][li] : [.65, 1][li];
      for (const it of layout(p, li, p.kinds[li], p.second[li])) { const m = {k: it.k, h: it.h * sc}; drawItem(c, m, it.x + (li * 23 % 40) * (li < p.layers - 1 ? 1 : 0), b + 5 + li * 9, dk, lt, sky, far, p); }
    }
  }
  const layerCanvas = () => { const L = document.createElement('canvas'); L.width = W; L.height = H; return L; };

  function motif(c, kind, s, col) {
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2.4; c.beginPath();
    if (kind === 'pine') { c.moveTo(0, -s); c.lineTo(s * .55, s * .5); c.lineTo(-s * .55, s * .5); }
    else if (kind === 'tri') { c.moveTo(0, -s); c.lineTo(s * .8, s * .6); c.lineTo(-s * .8, s * .6); }
    else if (kind === 'leaf' || kind === 'petal') { c.moveTo(0, -s); c.quadraticCurveTo(s * .8, -s * .1, 0, s * .7); c.quadraticCurveTo(-s * .8, -s * .1, 0, -s); }
    else if (kind === 'drop') { c.moveTo(0, -s); c.quadraticCurveTo(s * .9, s * .2, 0, s * .8); c.quadraticCurveTo(-s * .9, s * .2, 0, -s); }
    else if (kind === 'diamond') { c.moveTo(0, -s); c.lineTo(s * .55, 0); c.lineTo(0, s); c.lineTo(-s * .55, 0); }
    else if (kind === 'ring') { c.arc(0, 0, s * .6, 0, TAU); c.stroke(); return; }
    c.closePath(); c.fill();
  }
  function back(c, ink, sky, world, p) {
    const S = p.sun, hl = mix(sky, '#ffffff', .55), g = c.createRadialGradient(S.x, S.y, S.r, S.x, S.y, 270); g.addColorStop(0, hl + 'cc'); g.addColorStop(1, hl + '00'); c.fillStyle = g; c.fillRect(S.x - 270, S.y - 270, 540, 540);
    if (p.arcs) { c.save(); c.lineWidth = 14; for (let i = 0; i < 6; i++) { c.globalAlpha = .5; c.strokeStyle = mix(ink, sky, .22 + i * .1); c.beginPath(); c.arc(p.arcX, 430, 350 - i * 13.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); } c.restore(); }
    const rings = [[S.r + 40, 12, 15, .34], [S.r + 88, 18, 20, .26], [S.r + 143, 24, 25, .18], [S.r + 203, 30, 30, .1], [S.r + 270, 36, 34, .06]].slice(0, p.rings);
    rings.forEach(([rad, n, sz, a], j) => { c.save(); c.globalAlpha = a; for (let i = 0; i < n; i++) { const an = (i + (j % 2) * .5) * TAU / n + p.spin * (j % 2 ? 1 : -1) * .1; c.save(); c.translate(S.x + Math.cos(an) * rad, S.y + Math.sin(an) * rad); c.rotate(an + Math.PI / 2); motif(c, p.motif, sz, mix(ink, sky, .35)); c.restore(); } c.restore(); });
    c.save(); c.strokeStyle = mix(ink, sky, .5); c.lineWidth = 2; for (const [r, a] of [[S.r + 14, .5], [S.r + 30, .3]]) { c.globalAlpha = a; disc(c, S.x, S.y, r); c.stroke(); } c.restore();
  }
  function mid(c, ink, sky, world, base, p) {
    const b = base || 318, L = layerCanvas(), lc = L.getContext('2d'); lc.translate(-X0, -Y0);
    skyline(lc, p, ink, sky, b + 10);
    lc.globalCompositeOperation = 'destination-out';   // dissolvenza: le cime svaniscono nel cielo
    const f = lc.createLinearGradient(0, b - 250, 0, b - 110); f.addColorStop(0, `rgba(0,0,0,${p.fade})`); f.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = f; lc.fillRect(X0, Y0, W, H);
    lc.globalCompositeOperation = 'source-over';
    if (p.mirror) {   // riflesso capovolto appeso al bordo alto, che sfuma
      const M = layerCanvas(), mc = M.getContext('2d'); mc.translate(0, .5 * H); mc.scale(1, -.5); mc.drawImage(L, 0, 0); mc.setTransform(1, 0, 0, 1, 0, 0);
      mc.globalCompositeOperation = 'destination-in'; const mf = mc.createLinearGradient(0, 0, 0, 175); mf.addColorStop(0, 'rgba(0,0,0,1)'); mf.addColorStop(1, 'rgba(0,0,0,0)'); mc.fillStyle = mf; mc.fillRect(0, 0, W, H);
      c.save(); c.globalAlpha = p.mirror; c.drawImage(M, X0, Y0); c.restore();
    }
    for (let i = p.echoes; i >= 1; i--) { c.save(); c.globalAlpha = .2 / i * 1.6; c.drawImage(L, X0 + p.echoDir * 13 * i, Y0 - 8 * i); c.restore(); }   // sdoppiamento
    if (p.tilt) for (const s of [1, -1]) { c.save(); c.translate(500, b + 18); c.rotate(s * p.tilt); c.translate(-500, -(b + 18)); c.globalAlpha = s > 0 ? .13 : .1; c.drawImage(L, X0, Y0); c.restore(); }
    c.drawImage(L, X0, Y0);
    if (p.vignette) { const v = c.createRadialGradient(500, 190, 150, 500, 190, 560); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, mix(ink, sky, .2) + '30'); c.fillStyle = v; c.fillRect(X0, Y0, W, H); }
  }

  const hexOk = h => /^#[0-9a-f]{6}$/i.test(h);
  function run(part, c, p, world, sky, ink, base) {
    if (!p || !hexOk(sky) || !hexOk(ink)) return false;
    c.save(); try { (part === 'back' ? back : mid)(c, ink, sky, world, part === 'back' ? p : base, p); } catch (e) { console.warn('postcard scene', world, e); } c.restore(); return true;
  }
  return {plan, back: (c, p, w, sky, ink) => run('back', c, p, w, sky, ink), mid: (c, p, w, sky, ink, base) => run('mid', c, p, w, sky, ink, base)};
})();
