/*
 * Scenery — lo scenario che cambia lungo la pista.
 *
 * 7 biomi (uno per tipo di zona), un sole che attraversa il cielo dall'alba al tramonto lungo
 * la gara, montagne a 4 livelli di profondità con alberi, nuvole, uccelli, particelle (neve,
 * foglie, lucciole…), terreno a strati, acqua trasparente davanti alle bici.
 *
 * Tutto è "disegnato a mano" con il canvas, nessuna immagine da caricare. Per restare fluido:
 *  - gli sprite (alberi, nuvole, sole) sono pre-disegnati UNA volta su canvas fuori schermo;
 *  - ogni fotogramma disegna solo ciò che è visibile, con poche chiamate "a lotto" (un solo
 *    Path2D per tipo di dettaglio);
 *  - nessun array nuovo per fotogramma nel percorso caldo;
 *  - setQuality(0..2) toglie in fretta le parti costose se il dispositivo fatica.
 *
 * Il modulo non conosce la fisica: legge solo Terrain (zone, altezze) e disegna.
 */
const Scenery = (() => {
  'use strict';

  // ---------- utilità ------------------------------------------------------------------------
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const rgb = c => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const fract = v => v - Math.floor(v);
  const rnd = (a, b = 0, c = 0) => fract(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);
  const TAU = Math.PI * 2;

  // ---------- biomi --------------------------------------------------------------------------
  // flora: [[tipo, peso], …] degli alberi/arbusti sulle creste più vicine
  const FL = { ROUND: 0, PINE: 1, SNOWPINE: 2, CACTUS: 3, BUSH: 4, PALM: 5, AUTUMN: 6 };
  const BIOME_DEFS = [
    { name: 'Prato fiorito', skyT: '#69b9f0', skyB: '#d6f1ff', ridge: ['#cfe3f5', '#b0ddca', '#88cd97', '#5fb870'], shape: [1, 0, 0], amp: 0.9, snow: 0,
      flora: [[FL.ROUND, 5], [FL.BUSH, 3], [FL.PINE, 1]], dens: 0.8, soil: '#8b5a2b', surf: '#3fc060', fg: 0, part: 'meadow' },
    { name: 'Colline', skyT: '#5eaeea', skyB: '#d2eeff', ridge: ['#c8dff2', '#a9d3b6', '#8cc77c', '#6db55a'], shape: [0.75, 0.25, 0], amp: 1.1, snow: 0,
      flora: [[FL.ROUND, 4], [FL.PINE, 4], [FL.BUSH, 2]], dens: 0.85, soil: '#8a5a2a', surf: '#4cbc4f', fg: 0, part: 'meadow' },
    { name: 'Ghiacciaio', skyT: '#7ec8ee', skyB: '#eaf8ff', ridge: ['#e2f2fb', '#c8e5f4', '#abd5ea', '#8fc4df'], shape: [0.05, 0.95, 0], amp: 1.5, snow: 1,
      flora: [[FL.SNOWPINE, 6], [FL.BUSH, 1]], dens: 0.7, soil: '#a9cfe3', surf: '#f1fbff', fg: 2, part: 'snow' },
    { name: 'Canyon', skyT: '#72b6e6', skyB: '#fbe3c4', ridge: ['#f2d6b8', '#e3b58e', '#cc9066', '#b0714a'], shape: [0, 0.15, 0.85], amp: 1.05, snow: 0,
      flora: [[FL.CACTUS, 5], [FL.BUSH, 3]], dens: 0.55, soil: '#b87442', surf: '#d6b48a', fg: 3, part: 'dust' },
    { name: 'Laguna', skyT: '#55c0e6', skyB: '#d4f6f0', ridge: ['#cdebf0', '#a6dad6', '#7fc9bd', '#57b7a2'], shape: [0.9, 0.1, 0], amp: 0.7, snow: 0,
      flora: [[FL.PALM, 6], [FL.BUSH, 3]], dens: 0.75, soil: '#8a6a44', surf: '#e6d095', fg: 4, part: 'lagoon', water: '#2eb5d6' },
    { name: 'Bosco d\'autunno', skyT: '#86bfe8', skyB: '#ffe6b8', ridge: ['#f4dcb9', '#eab97b', '#d9914a', '#bc6c2c'], shape: [0.85, 0.15, 0], amp: 1.0, snow: 0,
      flora: [[FL.AUTUMN, 7], [FL.PINE, 1], [FL.BUSH, 2]], dens: 0.95, soil: '#7c4b25', surf: '#dc8a2c', fg: 5, part: 'leaves' },
    { name: 'Traguardo!', skyT: '#66bff7', skyB: '#ffe4f2', ridge: ['#d6e5f8', '#bfe0e0', '#98d6a4', '#6cc27c'], shape: [1, 0, 0], amp: 0.8, snow: 0,
      flora: [[FL.ROUND, 5], [FL.BUSH, 3]], dens: 0.7, soil: '#8b5a2b', surf: '#3fc060', fg: 0, part: 'confetti' },
  ];
  const ZONE_TO_BIOME = { start: 0, hills: 1, ice: 2, gravel: 3, water: 4, ramps: 5, finish: 6 };
  const BIOMES = BIOME_DEFS.map(b => ({
    name: b.name, skyT: hex(b.skyT), skyB: hex(b.skyB), ridge: b.ridge.map(hex),
    wR: b.shape[0], wP: b.shape[1], wM: b.shape[2], amp: b.amp, snow: b.snow,
    flora: b.flora, dens: b.dens, soil: hex(b.soil), surf: hex(b.surf), fg: b.fg, part: b.part,
    water: hex(b.water || '#2eb5d6'),
  }));
  // cumulativi per scegliere il tipo di pianta in modo deterministico da un numero 0..1
  BIOMES.forEach(b => { let tot = 0; b.floraCum = b.flora.map(f => (tot += f[1])); b.floraTot = tot; });
  const floraPick = (b, r) => { const x = r * b.floraTot; for (let i = 0; i < b.floraCum.length; i++) if (x < b.floraCum[i]) return b.flora[i][0]; return b.flora[0][0]; };

  const DUSK_T = hex('#4b4ea6'), DUSK_B = hex('#ffa070'), NIGHT_T = hex('#0e1a52'), NIGHT_B = hex('#37306f');
  const HAZE = hex('#cfe6f7');
  const SB = 900;   // larghezza (px) della sfumatura fra due biomi

  // ---------- stato -------------------------------------------------------------------------
  const Z = [];                 // [{start,end,biome,key}]
  let finishX = 12000;
  let dpr = 1, viewScale = 1, pr = 1;     // pr = risoluzione degli sprite
  let quality = 0;
  const S = {
    p: 0, e: 0.5, warm: 0, night: 0, day: 1, starA: 0,
    sunX: 0, sunY: 0, sunR: 40,
    A: BIOMES[0], B: BIOMES[0], t: 0, ia: 0, ib: 0, zi: 0, zi0: 0,
    camX: 0, w: 800, h: 600, gy: 480, hs: 1, now: 0, dt: 0.016,
    skyT: [0, 0, 0], skyB: [0, 0, 0],
    bannerT: -10, bannerName: '', lastZone: -1,
  };
  const RP = [0, 1, 2, 3].map(() => ({ A: 0, off: 0, f1: 1, f2: 1, f3: 1, p1: 0, p2: 0, p3: 0, wR: 1, wP: 0, wM: 0, col: [0, 0, 0], colB: [0, 0, 0], y0: 0 }));
  const LAYER = [
    { speed: 0.035, off: 215, amp: 92, f1: 540, f2: 215, f3: 88, p1: 0.4, p2: 1.9, p3: 3.1, spacing: 0, fog: 0.62, size: 0 },
    { speed: 0.085, off: 150, amp: 100, f1: 390, f2: 150, f3: 62, p1: 2.2, p2: 0.7, p3: 5.0, spacing: 118, fog: 0.42, size: 0.5 },
    { speed: 0.16,  off: 98,  amp: 72, f1: 270, f2: 108, f3: 48, p1: 4.1, p2: 2.8, p3: 1.3, spacing: 84, fog: 0.22, size: 0.78 },
    { speed: 0.27,  off: 52,  amp: 54, f1: 195, f2: 80,  f3: 36, p1: 1.1, p2: 5.2, p3: 2.4, spacing: 64, fog: 0, size: 1.05 },
  ];

  // ---------- sprite pre-disegnati ------------------------------------------------------------
  const atlas = { trees: null, sunRays: null, sunHappy: null, sunSleepy: null, glow: null, clouds: [], cloudsWarm: [], fg: [] };
  let dirty = true, bakedPr = 0;

  function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * pr)); c.height = Math.max(1, Math.ceil(h * pr)); const g = c.getContext('2d'); g.scale(pr, pr); return { c, g, w, h }; }

  // ---- alberi: base in (0,0), alti fino a ~-105; colori mescolati verso la foschia per distanza
  const TREE_W = 96, TREE_H = 128;
  function bakeTree(kind, fog, variant) {
    const cv = mkCanvas(TREE_W, TREE_H), g = cv.g;
    g.translate(TREE_W / 2, TREE_H - 3);
    const T = c => rgb(mix(hex(c), HAZE, fog));
    const circ = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    const trunk = (w, h, col = '#6b4426') => { g.fillStyle = T(col); g.fillRect(-w / 2, -h, w, h); };
    if (kind === FL.ROUND || kind === FL.AUTUMN) {
      const pal = kind === FL.ROUND
        ? (variant ? ['#3f9d52', '#58b565', '#2e7f43'] : ['#4aa85a', '#68c070', '#35904a'])
        : (variant ? ['#e2792a', '#f3a23b', '#b8461d'] : ['#d9531f', '#f08a2a', '#ffc247']);
      trunk(8, 36);
      const lobes = [[0, -66, 27], [-20, -50, 20], [20, -50, 20], [-6, -86, 18], [14, -76, 16]];
      lobes.forEach(([x, y, r]) => circ(x, y, r, T(pal[0])));
      circ(-8, -74, 14, T(pal[1]));  circ(-18, -54, 10, T(pal[1]));  circ(8, -90, 9, T(pal[1]));
      g.fillStyle = T(pal[2]); g.globalAlpha = 0.5; g.beginPath(); g.arc(14, -44, 17, -0.3, 2.2); g.arc(4, -52, 24, 2.2, -0.3, true); g.fill(); g.globalAlpha = 1;
    } else if (kind === FL.PINE || kind === FL.SNOWPINE) {
      const snow = kind === FL.SNOWPINE;
      trunk(8, 22);
      const tiers = [[0, -20, 36, 38], [0, -42, 30, 36], [0, -64, 23, 34], [0, -84, 15, 30]];
      tiers.forEach(([x, y, hw, hgt], i) => {
        g.fillStyle = T(snow ? (variant ? '#2f6b57' : '#2a6350') : (variant ? '#2d7a43' : '#256b3a'));
        g.beginPath(); g.moveTo(-hw, y); g.lineTo(0, y - hgt); g.lineTo(hw, y); g.closePath(); g.fill();
        g.fillStyle = T(snow ? '#3d8068' : '#3a9254'); g.beginPath(); g.moveTo(-hw, y); g.lineTo(0, y - hgt); g.lineTo(-hw * 0.2, y); g.closePath(); g.fill();
        if (snow) { g.fillStyle = T('#ffffff'); g.beginPath(); g.moveTo(-hw * 0.62, y - hgt * 0.38); g.lineTo(0, y - hgt); g.lineTo(hw * 0.62, y - hgt * 0.38); g.lineTo(hw * 0.3, y - hgt * 0.3); g.lineTo(0, y - hgt * 0.5); g.lineTo(-hw * 0.3, y - hgt * 0.3); g.closePath(); g.fill(); }
      });
    } else if (kind === FL.CACTUS) {
      const col = T(variant ? '#5aa05c' : '#4f9a56'), hi = T('#7bc17a');
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      const arm = (sx, up, dir) => { g.lineWidth = 9; g.beginPath(); g.moveTo(0, sx); g.lineTo(dir * 15, sx); g.lineTo(dir * 15, sx - up); g.stroke(); };
      g.lineWidth = 15; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -74); g.stroke();
      arm(-30, 26, -1); arm(-44, 20, 1);
      g.strokeStyle = hi; g.lineWidth = 3; g.beginPath(); g.moveTo(-3, -6); g.lineTo(-3, -66); g.stroke();
      circ(0, -78, 5, T('#f472b6')); circ(0, -78, 2, T('#fde047'));
    } else if (kind === FL.BUSH) {
      const pal = variant ? ['#4aa05a', '#69bd6f', '#2f7d45'] : ['#55ad5e', '#78c97b', '#378a4a'];
      [[-17, -13, 14], [0, -20, 19], [17, -13, 14], [-6, -12, 15], [9, -10, 14]].forEach(([x, y, r]) => circ(x, y, r, T(pal[0])));
      circ(-6, -26, 10, T(pal[1])); circ(-18, -17, 7, T(pal[1]));
      circ(9, -26, 2.4, T('#fb7185')); circ(-12, -14, 2.2, T('#fde047')); circ(18, -14, 2.2, T('#fb7185'));
    } else if (kind === FL.PALM) {
      g.strokeStyle = T('#8a5f35'); g.lineCap = 'round'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -50, (variant ? -8 : 6), -88); g.stroke();
      g.strokeStyle = T('#6b4526'); g.lineWidth = 2;
      for (let y = -12; y > -80; y -= 12) { g.beginPath(); g.moveTo(-4, y); g.lineTo(5, y - 2); g.stroke(); }
      const tx = variant ? -8 : 6, ty = -88;
      g.fillStyle = T('#3aa163');
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.95 + i * (Math.PI * 0.9 / 6);
        g.save(); g.translate(tx, ty); g.rotate(a);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(22, -16, 44, 4); g.quadraticCurveTo(22, -6, 0, 3); g.closePath(); g.fill(); g.restore();
      }
      circ(tx - 2, ty + 3, 3.6, T('#7a4a22')); circ(tx + 4, ty + 4, 3.6, T('#7a4a22'));
    }
    return cv.c;
  }

  // ---- sole "da bambino": raggi (ruotano) + disco con faccina
  function bakeSun() {
    const R = 100, S2 = R * 2.1;
    const rays = mkCanvas(S2 * 2, S2 * 2), g = rays.g; g.translate(S2, S2);
    g.strokeStyle = '#f59e0b'; g.lineCap = 'round'; g.lineWidth = 9;
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, len = i % 2 ? 26 : 46;
      g.beginPath(); g.moveTo(Math.cos(a) * (R + 12), Math.sin(a) * (R + 12)); g.lineTo(Math.cos(a) * (R + 12 + len), Math.sin(a) * (R + 12 + len)); g.stroke();
    }
    atlas.sunRays = rays.c;
    const face = sleepy => {
      const cv = mkCanvas(R * 2 + 24, R * 2 + 24), c = cv.g; c.translate(R + 12, R + 12);
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fillStyle = '#fde047'; c.fill();
      const gr = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fill();
      c.lineWidth = 8; c.strokeStyle = '#f59e0b'; c.stroke();
      c.fillStyle = '#92400e'; c.strokeStyle = '#92400e'; c.lineCap = 'round'; c.lineWidth = 7;
      if (!sleepy) {
        c.beginPath(); c.arc(-R * 0.3, -R * 0.1, R * 0.09, 0, TAU); c.fill();
        c.beginPath(); c.arc(R * 0.3, -R * 0.1, R * 0.09, 0, TAU); c.fill();
        c.beginPath(); c.arc(0, R * 0.02, R * 0.36, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      } else {
        c.lineWidth = 6;
        c.beginPath(); c.arc(-R * 0.3, -R * 0.08, R * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.beginPath(); c.arc(R * 0.3, -R * 0.08, R * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.beginPath(); c.ellipse(0, R * 0.34, R * 0.1, R * 0.07, 0, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(251,113,133,0.55)';
      c.beginPath(); c.ellipse(-R * 0.52, R * 0.18, R * 0.13, R * 0.08, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(R * 0.52, R * 0.18, R * 0.13, R * 0.08, 0, 0, TAU); c.fill();
      return cv.c;
    };
    atlas.sunHappy = face(false); atlas.sunSleepy = face(true);
    const gl = mkCanvas(300, 300), gg = gl.g, grd = gg.createRadialGradient(150, 150, 8, 150, 150, 150);
    grd.addColorStop(0, 'rgba(255,236,160,0.62)'); grd.addColorStop(0.45, 'rgba(255,214,120,0.22)'); grd.addColorStop(1, 'rgba(255,200,100,0)');
    gg.fillStyle = grd; gg.fillRect(0, 0, 300, 300); atlas.glow = gl.c;
  }

  // ---- nuvole gonfie (4 forme), bianche e rosate per l'alba/tramonto
  const CLOUD_SHAPES = [
    [[0, 8, 22], [22, -6, 30], [50, 2, 26], [72, 12, 18], [38, 16, 22], [12, 18, 16]],
    [[0, 10, 18], [18, -4, 26], [44, -12, 30], [72, -2, 24], [92, 12, 18], [50, 14, 24]],
    [[0, 6, 16], [20, 0, 22], [42, 8, 18]],
    [[0, 12, 20], [24, -2, 28], [52, -10, 26], [78, 2, 22], [58, 16, 20], [26, 18, 18]],
  ];
  function bakeClouds() {
    atlas.clouds = []; atlas.cloudsWarm = [];
    [['#ffffff', atlas.clouds], ['#ffc6a6', atlas.cloudsWarm]].forEach(([col, out]) => {
      CLOUD_SHAPES.forEach(shape => {
        const cv = mkCanvas(150, 90), g = cv.g;
        g.translate(30, 44);
        g.fillStyle = 'rgba(120,150,190,0.30)';          // ombra morbida sotto
        g.beginPath(); shape.forEach(([x, y, r]) => { g.moveTo(x + r, y + 7); g.arc(x, y + 7, r, 0, TAU); }); g.fill();
        g.fillStyle = col;
        g.beginPath(); shape.forEach(([x, y, r]) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }); g.fill();
        out.push(cv.c);
      });
    });
  }

  // ---- bordo di primo piano: strisce di erba/canne/rocce/cristalli che scorrono più veloci del terreno
  const FG_W = 1100, FG_H = 120;
  function bakeForeground(kind) {
    const cv = mkCanvas(FG_W, FG_H), g = cv.g;
    g.translate(0, FG_H);
    const blade = (x, h, w, lean, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x - w, 4); g.quadraticCurveTo(x - w * 0.3, -h * 0.6, x + lean, -h); g.quadraticCurveTo(x + w * 0.3, -h * 0.5, x + w, 4); g.closePath(); g.fill(); };
    const n = 150;
    if (kind === 0 || kind === 5) {
      const cols = kind === 0 ? ['#1f8a45', '#2aa556', '#177a3c', '#36b866'] : ['#b8651c', '#d98a2c', '#8f4a14', '#e8a43a'];
      for (let i = 0; i < n; i++) { const x = rnd(i, 1) * FG_W; blade(x, 26 + rnd(i, 2) * 52, 3 + rnd(i, 3) * 3, (rnd(i, 4) - 0.5) * 22, cols[i % cols.length]); }
      if (kind === 0) {
        for (let i = 0; i < 9; i++) {         // margherite di primo piano
          const x = (i + 0.3 + rnd(i, 7) * 0.4) / 9 * FG_W, h = 44 + rnd(i, 8) * 34;
          g.strokeStyle = '#1f8a45'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 2); g.quadraticCurveTo(x + 6, -h * 0.5, x + 2, -h); g.stroke();
          g.fillStyle = '#ffffff'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.ellipse(x + 2 + Math.cos(a) * 9, -h + Math.sin(a) * 9, 6.5, 3.2, a, 0, TAU); g.fill(); }
          g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(x + 2, -h, 5, 0, TAU); g.fill();
        }
      } else {
        for (let i = 0; i < 18; i++) { const x = rnd(i, 11) * FG_W, y = -rnd(i, 12) * 26 + 2; g.fillStyle = ['#d9531f', '#f08a2a', '#ffc247', '#b8461d'][i % 4]; g.save(); g.translate(x, y); g.rotate(rnd(i, 13) * TAU); g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, TAU); g.fill(); g.restore(); }
      }
    } else if (kind === 2) {
      for (let i = 0; i < 46; i++) {
        const x = rnd(i, 21) * FG_W, h = 22 + rnd(i, 22) * 62, w = 6 + rnd(i, 23) * 9;
        g.fillStyle = i % 3 ? 'rgba(190,232,255,0.92)' : 'rgba(150,210,250,0.92)';
        g.beginPath(); g.moveTo(x - w, 4); g.lineTo(x - w * 0.5, -h * 0.7); g.lineTo(x, -h); g.lineTo(x + w * 0.5, -h * 0.65); g.lineTo(x + w, 4); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.moveTo(x - w * 0.5, 0); g.lineTo(x - w * 0.3, -h * 0.65); g.lineTo(x, -h); g.lineTo(x - w * 0.1, -h * 0.2); g.closePath(); g.fill();
      }
      for (let i = 0; i < 24; i++) { const x = rnd(i, 25) * FG_W; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, 2, 30 + rnd(i, 26) * 30, 10 + rnd(i, 27) * 8, 0, Math.PI, TAU); g.fill(); }
    } else if (kind === 3) {
      for (let i = 0; i < 110; i++) { const x = rnd(i, 31) * FG_W; blade(x, 18 + rnd(i, 32) * 40, 2.5 + rnd(i, 33) * 2.5, (rnd(i, 34) - 0.5) * 26, ['#b99a62', '#d1b27a', '#9c7f4d'][i % 3]); }
      for (let i = 0; i < 16; i++) { const x = rnd(i, 35) * FG_W, r = 9 + rnd(i, 36) * 18; g.fillStyle = ['#8c6a4a', '#a98260', '#6f5238'][i % 3]; g.beginPath(); g.ellipse(x, 3, r * 1.3, r, 0, Math.PI, TAU); g.fill(); }
    } else if (kind === 4) {
      for (let i = 0; i < 70; i++) { const x = rnd(i, 41) * FG_W, h = 40 + rnd(i, 42) * 70; blade(x, h, 2.2 + rnd(i, 43) * 1.6, (rnd(i, 44) - 0.5) * 18, ['#2d8c57', '#3aa466', '#1f7345'][i % 3]); }
      for (let i = 0; i < 16; i++) {          // tife (cattails)
        const x = rnd(i, 45) * FG_W, h = 62 + rnd(i, 46) * 48;
        g.strokeStyle = '#2d8c57'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 2); g.quadraticCurveTo(x + 4, -h * 0.5, x + 1, -h); g.stroke();
        g.fillStyle = '#7a4a24'; g.beginPath(); g.ellipse(x + 1, -h - 8, 4.5, 12, 0, 0, TAU); g.fill();
      }
    }
    return cv.c;
  }

  function bakeAll() {
    atlas.trees = [];
    for (let k = 0; k < 7; k++) { atlas.trees[k] = []; for (let l = 1; l < 4; l++) atlas.trees[k][l] = [bakeTree(k, LAYER[l].fog, 0), bakeTree(k, LAYER[l].fog, 1)]; }
    bakeSun(); bakeClouds();
    atlas.fg = [0, 1, 2, 3, 4, 5].map(k => (k === 1 ? null : bakeForeground(k)));
    bakedPr = pr; dirty = false;
  }

  // ---------- pista -------------------------------------------------------------------------
  function setTrack(zones, fx) {
    Z.length = 0; finishX = fx;
    zones.forEach(z => Z.push({ start: z.start, end: z.end, biome: ZONE_TO_BIOME[z.key] != null ? ZONE_TO_BIOME[z.key] : 0, key: z.key }));
    S.zi = 0; S.zi0 = 0; S.lastZone = -1; S.bannerT = -10;
    P.forEach(p => { p.on = false; });
  }
  function setView(d, vs) {
    dpr = d; viewScale = vs;
    const npr = clamp(d * vs, 0.8, 2);
    if (Math.abs(npr - pr) > 0.15 || !atlas.trees) { pr = npr; dirty = true; }
  }
  function warmup() { if (dirty || !atlas.trees) bakeAll(); }
  function bannerText() { const i = BIOMES.findIndex(b => b.name === S.bannerName); return i >= 0 ? I18n.t('biome.' + i) : S.bannerName; }
  function announce(now) { S.bannerT = now; S.bannerName = S.A.name; S.lastZone = S.zi; }

  // ---------- stelle, uccelli, nuvole --------------------------------------------------------
  const STARS = Array.from({ length: 80 }, (_, i) => ({ x: rnd(i, 1), y: rnd(i, 2), r: 1 + rnd(i, 3) * 1.8, ph: rnd(i, 4) * 6.28 }));
  const BIRDS = Array.from({ length: 5 }, (_, i) => ({ x0: rnd(i, 5) * 1400, y: 0.12 + rnd(i, 6) * 0.3, v: 28 + rnd(i, 7) * 22, s: 0.8 + rnd(i, 8) * 0.8, ph: rnd(i, 9) * 6.28 }));
  const CLOUDS = Array.from({ length: 9 }, (_, i) => ({ x0: i * 330 + rnd(i, 11) * 200, y: 0.07 + rnd(i, 12) * 0.34, s: 0.75 + rnd(i, 13) * 0.95, shape: i % 4, par: 0.03 + rnd(i, 14) * 0.07, drift: 4 + rnd(i, 15) * 8, a: 0.62 + rnd(i, 16) * 0.35 }));
  const CLOUD_WRAP = 3000;

  // ---------- particelle (pool fisso, nessuna allocazione per fotogramma) --------------------
  const PMAX = 56;
  const P = Array.from({ length: PMAX }, () => ({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, par: 1, col: 0, ph: 0 }));
  const K_SNOW = 0, K_LEAF = 1, K_DUST = 2, K_GLOW = 3, K_BUTTERFLY = 4, K_CONFETTI = 5;
  const LEAF_COLS = ['#d9531f', '#f08a2a', '#ffc247', '#b8461d', '#c9372c'];
  const CONF_COLS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#ffffff'];
  const BFLY_COLS = ['#fb923c', '#f472b6', '#60a5fa', '#facc15', '#c084fc'];
  const want = [0, 0, 0, 0, 0, 0], alive = [0, 0, 0, 0, 0, 0];

  function addWanted(b, wgt) {
    if (wgt <= 0) return;
    switch (b.part) {
      case 'meadow':   want[K_BUTTERFLY] += S.day * 3 * wgt; want[K_GLOW] += (S.warm * 0.6 + S.night) * 9 * wgt; break;
      case 'snow':     want[K_SNOW] += 26 * wgt; break;
      case 'dust':     want[K_DUST] += 8 * wgt; break;
      case 'lagoon':   want[K_GLOW] += 8 * wgt; want[K_BUTTERFLY] += S.day * 1.5 * wgt; break;
      case 'leaves':   want[K_LEAF] += 16 * wgt; break;
      case 'confetti': want[K_CONFETTI] += 26 * wgt; break;
    }
  }
  function spawn(kind, glowCol) {
    let p = null; for (let i = 0; i < PMAX; i++) if (!P[i].on) { p = P[i]; break; }
    if (!p) return;
    const w = S.w, gy = S.gy, r = Math.random;
    p.on = true; p.kind = kind; p.life = 0; p.rot = r() * TAU; p.vr = (r() - 0.5) * 4; p.ph = r() * TAU; p.col = 0; p.par = 0.7 + r() * 0.5;
    switch (kind) {
      case K_SNOW:     p.x = r() * (w + 120) - 20; p.y = -10; p.vx = (r() - 0.5) * 30; p.vy = 50 + r() * 70; p.size = 1.6 + r() * 2.4; p.max = 14; break;
      case K_LEAF:     p.x = r() * (w + 160); p.y = -14; p.vx = 18 + r() * 28; p.vy = 36 + r() * 40; p.size = 5 + r() * 4; p.col = (r() * LEAF_COLS.length) | 0; p.max = 18; p.vr = (r() - 0.5) * 3; break;
      case K_DUST:     p.x = w + 60; p.y = gy - 20 - r() * gy * 0.36; p.vx = -(40 + r() * 50); p.vy = (r() - 0.5) * 6; p.size = 26 + r() * 40; p.max = 14; p.par = 0.9; break;
      case K_GLOW:     p.x = r() * w; p.y = gy - 30 - r() * 230 * S.hs; p.vx = (r() - 0.5) * 16; p.vy = (r() - 0.5) * 14; p.size = 2 + r() * 1.6; p.max = 6 + r() * 5; p.col = glowCol; break;
      case K_BUTTERFLY:p.x = r() * w; p.y = gy - 70 - r() * 260 * S.hs; p.vx = 20 + r() * 25; p.vy = 0; p.size = 6 + r() * 3; p.max = 10 + r() * 8; p.col = (r() * BFLY_COLS.length) | 0; p.par = 0.8; break;
      case K_CONFETTI: p.x = r() * (w + 100); p.y = -10; p.vx = (r() - 0.5) * 40; p.vy = 55 + r() * 80; p.size = 4 + r() * 4; p.col = (r() * CONF_COLS.length) | 0; p.max = 14; p.vr = (r() - 0.5) * 9; break;
    }
  }
  function updateParticles(dt, dCam) {
    const lim = quality >= 2 ? 0 : quality === 1 ? 28 : PMAX;
    want.fill(0); alive.fill(0);
    addWanted(S.A, 1 - S.t); addWanted(S.B, S.t);
    const glowCol = (S.A.part === 'lagoon' && S.t < 0.5) || (S.B.part === 'lagoon' && S.t >= 0.5) ? 1 : 0;
    let total = 0;
    for (let i = 0; i < PMAX; i++) {
      const p = P[i]; if (!p.on) continue;
      p.life += dt;
      p.x += p.vx * dt - dCam * p.par; p.y += p.vy * dt;
      switch (p.kind) {
        case K_SNOW: p.x += Math.sin(p.life * 1.7 + p.ph) * 14 * dt; break;
        case K_LEAF: p.x += Math.sin(p.life * 2.2 + p.ph) * 26 * dt; p.rot += p.vr * dt; break;
        case K_GLOW: p.vx += (Math.random() - 0.5) * 30 * dt; p.vy += (Math.random() - 0.5) * 30 * dt; p.vx *= 0.98; p.vy *= 0.98; break;
        case K_BUTTERFLY: p.y += Math.sin(p.life * 2.3 + p.ph) * 22 * dt; p.vx += (Math.random() - 0.5) * 20 * dt; p.vx = clamp(p.vx, 8, 55); break;
        case K_CONFETTI: p.x += Math.sin(p.life * 3 + p.ph) * 30 * dt; p.rot += p.vr * dt; break;
      }
      const ground = S.gy - 4;
      const gone = p.life > p.max || p.x < -80 || p.x > S.w + 120 || ((p.kind === K_SNOW || p.kind === K_LEAF || p.kind === K_CONFETTI) && p.y > ground + 10 * (1 + (p.ph % 3)))
        || total >= lim || want[p.kind] < 0.5;
      if (gone) { p.on = false; continue; }
      alive[p.kind]++; total++;
    }
    if (lim === 0) return;
    for (let k = 0, spawned = 0; k < 6 && spawned < 2; k++) if (alive[k] < want[k] - 0.5 && total < lim) { spawn(k, glowCol); spawned++; total++; }
  }
  function drawParticles(ctx) {
    for (let i = 0; i < PMAX; i++) {
      const p = P[i]; if (!p.on) continue;
      const a = Math.min(1, p.life / 0.5, (p.max - p.life) / 0.8);
      if (a <= 0.01) continue;
      switch (p.kind) {
        case K_SNOW: ctx.fillStyle = `rgba(255,255,255,${(0.85 * a).toFixed(2)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.7 + p.par * 0.3), 0, TAU); ctx.fill(); break;
        case K_LEAF:
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = LEAF_COLS[p.col];
          ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(80,30,10,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.stroke();
          ctx.restore(); break;
        case K_DUST: ctx.fillStyle = `rgba(226,196,150,${(0.1 * a).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 1.8, p.size * 0.5, 0, 0, TAU); ctx.fill(); break;
        case K_GLOW: {
          const tw = 0.55 + 0.45 * Math.sin(p.life * 4 + p.ph), c = p.col ? '120,240,230' : '230,255,120';
          ctx.fillStyle = `rgba(${c},${(0.16 * a * tw).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.6, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(${c},${(0.95 * a * tw).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
        }
        case K_BUTTERFLY: {
          const fl = Math.abs(Math.cos(p.life * 11 + p.ph)), s = p.size;
          ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = a * 0.95; ctx.fillStyle = BFLY_COLS[p.col];
          ctx.beginPath(); ctx.ellipse(-s * 0.55 * fl, -s * 0.2, s * 0.62 * fl + 0.6, s * 0.8, -0.4, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(s * 0.55 * fl, -s * 0.2, s * 0.62 * fl + 0.6, s * 0.8, 0.4, 0, TAU); ctx.fill();
          ctx.fillStyle = '#334155'; ctx.fillRect(-0.9, -s * 0.7, 1.8, s * 1.4);
          ctx.restore(); break;
        }
        case K_CONFETTI: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = CONF_COLS[p.col]; ctx.scale(1, Math.abs(Math.cos(p.rot * 1.7)) * 0.8 + 0.2); ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6); ctx.restore(); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- aggiornamento per fotogramma ---------------------------------------------------
  let prevCam = null;
  const todWarm = [255, 150, 90], todNight = [22, 30, 96];
  const tod = (c, wk, nk) => mix(mix(c, todWarm, S.warm * wk), todNight, S.night * nk);

  function update(camX, w, h, gy, now) {
    if (dirty || !atlas.trees) bakeAll();
    if (!Z.length) return;
    const dt = clamp((now - S.now) / 1000, 0.001, 0.1); S.now = now; S.dt = dt;
    const dCam = prevCam === null ? 0 : clamp(camX - prevCam, -200, 200); prevCam = camX;
    S.camX = camX; S.w = w; S.h = h; S.gy = gy; S.hs = clamp(gy / 720, 0.7, 1.45);

    // dall'alba al tramonto lungo la gara
    const bx = camX + w * 0.4;
    S.p = clamp(bx / finishX, 0, 1);
    const th = Math.PI * (0.08 + 0.88 * S.p);
    S.e = Math.sin(th);
    S.warm = clamp(1 - (S.e - 0.2) / 0.5, 0, 1);
    S.night = smooth((0.2 - S.e) / 0.12);
    S.day = clamp((S.e - 0.14) / 0.5, 0, 1);
    S.starA = S.night * 0.9;
    S.sunR = clamp(w * 0.07, 34, 62) * (1 + (1 - S.e) * 0.35);
    S.sunX = w * (0.5 - 0.42 * Math.cos(th));
    S.sunY = gy - 36 * S.hs - S.e * gy * 0.66;

    // zona sotto la telecamera + sfumatura verso la vicina
    let zi = S.zi;
    while (zi > 0 && Z[zi].start > bx) zi--;
    while (zi < Z.length - 1 && Z[zi].end <= bx) zi++;
    S.zi = zi;
    const z = Z[zi], u = bx - z.start, len = z.end - z.start;
    let ib = z.biome, t = 0;
    if (u < SB / 2 && zi > 0) { ib = Z[zi - 1].biome; t = smooth(0.5 - u / SB); }
    else if (len - u < SB / 2 && zi < Z.length - 1) { ib = Z[zi + 1].biome; t = smooth(0.5 - (len - u) / SB); }
    S.A = BIOMES[z.biome]; S.B = BIOMES[ib]; S.t = t;
    let z0 = S.zi0;
    while (z0 > 0 && Z[z0].start > camX) z0--;
    while (z0 < Z.length - 1 && Z[z0].end <= camX) z0++;
    S.zi0 = z0;
    if (zi !== S.lastZone && u > 60) { S.lastZone = zi; S.bannerT = now; S.bannerName = z.biome === 6 ? BIOMES[6].name : BIOMES[z.biome].name; }

    // cielo
    const A = S.A, B = S.B;
    let sT = mix(A.skyT, B.skyT, t), sB = mix(A.skyB, B.skyB, t);
    sT = mix(mix(sT, DUSK_T, S.warm * 0.6), NIGHT_T, S.night);
    sB = mix(mix(sB, DUSK_B, S.warm * 0.65), NIGHT_B, S.night);
    S.skyT = sT; S.skyB = sB;

    // creste: forma e colori mescolati fra i due biomi, poi tinti dall'ora del giorno
    for (let l = 0; l < 4; l++) {
      const R = RP[l], L = LAYER[l], am = A.amp + (B.amp - A.amp) * t;
      R.wR = A.wR + (B.wR - A.wR) * t; R.wP = A.wP + (B.wP - A.wP) * t; R.wM = A.wM + (B.wM - A.wM) * t;
      R.A = L.amp * S.hs * am; R.off = L.off * S.hs;
      R.f1 = L.f1; R.f2 = L.f2; R.f3 = L.f3; R.p1 = L.p1; R.p2 = L.p2; R.p3 = L.p3;
      let c = mix(A.ridge[l], B.ridge[l], t);
      c = tod(c, 0.3 - l * 0.04, 0.6);
      R.col = c;
      R.colB = mix(c, sB, 0.5 - l * 0.1);
    }
    updateParticles(dt, dCam);
  }

  function ridgeShape(R, lx) {
    const q = lx / R.f1 + R.p1;
    const s2 = Math.sin(lx / R.f2 + R.p2), s3 = Math.sin(lx / R.f3 + R.p3);
    const v = 0.55 * Math.sin(q) + 0.3 * s2 + 0.15 * s3;
    let out = R.wR * v;
    if (R.wP > 0.01) out += R.wP * ((1 - 2 * Math.abs(Math.sin(q * 0.5))) * 0.85 + 0.2 * s2 + 0.08 * s3);
    if (R.wM > 0.01) out += R.wM * (clamp(v * 2.1, -0.6, 0.48) + 0.04 * s3);
    return out;
  }

  // ---------- disegno: sfondo ---------------------------------------------------------------
  const ysBuf = new Float32Array(400);
  function drawBackdrop(ctx) {
    if (!Z.length) { ctx.fillStyle = '#bde3ff'; ctx.fillRect(0, 0, S.w, S.h); return; }
    const w = S.w, h = S.h, gy = S.gy, now = S.now / 1000;

    // cielo
    const g = ctx.createLinearGradient(0, 0, 0, gy);
    g.addColorStop(0, rgb(S.skyT)); g.addColorStop(1, rgb(S.skyB));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // stelle
    if (S.starA > 0.02 && quality < 2) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < STARS.length; i++) {
        const s = STARS[i];
        ctx.globalAlpha = S.starA * (0.55 + 0.45 * Math.sin(now * 2 + s.ph));
        ctx.fillRect(s.x * w, s.y * gy * 0.62, s.r, s.r);
      }
      ctx.globalAlpha = 1;
    }

    // sole: alone, raggi che girano piano, faccia (assonnata all'alba e al tramonto)
    {
      const r = S.sunR, k = r / 100, sx = S.sunX, sy = S.sunY;
      ctx.globalAlpha = 1 - S.night * 0.5;
      ctx.drawImage(atlas.glow, sx - r * 4.2, sy - r * 4.2, r * 8.4, r * 8.4);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(now * 0.18);
      const rs = atlas.sunRays.width / pr * k; ctx.globalAlpha = 0.95 - S.night * 0.3;
      ctx.drawImage(atlas.sunRays, -rs / 2, -rs / 2, rs, rs); ctx.restore();
      const awake = smooth((S.e - 0.14) / 0.3), fs = (2 * 100 + 24) * k;
      ctx.globalAlpha = 1 - S.night * 0.25;
      if (awake < 0.98) { ctx.globalAlpha = (1 - S.night * 0.25) * (1 - awake); ctx.drawImage(atlas.sunSleepy, sx - fs / 2, sy - fs / 2, fs, fs); }
      if (awake > 0.02) { ctx.globalAlpha = (1 - S.night * 0.25) * awake; ctx.drawImage(atlas.sunHappy, sx - fs / 2, sy - fs / 2, fs, fs); }
      if (awake < 0.6) {                       // "z z z"
        ctx.globalAlpha = (0.6 - awake) * 1.4; ctx.fillStyle = '#7c3aed'; ctx.font = `700 ${Math.round(r * 0.5)}px Kalam, cursive`; ctx.textAlign = 'center';
        const zt = (now * 0.7) % 1;
        ctx.fillText('z', sx + r * 1.15, sy - r * 0.7 - zt * r * 0.4);
        ctx.fillText('Z', sx + r * 1.45, sy - r * 1.05 - ((zt + 0.5) % 1) * r * 0.4);
      }
      ctx.globalAlpha = 1;
    }

    // nuvole (+ versione rosata che sfuma dentro all'alba/tramonto)
    for (let i = 0; i < CLOUDS.length; i++) {
      const c = CLOUDS[i];
      let sx = ((c.x0 + now * c.drift - S.camX * c.par) % CLOUD_WRAP + CLOUD_WRAP) % CLOUD_WRAP - 260;
      if (sx > w + 40) continue;
      const cw = 150 * c.s, ch = 90 * c.s, y = c.y * gy;
      const alpha = c.a * (1 - S.night * 0.65);
      ctx.globalAlpha = alpha; ctx.drawImage(atlas.clouds[c.shape], sx, y, cw, ch);
      if (S.warm > 0.05) { ctx.globalAlpha = alpha * S.warm * 0.85; ctx.drawImage(atlas.cloudsWarm[c.shape], sx, y, cw, ch); }
    }
    ctx.globalAlpha = 1;

    // uccelli (solo di giorno)
    if (S.day > 0.3 && quality < 2) {
      ctx.strokeStyle = `rgba(40,50,80,${(0.6 * S.day).toFixed(2)})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const bp = new Path2D();
      for (let i = 0; i < BIRDS.length; i++) {
        const b = BIRDS[i], span = w + 400;
        const x = ((b.x0 + now * b.v - S.camX * 0.05) % span + span) % span - 200;
        const y = b.y * gy + Math.sin(now * 0.9 + b.ph) * 10, fl = Math.sin(now * 7 + b.ph * 3), s = b.s * 9;
        bp.moveTo(x - s, y - fl * s * 0.7); bp.quadraticCurveTo(x - s * 0.4, y - s * 0.5 - fl * s * 0.3, x, y);
        bp.quadraticCurveTo(x + s * 0.4, y - s * 0.5 - fl * s * 0.3, x + s, y - fl * s * 0.7);
      }
      ctx.stroke(bp);
    }

    // bagliore caldo all'orizzonte
    if (S.warm > 0.05) {
      const hg = ctx.createLinearGradient(0, gy - 280 * S.hs, 0, gy);
      hg.addColorStop(0, 'rgba(255,170,110,0)'); hg.addColorStop(1, `rgba(255,150,90,${(S.warm * 0.3).toFixed(3)})`);
      ctx.fillStyle = hg; ctx.fillRect(0, gy - 280 * S.hs, w, 280 * S.hs);
    }

    for (let l = 0; l < 4; l++) drawLayer(ctx, l);
  }

  const SNOW_COL = [250, 253, 255];
  function drawLayer(ctx, l) {
    const R = RP[l], L = LAYER[l], w = S.w, gy = S.gy, par = S.camX * L.speed;
    const step = quality >= 2 ? 26 : (l === 0 ? 20 : 12);
    const n = Math.min(399, Math.ceil((w + step * 2) / step) + 1);
    let yMin = 1e9;
    for (let i = 0; i < n; i++) { const y = gy - R.off - R.A * ridgeShape(R, par - step + i * step - 0); ysBuf[i] = y; if (y < yMin) yMin = y; }
    const x0 = -step;

    ctx.beginPath(); ctx.moveTo(x0, gy + 6);
    for (let i = 0; i < n; i++) ctx.lineTo(x0 + i * step, ysBuf[i]);
    ctx.lineTo(x0 + (n - 1) * step, gy + 6); ctx.closePath();
    const grad = ctx.createLinearGradient(0, yMin, 0, gy);
    grad.addColorStop(0, rgb(R.col)); grad.addColorStop(1, rgb(R.colB));
    ctx.fillStyle = grad; ctx.fill();

    // cime innevate (ghiacciaio): il bordo basso è una linea a denti
    const sn = S.A.snow + (S.B.snow - S.A.snow) * S.t;
    if (sn > 0.04 && l <= 2) {
      const thr = gy - R.off - R.A * 0.3, cap = new Path2D();
      for (let i = 0; i < n;) {
        if (ysBuf[i] < thr) {
          let j = i; while (j + 1 < n && ysBuf[j + 1] < thr) j++;
          cap.moveTo(x0 + i * step, ysBuf[i]);
          for (let k = i + 1; k <= j; k++) cap.lineTo(x0 + k * step, ysBuf[k]);
          for (let k = j; k >= i; k--) cap.lineTo(x0 + k * step, thr + 4 + 10 * Math.abs(Math.sin((par + x0 + k * step) * 0.05 + l * 2)));
          cap.closePath(); i = j + 1;
        } else i++;
      }
      ctx.fillStyle = rgba(tod(SNOW_COL, 0.35, 0.45), sn.toFixed(2)); ctx.fill(cap);
    }

    // ombre sui versanti lontani dal sole: un solo poligono per tratto, sfumato in basso (niente bande)
    const sh = R.wP + R.wM;
    if (sh > 0.4 && quality < 1) {
      const dir = S.p < 0.5 ? 1 : -1, shade = new Path2D();
      for (let i = 0; i < n - 1;) {
        const d = (ysBuf[i + 1] - ysBuf[i]) * dir;
        if (d > 0.25) {
          let j = i; while (j + 1 < n - 1 && (ysBuf[j + 2] - ysBuf[j + 1]) * dir > 0.25) j++;
          const len = j + 1 - i;
          // fascia d'ombra lungo il versante: sottile alle estremità, più spessa a metà (nessun bordo verticale netto)
          shade.moveTo(x0 + i * step, ysBuf[i]);
          for (let k = i + 1; k <= j + 1; k++) shade.lineTo(x0 + k * step, ysBuf[k]);
          for (let k = j + 1; k >= i; k--) shade.lineTo(x0 + k * step, ysBuf[k] + 70 * S.hs * Math.pow(Math.sin(Math.PI * (k - i) / len), 0.7));
          shade.closePath();
          i = j + 1;
        } else i++;
      }
      const sc = S.warm > 0.4 ? '70,40,120' : '30,48,100';
      const sa = clamp(sh, 0, 1) * (0.2 + S.night * 0.15);
      const sg = ctx.createLinearGradient(0, yMin, 0, yMin + 110 * S.hs);
      sg.addColorStop(0, `rgba(${sc},${sa.toFixed(3)})`); sg.addColorStop(1, `rgba(${sc},0)`);
      ctx.fillStyle = sg; ctx.fill(shade);
    }

    // filo di luce sulla cresta
    if (quality < 2) {
      ctx.beginPath(); ctx.moveTo(x0, ysBuf[0]);
      for (let i = 1; i < n; i++) ctx.lineTo(x0 + i * step, ysBuf[i]);
      ctx.strokeStyle = S.warm > 0.3 ? `rgba(255,214,170,${(0.32 * (1 - S.night)).toFixed(2)})` : `rgba(255,255,255,${(0.26 * (1 - S.night * 0.7)).toFixed(2)})`;
      ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke();
    }

    // alberi e arbusti sulla cresta (sprite pre-disegnati)
    if (l >= 1 && atlas.trees && !(quality >= 2 && l < 3)) {
      const sp = L.spacing, s0 = Math.floor((par - 70) / sp), s1 = Math.floor((par + w + 70) / sp);
      const A = S.A, B = S.B, t = S.t;
      for (let s = s0; s <= s1; s++) {
        const lx = s * sp + (rnd(s, l, 1) - 0.5) * sp * 0.85, sx = lx - par;
        const rp = rnd(s, l, 2), rk = rnd(s, l, 3), v = rnd(s, l, 5) < 0.5 ? 0 : 1;
        const aA = rp < A.dens ? 1 - t : 0, aB = rp < B.dens ? t : 0;
        if (aA + aB < 0.02) continue;
        const kA = floraPick(A, rk), kB = floraPick(B, rk);
        const sc = L.size * S.hs * (0.72 + 0.55 * rnd(s, l, 4));
        const y = gy - R.off - R.A * ridgeShape(R, lx) + 3 * sc;
        const dw = TREE_W * sc, dh = TREE_H * sc;
        if (kA === kB) { ctx.globalAlpha = Math.min(1, aA + aB); ctx.drawImage(atlas.trees[kA][l][v], sx - dw / 2, y - dh + 3 * sc, dw, dh); }
        else {
          if (aA > 0.02) { ctx.globalAlpha = aA; ctx.drawImage(atlas.trees[kA][l][v], sx - dw / 2, y - dh + 3 * sc, dw, dh); }
          if (aB > 0.02) { ctx.globalAlpha = aB; ctx.drawImage(atlas.trees[kB][l][v], sx - dw / 2, y - dh + 3 * sc, dw, dh); }
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- disegno: terreno --------------------------------------------------------------
  // gradiente orizzontale con un colore per zona (sfumato ai confini): un'unica fill per tutto lo schermo
  function zoneGrad(ctx, pick) {
    const w = S.w, camX = S.camX, g = ctx.createLinearGradient(0, 0, w, 0);
    let last = 0;
    for (let i = S.zi0; i < Z.length && Z[i].start < camX + w; i++) {
      const a = clamp((Z[i].start - camX + 110) / w, 0, 1), b = clamp((Z[i].end - camX - 110) / w, 0, 1);
      const aa = Math.max(a, last), bb = Math.max(b, aa), c = rgb(pick(Z[i]));
      g.addColorStop(aa, c); g.addColorStop(bb, c); last = bb;
    }
    return g;
  }

  // il "vuoto" sotto un ponte: la parete in fondo al fiume/crepaccio, tra la riva e il fondo
  function drawGapWalls(ctx, surf, n, step) {
    const camX = S.camX, w = S.w, gy = S.gy;
    for (let zi = S.zi0; zi < Z.length && Z[zi].start < camX + w; zi++) {
      const tz = Terrain.ZONES[zi]; if (!tz || !tz.gap) continue;
      const g0 = tz.gap.g0, g1 = tz.gap.g1; if (g1 < camX - 20 || g0 > camX + w + 20) continue;
      const i0 = Math.max(0, Math.floor((g0 - camX) / step)), i1 = Math.min(n - 1, Math.ceil((g1 - camX) / step));
      if (i1 <= i0) continue;
      const canyon = tz.key === 'gravel';
      ctx.beginPath(); let yTop = 1e9, yBot = -1e9;
      for (let i = i0; i <= i1; i++) { const y = gy - Terrain.baseHeight(camX + i * step); if (y < yTop) yTop = y; if (i === i0) ctx.moveTo(i * step, y); else ctx.lineTo(i * step, y); }
      for (let i = i1; i >= i0; i--) { const y = gy - surf[i]; if (y > yBot) yBot = y; ctx.lineTo(i * step, y); }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      if (canyon) { g.addColorStop(0, rgb(tod([196, 124, 74], 0.3, 0.5))); g.addColorStop(0.55, rgb(tod([120, 62, 34], 0.3, 0.6))); g.addColorStop(1, rgb(tod([92, 70, 100], 0.2, 0.6))); }
      else { g.addColorStop(0, rgb(tod([139, 119, 97], 0.3, 0.5))); g.addColorStop(1, rgb(tod([48, 40, 32], 0.2, 0.6))); }
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.13)'; ctx.lineWidth = 6; ctx.beginPath();
      for (let k = 1; yTop + k * 24 < yBot; k++) { const y = yTop + k * 24; ctx.moveTo(i0 * step, y); for (let x = i0 * step; x <= i1 * step; x += 30) ctx.lineTo(x, y + 4 * Math.sin((x + camX) * 0.02 + k)); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let k = 1; yTop + k * 24 + 9 < yBot; k++) { const y = yTop + k * 24 + 9; ctx.moveTo(i0 * step, y); for (let x = i0 * step; x <= i1 * step; x += 30) ctx.lineTo(x, y + 4 * Math.sin((x + camX) * 0.02 + k)); }
      ctx.stroke();
      if (canyon) {              // nebbiolina sul fondo del crepaccio
        const fg = ctx.createLinearGradient(0, yBot - 120, 0, yBot);
        fg.addColorStop(0, 'rgba(210,190,210,0)'); fg.addColorStop(1, 'rgba(210,190,210,0.55)');
        ctx.fillStyle = fg; ctx.fillRect(i0 * step, yBot - 120, (i1 - i0) * step, 120);
      }
      ctx.restore();
    }
  }

  function drawGround(ctx, surf, n, step) {
    if (!Z.length) return;
    const w = S.w, h = S.h, gy = S.gy, camX = S.camX, xLast = (n - 1) * step;
    drawGapWalls(ctx, surf, n, step);

    // 1. terriccio: colore per zona, poi scurisce verso il basso
    ctx.beginPath(); ctx.moveTo(0, h + 6);
    for (let i = 0; i < n; i++) ctx.lineTo(i * step, gy - surf[i]);
    ctx.lineTo(xLast, h + 6); ctx.closePath();
    ctx.fillStyle = zoneGrad(ctx, z => tod(BIOMES[z.biome].soil, 0.25, 0.5)); ctx.fill();
    const dk = mix(S.A.soil, [12, 8, 20], 0.78), vg = ctx.createLinearGradient(0, gy - 90, 0, h);
    vg.addColorStop(0, rgba(dk, 0)); vg.addColorStop(1, rgba(dk, 0.62));
    ctx.fillStyle = vg; ctx.fill();

    // 2. strati e sassi sepolti (dentro il terreno)
    if (quality < 2) {
      ctx.save(); ctx.clip();
      const dkP = new Path2D(), ltP = new Path2D();
      for (let k = 0; k < 3; k++) {
        const off = [34, 82, 150][k], P2 = k === 1 ? ltP : dkP;
        for (let i = 0; i < n; i++) { const x = i * step, y = gy - surf[i] + off + 7 * Math.sin((x + camX) * 0.011 + k * 2); if (i === 0) P2.moveTo(x, y); else P2.lineTo(x, y); }
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 9; ctx.stroke(dkP);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 6; ctx.stroke(ltP);
      const rockD = new Path2D(), rockL = new Path2D();
      for (let s = Math.floor(camX / 150) - 1; s <= Math.floor((camX + w) / 150) + 1; s++) {
        const wx = s * 150 + rnd(s, 3) * 110, sx = wx - camX; if (sx < -40 || sx > w + 40) continue;
        const fi = clamp(sx / step, 0, n - 2), i = Math.floor(fi), f = fi - i, ys = gy - (surf[i] * (1 - f) + surf[i + 1] * f);
        const y = ys + 46 + rnd(s, 4) * 150, r = 8 + rnd(s, 5) * 15;
        rockD.moveTo(sx + r * 1.3, y); rockD.ellipse(sx, y, r * 1.3, r, 0, 0, TAU);
        rockL.moveTo(sx - r * 0.2 + r * 0.7, y - r * 0.3); rockL.ellipse(sx - r * 0.2, y - r * 0.3, r * 0.7, r * 0.45, 0, 0, TAU);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fill(rockD);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill(rockL);
      ctx.restore();
    }

    // 3. linea di superficie (colore per zona, bordo scuro "da disegno")
    const line = new Path2D();
    for (let i = 0; i < n; i++) { const y = gy - surf[i]; if (i === 0) line.moveTo(0, y); else line.lineTo(i * step, y); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(15,23,42,0.55)'; ctx.lineWidth = 13; ctx.stroke(line);
    ctx.strokeStyle = zoneGrad(ctx, z => tod(BIOMES[z.biome].surf, 0.25, 0.5)); ctx.lineWidth = 9; ctx.stroke(line);

    // 4. dettagli di superficie, uno per bioma, tutti a lotto
    if (quality < 2) {
      const grass = {}, snow = new Path2D(), spark = new Path2D(), peb = new Path2D(), leafs = [new Path2D(), new Path2D(), new Path2D()];
      let zi = S.zi0;
      for (let s = Math.floor(camX / 34) - 1; s <= Math.floor((camX + w) / 34) + 1; s++) {
        const wx = s * 34 + rnd(s, 1) * 26, sx = wx - camX; if (sx < -20 || sx > w + 20) continue;
        while (zi < Z.length - 1 && Z[zi].end <= wx) zi++;
        const tz = Terrain.ZONES[zi]; if (tz && tz.gap && wx > tz.gap.g0 - 40 && wx < tz.gap.g1 + 40) continue;
        const bi = Z[zi].biome, fi = clamp(sx / step, 0, n - 2), i = Math.floor(fi), f = fi - i;
        const y = gy - (surf[i] * (1 - f) + surf[i + 1] * f), r = rnd(s, 2);
        if (bi === 2) {
          if (r < 0.55) { const rx = 8 + r * 18; snow.moveTo(sx + rx, y - 2); snow.ellipse(sx, y - 2, rx, 3 + r * 6, 0, Math.PI, TAU); }
          else if (r < 0.7) { spark.moveTo(sx - 4, y - 12); spark.lineTo(sx + 4, y - 12); spark.moveTo(sx, y - 16); spark.lineTo(sx, y - 8); }
        } else if (bi === 3) {
          if (r < 0.5) { const rr = 2.5 + r * 6; peb.moveTo(sx + rr * 1.3, y - 3); peb.ellipse(sx, y - 3, rr * 1.3, rr, 0, 0, TAU); }
          else if (r < 0.75) { (grass[3] = grass[3] || new Path2D()); const g2 = grass[3], hh = 6 + r * 8; g2.moveTo(sx - 3, y + 1); g2.lineTo(sx - 5, y - hh); g2.moveTo(sx, y + 1); g2.lineTo(sx + 1, y - hh - 3); g2.moveTo(sx + 3, y + 1); g2.lineTo(sx + 6, y - hh + 1); }
        } else if (bi === 5) {
          if (r < 0.45) { const lp = leafs[(r * 20 | 0) % 3], rr = 4 + r * 7; lp.moveTo(sx + rr, y - 2); lp.ellipse(sx, y - 2, rr, rr * 0.5, r, 0, TAU); }
          else if (r < 0.7) { (grass[5] = grass[5] || new Path2D()); const g2 = grass[5], hh = 6 + r * 9; g2.moveTo(sx - 3, y + 1); g2.lineTo(sx - 5, y - hh); g2.moveTo(sx, y + 1); g2.lineTo(sx, y - hh - 3); g2.moveTo(sx + 3, y + 1); g2.lineTo(sx + 5, y - hh); }
        } else if (r < 0.75) {
          (grass[bi] = grass[bi] || new Path2D()); const g2 = grass[bi], hh = 7 + r * 11;
          g2.moveTo(sx - 4, y + 1); g2.quadraticCurveTo(sx - 5, y - hh * 0.6, sx - 7, y - hh);
          g2.moveTo(sx, y + 1); g2.quadraticCurveTo(sx + 1, y - hh * 0.7, sx + 1, y - hh - 4);
          g2.moveTo(sx + 4, y + 1); g2.quadraticCurveTo(sx + 5, y - hh * 0.6, sx + 8, y - hh);
        }
      }
      ctx.lineWidth = 2.6;
      for (const k in grass) {
        const b = BIOMES[k]; ctx.strokeStyle = rgb(tod(mix(b.surf, k == 3 ? [120, 90, 50] : k == 5 ? [160, 70, 20] : [14, 90, 40], 0.45), 0.25, 0.5)); ctx.stroke(grass[k]);
      }
      ctx.fillStyle = rgba(tod([255, 255, 255], 0.3, 0.45), 0.96); ctx.fill(snow);
      ctx.strokeStyle = 'rgba(190,235,255,0.95)'; ctx.lineWidth = 1.8; ctx.stroke(spark);
      ctx.fillStyle = rgba(tod([128, 112, 96], 0.2, 0.5), 1); ctx.fill(peb);
      ['#d9531f', '#f08a2a', '#c9372c'].forEach((c, k) => { ctx.fillStyle = c; ctx.fill(leafs[k]); });
    }
  }

  // ---------- acqua: trasparente, disegnata DAVANTI alle bici ---------------------------------
  function drawWater(ctx, surf, n, step) {
    if (!Z.length) return;
    const camX = S.camX, w = S.w, gy = S.gy, now = S.now / 1000;
    let any = false;
    for (let zi = S.zi0; zi < Z.length && Z[zi].start < camX + w; zi++) if (Z[zi].key === 'water') { any = true; break; }
    if (!any) return;
    const wc = tod(BIOMES[4].water, 0.35, 0.55), deep = mix(wc, [10, 40, 90], 0.55);
    let i = 0;
    while (i < n) {
      const wl0 = Terrain.waterLevel(camX + i * step);
      if (!(wl0 > surf[i] + 0.5)) { i++; continue; }
      let j = i, yTop = gy - wl0, yBot = gy - surf[i];
      const tops = [];
      while (j < n) {
        const wl = Terrain.waterLevel(camX + j * step);
        if (!(wl > surf[j] + 0.5)) break;
        const x = j * step, wv = 2.2 * Math.sin((x + camX) * 0.03 + now * 2.1) + 1.4 * Math.sin((x + camX) * 0.07 - now * 3.3);
        tops.push(x, gy - wl + wv); yBot = Math.max(yBot, gy - surf[j]); j++;
      }
      const x0 = i * step, x1 = (j - 1) * step;
      ctx.beginPath(); ctx.moveTo(tops[0], tops[1]);
      for (let k = 2; k < tops.length; k += 2) ctx.lineTo(tops[k], tops[k + 1]);
      for (let k = j - 1; k >= i; k--) ctx.lineTo(k * step, gy - surf[k]);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, rgba(wc, 0.5)); g.addColorStop(1, rgba(deep, 0.86));
      ctx.fillStyle = g; ctx.fill();
      if (quality < 2) {
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 2.5; ctx.beginPath();
        for (let k = 1; yTop + 9 + k * 15 < yBot; k++) {
          const y = yTop + 9 + k * 15; ctx.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 22) ctx.lineTo(x, y + 2.5 * Math.sin((x + camX) * 0.05 + now * (1.2 + k * 0.3) + k));
        }
        ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.moveTo(tops[0], tops[1]); for (let k = 2; k < tops.length; k += 2) ctx.lineTo(tops[k], tops[k + 1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 7; ctx.stroke();
      i = j + 1;
    }
  }

  // ---------- primo piano, particelle, luce, titolo del bioma ---------------------------------
  function drawFront(ctx) {
    if (!Z.length) return;
    const w = S.w, h = S.h, camX = S.camX;
    if (quality < 2) {
      const par = camX * 1.45;
      const draw = (b, a) => {
        const tile = atlas.fg[b.fg]; if (!tile || a < 0.02) return;
        ctx.globalAlpha = a;
        let x = -(par % FG_W); if (x > 0) x -= FG_W;
        for (; x < w; x += FG_W) ctx.drawImage(tile, x, h - FG_H * 0.85, FG_W, FG_H);
      };
      if (S.A.fg === S.B.fg) draw(S.A, 1); else { draw(S.A, 1 - S.t); draw(S.B, S.t); }
      ctx.globalAlpha = 1;
    }
    drawParticles(ctx);

    // luce: oro all'alba e al tramonto, blu la sera (si applica anche a terreno e bici)
    if (S.warm > 0.02) { ctx.fillStyle = `rgba(255,140,60,${(S.warm * 0.11).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
    if (S.night > 0.02) { ctx.fillStyle = `rgba(8,16,64,${(S.night * 0.32).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }

    // titolo del bioma: entra dall'alto, resta, sfuma
    const age = S.now - S.bannerT;
    if (age >= 0 && age < 3000) {
      const a = Math.min(1, age / 350, (3000 - age) / 700), slide = (1 - smooth(age / 450)) * -26;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = clamp(w * 0.055, 26, 46), y = Math.max(82, S.gy * 0.2) + slide;
      ctx.font = `700 ${Math.round(fs)}px Kalam, "Comic Sans MS", cursive`;
      ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(16,42,67,0.85)'; ctx.strokeText(bannerText(), w / 2, y);
      ctx.fillStyle = '#ffffff'; ctx.fillText(bannerText(), w / 2, y);
      ctx.restore();
    }
  }

  function setQuality(q) { quality = clamp(q | 0, 0, 2); }

  return {
    setTrack, setView, update, drawBackdrop, drawGround, drawWater, drawFront, setQuality, warmup, announce,
    get quality() { return quality; }, get state() { return S; },
  };
})(); // scenery
