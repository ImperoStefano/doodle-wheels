/*
 * Scenery — lo scenario che cambia lungo la pista.
 *
 * 7 biomi (uno per tipo di zona), un sole che attraversa il cielo dall'alba al tramonto lungo
 * la gara, montagne a 4 livelli di profondità con alberi, nuvole, uccelli, particelle (neve,
 * foglie, lucciole…), terreno a strati, acqua trasparente davanti alle bici.
 *
 * I mondi classici sono disegnati con Canvas; Atlantide, Bosco Incantato e Città Neon usano
 * panorami SVG locali caricati una sola volta. Per restare fluido:
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

  // Illustrazioni panoramiche originali dei tre mondi aggiuntivi. Sono SVG locali:
  // nitide su desktop e mobile, senza richieste esterne e senza dipendenze di rete.
  const WORLD_ART = Object.create(null);
  const WORLD_FRONT_ART = Object.create(null);
  const WORLD_ART_PATHS = {
    atlantis: 'img/worlds/atlantis.svg',
    enchanted: 'img/worlds/enchanted.svg',
    neon: 'img/worlds/neon.svg',
  };
  const WORLD_FRONT_ART_PATHS = {
    atlantis: 'img/worlds/atlantis-front.svg',
    enchanted: 'img/worlds/enchanted-front.svg',
    neon: 'img/worlds/neon-front.svg',
  };
  function preloadWorldArt() {
    if (typeof Image === 'undefined') return;
    for (const name of Object.keys(WORLD_ART_PATHS)) {
      if (!WORLD_ART[name]) {
        const img = new Image();
        img.decoding = 'async';
        img.src = WORLD_ART_PATHS[name];
        WORLD_ART[name] = img;
      }
      if (!WORLD_FRONT_ART[name]) {
        const front = new Image();
        front.decoding = 'async';
        front.src = WORLD_FRONT_ART_PATHS[name];
        WORLD_FRONT_ART[name] = front;
      }
    }
  }
  preloadWorldArt();

  // Stile "paesaggio" (illustrazione vettoriale a strati): cieli sfumati dal rosso-arancio al pesca o dal verde salvia al menta, sole grande e pallido,
  // montagne a più piani con una faccia chiara e una in ombra, colline a fasce, chiome morbide a lobi e cipressi color melanzana.
  // POSTER resta true perché il resto del disegno (acqua, lava, etichette) usa le campiture piatte; LAND accende gradienti e sfaccettature.
  const POSTER = true, LAND = true;
  const PS = (a, b) => POSTER ? a : b;

  // ---------- biomi --------------------------------------------------------------------------
  // flora: [[tipo, peso], …] degli alberi/arbusti sulle creste più vicine
  const FL = { ROUND: 0, PINE: 1, SNOWPINE: 2, CACTUS: 3, BUSH: 4, PALM: 5, AUTUMN: 6, DEAD: 7 };
  const BIOME_DEFS = [
    { name: 'Prato fiorito', skyT: '#86b794', skyB: '#d9ecd2', sun: '#f8e9b4', ridge: ['#bde0b6', '#8cc79c', '#4f9d76', '#287056'], shape: [0.3, 0.7, 0], amp: 1.3, snow: 0,
      flora: [[FL.ROUND, 5], [FL.BUSH, 3], [FL.PINE, 1]], dens: 0.8, soil: '#3f8d5c', surf: '#a9d66b', fg: 0, part: 'meadow' },
    { name: 'Colline', skyT: '#7fb3a2', skyB: '#dcedd2', sun: '#f9e8b0', ridge: ['#b0dcbc', '#78bba0', '#3f8d7b', '#25675f'], shape: [0.2, 0.8, 0], amp: 1.4, snow: 0,
      flora: [[FL.ROUND, 4], [FL.PINE, 4], [FL.BUSH, 2]], dens: 0.85, soil: '#388659', surf: '#9fd070', fg: 0, part: 'meadow' },
    { name: 'Ghiacciaio', skyT: '#9bb6df', skyB: '#ebeff7', sun: '#fcf1d2', ridge: ['#e8edf8', '#bdcbe9', '#8d9fd1', '#5f6fab'], shape: [0.05, 0.95, 0], amp: 1.6, snow: 1,
      flora: [[FL.SNOWPINE, 6], [FL.BUSH, 1]], dens: 0.7, soil: '#7a8dc0', surf: '#f3f6fc', fg: 2, part: 'snow' },
    { name: 'Canyon', skyT: '#df5859', skyB: '#f7ab7c', sun: '#f8e0a4', ridge: ['#cc869b', '#a26b8e', '#705f96', '#463f7b'], shape: [0, 0.4, 0.6], amp: 1.2, snow: 0,
      flora: [[FL.CACTUS, 5], [FL.BUSH, 3]], dens: 0.55, soil: '#c2693b', surf: '#f3b94d', fg: 3, part: 'dust' },
    { name: 'Laguna', skyT: '#f1ad8d', skyB: '#fbe3b8', sun: '#fcead0', ridge: ['#f7cfae', '#58d4c2', '#16b9a7', '#0e8f85'], shape: [0.8, 0.2, 0], amp: 0.95, snow: 0,
      flora: [[FL.PALM, 6], [FL.BUSH, 3]], dens: 0.75, soil: '#d8924d', surf: '#f8da8c', fg: 4, part: 'lagoon', water: '#2fc4b8' },
    { name: 'Bosco d\'autunno', skyT: '#e66b5d', skyB: '#f9c680', sun: '#fadca2', ridge: ['#eaa38c', '#c4617b', '#80407a', '#4c2b63'], shape: [0.6, 0.4, 0], amp: 1.15, snow: 0,
      flora: [[FL.AUTUMN, 7], [FL.PINE, 1], [FL.BUSH, 2]], dens: 0.95, soil: '#8f3f46', surf: '#f1a540', fg: 5, part: 'leaves' },
    { name: 'Traguardo!', skyT: '#f2a98d', skyB: '#fbe4bd', sun: '#fcead0', ridge: ['#fbd3b1', '#1acab5', '#0e9d8f', '#512b75'], shape: [0.7, 0.3, 0], amp: 1.1, snow: 0,
      flora: [[FL.ROUND, 5], [FL.BUSH, 3]], dens: 0.7, soil: '#7b409d', surf: '#f06aa1', fg: 0, part: 'confetti' },
    { name: 'Vulcano', skyT: '#4a2142', skyB: '#ff7d47', sun: '#ffd286', ridge: ['#a35c79', '#7b4569', '#523250', '#2f2139'], shape: [0.1, 0.9, 0], amp: 1.3, snow: 0,
      flora: [[FL.DEAD, 6], [FL.BUSH, 1]], dens: 0.5, soil: '#2b2030', surf: '#6e3b3b', fg: 6, part: 'ember', water: '#ff6a1a' },
  ];
  const ZONE_TO_BIOME = { start: 0, hills: 1, ice: 2, gravel: 3, water: 4, ramps: 5, finish: 6, lava: 7 };
  const BIOMES = BIOME_DEFS.map(b => ({
    name: b.name, skyT: hex(b.skyT), skyB: hex(b.skyB), sun: hex(b.sun), ridge: b.ridge.map(hex),
    wR: b.shape[0], wP: b.shape[1], wM: b.shape[2], amp: b.amp, snow: b.snow,
    flora: b.flora, dens: b.dens, soil: hex(b.soil), surf: hex(b.surf), fg: b.fg, part: b.part,
    water: hex(b.water || '#2eb5d6'),
  }));
  // cumulativi per scegliere il tipo di pianta in modo deterministico da un numero 0..1
  BIOMES.forEach(b => { let tot = 0; b.floraCum = b.flora.map(f => (tot += f[1])); b.floraTot = tot; });
  let ACTIVE_BIOMES = BIOMES;
  function makeWorldBiomes(world) {
    if (world === 'classic') return BIOMES;
    const palettes = {
      paradise: { skyT: '#78bce5', skyB: '#fff8e8', sun: '#fff1bd', ridge: ['#fffdf7', '#e8f3f0', '#c8dfdf', '#8fbcc9'], soil: '#d9edf0', surf: '#fff7df', water: '#73d9ed', part: 'meadow', fg: 1, dens: 0.24, flora: [[FL.ROUND, 5], [FL.BUSH, 3], [FL.PINE, 1]] },
      inferno: { skyT: '#171827', skyB: '#783447', sun: '#6d354a', ridge: ['#5a3447', '#3c293b', '#292333', '#171722'], soil: '#14151d', surf: '#302a35', water: '#ff5734', part: 'ember', fg: 6, dens: 0.18, flora: [[FL.DEAD, 7], [FL.BUSH, 1]] },
      atlantis: { skyT: '#062d49', skyB: '#0e7185', sun: '#c7fff3', ridge: ['#8bd8cf', '#397f89', '#1c596c', '#10384f'], soil: '#0b4052', surf: '#a9e8dc', water: '#087a93', part: 'water', fg: 1, dens: 0.18, flora: [[FL.PALM, 2], [FL.BUSH, 5], [FL.ROUND, 1]] },
      enchanted: { skyT: '#091b2b', skyB: '#173f3d', sun: '#d5ffd0', ridge: ['#8dbb83', '#4e8b68', '#245944', '#12372f'], soil: '#102d27', surf: '#8acb82', water: '#246b70', part: 'magic', fg: 1, dens: 0.38, flora: [[FL.ROUND, 3], [FL.PINE, 2], [FL.BUSH, 5]] },
      neon: { skyT: '#080d24', skyB: '#28134b', sun: '#ff62d4', ridge: ['#5a4c91', '#36326c', '#211f4d', '#11152e'], soil: '#10142a', surf: '#6d83e9', water: '#12bfc9', part: 'neon', fg: 1, dens: 0.08, flora: [[FL.DEAD, 1], [FL.BUSH, 1]] }
    };
    const colors = palettes[world] || palettes.inferno;
    const themed = BIOMES.map(b => Object.assign({}, b, {
      skyT: hex(colors.skyT), skyB: hex(colors.skyB), sun: hex(colors.sun), ridge: colors.ridge.map(hex),
      soil: hex(colors.soil), surf: hex(colors.surf), water: hex(colors.water), part: colors.part, fg: colors.fg, dens: colors.dens, flora: colors.flora
    }));
    themed.forEach(b => { let total = 0; b.floraCum = b.flora.map(f => (total += f[1])); b.floraTot = total; });
    return themed;
  }
  const floraPick = (b, r) => { const x = r * b.floraTot; for (let i = 0; i < b.floraCum.length; i++) if (x < b.floraCum[i]) return b.flora[i][0]; return b.flora[0][0]; };

  const SUN_COL = hex('#ff5f38'), SUN_WARM = hex('#ff3b2f');
  const DUSK_T = hex('#4b4ea6'), DUSK_B = hex('#ffa070'), NIGHT_T = hex('#0e1a52'), NIGHT_B = hex('#37306f');
  const HAZE = hex('#cfe6f7');
  const SB = 900;   // larghezza (px) della sfumatura fra due biomi

  // ---------- stato -------------------------------------------------------------------------
  const Z = [];                 // [{start,end,biome,key}]
  let finishX = 12000;
  let dpr = 1, viewScale = 1, pr = 1;     // pr = risoluzione degli sprite
  let quality = 0;
  const S = {
    p: 0, e: 0.5, warm: 0, night: 0, day: 1, starA: 0, world: 'classic',
    sunX: 0, sunY: 0, sunR: 40,
    A: BIOMES[0], B: BIOMES[0], t: 0, ia: 0, ib: 0, zi: 0, zi0: 0,
    camX: 0, w: 800, h: 600, gy: 480, hs: 1, now: 0, dt: 0.016,
    skyT: [0, 0, 0], skyB: [0, 0, 0],
    bannerT: -10, bannerName: '', bannerWorld: null, lastZone: -1,
    segment: null, segmentBlend: 0, segmentActive: false,
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
    // chioma "a festoni": ellisse piena + cerchietti lungo il bordo; luce a sinistra, ombra a destra
    const scallop = (cx, cy, rx, ry, n, lr, base, lite, dark) => {
      const ring = col => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry; g.moveTo(x + lr, y); g.arc(x, y, lr, 0, TAU); } g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill(); };
      ring(base);
      g.save(); g.beginPath(); g.ellipse(cx, cy, rx + lr, ry + lr, 0, 0, TAU); g.clip();
      g.fillStyle = dark; g.beginPath(); g.rect(cx - rx * 3, cy - ry * 3, rx * 6, ry * 6); g.ellipse(cx - rx * 0.28, cy - ry * 0.22, rx * 1.02, ry * 1.04, 0, 0, TAU); g.fill('evenodd');
      g.restore();
      g.fillStyle = lite; for (let i = 0; i < n; i++) { const a = i / n * TAU; if (Math.cos(a) + Math.sin(a) < -0.55) { const x = cx + Math.cos(a) * rx * 0.96, y = cy + Math.sin(a) * ry * 0.96; g.beginPath(); g.arc(x, y, lr * 0.62, 0, TAU); g.fill(); } }
    };
    const stem = (h, bend, col, w) => { g.strokeStyle = T(col); g.lineCap = 'round'; g.lineWidth = w; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(bend, -h * 0.5, bend * 0.4, -h); g.stroke(); };
    // cipresso: goccia alta con metà chiara sul bordo
    const cypress = (hgt, wid, col, edge) => {
      g.fillStyle = T(col); g.beginPath(); g.moveTo(0, -hgt); g.bezierCurveTo(wid * 1.15, -hgt * 0.7, wid * 1.05, -hgt * 0.12, 0, -hgt * 0.02); g.bezierCurveTo(-wid * 1.05, -hgt * 0.12, -wid * 1.15, -hgt * 0.7, 0, -hgt); g.fill();
      g.fillStyle = T(edge); g.beginPath(); g.moveTo(0, -hgt); g.bezierCurveTo(-wid * 1.15, -hgt * 0.7, -wid * 1.05, -hgt * 0.12, 0, -hgt * 0.02); g.bezierCurveTo(-wid * 0.55, -hgt * 0.3, -wid * 0.5, -hgt * 0.7, 0, -hgt); g.fill();
    };
    if (LAND && kind === FL.ROUND) {
      if (variant) { stem(40, 5, '#6a3a22', 5); scallop(2, -66, 25, 22, 11, 9, T('#2f8c64'), T('#8fd1a6'), T('#1f6f55')); }
      else { stem(34, -4, '#6a3a22', 5); scallop(0, -58, 28, 26, 12, 10, T('#4aa876'), T('#a6dcb4'), T('#2f8764')); }
    } else if (LAND && kind === FL.BUSH) {
      const pal = variant ? ['#2f9a7d', '#9bdcc0', '#1f7a66'] : ['#5bbd8b', '#b4e5c6', '#37976f'];
      scallop(0, -13, 26, 11, 9, 8, T(pal[0]), T(pal[1]), T(pal[2]));
    } else if (LAND && (kind === FL.AUTUMN)) {
      if (variant) { stem(38, 4, '#5a2c3a', 5); scallop(1, -64, 26, 23, 11, 9, T('#e9a043'), T('#f8d684'), T('#c77a2e')); }
      else { stem(34, -4, '#5a2c3a', 5); scallop(0, -60, 28, 26, 12, 10, T('#e2603e'), T('#f6a07a'), T('#b8412f')); }
    } else if (LAND && (kind === FL.PINE || kind === FL.SNOWPINE)) {
      const snow = kind === FL.SNOWPINE;
      if (snow) cypress(variant ? 112 : 100, variant ? 17 : 20, variant ? '#4a5aa0' : '#5a6bb0', variant ? '#a9b7e6' : '#bcc8ee');
      else if (variant) cypress(110, 17, '#14634a', '#7fcaa0');
      else cypress(104, 19, '#7b1f4b', '#f08a7a');
      g.fillStyle = T('#5a2c3a'); g.fillRect(-2.5, -6, 5, 6);
    } else if (LAND && kind === FL.PALM) {
      g.strokeStyle = T('#6a3a22'); g.lineCap = 'round'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -50, (variant ? -8 : 6), -88); g.stroke();
      const tx = variant ? -8 : 6, ty = -88;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.95 + i * (Math.PI * 0.9 / 6);
        g.save(); g.translate(tx, ty); g.rotate(a); g.fillStyle = T(i % 2 ? '#1a9a86' : '#0b7a6c');
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(22, -16, 44, 4); g.quadraticCurveTo(22, -6, 0, 3); g.closePath(); g.fill(); g.restore();
      }
      circ(tx - 2, ty + 3, 3.6, T('#7a4a22')); circ(tx + 4, ty + 4, 3.6, T('#7a4a22'));
    } else if (POSTER && kind === FL.ROUND) {
      g.fillStyle = T('#05766f'); g.beginPath(); g.ellipse(0, -66, 22, 44, 0, 0, TAU); g.fill();
    } else if (POSTER && kind === FL.BUSH) {
      g.fillStyle = T('#7dbf8f'); g.beginPath(); g.ellipse(0, -13, 25, 16, 0, Math.PI, TAU); g.fill();
    } else if (kind === FL.ROUND || kind === FL.AUTUMN) {
      const pal = kind === FL.ROUND
        ? (variant ? ['#3f9d52', '#58b565', '#2e7f43'] : ['#4aa85a', '#68c070', '#35904a'])
        : POSTER ? (variant ? ['#ecbd6f', '#f5e594', '#e3937a'] : ['#fb5f35', '#ecbd6f', '#e3937a']) : (variant ? ['#e2792a', '#f3a23b', '#b8461d'] : ['#d9531f', '#f08a2a', '#ffc247']);
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
        g.fillStyle = T(snow ? (variant ? '#2f6b57' : '#2a6350') : POSTER ? (variant ? '#0b6a63' : '#05766f') : (variant ? '#2d7a43' : '#256b3a'));
        g.beginPath(); g.moveTo(-hw, y); g.lineTo(0, y - hgt); g.lineTo(hw, y); g.closePath(); g.fill();
        g.fillStyle = T(snow ? '#3d8068' : POSTER ? (variant ? '#0b6a63' : '#05766f') : '#3a9254'); g.beginPath(); g.moveTo(-hw, y); g.lineTo(0, y - hgt); g.lineTo(-hw * 0.2, y); g.closePath(); g.fill();
        if (snow) { g.fillStyle = T('#ffffff'); g.beginPath(); g.moveTo(-hw * 0.62, y - hgt * 0.38); g.lineTo(0, y - hgt); g.lineTo(hw * 0.62, y - hgt * 0.38); g.lineTo(hw * 0.3, y - hgt * 0.3); g.lineTo(0, y - hgt * 0.5); g.lineTo(-hw * 0.3, y - hgt * 0.3); g.closePath(); g.fill(); }
      });
    } else if (kind === FL.CACTUS) {
      const col = T(variant ? '#438c67' : '#2f7d5c'), hi = T('#78ba8e');
      g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      const arm = (sx, up, dir) => { g.lineWidth = 9; g.beginPath(); g.moveTo(0, sx); g.lineTo(dir * 15, sx); g.lineTo(dir * 15, sx - up); g.stroke(); };
      g.lineWidth = 15; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -74); g.stroke();
      arm(-30, 26, -1); arm(-44, 20, 1);
      g.strokeStyle = hi; g.lineWidth = 3; g.beginPath(); g.moveTo(-3, -6); g.lineTo(-3, -66); g.stroke();
      circ(0, -78, 5, T('#fb5f35')); circ(0, -78, 2, T('#f5e594'));
    } else if (kind === FL.BUSH) {
      const pal = variant ? ['#4aa05a', '#69bd6f', '#2f7d45'] : ['#55ad5e', '#78c97b', '#378a4a'];
      [[-17, -13, 14], [0, -20, 19], [17, -13, 14], [-6, -12, 15], [9, -10, 14]].forEach(([x, y, r]) => circ(x, y, r, T(pal[0])));
      circ(-6, -26, 10, T(pal[1])); circ(-18, -17, 7, T(pal[1]));
      circ(9, -26, 2.4, T('#fb7185')); circ(-12, -14, 2.2, T('#fde047')); circ(18, -14, 2.2, T('#fb7185'));
    } else if (kind === FL.DEAD) {
      // tronco bruciato: nero-viola, rami spogli, qualche brace sulla punta
      g.strokeStyle = T(variant ? '#2a1d24' : '#33232b'); g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = 9; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4, -40, (variant ? 5 : -5), -78); g.stroke();
      g.lineWidth = 5;
      [[-6, -44, -24, -58, -30, -76], [3, -56, 20, -66, 26, -86], [(variant ? 4 : -4), -70, -10, -86, -6, -102]].forEach(([x0, y0, cx, cy, x1, y1]) => { g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke(); });
      g.lineWidth = 3; g.beginPath(); g.moveTo(-24, -58); g.lineTo(-38, -62); g.moveTo(20, -66); g.lineTo(34, -70); g.stroke();
      circ(-30, -76, 2.6, T('#ff7a24')); circ(26, -86, 2.4, T('#ffb347')); circ(-6, -102, 2.2, T('#ff7a24'));
    } else if (kind === FL.PALM) {
      g.strokeStyle = T(POSTER ? '#6a3a22' : '#8a5f35'); g.lineCap = 'round'; g.lineWidth = POSTER ? 6 : 8;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -50, (variant ? -8 : 6), -88); g.stroke();
      g.strokeStyle = T('#6b4526'); g.lineWidth = 2;
      for (let y = -12; y > -80; y -= 12) { g.beginPath(); g.moveTo(-4, y); g.lineTo(5, y - 2); g.stroke(); }
      const tx = variant ? -8 : 6, ty = -88;
      g.fillStyle = T(POSTER ? '#027a71' : '#3aa163');
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
    [[LAND ? '#f9d3c6' : '#ffffff', atlas.clouds], [LAND ? '#f6b9a8' : '#ffc6a6', atlas.cloudsWarm]].forEach(([col, out]) => {
      CLOUD_SHAPES.forEach(shape => {
        const cv = mkCanvas(150, 90), g = cv.g;
        g.translate(30, 44);
        g.fillStyle = LAND ? '#e59a8f' : 'rgba(120,150,190,0.30)';          // ombra sotto (nel Paesaggio: salmone, a strati)
        g.beginPath(); shape.forEach(([x, y, r]) => { g.moveTo(x + r, y + 7); g.arc(x, y + 7, r, 0, TAU); }); g.fill();
        g.fillStyle = col;
        g.beginPath(); shape.forEach(([x, y, r]) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }); g.fill();
        if (LAND) { g.fillStyle = 'rgba(255,240,232,0.7)'; g.beginPath(); shape.forEach(([x, y, r]) => { g.moveTo(x + r * 0.62, y - r * 0.3); g.arc(x - r * 0.1, y - r * 0.3, r * 0.62, 0, TAU); }); g.fill(); }
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
      const cols = kind === 0 ? ['#438c67', '#5fa87d', '#367a58', '#78ba8e'] : ['#e3937a', '#ecbd6f', '#c9633f', '#fb5f35'];
      for (let i = 0; i < n; i++) { const x = rnd(i, 1) * FG_W; blade(x, 26 + rnd(i, 2) * 52, 3 + rnd(i, 3) * 3, (rnd(i, 4) - 0.5) * 22, cols[i % cols.length]); }
      if (kind === 0) {
        for (let i = 0; i < 9; i++) {         // margherite di primo piano
          const x = (i + 0.3 + rnd(i, 7) * 0.4) / 9 * FG_W, h = 44 + rnd(i, 8) * 34;
          g.strokeStyle = '#438c67'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 2); g.quadraticCurveTo(x + 6, -h * 0.5, x + 2, -h); g.stroke();
          g.fillStyle = '#f8f4dc'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.ellipse(x + 2 + Math.cos(a) * 9, -h + Math.sin(a) * 9, 6.5, 3.2, a, 0, TAU); g.fill(); }
          g.fillStyle = '#fb5f35'; g.beginPath(); g.arc(x + 2, -h, 5, 0, TAU); g.fill();
        }
      } else {
        for (let i = 0; i < 18; i++) { const x = rnd(i, 11) * FG_W, y = -rnd(i, 12) * 26 + 2; g.fillStyle = ['#fb5f35', '#ecbd6f', '#f5e594', '#e3937a'][i % 4]; g.save(); g.translate(x, y); g.rotate(rnd(i, 13) * TAU); g.beginPath(); g.ellipse(0, 0, 9, 5, 0, 0, TAU); g.fill(); g.restore(); }
      }
    } else if (kind === 2) {
      for (let i = 0; i < 46; i++) {
        const x = rnd(i, 21) * FG_W, h = 22 + rnd(i, 22) * 62, w = 6 + rnd(i, 23) * 9;
        g.fillStyle = i % 3 ? '#cfeae6' : '#a6d8d8';
        g.beginPath(); g.moveTo(x - w, 4); g.lineTo(x - w * 0.5, -h * 0.7); g.lineTo(x, -h); g.lineTo(x + w * 0.5, -h * 0.65); g.lineTo(x + w, 4); g.closePath(); g.fill();
        g.fillStyle = 'rgba(248,244,220,0.7)'; g.beginPath(); g.moveTo(x - w * 0.5, 0); g.lineTo(x - w * 0.3, -h * 0.65); g.lineTo(x, -h); g.lineTo(x - w * 0.1, -h * 0.2); g.closePath(); g.fill();
      }
      for (let i = 0; i < 24; i++) { const x = rnd(i, 25) * FG_W; g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, 2, 30 + rnd(i, 26) * 30, 10 + rnd(i, 27) * 8, 0, Math.PI, TAU); g.fill(); }
    } else if (kind === 3) {
      for (let i = 0; i < 110; i++) { const x = rnd(i, 31) * FG_W; blade(x, 18 + rnd(i, 32) * 40, 2.5 + rnd(i, 33) * 2.5, (rnd(i, 34) - 0.5) * 26, ['#ecbd6f', '#e3937a', '#c4953f'][i % 3]); }
      for (let i = 0; i < 16; i++) { const x = rnd(i, 35) * FG_W, r = 9 + rnd(i, 36) * 18; g.fillStyle = ['#c9633f', '#d98b57', '#a8553a'][i % 3]; g.beginPath(); g.ellipse(x, 3, r * 1.3, r, 0, Math.PI, TAU); g.fill(); }
    } else if (kind === 6) {
      // rocce di basalto nere con venature di brace
      for (let i = 0; i < 26; i++) {
        const x = rnd(i, 51) * FG_W, r = 12 + rnd(i, 52) * 26;
        g.fillStyle = ['#3a2a32', '#4a343a', '#2d2126'][i % 3]; g.beginPath(); g.moveTo(x - r * 1.4, 4); g.lineTo(x - r * 0.8, -r * 0.8); g.lineTo(x - r * 0.1, -r); g.lineTo(x + r * 0.7, -r * 0.7); g.lineTo(x + r * 1.4, 4); g.closePath(); g.fill();
        g.strokeStyle = '#fb5f35'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - r * 0.5, 0); g.lineTo(x - r * 0.2, -r * 0.45); g.lineTo(x + r * 0.15, -r * 0.3); g.lineTo(x + r * 0.35, -r * 0.7); g.stroke();
      }
      for (let i = 0; i < 40; i++) { const x = rnd(i, 53) * FG_W, h = 8 + rnd(i, 54) * 22; g.fillStyle = 'rgba(30,20,26,0.9)'; g.beginPath(); g.moveTo(x - 6, 4); g.lineTo(x, -h); g.lineTo(x + 6, 4); g.closePath(); g.fill(); }
    } else if (kind === 4) {
      for (let i = 0; i < 70; i++) { const x = rnd(i, 41) * FG_W, h = 40 + rnd(i, 42) * 70; blade(x, h, 2.2 + rnd(i, 43) * 1.6, (rnd(i, 44) - 0.5) * 18, ['#027a71', '#5bb5b0', '#015a53'][i % 3]); }
      for (let i = 0; i < 16; i++) {          // tife (cattails)
        const x = rnd(i, 45) * FG_W, h = 62 + rnd(i, 46) * 48;
        g.strokeStyle = '#027a71'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 2); g.quadraticCurveTo(x + 4, -h * 0.5, x + 1, -h); g.stroke();
        g.fillStyle = '#c9633f'; g.beginPath(); g.ellipse(x + 1, -h - 8, 4.5, 12, 0, 0, TAU); g.fill();
      }
    }
    return cv.c;
  }

  function bakeAll() {
    atlas.trees = [];
    for (let k = 0; k < 8; k++) { atlas.trees[k] = []; for (let l = 1; l < 4; l++) atlas.trees[k][l] = [bakeTree(k, LAYER[l].fog, 0), bakeTree(k, LAYER[l].fog, 1)]; }
    bakeSun(); bakeClouds();
    atlas.fg = [0, 1, 2, 3, 4, 5, 6].map(k => (k === 1 ? null : bakeForeground(k)));
    bakedPr = pr; dirty = false;
  }

  // Bioma di una zona vista dal punto x: dentro il tratto speciale (e solo fino alla sua fine) usa la tavolozza del mondo locale,
  // così terreno, superficie, acqua e primo piano cambiano insieme allo sfondo e non restano "classici".
  const SEG_B = {};
  const segBiomes = wd => SEG_B[wd] || (SEG_B[wd] = makeWorldBiomes(wd));
  function bioAt(z, x) {
    const sw = z.specialWorld;
    if (!sw || !S.segment || sw !== S.segment.world || x > S.segment.end) return ACTIVE_BIOMES[z.biome];
    return segBiomes(sw)[z.biome];
  }

  // ---------- pista -------------------------------------------------------------------------
  function setTrack(zones, fx, world = 'classic', worldSegment = null) {
    Z.length = 0; finishX = fx;
    const validWorld = ['classic', 'paradise', 'inferno', 'atlantis', 'enchanted', 'neon'].includes(world) ? world : 'classic';
    // I tre nuovi mondi sono set-piece locali: il resto della pista resta nel mondo classico.
    S.segment = worldSegment && ['atlantis', 'enchanted', 'neon'].includes(worldSegment.world)
      ? { world: worldSegment.world, start: worldSegment.start, end: worldSegment.end, length: worldSegment.length }
      : null;
    S.segmentBlend = 0; S.segmentActive = false;
    S.world = S.segment ? 'classic' : validWorld;
    S.bannerWorld = null;
    ACTIVE_BIOMES = makeWorldBiomes(S.world);
    zones.forEach(z => Z.push({ start: z.start, end: z.end, biome: ZONE_TO_BIOME[z.key] != null ? ZONE_TO_BIOME[z.key] : 0, key: z.key, specialWorld: z.specialWorld || null, specialPart: z.specialPart || null }));
    S.zi = 0; S.zi0 = 0; S.lastZone = -1; S.bannerT = -10;
    P.forEach(p => { p.on = false; });
  }
  function setView(d, vs) {
    dpr = d; viewScale = vs;
    const npr = clamp(d * vs, 0.8, 2);
    if (Math.abs(npr - pr) > 0.15 || !atlas.trees) { pr = npr; dirty = true; }
  }
  function warmup() { if (dirty || !atlas.trees) bakeAll(); preloadWorldArt(); }
  function bannerText() {
    if (S.bannerName === '@world') return I18n.t('world.tag.' + (S.bannerWorld || S.world));
    const i = BIOMES.findIndex(b => b.name === S.bannerName); return i >= 0 ? I18n.t('biome.' + i) : S.bannerName;
  }
  function announce(now) { S.bannerT = now; S.bannerWorld = null; S.bannerName = S.world === 'classic' ? S.A.name : '@world'; S.lastZone = S.zi; }

  // ---------- stelle, uccelli, nuvole --------------------------------------------------------
  const STARS = Array.from({ length: 80 }, (_, i) => ({ x: rnd(i, 1), y: rnd(i, 2), r: 1 + rnd(i, 3) * 1.8, ph: rnd(i, 4) * 6.28 }));
  const BIRDS = Array.from({ length: 5 }, (_, i) => ({ x0: rnd(i, 5) * 1400, y: 0.12 + rnd(i, 6) * 0.3, v: 28 + rnd(i, 7) * 22, s: 0.8 + rnd(i, 8) * 0.8, ph: rnd(i, 9) * 6.28 }));
  const CLOUDS = Array.from({ length: 9 }, (_, i) => ({ x0: i * 330 + rnd(i, 11) * 200, y: 0.07 + rnd(i, 12) * 0.34, s: 0.75 + rnd(i, 13) * 0.95, shape: i % 4, par: 0.03 + rnd(i, 14) * 0.07, drift: 4 + rnd(i, 15) * 8, a: 0.62 + rnd(i, 16) * 0.35 }));
  const CLOUD_WRAP = 3000;

  // ---------- particelle (pool fisso, nessuna allocazione per fotogramma) --------------------
  const PMAX = 56;
  const P = Array.from({ length: PMAX }, () => ({ on: false, kind: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, par: 1, col: 0, ph: 0 }));
  const K_SNOW = 0, K_LEAF = 1, K_DUST = 2, K_GLOW = 3, K_BUTTERFLY = 4, K_CONFETTI = 5, K_EMBER = 6, K_ASH = 7;
  const LEAF_COLS = ['#d9531f', '#f08a2a', '#ffc247', '#b8461d', '#c9372c'];
  const CONF_COLS = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#ffffff'];
  const BFLY_COLS = ['#fb923c', '#f472b6', '#60a5fa', '#facc15', '#c084fc'];
  const want = [0, 0, 0, 0, 0, 0, 0, 0], alive = [0, 0, 0, 0, 0, 0, 0, 0];

  function addWanted(b, wgt) {
    if (wgt <= 0) return;
    switch (b.part) {
      case 'meadow':   want[K_BUTTERFLY] += S.day * 3 * wgt; want[K_GLOW] += (S.warm * 0.6 + S.night) * 9 * wgt; break;
      case 'snow':     want[K_SNOW] += 26 * wgt; break;
      case 'dust':     want[K_DUST] += 8 * wgt; break;
      case 'lagoon':   want[K_GLOW] += 8 * wgt; want[K_BUTTERFLY] += S.day * 1.5 * wgt; break;
      case 'leaves':   want[K_LEAF] += 16 * wgt; break;
      case 'confetti': want[K_CONFETTI] += 26 * wgt; break;
      case 'ember':    want[K_EMBER] += 16 * wgt; want[K_ASH] += 9 * wgt; break;
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
      case K_EMBER:    p.x = r() * (w + 60); p.y = gy + 6 - r() * 40; p.vx = -10 + r() * 30; p.vy = -(46 + r() * 70); p.size = 1.3 + r() * 2; p.max = 3 + r() * 3; p.par = 0.9 + r() * 0.3; break;
      case K_ASH:      p.x = r() * (w + 100); p.y = -8; p.vx = 12 + r() * 20; p.vy = 18 + r() * 24; p.size = 3 + r() * 4; p.max = 16; p.vr = (r() - 0.5) * 2.5; p.par = 0.5 + r() * 0.4; break;
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
        case K_EMBER: p.x += Math.sin(p.life * 4 + p.ph) * 22 * dt; p.vy *= 0.995; break;
        case K_ASH: p.x += Math.sin(p.life * 1.6 + p.ph) * 18 * dt; p.rot += p.vr * dt; break;
      }
      const ground = S.gy - 4;
      const gone = p.life > p.max || p.x < -80 || p.x > S.w + 120 || ((p.kind === K_SNOW || p.kind === K_LEAF || p.kind === K_CONFETTI || p.kind === K_ASH) && p.y > ground + 10 * (1 + (p.ph % 3)))
        || total >= lim || want[p.kind] < 0.5;
      if (gone) { p.on = false; continue; }
      alive[p.kind]++; total++;
    }
    if (lim === 0) return;
    for (let k = 0, spawned = 0; k < 8 && spawned < 2; k++) if (alive[k] < want[k] - 0.5 && total < lim) { spawn(k, glowCol); spawned++; total++; }
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
        case K_EMBER: { const tw = 0.6 + 0.4 * Math.sin(p.life * 17 + p.ph), al = a * tw;
          ctx.fillStyle = `rgba(255,120,30,${(0.2 * al).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.4, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(255,214,110,${(0.95 * al).toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break; }
        case K_ASH: ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = a * 0.55; ctx.fillStyle = '#3a2d33'; ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.7 + 0.3); ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7); ctx.restore(); break;
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
    if (S.segment) {
      // Il set-piece entra in scena quando raggiunge il campo visivo e svanisce quando lo lascia.
      // La sfumatura evita un cambio di fondale brusco ai bordi delle 2,5 zone speciali.
      const viewL = camX + w * 0.16, viewR = camX + w * 0.82;
      const overlap = Math.max(0, Math.min(viewR, S.segment.end) - Math.max(viewL, S.segment.start));
      const feather = Math.max(120, w * 0.34);
      S.segmentBlend = smooth(overlap / feather);
      const center = camX + w * 0.40;
      S.segmentActive = center >= S.segment.start && center <= S.segment.end;
    } else { S.segmentBlend = 0; S.segmentActive = false; }

    // dall'alba al tramonto lungo la gara
    const bx = camX + w * 0.4;
    S.p = clamp(bx / finishX, 0, 1);
    const th = Math.PI * (0.08 + 0.88 * S.p);
    S.e = Math.sin(th);
    S.warm = clamp(1 - (S.e - 0.2) / 0.5, 0, 1);
    S.night = smooth((0.2 - S.e) / 0.12);
    S.day = clamp((S.e - 0.14) / 0.5, 0, 1);
    if (S.world === 'paradise') {
      // Un mondo celeste resta luminoso: niente notti viola o tramonti arancioni.
      S.e = Math.max(0.82, S.e);
      S.warm = 0.015; S.night = 0; S.day = 1; S.starA = 0;
    } else if (S.world === 'inferno') {
      // L'Inferno mantiene un crepuscolo tempestoso e costante.
      S.e = 0.18; S.warm = 0.24; S.night = 0.34; S.day = 0.06; S.starA = 0.02;
    } else if (S.world === 'atlantis') {
      // Luce filtrata sott'acqua: blu profondo ma abbastanza chiaro per leggere la pista.
      S.e = 0.72; S.warm = 0; S.night = 0; S.day = 1; S.starA = 0;
    } else if (S.world === 'enchanted') {
      // Crepuscolo boschivo permanente, con lucciole e riflessi lilla.
      S.e = 0.22; S.warm = 0.02; S.night = 0.48; S.day = 0.12; S.starA = 0.22;
    } else if (S.world === 'neon') {
      // Notte urbana: i neon restano leggibili per tutta la gara.
      S.e = 0.12; S.warm = 0; S.night = 0.72; S.day = 0.04; S.starA = 0.12;
    } else {
      S.starA = S.night * 0.9;
    }
    S.sunR = S.world === 'inferno' ? clamp(w * 0.062, 42, 58) : clamp(w * 0.07, 34, 62) * (1 + (1 - S.e) * 0.35);
    S.sunX = S.world === 'inferno' ? w * 0.76 : w * (0.5 - 0.42 * Math.cos(th));
    S.sunY = S.world === 'inferno' ? gy * 0.27 : gy - 36 * S.hs - S.e * gy * 0.66;

    // zona sotto la telecamera + sfumatura verso la vicina
    let zi = S.zi;
    while (zi > 0 && Z[zi].start > bx) zi--;
    while (zi < Z.length - 1 && Z[zi].end <= bx) zi++;
    S.zi = zi;
    const z = Z[zi], u = bx - z.start, len = z.end - z.start;
    let ib = z.biome, t = 0;
    if (u < SB / 2 && zi > 0) { ib = Z[zi - 1].biome; t = smooth(0.5 - u / SB); }
    else if (len - u < SB / 2 && zi < Z.length - 1) { ib = Z[zi + 1].biome; t = smooth(0.5 - (len - u) / SB); }
    S.A = bioAt(z, bx);
    const zn = (u < SB / 2 && zi > 0) ? Z[zi - 1] : (len - u < SB / 2 && zi < Z.length - 1) ? Z[zi + 1] : null;
    S.B = zn ? bioAt(zn, zn === Z[zi - 1] ? zn.end - 1 : zn.start) : S.A; S.t = t;
    let z0 = S.zi0;
    while (z0 > 0 && Z[z0].start > camX) z0--;
    while (z0 < Z.length - 1 && Z[z0].end <= camX) z0++;
    S.zi0 = z0;
    if (zi !== S.lastZone && u > 60) {
      S.lastZone = zi; S.bannerT = now;
      if (z.specialWorld) { S.bannerName = '@world'; S.bannerWorld = z.specialWorld; }
      else { S.bannerWorld = null; S.bannerName = z.biome === 6 ? ACTIVE_BIOMES[6].name : ACTIVE_BIOMES[z.biome].name; }
    }

    // cielo
    const A = S.A, B = S.B;
    let sT = mix(A.skyT, B.skyT, t), sB = mix(A.skyB, B.skyB, t);
    if (POSTER && !LAND) { const em = (A.part === 'ember' ? 1 - t : 0) + (B.part === 'ember' ? t : 0); sT = mix(sT, sB, 0.8 * (1 - em)); }   // cielo quasi piatto (tranne il vulcano)
    sT = mix(mix(sT, DUSK_T, S.warm * (LAND ? 0.3 : 0.6)), NIGHT_T, S.night);
    sB = mix(mix(sB, DUSK_B, S.warm * (LAND ? 0.35 : 0.65)), NIGHT_B, S.night);
    S.skyT = sT; S.skyB = sB; S.sunC = mix(A.sun, B.sun, t);

    // creste: forma e colori mescolati fra i due biomi, poi tinti dall'ora del giorno
    for (let l = 0; l < 4; l++) {
      const R = RP[l], L = LAYER[l], am = (A.amp + (B.amp - A.amp) * t) * (LAND ? 1.18 : 1);
      R.wR = A.wR + (B.wR - A.wR) * t; R.wP = A.wP + (B.wP - A.wP) * t; R.wM = A.wM + (B.wM - A.wM) * t;
      R.A = L.amp * S.hs * am; R.off = L.off * S.hs;
      R.f1 = L.f1; R.f2 = L.f2; R.f3 = L.f3; R.p1 = L.p1; R.p2 = L.p2; R.p3 = L.p3;
      let c = mix(A.ridge[l], B.ridge[l], t);
      c = tod(c, 0.3 - l * 0.04, 0.6);
      R.col = c;
      R.colB = mix(c, sB, LAND ? 0.5 - l * 0.1 : POSTER ? 0.08 : 0.5 - l * 0.1);
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
  // Il Paradiso deve essere immediatamente leggibile: isole sospese con cascate,
  // templi marmorei, aureole dorate, arcobaleni e un mare di nuvole in primo piano.
  function drawParadiseTemple(ctx, cx, base, scale, now) {
    const s = scale;
    ctx.save(); ctx.translate(cx, base); ctx.scale(s, s);

    // alone dorato dietro il tempio
    const halo = ctx.createRadialGradient(0, -92, 10, 0, -92, 132);
    halo.addColorStop(0, 'rgba(255,246,196,0.78)');
    halo.addColorStop(0.55, 'rgba(255,239,173,0.25)');
    halo.addColorStop(1, 'rgba(255,239,173,0)');
    ctx.fillStyle = halo; ctx.fillRect(-145, -230, 290, 255);

    // gradinata
    ctx.fillStyle = '#d4e8ed';
    ctx.beginPath(); ctx.moveTo(-92, 0); ctx.lineTo(92, 0); ctx.lineTo(76, -16); ctx.lineTo(-76, -16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff9e8'; ctx.fillRect(-84, -21, 168, 7);
    ctx.fillStyle = '#b8d4df'; ctx.fillRect(-71, -31, 142, 10);
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(-76, -35, 152, 5);

    // corpo del tempio e ombre laterali
    ctx.fillStyle = '#f8fbf7'; ctx.fillRect(-70, -105, 140, 69);
    ctx.fillStyle = '#d8eaf0'; ctx.fillRect(48, -103, 22, 67);
    ctx.fillStyle = '#fffdf4'; ctx.fillRect(-76, -111, 152, 9);
    ctx.fillStyle = '#d7e7e9'; ctx.fillRect(-78, -37, 156, 5);

    // portale della basilica: arco luminoso, con un piccolo mosaico sopra l'ingresso
    ctx.fillStyle = '#b8d9e5';
    ctx.beginPath(); ctx.moveTo(-19, -37); ctx.lineTo(-19, -76); ctx.arc(0, -76, 19, Math.PI, 0); ctx.lineTo(19, -37); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff0bd';
    ctx.beginPath(); ctx.moveTo(-12, -37); ctx.lineTo(-12, -74); ctx.arc(0, -74, 12, Math.PI, 0); ctx.lineTo(12, -37); ctx.closePath(); ctx.fill();

    // rosone cristiano: vetro azzurro e raggi dorati sopra il portale
    ctx.fillStyle = '#d9eef1'; ctx.beginPath(); ctx.arc(0, -91, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = '#83b9d0'; ctx.beginPath(); ctx.arc(0, -91, 8.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e6c979'; ctx.lineWidth = 1.8;
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 3, -91 + Math.sin(a) * 3); ctx.lineTo(Math.cos(a) * 8, -91 + Math.sin(a) * 8); ctx.stroke(); }
    ctx.fillStyle = '#fff3c6'; ctx.beginPath(); ctx.arc(0, -91, 2.8, 0, TAU); ctx.fill();

    // colonne ioniche stilizzate
    for (let i = 0; i < 6; i++) {
      const x = -57 + i * 22.8;
      if (x > -25 && x < 25) continue;
      ctx.fillStyle = '#fffdf5'; ctx.fillRect(x - 4.5, -98, 9, 57);
      ctx.fillStyle = '#c6dfe7'; ctx.fillRect(x + 2.5, -97, 2, 54);
      ctx.fillStyle = '#f4d98f'; ctx.fillRect(x - 7, -101, 14, 4); ctx.fillRect(x - 7, -42, 14, 4);
    }

    // frontone triangolare e cornice dorata
    ctx.fillStyle = '#fff9e9'; ctx.beginPath(); ctx.moveTo(-88, -111); ctx.lineTo(0, -161); ctx.lineTo(88, -111); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d8b967'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-82, -113); ctx.lineTo(0, -157); ctx.lineTo(82, -113); ctx.stroke();
    ctx.fillStyle = '#e7c878'; ctx.beginPath(); ctx.arc(0, -125, 8, 0, TAU); ctx.fill();

    // cupola centrale e croce: il profilo richiama una basilica cristiana, non un tempio pagano
    ctx.fillStyle = '#f9fcf7'; ctx.beginPath(); ctx.ellipse(0, -164, 36, 25, 0, Math.PI, TAU); ctx.lineTo(36, -160); ctx.lineTo(-36, -160); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d6b866'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -164, 36, 25, 0, Math.PI, TAU); ctx.stroke();
    ctx.fillStyle = '#e8c978'; ctx.fillRect(-3, -194, 6, 12); ctx.beginPath(); ctx.arc(0, -197, 5, 0, TAU); ctx.fill();
    // croce latina dorata in cima alla cupola, con un alone appena percettibile
    const cg = ctx.createRadialGradient(0, -226, 2, 0, -226, 34);
    cg.addColorStop(0, 'rgba(255,246,197,0.56)'); cg.addColorStop(1, 'rgba(255,246,197,0)');
    ctx.fillStyle = cg; ctx.fillRect(-36, -260, 72, 68);
    ctx.strokeStyle = '#c8a34f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -248); ctx.lineTo(0, -205); ctx.moveTo(-13, -235); ctx.lineTo(13, -235); ctx.stroke();
    ctx.strokeStyle = '#fff0ba'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -246); ctx.lineTo(0, -207); ctx.moveTo(-11, -235); ctx.lineTo(11, -235); ctx.stroke();

    // torrette laterali con piccole cupole
    for (const side of [-1, 1]) {
      const x = side * 103;
      ctx.fillStyle = '#eef7f7'; ctx.fillRect(x - 14, -83, 28, 83);
      ctx.fillStyle = '#d5e8ec'; ctx.fillRect(x + 7, -82, 7, 82);
      ctx.fillStyle = '#f8fbf5'; ctx.beginPath(); ctx.ellipse(x, -84, 18, 13, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = '#d8bd78'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, -84, 18, 13, 0, Math.PI, TAU); ctx.stroke();
      ctx.fillStyle = '#d8bd78'; ctx.beginPath(); ctx.arc(x, -99, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#c8a34f'; ctx.lineWidth = 2.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, -119); ctx.lineTo(x, -104); ctx.moveTo(x - 5, -114); ctx.lineTo(x + 5, -114); ctx.stroke();
    }

    // bandiere sottili animate
    ctx.strokeStyle = '#d8bd78'; ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const x = side * 124; ctx.beginPath(); ctx.moveTo(x, -112); ctx.lineTo(x, -149); ctx.stroke();
      ctx.fillStyle = '#f0c96f'; ctx.beginPath(); ctx.moveTo(x, -148); ctx.quadraticCurveTo(x + side * (12 + 3 * Math.sin(now * 2 + side)), -143, x + side * 17, -137); ctx.lineTo(x, -133); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawParadiseIslands(ctx) {
    if (S.world !== 'paradise' || quality >= 2) return;
    const w = S.w, gy = S.gy, now = S.now / 1000, period = 2380;
    const first = Math.floor((S.camX * 0.12 - 900) / period);

    // raggi di luce molto morbidi, non una semplice tinta azzurra
    ctx.save();
    const sunX = w * 0.76, sunY = gy * 0.19;
    const aura = ctx.createRadialGradient(sunX, sunY, 12, sunX, sunY, gy * 0.72);
    aura.addColorStop(0, 'rgba(255,248,212,0.48)'); aura.addColorStop(0.42, 'rgba(255,248,212,0.13)'); aura.addColorStop(1, 'rgba(255,248,212,0)');
    ctx.fillStyle = aura; ctx.fillRect(0, 0, w, gy * 0.92);

    // arcobaleno dietro alle isole: forma grande e tenue, riconoscibile senza rubare la scena
    const rx = w * 0.51, ry = gy * 0.66, rr = Math.min(w * 0.34, gy * 0.62);
    const rainbow = ['rgba(255,126,120,0.15)','rgba(255,192,112,0.16)','rgba(255,235,142,0.17)','rgba(143,218,170,0.16)','rgba(111,197,238,0.17)','rgba(164,157,239,0.14)'];
    for (let i = 0; i < rainbow.length; i++) {
      ctx.strokeStyle = rainbow[i]; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(rx, ry, rr - i * 10, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    }

    // Isole principali: silhouette rocciosa, prato luminoso, cascate e templi.
    const spacing = 850; // isole più distanziate: ogni apparizione deve avere spazio visivo
    const scroll = (S.camX * 0.12) % spacing;
    const firstIsland = Math.floor((S.camX * 0.12 - 470) / spacing);
    for (let n = firstIsland; n <= firstIsland + 4; n++) {
      const islandJitter = (rnd(n, 779) - 0.5) * 150;
      const x = n * spacing + 470 + islandJitter - S.camX * 0.12;
      if (x < -500 || x > w + 500) continue;
      const bob = Math.sin(now * 0.45 + n * 1.7) * 4;
      const big = ((n % 2) + 2) % 2 === 0;
      const iw = big ? 455 : 270, top = gy * (big ? 0.43 : 0.52) + bob, depth = big ? 112 : 76;

      // ombra sospesa
      ctx.fillStyle = 'rgba(57,111,151,0.10)'; ctx.beginPath(); ctx.ellipse(x, top + depth + 17, iw * 0.42, 15, 0, 0, TAU); ctx.fill();

      // cascata che scende fra le nuvole
      for (const dx of [-iw * 0.23, iw * 0.20]) {
        const wh = big ? 185 : 118, wave = Math.sin(now * 1.1 + dx) * 7;
        const wg = ctx.createLinearGradient(0, top + 15, 0, top + wh);
        wg.addColorStop(0, 'rgba(255,255,255,0.88)'); wg.addColorStop(0.55, 'rgba(175,235,250,0.58)'); wg.addColorStop(1, 'rgba(198,240,250,0)');
        ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(x + dx - 9, top + 8); ctx.bezierCurveTo(x + dx - 14 + wave, top + wh * 0.38, x + dx + 10 - wave, top + wh * 0.7, x + dx + 3, top + wh); ctx.lineTo(x + dx + 19, top + wh); ctx.bezierCurveTo(x + dx + 23, top + wh * 0.65, x + dx + 2, top + wh * 0.35, x + dx + 8, top + 8); ctx.closePath(); ctx.fill();
      }

      // corpo dell'isola: roccia azzurra sfaccettata
      const rock = ctx.createLinearGradient(0, top, 0, top + depth);
      rock.addColorStop(0, '#d8edf0'); rock.addColorStop(0.38, '#9fc8d9'); rock.addColorStop(1, '#668eaa');
      ctx.fillStyle = rock; ctx.beginPath(); ctx.moveTo(x - iw/2, top); ctx.quadraticCurveTo(x - iw*0.38, top + 25, x - iw*0.27, top + 47); ctx.lineTo(x - iw*0.08, top + depth*0.78); ctx.lineTo(x + iw*0.05, top + depth); ctx.lineTo(x + iw*0.20, top + depth*0.72); ctx.quadraticCurveTo(x + iw*0.40, top + 40, x + iw/2, top); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.42)'; ctx.beginPath(); ctx.moveTo(x - iw*0.42, top + 12); ctx.lineTo(x - iw*0.08, top + depth*0.72); ctx.lineTo(x - iw*0.20, top + depth*0.28); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(70,125,157,0.25)'; ctx.beginPath(); ctx.moveTo(x + iw*0.12, top + 15); ctx.lineTo(x + iw*0.05, top + depth); ctx.lineTo(x + iw*0.29, top + depth*0.4); ctx.closePath(); ctx.fill();

      // prato e bordo in pietra chiara
      ctx.fillStyle = '#f2f6d8'; ctx.beginPath(); ctx.ellipse(x, top + 2, iw * 0.51, 22, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#9ed4a5'; ctx.beginPath(); ctx.ellipse(x, top - 4, iw * 0.49, 18, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff5d7'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, top + 1, iw * 0.50, 19, 0, Math.PI, TAU); ctx.stroke();

      if (big) {
        drawParadiseTemple(ctx, x, top - 8, 1.08, now);
        // cipressi chiari e piccoli alberi ai lati del tempio
        for (const side of [-1, 1]) {
          const tx = x + side * 148, ty = top - 9;
          ctx.fillStyle = '#609b83'; ctx.beginPath(); ctx.moveTo(tx, ty - 54); ctx.lineTo(tx - 15, ty - 7); ctx.lineTo(tx + 15, ty - 7); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#a9d4a0'; ctx.beginPath(); ctx.moveTo(tx, ty - 48); ctx.lineTo(tx - 8, ty - 20); ctx.lineTo(tx + 8, ty - 20); ctx.closePath(); ctx.fill();
        }
      } else {
        // piccola edicola luminosa sulle isole secondarie
        ctx.fillStyle = '#fffaf0'; ctx.fillRect(x - 30, top - 42, 60, 38);
        ctx.fillStyle = '#f4d98d'; ctx.beginPath(); ctx.moveTo(x - 39, top - 41); ctx.lineTo(x, top - 65); ctx.lineTo(x + 39, top - 41); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d4e8ed'; ctx.fillRect(x - 4, top - 29, 8, 25);
      }
    }

    // mare di nuvole in primo piano, stratificato e con ombre azzurre
    const cloudY = gy * 0.79;
    ctx.globalAlpha = 0.93;
    for (let i = -1; i < 8; i++) {
      const x = ((i * 260 - S.camX * 0.055) % (w + 520) + (w + 520)) % (w + 520) - 180;
      const y = cloudY + Math.sin(i * 1.7 + now * 0.16) * 13;
      ctx.fillStyle = 'rgba(145,194,220,0.28)';
      ctx.beginPath(); ctx.ellipse(x, y + 24, 154, 40, 0, 0, TAU); ctx.ellipse(x - 65, y + 4, 78, 52, 0, 0, TAU); ctx.ellipse(x + 50, y - 3, 94, 62, 0, 0, TAU); ctx.ellipse(x + 112, y + 17, 72, 43, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      ctx.beginPath(); ctx.ellipse(x, y + 14, 150, 37, 0, 0, TAU); ctx.ellipse(x - 66, y - 5, 78, 49, 0, 0, TAU); ctx.ellipse(x + 48, y - 15, 91, 58, 0, 0, TAU); ctx.ellipse(x + 111, y + 5, 70, 39, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(x + 37, y - 37, 44, 17, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawWorldEffects(ctx, camX, w, gy, raceTime = 0) {
    const world = S.segment && (camX + w * 0.40 >= S.segment.start - 80) && (camX + w * 0.40 <= S.segment.end + 80) ? S.segment.world : S.world;
    if (world === 'paradise') {
      for (const q of Terrain.CLOUD_PADS) {
        const x = q.x - camX; if (x < -80 || x > w + 80) continue;
        const y = gy - Terrain.height(q.x) - 2, pulse = 0.85 + 0.15 * Math.sin(raceTime / 240 + q.id);
        ctx.save(); ctx.globalAlpha = 0.82 * pulse; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(x, y, 30, 8, 0, 0, TAU); ctx.ellipse(x - 16, y - 5, 15, 9, 0, 0, TAU); ctx.ellipse(x + 14, y - 6, 17, 10, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(126,194,225,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 22, y + 6); ctx.quadraticCurveTo(x, y + 11, x + 22, y + 6); ctx.stroke(); ctx.restore();
      }
      for (const q of Terrain.UPDRAFTS) {
        const x = q.x - camX; if (x < -q.width || x > w + q.width) continue;
        const y = gy - Terrain.height(q.x), h = q.height, pulse = 0.75 + 0.25 * Math.sin(raceTime / 340 + q.id);
        ctx.save(); ctx.globalAlpha = 0.58 * pulse;
        const g = ctx.createLinearGradient(0, y - h, 0, y);
        g.addColorStop(0, 'rgba(194,241,255,0)'); g.addColorStop(0.55, 'rgba(155,225,246,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.78)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.bezierCurveTo(x - q.width * 0.48, y - h * 0.64, x - q.width * 0.26, y - h * 0.86, x, y - h); ctx.bezierCurveTo(x + q.width * 0.26, y - h * 0.86, x + q.width * 0.48, y - h * 0.64, x + 9, y); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.82)'; ctx.lineWidth = 2.2;
        for (let k = 0; k < 3; k++) { const yy = y - 22 - ((raceTime * 0.12 + k * 48 + q.id * 19) % Math.max(55, h - 30)); const xx = x + Math.sin(raceTime / 500 + k * 2 + q.id) * 23; ctx.beginPath(); ctx.moveTo(xx - 5, yy + 8); ctx.lineTo(xx, yy); ctx.lineTo(xx + 5, yy + 8); ctx.stroke(); }
        ctx.restore();
      }
    } else if (world === 'inferno') {
      for (const q of Terrain.GEYSERS) {
        const x = q.x - camX; if (x < -100 || x > w + 100) continue;
        const phase = ((raceTime / 1000 + q.phase) % q.period + q.period) % q.period;
        const y = gy - Terrain.lavaLevel(q.x);
        if (!Number.isFinite(y)) continue;
        const warning = phase > q.period - 0.55, active = phase < q.burst;
        if (!warning && !active) continue;
        const k = active ? Math.sin(Math.PI * phase / q.burst) : 0.22 + 0.18 * Math.sin(raceTime / 75 + q.id);
        ctx.save(); ctx.globalAlpha = active ? 0.9 : 0.55;
        ctx.fillStyle = warning ? 'rgba(255,190,80,0.55)' : 'rgba(255,110,35,0.5)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 24 + 10 * k, 6 + 2 * k, 0, 0, TAU); ctx.fill();
        if (active) {
          const h = 48 + 108 * k, half = 13 + 13 * k;
          const flame = ctx.createLinearGradient(0, y - h, 0, y); flame.addColorStop(0, 'rgba(255,238,150,0.08)'); flame.addColorStop(0.35, 'rgba(255,160,48,0.8)'); flame.addColorStop(1, 'rgba(220,45,20,0.92)');
          ctx.fillStyle = flame; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.quadraticCurveTo(x - half * 1.4, y - h * 0.55, x + Math.sin(raceTime / 90 + q.id) * half * 0.35, y - h); ctx.quadraticCurveTo(x + half * 1.4, y - h * 0.54, x + 5, y); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    } else if (world === 'atlantis') {
      for (const q of Terrain.BUBBLE_VENTS) {
        const x = q.x - camX; if (x < -q.width || x > w + q.width) continue;
        const y = gy - Terrain.height(q.x), pulse = 0.65 + 0.35 * Math.sin(raceTime / 430 + q.phase);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.7 * pulse;
        const g = ctx.createLinearGradient(0, y - q.height, 0, y); g.addColorStop(0, 'rgba(165,255,246,0)'); g.addColorStop(0.65, 'rgba(108,237,231,0.28)'); g.addColorStop(1, 'rgba(201,255,246,0.68)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 13, y); ctx.bezierCurveTo(x - q.width * 0.48, y - q.height * 0.42, x - 12, y - q.height * 0.74, x, y - q.height); ctx.bezierCurveTo(x + 12, y - q.height * 0.74, x + q.width * 0.48, y - q.height * 0.42, x + 13, y); ctx.closePath(); ctx.fill();
        for (let i = 0; i < 8; i++) { const yy = y - ((raceTime * 0.09 + i * 28 + q.phase * 17) % Math.max(40, q.height)); const xx = x + Math.sin(raceTime / 600 + i * 1.4 + q.id) * (12 + i * 2); ctx.strokeStyle = 'rgba(206,255,250,0.9)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(xx, yy, 3 + (i % 3), 0, TAU); ctx.stroke(); }
        ctx.restore();
      }
    } else if (world === 'enchanted') {
      for (const q of Terrain.CLOUD_PADS) {
        const x = q.x - camX; if (x < -90 || x > w + 90) continue;
        const y = gy - Terrain.height(q.x), pulse = 0.82 + 0.18 * Math.sin(raceTime / 330 + q.id);
        ctx.save(); ctx.globalAlpha = 0.92 * pulse;
        const glow = ctx.createRadialGradient(x, y - 20, 2, x, y - 20, 66); glow.addColorStop(0, 'rgba(206,139,255,0.35)'); glow.addColorStop(1, 'rgba(206,139,255,0)'); ctx.fillStyle = glow; ctx.fillRect(x - 70, y - 88, 140, 90);
        ctx.fillStyle = '#e7d7bd'; ctx.fillRect(x - 8, y - 25, 16, 25); ctx.fillStyle = '#a85fd2'; ctx.beginPath(); ctx.ellipse(x, y - 28, 30, 13, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f5e6ff'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * 13, y - 32, 3, 0, TAU); ctx.fill(); } ctx.restore();
      }
    } else if (world === 'neon') {
      for (const q of Terrain.NEON_BOOSTS) {
        const x = q.x - camX; if (x < -100 || x > w + 100) continue;
        const y = gy - Terrain.height(q.x), pulse = 0.6 + 0.4 * Math.sin(raceTime / 190 + q.id);
        ctx.save(); ctx.globalAlpha = 0.9; ctx.shadowBlur = 15; ctx.shadowColor = '#45f2ef'; ctx.strokeStyle = `rgba(70,245,238,${0.55 + 0.4 * pulse})`; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x - 36, y + 1); ctx.lineTo(x - 36, y - 64); ctx.quadraticCurveTo(x, y - 96, x + 36, y - 64); ctx.lineTo(x + 36, y + 1); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(244,87,222,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 24, y - 9); ctx.lineTo(x - 24, y - 58); ctx.lineTo(x, y - 76); ctx.lineTo(x + 24, y - 58); ctx.lineTo(x + 24, y - 9); ctx.stroke(); ctx.restore();
      }
    }
  }

  // Bufera infernale dantesca: nubi in rotazione, raffiche e lampi.
  // La lava resta nel paesaggio basso; il cielo racconta il secondo cerchio.
  function drawInfernoAtmosphere(ctx) {
    if (S.world !== 'inferno') return;
    const w = S.w, gy = S.gy, now = S.now / 1000;
    ctx.save();

    // vortice centrale: anelli ellittici deformati e ruotanti, come una bufera senza tregua
    const vx = w * 0.61 + Math.sin(now * 0.17) * 26, vy = gy * 0.31;
    const pulse = 0.84 + 0.16 * Math.sin(now * 1.7);
    const vg = ctx.createRadialGradient(vx, vy, 8, vx, vy, gy * 0.55);
    vg.addColorStop(0, 'rgba(15,17,29,0.04)');
    vg.addColorStop(0.42, 'rgba(21,18,32,0.08)');
    vg.addColorStop(0.72, 'rgba(32,19,35,0.33)');
    vg.addColorStop(1, 'rgba(26,17,30,0)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, gy * 0.9);

    // nubi a spirale: grandi masse scure stratificate con bordi cremisi
    for (let i = 0; i < 9; i++) {
      const wrap = w + 520;
      const x = ((i * 231 + 70 - S.camX * (0.025 + (i % 3) * 0.012) + now * (i % 2 ? 15 : -11) + wrap) % wrap) - 260;
      const y = gy * (0.10 + (i % 5) * 0.075) + Math.sin(now * 0.32 + i * 1.7) * 15;
      const sc = 0.72 + (i % 4) * 0.13;
      ctx.globalAlpha = 0.20 + (i % 3) * 0.045;
      ctx.fillStyle = i % 2 ? '#171827' : '#302033';
      ctx.beginPath();
      ctx.ellipse(x, y, 145 * sc, 25 * sc, 0, 0, TAU);
      ctx.ellipse(x - 57 * sc, y - 13 * sc, 68 * sc, 39 * sc, -0.15, 0, TAU);
      ctx.ellipse(x + 22 * sc, y - 24 * sc, 91 * sc, 46 * sc, 0.10, 0, TAU);
      ctx.ellipse(x + 105 * sc, y - 7 * sc, 62 * sc, 31 * sc, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#a84b5a'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(x + 15 * sc, y + 5 * sc, 100 * sc, 12 * sc, 0, 0.12, Math.PI - 0.12); ctx.stroke();
    }

    // lunghi filamenti di vento: traiettorie curve, sempre in movimento
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = gy * (0.17 + i * 0.071) + Math.sin(now * 0.7 + i) * 8;
      const drift = (now * (22 + i * 4)) % (w + 420);
      const x = drift - 210;
      ctx.globalAlpha = 0.19 + 0.055 * (i % 3);
      ctx.strokeStyle = i % 2 ? '#d98b98' : '#b7b5ca'; ctx.lineWidth = i % 3 === 0 ? 4 : 2.2;
      ctx.beginPath(); ctx.moveTo(x - 210, y + 34);
      ctx.bezierCurveTo(x - 90, y - 30, x + 15, y + 60, x + 145, y - 14);
      ctx.bezierCurveTo(x + 210, y - 49, x + 285, y - 36, x + 360, y - 4); ctx.stroke();
    }
    ctx.restore();

    // piccolo turbine nel cielo, sopra la linea delle montagne
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(-now * 0.16);
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.13 + i * 0.035;
      ctx.strokeStyle = i % 2 ? '#c46d79' : '#7d718c'; ctx.lineWidth = 3.5 - i * 0.35;
      ctx.beginPath(); ctx.ellipse(0, 0, 72 + i * 30, 18 + i * 9, 0.22 + i * 0.05, 0.25 + i * 0.19, Math.PI * 1.55 + i * 0.14); ctx.stroke();
    }
    ctx.restore();

    // lampi lontani e sporadici: illuminano per un istante la tempesta
    const flash = Math.pow(Math.max(0, Math.sin(now * 0.73 + 1.4)), 9) * 0.72;
    // due saette lontane restano leggibili anche fra un lampo e l'altro
    ctx.save(); ctx.globalAlpha = 0.22 + flash * 0.68; ctx.strokeStyle = '#d7c3d8'; ctx.lineWidth = 2.5; ctx.lineJoin = 'bevel';
    for (let i = 0; i < 2; i++) {
      const lx = w * (0.24 + i * 0.48) + Math.sin(now * 0.3 + i) * 55, ly = gy * 0.10 + i * 25;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 17, ly + 35); ctx.lineTo(lx + 4, ly + 33); ctx.lineTo(lx - 23, ly + 82); ctx.stroke();
    }
    ctx.restore();
    if (flash > 0.015) {
      ctx.globalAlpha = flash * 0.17; ctx.fillStyle = '#c9c4df'; ctx.fillRect(0, 0, w, gy * 0.74);
    }

    // poche braci scure e rosse, trascinate lateralmente dalla tempesta
    if (quality < 2) {
      for (let i = 0; i < 25; i++) {
        const x = (rnd(i, 401) * w - now * (18 + rnd(i, 402) * 22) + w * 3) % w;
        const y = gy * (0.12 + rnd(i, 403) * 0.57) + Math.sin(now * 1.3 + i) * 5;
        const rr = 0.8 + rnd(i, 404) * 1.8;
        ctx.globalAlpha = 0.20 + 0.26 * (0.5 + 0.5 * Math.sin(now * 2 + i));
        ctx.fillStyle = i % 4 === 0 ? '#f3a17e' : '#bd4550';
        ctx.beginPath(); ctx.ellipse(x, y, rr * 1.5, rr * 0.65, -0.3, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  // Paolo e Francesca: due figure unite nell'abbraccio, trascinate per sempre dalla bufera.
  // Sono una silhouette poetica, non un elemento di gameplay né un ostacolo.
  function drawDanteLovers(ctx) {
    if (S.world !== 'inferno' || quality >= 2) return;
    const w = S.w, gy = S.gy, now = S.now / 1000, spacing = 2240; // apparizioni narrative più rare e leggibili
    const par = S.camX * 0.052;
    const first = Math.floor((par - 900) / spacing), last = Math.floor((par + w + 900) / spacing);
    for (let n = first; n <= last; n++) {
      const cx = n * spacing + 960 + (rnd(n, 881) - 0.5) * 220 - par;
      if (cx < -340 || cx > w + 340) continue;
      const cy = gy * (0.40 + 0.028 * Math.sin(now * 0.7 + n));
      const sc = 1.24 + rnd(n, 880) * 0.10;
      const rot = -0.19 + 0.16 * Math.sin(now * 1.45 + n * 2.2);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc * S.hs, sc * S.hs);

      // alone morbido: i due amanti sono sospesi, ma non confusi con il cielo
      const aura = ctx.createRadialGradient(0, -12, 8, 0, -12, 142);
      aura.addColorStop(0, 'rgba(238,157,153,0.28)'); aura.addColorStop(0.48, 'rgba(132,68,91,0.16)'); aura.addColorStop(1, 'rgba(50,29,49,0)');
      ctx.fillStyle = aura; ctx.fillRect(-155, -165, 310, 310);

      // vortice che li trascina, disegnato dietro alle figure
      ctx.globalAlpha = 0.52; ctx.strokeStyle = '#d28a98'; ctx.lineWidth = 3.0;
      ctx.beginPath(); ctx.ellipse(0, -3, 111, 47, -0.22, 0.06, Math.PI * 1.7); ctx.stroke();
      ctx.globalAlpha = 0.30; ctx.strokeStyle = '#e2c3b7'; ctx.lineWidth = 1.7;
      ctx.beginPath(); ctx.ellipse(0, -3, 132, 61, -0.22, Math.PI, Math.PI * 2.75); ctx.stroke();
      ctx.globalAlpha = 1;

      // mantello di Paolo e veste di Francesca, entrambe trascinate dal vento
      ctx.fillStyle = '#241f31'; ctx.beginPath();
      ctx.moveTo(-25, -23); ctx.bezierCurveTo(-65, -54, -111, -52, -151, -93);
      ctx.bezierCurveTo(-133, -48, -91, -22, -48, -8);
      ctx.bezierCurveTo(-104, 0, -133, 24, -161, 16);
      ctx.bezierCurveTo(-113, 48, -57, 29, -15, 11); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(223,151,150,0.62)'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-134, -77); ctx.quadraticCurveTo(-88, -34, -34, -9); ctx.moveTo(-145, 17); ctx.quadraticCurveTo(-82, 40, -12, 7); ctx.stroke();

      ctx.fillStyle = '#54283f'; ctx.beginPath();
      ctx.moveTo(6, -20); ctx.bezierCurveTo(39, -48, 65, -22, 60, 19);
      ctx.bezierCurveTo(58, 48, 83, 66, 111, 72);
      ctx.bezierCurveTo(61, 92, 7, 70, -8, 45);
      ctx.bezierCurveTo(7, 18, -7, -1, 6, -20); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(229,154,157,0.64)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(38, -13); ctx.quadraticCurveTo(48, 36, 89, 65); ctx.stroke();

      // busto di Paolo: figura maschile a sinistra
      ctx.fillStyle = '#30263a'; ctx.beginPath();
      ctx.moveTo(-44, -23); ctx.quadraticCurveTo(-64, 4, -57, 45);
      ctx.lineTo(-27, 65); ctx.lineTo(3, 48); ctx.quadraticCurveTo(4, 7, -7, -18);
      ctx.closePath(); ctx.fill();
      // collo e volto di Paolo, rivolto verso Francesca
      ctx.fillStyle = '#c39086'; ctx.fillRect(-31, -42, 15, 24);
      ctx.beginPath(); ctx.ellipse(-24, -54, 18, 21, -0.08, 0, TAU); ctx.fill();
      ctx.fillStyle = '#211d2b'; ctx.beginPath();
      ctx.moveTo(-43, -58); ctx.quadraticCurveTo(-47, -82, -22, -82);
      ctx.quadraticCurveTo(0, -78, -4, -51); ctx.quadraticCurveTo(-12, -62, -21, -63);
      ctx.quadraticCurveTo(-31, -51, -43, -58); ctx.fill();
      // profilo di Paolo: naso e guancia in luce
      ctx.fillStyle = '#d9a398'; ctx.beginPath(); ctx.moveTo(-10, -56); ctx.lineTo(-3, -51); ctx.lineTo(-11, -47); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(250,204,183,0.88)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-15, -40); ctx.quadraticCurveTo(-24, -34, -33, -41); ctx.stroke();

      // busto di Francesca: figura femminile a destra, vicina al volto di Paolo
      ctx.fillStyle = '#663047'; ctx.beginPath();
      ctx.moveTo(-1, -22); ctx.quadraticCurveTo(23, -37, 46, -13);
      ctx.quadraticCurveTo(66, 17, 49, 58); ctx.quadraticCurveTo(24, 79, -8, 56);
      ctx.quadraticCurveTo(9, 15, -1, -22); ctx.closePath(); ctx.fill();
      // collo e volto di Francesca, rivolto verso Paolo
      ctx.fillStyle = '#d3a09a'; ctx.fillRect(10, -43, 16, 24);
      ctx.beginPath(); ctx.ellipse(18, -55, 17, 21, 0.08, 0, TAU); ctx.fill();
      // lunghi capelli mossi dal vento
      ctx.fillStyle = '#211a2a'; ctx.beginPath();
      ctx.moveTo(3, -62); ctx.quadraticCurveTo(0, -88, 26, -82);
      ctx.quadraticCurveTo(51, -78, 42, -52); ctx.quadraticCurveTo(58, -29, 108, -10);
      ctx.quadraticCurveTo(70, -12, 42, -32); ctx.quadraticCurveTo(35, -41, 31, -50);
      ctx.quadraticCurveTo(19, -43, 3, -62); ctx.fill();
      // profilo di Francesca e piccolo riflesso sul viso
      ctx.fillStyle = '#e0afa2'; ctx.beginPath(); ctx.moveTo(2, -57); ctx.lineTo(-5, -52); ctx.lineTo(3, -47); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,217,195,0.9)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(9, -39); ctx.quadraticCurveTo(18, -33, 29, -41); ctx.stroke();

      // l'abbraccio leggibile: il braccio di Paolo avvolge le spalle di Francesca
      ctx.strokeStyle = '#ba827e'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8, -14); ctx.quadraticCurveTo(10, -31, 31, -17); ctx.quadraticCurveTo(45, -9, 48, 1); ctx.stroke();
      // il braccio di Francesca attraversa il petto di Paolo
      ctx.strokeStyle = '#d1a098'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(43, 3); ctx.quadraticCurveTo(15, 19, -8, 9); ctx.quadraticCurveTo(-23, 3, -29, -7); ctx.stroke();
      // mani unite al centro
      ctx.fillStyle = '#e0b0a2'; ctx.beginPath(); ctx.ellipse(5, 3, 8, 5, -0.3, 0, TAU); ctx.fill();

      // riflessi di tempesta sui contorni, per separarli dalle nubi
      ctx.strokeStyle = 'rgba(244,177,164,0.70)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-43, -67); ctx.quadraticCurveTo(-54, -48, -43, -29);
      ctx.moveTo(4, -70); ctx.quadraticCurveTo(30, -83, 40, -58); ctx.stroke();
      ctx.restore();
    }
  }

  // Paradiso cristiano: raggi tranquilli, colombe e rosa luminosa dell'Empireo.
  function drawParadiseHeaven(ctx) {
    if (S.world !== 'paradise' || quality >= 2) return;
    const w = S.w, gy = S.gy, now = S.now / 1000;
    ctx.save();

    // luce divina, larga e morbida: niente lampi o contrasti aggressivi
    const sx = w * 0.75, sy = gy * 0.14;
    const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, gy * 0.95);
    glow.addColorStop(0, 'rgba(255,250,218,0.38)');
    glow.addColorStop(0.38, 'rgba(255,248,222,0.18)');
    glow.addColorStop(1, 'rgba(255,248,222,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, gy);

    // raggi verticali appena accennati, come luce che filtra dall'alto
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 7; i++) {
      const x = w * (0.49 + i * 0.075), sway = Math.sin(now * 0.16 + i) * 12;
      const rg = ctx.createLinearGradient(x, 0, x + sway + 42, gy * 0.66);
      rg.addColorStop(0, 'rgba(255,250,220,0.28)'); rg.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(x - 14, 0); ctx.lineTo(x + 15, 0); ctx.lineTo(x + sway + 92, gy * 0.66); ctx.lineTo(x + sway + 35, gy * 0.66); ctx.closePath(); ctx.fill();
    }

    // Rosa candida dell'Empireo, ispirata alla visione finale della Commedia
    const rx = w * 0.78, ry = gy * 0.31, rr = Math.min(gy * 0.12, 78);
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(now * 0.018);
    const roseGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, rr * 1.65);
    roseGlow.addColorStop(0, 'rgba(255,255,245,0.34)'); roseGlow.addColorStop(1, 'rgba(255,246,211,0)');
    ctx.fillStyle = roseGlow; ctx.beginPath(); ctx.arc(0, 0, rr * 1.65, 0, TAU); ctx.fill();
    for (let ring = 0; ring < 3; ring++) {
      const petals = 12 + ring * 4, rad = rr * (0.26 + ring * 0.25), pr = rr * (0.25 - ring * 0.045);
      for (let k = 0; k < petals; k++) {
        const a = k * TAU / petals + ring * 0.13;
        ctx.fillStyle = ring % 2 ? 'rgba(255,255,248,0.74)' : 'rgba(255,249,222,0.82)';
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * rad, Math.sin(a) * rad, pr * 0.72, pr, a, 0, TAU); ctx.fill();
      }
    }
    ctx.fillStyle = '#fffdf0'; ctx.beginPath(); ctx.arc(0, 0, rr * 0.19, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(215,184,112,0.82)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, rr * 0.19, 0, TAU); ctx.stroke();
    ctx.restore();

    // Colombe bianche in volo: la colomba è il segno visivo dello Spirito Santo.
    function dove(x, y, sc, phase) {
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      const flap = Math.sin(now * 2.1 + phase) * 5;
      ctx.fillStyle = 'rgba(255,255,250,0.95)';
      // corpo
      ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, -0.08, 0, TAU); ctx.fill();
      // testa e becco
      ctx.beginPath(); ctx.arc(15, -4, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e3bd75'; ctx.beginPath(); ctx.moveTo(20, -4); ctx.lineTo(28, -1); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
      // ali in movimento
      ctx.fillStyle = '#fffef8'; ctx.beginPath(); ctx.moveTo(-2, -1); ctx.quadraticCurveTo(-10, -17 - flap, -30, -19 - flap); ctx.quadraticCurveTo(-22, -4, -4, 5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, 1); ctx.quadraticCurveTo(-12, 14 + flap * 0.45, -27, 16 + flap * 0.45); ctx.quadraticCurveTo(-17, 3, -2, -2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    dove(w * 0.22 + Math.sin(now * 0.22) * 18, gy * 0.22, 0.78, 0.2);
    dove(w * 0.40 + Math.sin(now * 0.19 + 1) * 13, gy * 0.34, 0.55, 1.1);

    // piccoli punti luce lenti, simili a pulviscolo dorato
    for (let i = 0; i < 24; i++) {
      const x = (rnd(i, 977) * w + Math.sin(now * 0.11 + i) * 8) % w;
      const y = gy * (0.08 + rnd(i, 978) * 0.56) + Math.sin(now * 0.3 + i * 1.7) * 5;
      const a = 0.13 + 0.12 * (0.5 + 0.5 * Math.sin(now * 0.65 + i));
      ctx.globalAlpha = a; ctx.fillStyle = '#fff1bd'; ctx.beginPath(); ctx.arc(x, y, 1 + rnd(i, 979) * 1.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Fortezza infernale in lontananza: mura spezzate, torri aguzze, portale di magma.
  // Si muove a parallasse lenta per dare profondità senza interferire con la pista.
  function drawInfernoCitadels(ctx) {
    if (S.world !== 'inferno' || quality >= 2) return;
    const gy = S.gy, now = S.now / 1000, par = S.camX * 0.038, spacing = 2070; // fortezze più distanti tra loro
    const first = Math.floor((par - 620) / spacing), last = Math.floor((par + S.w + 620) / spacing);
    for (let n = first; n <= last; n++) {
      const cx = n * spacing + 820 + (rnd(n, 510) - 0.5) * 180 - par;
      if (cx < -620 || cx > S.w + 620) continue;
      const sc = 0.82 + rnd(n, 511) * 0.25, base = gy - 84 * S.hs;
      const bw = 390 * sc, pulse = 0.72 + 0.28 * Math.sin(now * 1.35 + n * 2.1);
      ctx.save(); ctx.translate(cx, base); ctx.scale(sc * S.hs, S.hs);

      // alone di lava dietro al portale
      const aura = ctx.createRadialGradient(0, -95, 8, 0, -95, 230);
      aura.addColorStop(0, `rgba(255,91,37,${(0.26 * pulse).toFixed(3)})`);
      aura.addColorStop(0.45, 'rgba(191,49,37,0.12)'); aura.addColorStop(1, 'rgba(112,24,35,0)');
      ctx.fillStyle = aura; ctx.fillRect(-245, -325, 490, 330);

      // fondamenta frastagliate
      ctx.fillStyle = '#201923'; ctx.beginPath();
      ctx.moveTo(-bw * 0.56, 0); ctx.lineTo(-bw * 0.49, -38); ctx.lineTo(-bw * 0.39, -22);
      ctx.lineTo(-bw * 0.28, -54); ctx.lineTo(-bw * 0.12, -25); ctx.lineTo(0, -47);
      ctx.lineTo(bw * 0.14, -20); ctx.lineTo(bw * 0.29, -52); ctx.lineTo(bw * 0.42, -22);
      ctx.lineTo(bw * 0.53, -41); ctx.lineTo(bw * 0.58, 0); ctx.closePath(); ctx.fill();

      // cinta muraria e bastioni
      ctx.fillStyle = '#211b28'; ctx.fillRect(-150, -116, 300, 116);
      ctx.fillStyle = '#30212d'; ctx.fillRect(-145, -122, 290, 9);
      for (let k = 0; k < 13; k++) {
        const x = -140 + k * 23;
        ctx.fillStyle = '#241b28'; ctx.fillRect(x, -137 - (k % 3 === 0 ? 8 : 0), 14, 24 + (k % 3 === 0 ? 8 : 0));
      }

      // mastio centrale
      ctx.fillStyle = '#1a1722'; ctx.fillRect(-75, -210, 150, 210);
      ctx.fillStyle = '#38212d'; ctx.fillRect(-68, -204, 12, 196);
      ctx.fillStyle = '#120f19'; ctx.beginPath(); ctx.moveTo(-91, -207); ctx.lineTo(0, -252); ctx.lineTo(91, -207); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a252e'; ctx.beginPath(); ctx.moveTo(-79, -207); ctx.lineTo(0, -242); ctx.lineTo(79, -207); ctx.closePath(); ctx.fill();

      // torri laterali con guglie spezzate
      for (const side of [-1, 1]) {
        const tx = side * 158;
        ctx.fillStyle = '#17151f'; ctx.fillRect(tx - 34, -185, 68, 185);
        ctx.fillStyle = '#39222e'; ctx.fillRect(tx - 29, -178, 10, 170);
        ctx.fillStyle = '#17141d'; ctx.beginPath(); ctx.moveTo(tx - 42, -181); ctx.lineTo(tx, -264 - rnd(n, 520 + side) * 24); ctx.lineTo(tx + 42, -181); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6c2c31'; ctx.beginPath(); ctx.moveTo(tx - 10, -187); ctx.lineTo(tx, -249); ctx.lineTo(tx + 8, -187); ctx.closePath(); ctx.fill();
        // finestre verticali incandescenti
        ctx.fillStyle = `rgba(255,112,45,${(0.7 * pulse).toFixed(3)})`;
        for (let j = 0; j < 3; j++) ctx.fillRect(tx - 4 + j * 13, -148 - (j % 2) * 25, 5, 22);
      }

      // grande portale: arco scuro con nucleo di magma
      ctx.fillStyle = '#100f17'; ctx.beginPath(); ctx.moveTo(-52, 0); ctx.lineTo(-52, -94); ctx.arc(0, -94, 52, Math.PI, 0); ctx.lineTo(52, 0); ctx.closePath(); ctx.fill();
      const portal = ctx.createLinearGradient(0, -155, 0, -2);
      portal.addColorStop(0, `rgba(255,203,112,${(0.88 * pulse).toFixed(3)})`);
      portal.addColorStop(0.45, `rgba(255,89,34,${(0.86 * pulse).toFixed(3)})`);
      portal.addColorStop(1, 'rgba(126,22,25,0.95)');
      ctx.fillStyle = portal; ctx.beginPath(); ctx.moveTo(-36, 0); ctx.lineTo(-36, -92); ctx.arc(0, -92, 36, Math.PI, 0); ctx.lineTo(36, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#17131e'; ctx.beginPath(); ctx.moveTo(-23, 0); ctx.lineTo(-23, -88); ctx.arc(0, -88, 23, Math.PI, 0); ctx.lineTo(23, 0); ctx.closePath(); ctx.fill();

      // rivoli incandescenti dalle feritoie verso le fondamenta
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        const fx = side * (108 + 8 * Math.sin(now * 0.6 + n));
        ctx.strokeStyle = `rgba(255,94,35,${(0.62 * pulse).toFixed(3)})`; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(fx, -116); ctx.bezierCurveTo(fx + side * 18, -78, fx - side * 10, -43, fx + side * 12, -8); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,205,107,0.72)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx, -112); ctx.bezierCurveTo(fx + side * 14, -78, fx - side * 8, -40, fx + side * 10, -9); ctx.stroke();
      }
      ctx.restore();

      // crepe verticali sulle mura
      ctx.strokeStyle = 'rgba(255,105,48,0.55)'; ctx.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const x = -132 + k * 43, y = -23 - rnd(n, 550 + k) * 64;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (k % 2 ? 7 : -5), y + 13); ctx.lineTo(x + (k % 2 ? 2 : -11), y + 31); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- tre nuovi mondi: landmark ampi e distanziati, ancorati alle coordinate della pista ----------
  // Le strutture hanno una spaziatura variabile ma deterministica: tutti i client vedono gli stessi landmark.
  function drawAtlantisWorld(ctx) {
    if (S.world !== 'atlantis' || quality >= 2) return;
    const w = S.w, gy = S.gy, now = S.now / 1000, par = S.camX * 0.045;
    // Raggi d'acqua: pochi fasci larghi, morbidi, non una griglia di particelle.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 367 + 120 - par * 0.42) % (w + 500) + w + 500) % (w + 500) - 250;
      const beam = ctx.createLinearGradient(x, 0, x + 105, gy * 0.88);
      beam.addColorStop(0, 'rgba(166,250,242,0.18)'); beam.addColorStop(1, 'rgba(94,227,214,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(x - 22, 0); ctx.lineTo(x + 28, 0); ctx.lineTo(x + 152, gy * 0.88); ctx.lineTo(x + 38, gy * 0.88); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // La città perduta appare a gruppi separati: archi, cupole e colonne sommerse.
    const spacing = 2320, a0 = Math.floor((par - 420) / spacing), a1 = Math.floor((par + w + 420) / spacing);
    for (let n = a0; n <= a1; n++) {
      const cx = n * spacing + spacing * (0.22 + rnd(n, 201) * 0.55) - par;
      if (cx < -420 || cx > w + 420) continue;
      const base = gy * (0.84 + rnd(n, 202) * 0.035), scale = 0.82 + rnd(n, 203) * 0.42;
      ctx.save(); ctx.translate(cx, base); ctx.scale(scale, scale); ctx.globalAlpha = 0.58;
      // piattaforma corallina
      ctx.fillStyle = '#276f78'; ctx.beginPath(); ctx.moveTo(-245, 0); ctx.lineTo(-205, -19); ctx.lineTo(190, -19); ctx.lineTo(238, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#68b7a7'; ctx.fillRect(-200, -23, 394, 5);
      // tempio centrale con cupola e colonne
      ctx.fillStyle = '#78b9ad'; ctx.fillRect(-72, -118, 144, 94);
      ctx.fillStyle = '#b2d8c8'; ctx.fillRect(-82, -126, 164, 11);
      ctx.fillStyle = '#d5e6cf'; ctx.beginPath(); ctx.moveTo(-88, -126); ctx.quadraticCurveTo(0, -205, 88, -126); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#477f82'; ctx.fillRect(-9, -94, 18, 70);
      for (let k = 0; k < 5; k++) { const x = -60 + k * 30; ctx.fillStyle = k % 2 ? '#d0e3c9' : '#98caba'; ctx.fillRect(x, -112, 10, 76); ctx.fillStyle = 'rgba(10,65,79,0.35)'; ctx.fillRect(x + 7, -112, 3, 76); }
      // due torri consumate, con archi crollati
      for (const side of [-1, 1]) {
        const tx = side * (145 + 16 * rnd(n, side + 205)), th = 78 + 40 * rnd(n, side + 207);
        ctx.fillStyle = '#407f80'; ctx.fillRect(tx - 19, -th, 38, th + 2); ctx.fillStyle = '#91c5b7'; ctx.fillRect(tx - 23, -th - 7, 46, 8);
        ctx.fillStyle = '#174e63'; ctx.beginPath(); ctx.arc(tx, -th + 13, 8, Math.PI, 0); ctx.lineTo(tx + 8, -th + 31); ctx.lineTo(tx - 8, -th + 31); ctx.closePath(); ctx.fill();
      }
      // alghe e ventagli di corallo alle estremità
      for (const side of [-1, 1]) {
        const ax = side * (210 + rnd(n, side + 211) * 22);
        ctx.strokeStyle = side < 0 ? '#e18f83' : '#e7b46e'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (let b = 0; b < 4; b++) { ctx.beginPath(); ctx.moveTo(ax, -18); ctx.quadraticCurveTo(ax + side * (14 + b * 3), -48, ax + side * (8 + b * 15), -58 - b * 4); ctx.stroke(); }
      }
      ctx.restore();
    }
    // silhouette di una manta/leviatano, rara e molto lontana.
    const whaleSpan = w + 760, wx = ((S.camX * 0.018 + 920) % whaleSpan + whaleSpan) % whaleSpan - 380;
    const wy = gy * 0.26 + Math.sin(now * 0.23) * 13;
    ctx.save(); ctx.globalAlpha = 0.11; ctx.fillStyle = '#06334d'; ctx.translate(wx, wy);
    ctx.beginPath(); ctx.ellipse(0, 0, 104, 31, -0.05, 0, TAU); ctx.moveTo(85, -2); ctx.quadraticCurveTo(142, -55, 156, -35); ctx.quadraticCurveTo(143, 2, 98, 9); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-22, 12); ctx.quadraticCurveTo(-73, 72, -119, 47); ctx.quadraticCurveTo(-89, 5, -22, 12); ctx.fill(); ctx.restore();
  }

  function drawEnchantedWorld(ctx) {
    if (S.world !== 'enchanted' || quality >= 2) return;
    const w = S.w, gy = S.gy, now = S.now / 1000, par = S.camX * 0.052, spacing = 2150;
    // Luna velata e alone, tenuti alti per non interferire con la pista.
    const moonX = w * 0.76 - (par * 0.12 % 260), moonY = gy * 0.2, moonR = 48;
    ctx.save(); const halo = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 148); halo.addColorStop(0, 'rgba(213,196,255,0.36)'); halo.addColorStop(1, 'rgba(213,196,255,0)'); ctx.fillStyle = halo; ctx.fillRect(moonX - 150, moonY - 150, 300, 300);
    ctx.fillStyle = '#e4d9ff'; ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(102,90,151,0.22)'; ctx.beginPath(); ctx.arc(moonX + 15, moonY - 8, moonR * 0.78, 0, TAU); ctx.fill(); ctx.restore();
    // Alberi secolari: tronchi a colonne e chiome ampie, ma una sola grande presenza per gruppo.
    const a0 = Math.floor((par - 420) / spacing), a1 = Math.floor((par + w + 420) / spacing);
    for (let n = a0; n <= a1; n++) {
      const cx = n * spacing + spacing * (0.18 + rnd(n, 301) * 0.62) - par;
      if (cx < -430 || cx > w + 430) continue;
      const base = gy * (0.91 + rnd(n, 302) * 0.025), ht = 190 + rnd(n, 303) * 105, wide = 175 + rnd(n, 304) * 85;
      ctx.save(); ctx.globalAlpha = 0.78;
      // chioma a strati con riflesso magico
      const glow = ctx.createRadialGradient(cx, base - ht, 8, cx, base - ht, wide * 1.5); glow.addColorStop(0, 'rgba(143,236,191,0.26)'); glow.addColorStop(1, 'rgba(143,236,191,0)'); ctx.fillStyle = glow; ctx.fillRect(cx - wide * 1.6, base - ht - wide * 1.6, wide * 3.2, wide * 3.2);
      ctx.fillStyle = '#183e3b'; ctx.beginPath(); ctx.moveTo(cx - 34, base); ctx.bezierCurveTo(cx - 16, base - ht * 0.48, cx - 66, base - ht * 0.76, cx - 9, base - ht); ctx.bezierCurveTo(cx + 5, base - ht * 0.77, cx + 76, base - ht * 0.7, cx + 33, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#356456'; ctx.beginPath(); ctx.ellipse(cx, base - ht, wide * 0.72, ht * 0.42, 0, 0, TAU); ctx.ellipse(cx - wide * 0.48, base - ht * 0.82, wide * 0.42, ht * 0.28, -0.2, 0, TAU); ctx.ellipse(cx + wide * 0.46, base - ht * 0.86, wide * 0.4, ht * 0.27, 0.18, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(157,235,192,0.32)'; ctx.beginPath(); ctx.ellipse(cx - wide * 0.2, base - ht * 1.04, wide * 0.28, ht * 0.12, -0.2, 0, TAU); ctx.fill();
      // una coppia di funghi giganti luminosi ai piedi dell'albero
      for (let side of [-1, 1]) {
        const mx = cx + side * (wide * 0.78), mh = 38 + 22 * rnd(n, side + 305), mr = 34 + 14 * rnd(n, side + 307);
        ctx.fillStyle = '#d5c5a3'; ctx.fillRect(mx - 7, base - mh * 0.65, 14, mh * 0.68);
        const mg = ctx.createRadialGradient(mx, base - mh, 2, mx, base - mh, mr * 1.8); mg.addColorStop(0, 'rgba(255,144,219,0.36)'); mg.addColorStop(1, 'rgba(255,144,219,0)'); ctx.fillStyle = mg; ctx.fillRect(mx - mr * 2, base - mh - mr * 2, mr * 4, mr * 4);
        ctx.fillStyle = side < 0 ? '#a85fd2' : '#e47caa'; ctx.beginPath(); ctx.ellipse(mx, base - mh, mr, mr * 0.42, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff0cf'; for (let d = -1; d <= 1; d++) { ctx.beginPath(); ctx.arc(mx + d * mr * 0.45, base - mh - 2, 3, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
    // lucciole in tre piccoli stormi: moto lento e controllato.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 19; i++) { const x = (rnd(i, 331) * (w + 80) - 40 + Math.sin(now * 0.32 + i) * 10), y = gy * (0.28 + rnd(i, 332) * 0.47) + Math.sin(now * 0.75 + i * 1.7) * 9; const a = 0.24 + 0.42 * (0.5 + 0.5 * Math.sin(now * 1.8 + i)); ctx.globalAlpha = a; ctx.fillStyle = i % 3 === 0 ? '#f3b8ff' : '#b7ffd7'; ctx.beginPath(); ctx.arc(x, y, 2 + rnd(i, 333) * 1.7, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  function drawNeonWorld(ctx) {
    if (S.world !== 'neon' || quality >= 2) return;
    const w = S.w, gy = S.gy, now = S.now / 1000, par = S.camX * 0.075, spacing = 1780;
    // Pioggia obliqua discreta in cielo, non davanti alla ruota.
    ctx.save(); ctx.strokeStyle = 'rgba(119,190,255,0.13)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 38; i++) { const x = rnd(i, 401) * w, y = rnd(i, 402) * gy * 0.72 + ((now * 85 + i * 31) % 150); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 19); ctx.stroke(); }
    ctx.restore();
    // Skyline di torri diverse in gruppi distanziati, con finestre e insegne luminose.
    const a0 = Math.floor((par - 450) / spacing), a1 = Math.floor((par + w + 450) / spacing);
    for (let n = a0; n <= a1; n++) {
      const cx = n * spacing + spacing * (0.18 + rnd(n, 411) * 0.62) - par;
      if (cx < -480 || cx > w + 480) continue;
      const base = gy * 0.91, towerCount = 3 + Math.floor(rnd(n, 412) * 3);
      ctx.save(); ctx.globalAlpha = 0.88;
      for (let k = 0; k < towerCount; k++) {
        const bw = 46 + rnd(n, 420 + k) * 58, bh = 150 + rnd(n, 430 + k) * 230, x = cx - (towerCount - 1) * 49 + k * 94;
        const top = base - bh;
        ctx.fillStyle = k % 2 ? '#1b2348' : '#202747'; ctx.fillRect(x - bw / 2, top, bw, bh);
        ctx.fillStyle = k % 2 ? 'rgba(47,224,226,0.8)' : 'rgba(242,82,208,0.78)'; ctx.fillRect(x - bw / 2, top, 3, bh);
        ctx.fillStyle = 'rgba(134,158,255,0.55)'; ctx.fillRect(x - bw / 2, top, bw, 4);
        // finestre: piccoli punti luminosi in una griglia regolare.
        for (let yy = top + 18; yy < base - 12; yy += 24) for (let xx = x - bw / 2 + 10; xx < x + bw / 2 - 5; xx += 15) {
          if (rnd(Math.round(xx), Math.round(yy), n) > 0.34) { ctx.fillStyle = (Math.floor(xx + yy) % 2) ? 'rgba(55,228,228,0.78)' : 'rgba(232,91,205,0.72)'; ctx.fillRect(xx, yy, 5, 8); }
        }
        if (k === Math.floor(towerCount / 2)) {
          ctx.strokeStyle = '#72efff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top - 56); ctx.stroke(); ctx.fillStyle = 'rgba(72,232,255,0.18)'; ctx.fillRect(x - 28, top + 34, 56, 28); ctx.strokeStyle = '#72efff'; ctx.strokeRect(x - 28, top + 34, 56, 28);
        }
      }
      // linea del treno sopraelevato, come tratto architettonico della città.
      const railY = base - 90 - rnd(n, 440) * 42; ctx.strokeStyle = 'rgba(67,219,236,0.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 350, railY); ctx.lineTo(cx + 350, railY); ctx.stroke();
      ctx.strokeStyle = 'rgba(222,76,220,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - 350, railY + 7); ctx.lineTo(cx + 350, railY + 7); ctx.stroke();
      // piccolo convoglio, lento sullo sfondo.
      const trainX = cx - 150 + ((now * 18 + n * 83) % 300); ctx.fillStyle = '#303b68'; ctx.beginPath(); ctx.roundRect(trainX, railY - 27, 104, 24, 10); ctx.fill(); ctx.fillStyle = '#65f3ed'; ctx.fillRect(trainX + 10, railY - 20, 78, 4);
      ctx.restore();
    }
  }

  function drawNewWorldStructures(ctx) {
    drawAtlantisWorld(ctx);
    drawEnchantedWorld(ctx);
    drawNeonWorld(ctx);
  }

  // ---------- fondali dedicati dei mondi speciali -------------------------------------------
  // Qui non usiamo le montagne e i livelli del bioma classico: ogni mondo ha una composizione
  // completa, con landmark grandi e distanziati, così il giocatore capisce subito dove si trova.
  function drawDedicatedWorldBackdrop(ctx) {
    const w = S.w, h = S.h, gy = S.gy, now = S.now / 1000;
    preloadWorldArt();
    const img = WORLD_ART[S.world];
    if (img && img.complete && img.naturalWidth > 0) {
      // Il panorama si muove più lentamente della pista: i landmark restano leggibili
      // e attraversano lo schermo in modo naturale per tutta la gara.
      const scale = h / 900, tileW = 2400 * scale;
      const offset = ((S.camX * 0.23) % tileW + tileW) % tileW;
      ctx.drawImage(img, -offset, 0, tileW, h);
      ctx.drawImage(img, tileW - offset, 0, tileW, h);
      if (offset < w) ctx.drawImage(img, -tileW - offset, 0, tileW, h);

      // Secondo piano di profondità: dettagli in primo piano (alghe/coralli, felci e rami,
      // strutture e cavi urbani) con parallasse più rapida. È disegnato prima del terreno,
      // così la pista e i corridori restano sempre perfettamente leggibili.
      const front = WORLD_FRONT_ART[S.world];
      if (front && front.complete && front.naturalWidth > 0) {
        const frontOffset = ((S.camX * 0.52) % tileW + tileW) % tileW;
        ctx.save();
        // Il foreground è un'inquadratura, non un secondo fondale: rami, alghe e strutture
        // entrano dai bordi e dall'alto, lasciando pulita la fascia centrale dove corrono le bici.
        // Il clipping evita che i grandi elementi decorativi attraversino la pista.
        const edge = Math.max(96, Math.min(150, w * 0.115));
        ctx.beginPath();
        ctx.rect(0, 0, w, Math.min(105, gy * 0.16));
        ctx.rect(0, 72, edge, Math.max(0, gy - 28));
        ctx.rect(w - edge, 72, edge, Math.max(0, gy - 28));
        ctx.clip();
        ctx.globalAlpha = 0.72;
        ctx.drawImage(front, -frontOffset, 0, tileW, h);
        ctx.drawImage(front, tileW - frontOffset, 0, tileW, h);
        if (frontOffset < w) ctx.drawImage(front, -tileW - frontOffset, 0, tileW, h);
        ctx.restore();
      }
      drawDedicatedWorldAtmosphere(ctx, S.world, w, h, gy, now);
      return;
    }
    // Fallback vettoriale immediato mentre il browser carica l'illustrazione locale.
    if (S.world === 'atlantis') drawAtlantisBackdrop(ctx, w, h, gy, now);
    else if (S.world === 'enchanted') drawEnchantedBackdrop(ctx, w, h, gy, now);
    else drawNeonBackdrop(ctx, w, h, gy, now);
  }

  function drawDedicatedWorldAtmosphere(ctx, world, w, h, gy, now) {
    ctx.save();
    if (world === 'atlantis') {
      // Bolle lente e riflessi sospesi; densità bassa per non coprire il palazzo.
      for (let i = 0; i < 17; i++) {
        const x = (rnd(i, 1511) * w + Math.sin(now * 0.22 + i) * 13 + w) % w;
        const r = 2.2 + rnd(i, 1512) * 5.2;
        const y = gy * (0.12 + rnd(i, 1513) * 0.53) - ((now * (8 + rnd(i, 1514) * 6) + i * 61) % (gy * 0.62));
        ctx.strokeStyle = 'rgba(190,255,245,0.34)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(236,255,244,0.32)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, Math.max(1, r * 0.2), 0, TAU); ctx.fill();
      }
      // Due banchi di pesci attraversano la città a velocità diverse: silhouettes piccole,
      // lontane e semitrasparenti, così danno scala al palazzo senza diventare ostacoli visivi.
      ctx.globalAlpha = 0.36;
      for (let school = 0; school < 2; school++) {
        const dir = school ? -1 : 1, baseY = gy * (0.28 + school * 0.16);
        for (let i = 0; i < 7; i++) {
          const span = w + 260, raw = now * (24 + school * 13) * dir + i * 46 + school * 310;
          const x = ((raw % span) + span) % span - 130;
          const y = baseY + Math.sin(now * 0.65 + i * 1.7 + school) * 13;
          const r = 5.5 + (i % 3) * 1.5;
          ctx.fillStyle = i % 3 === 0 ? '#b8ffed' : '#67d5d2';
          ctx.beginPath();
          if (dir > 0) { ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x + r * 0.25, y - r * 0.72, x + r, y); ctx.quadraticCurveTo(x + r * 0.25, y + r * 0.72, x - r, y); ctx.moveTo(x + r, y); ctx.lineTo(x + r * 1.65, y - r * 0.62); ctx.lineTo(x + r * 1.65, y + r * 0.62); ctx.closePath(); }
          else { ctx.moveTo(x + r, y); ctx.quadraticCurveTo(x - r * 0.25, y - r * 0.72, x - r, y); ctx.quadraticCurveTo(x - r * 0.25, y + r * 0.72, x + r, y); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 1.65, y - r * 0.62); ctx.lineTo(x - r * 1.65, y + r * 0.62); ctx.closePath(); }
          ctx.fill();
        }
      }
      // Piccole meduse bioluminescenti: pulsano e oscillano lentamente nella parte alta.
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const x = (i * 0.37 * w + now * (8 + i * 3) + 80) % (w + 100) - 50;
        const y = gy * (0.38 + i * 0.07) + Math.sin(now * 0.7 + i * 2) * 15;
        const pulse = 0.75 + 0.25 * Math.sin(now * 2 + i);
        ctx.fillStyle = `rgba(150,203,255,${(0.18 * pulse).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(x, y, 12 * pulse, 8 * pulse, 0, Math.PI, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(189,229,255,${(0.32 * pulse).toFixed(3)})`; ctx.lineWidth = 1.5;
        for (let t = -1; t <= 1; t++) { ctx.beginPath(); ctx.moveTo(x + t * 7, y); ctx.quadraticCurveTo(x + t * 11 + Math.sin(now * 1.4 + i + t) * 4, y + 10, x + t * 9, y + 22); ctx.stroke(); }
      }
    } else if (world === 'enchanted') {
      // Lucciole raggruppate, con alone piccolo e pulsazione lenta.
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 21; i++) {
        const x = (rnd(i, 1521) * w + Math.sin(now * 0.32 + i * 1.7) * 18 + w) % w;
        const y = gy * (0.22 + rnd(i, 1522) * 0.43) + Math.sin(now * 0.48 + i) * 9;
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now * 1.4 + i * 2.1));
        ctx.fillStyle = `rgba(202,255,157,${(0.11 * pulse).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(241,255,194,${(0.65 * pulse).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, TAU); ctx.fill();
      }
      // Foglie lente e semi luminosi: movimento diagonale appena percettibile, tipico del bosco.
      ctx.globalAlpha = 0.48;
      for (let i = 0; i < 12; i++) {
        const x = (rnd(i, 1541) * (w + 80) + now * (9 + i % 4 * 3) + w) % (w + 80) - 40;
        const y = gy * (0.16 + rnd(i, 1542) * 0.43) + ((now * (5 + i % 3 * 2) + i * 29) % 100);
        const a = Math.sin(now * 0.55 + i) * 0.7;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = i % 3 ? '#a8d78a' : '#d7a6ee';
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-1, -7, 8, -2); ctx.quadraticCurveTo(2, 7, -7, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(239,255,197,0.48)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(6, -1); ctx.stroke(); ctx.restore();
      }
      // Fasce di nebbia basse, molto morbide e in movimento lento.
      ctx.globalAlpha = 0.10; ctx.fillStyle = '#c9e8d0';
      for (let i = 0; i < 3; i++) { const x = ((i * 0.43 * w - now * (7 + i * 3)) % (w + 360) + (w + 360)) % (w + 360) - 180; const y = gy * (0.55 + i * 0.055); ctx.beginPath(); ctx.ellipse(x, y, 190 + i * 28, 18 + i * 3, 0, 0, TAU); ctx.fill(); }
    } else {
      // Pioggia fine inclinata e scie al neon, solo sul fondale.
      ctx.globalAlpha = 0.22; ctx.strokeStyle = '#9be8ff'; ctx.lineWidth = 1.3;
      for (let i = 0; i < 34; i++) {
        const x = (rnd(i, 1531) * (w + 100) - 50 - now * (26 + rnd(i, 1532) * 18) + (w + 100) * 3) % (w + 100);
        const y = rnd(i, 1533) * gy * 0.79;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 23); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 7; i++) {
        const x = (i * 211 + now * (22 + i * 2) + S.camX * 0.08) % (w + 80) - 40;
        const y = gy * (0.67 + (i % 3) * 0.035);
        ctx.strokeStyle = i % 2 ? 'rgba(255,87,211,0.35)' : 'rgba(84,242,246,0.38)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 46, y + 2); ctx.stroke();
      }
      // Tre piccoli veicoli aerei attraversano i livelli alti, con scia neon molto sottile.
      for (let i = 0; i < 3; i++) {
        const span = w + 180, x = ((now * (34 + i * 14) + i * 390) % span) - 90;
        const y = gy * (0.24 + i * 0.105) + Math.sin(now * 0.8 + i * 2) * 5;
        const col = i % 2 ? 'rgba(244,95,224,0.82)' : 'rgba(91,238,247,0.86)';
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 35, y + 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
        ctx.fillStyle = 'rgba(16,25,54,0.92)'; ctx.beginPath(); ctx.moveTo(x - 16, y + 3); ctx.lineTo(x - 5, y - 4); ctx.lineTo(x + 20, y - 3); ctx.lineTo(x + 32, y + 3); ctx.lineTo(x + 18, y + 7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(x + 4, y - 1, 13, 2);
      }
    }
    ctx.restore();
  }

  function drawAtlantisBackdrop(ctx, w, h, gy, now) {
    const par = S.camX * 0.04;
    const sky = ctx.createLinearGradient(0, 0, 0, gy * 1.05);
    sky.addColorStop(0, '#031c36'); sky.addColorStop(0.38, '#07516b'); sky.addColorStop(0.72, '#0b8490'); sky.addColorStop(1, '#062f49');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // Sole sommerso: luce ampia e raggi volumetrici dall'alto.
    const sunX = w * 0.69, sunY = gy * 0.09;
    const halo = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, gy * 0.86);
    halo.addColorStop(0, 'rgba(190,255,237,0.28)'); halo.addColorStop(0.42, 'rgba(94,226,222,0.12)'); halo.addColorStop(1, 'rgba(35,167,190,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, gy * 0.92);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 8; i++) {
      const x = (i * 231 + 35 - par * (0.2 + (i % 3) * 0.05)) % (w + 280) - 140;
      const width = 34 + (i % 3) * 18, end = x + 110 + Math.sin(now * 0.16 + i) * 32;
      const beam = ctx.createLinearGradient(x, 0, end, gy * 0.92);
      beam.addColorStop(0, 'rgba(171,255,242,0.11)'); beam.addColorStop(0.62, 'rgba(108,244,233,0.07)'); beam.addColorStop(1, 'rgba(108,244,233,0)');
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + width, 0); ctx.lineTo(end + width * 2.4, gy * 0.92); ctx.lineTo(end - width * 0.5, gy * 0.92); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // Onde di rifrazione sulla colonna d'acqua.
    ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = '#9cf5e9'; ctx.lineWidth = 2;
    for (let band = 0; band < 4; band++) {
      const y0 = gy * (0.12 + band * 0.13), shift = (now * (7 + band * 2) + band * 160) % (w + 260) - 130;
      ctx.beginPath();
      for (let x = -100; x <= w + 100; x += 28) {
        const y = y0 + Math.sin((x + shift) * 0.012 + band) * (6 + band * 2) + Math.sin((x + shift) * 0.027) * 2;
        if (x === -100) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Dorsali sottomarine: tre piani di profondità, senza un orizzonte terrestre.
    const ridge = (base, amp, color, speed, seed) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, gy * 0.9);
      for (let x = 0; x <= w + 16; x += 16) {
        const wx = x + S.camX * speed;
        const y = base + Math.sin(wx * 0.0031 + seed) * amp + Math.sin(wx * 0.008 + seed * 1.7) * amp * 0.27;
        if (x === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(w, gy * 1.02); ctx.lineTo(0, gy * 1.02); ctx.closePath(); ctx.fill();
    };
    ridge(gy * 0.62, 30, '#0a5368', 0.055, 1.4);
    ridge(gy * 0.70, 24, '#073e58', 0.085, 4.2);
    ridge(gy * 0.79, 17, '#052f49', 0.13, 2.1);

    // Città sommersa: palazzo centrale, cupole, torri e archi di corallo. Un gruppo importante
    // ogni ~2 km di pista, con posizione variabile ma deterministica.
    const spacing = 2140, n0 = Math.floor((S.camX * 0.045 - 800) / spacing), n1 = Math.floor((S.camX * 0.045 + w + 800) / spacing);
    for (let n = n0; n <= n1; n++) {
      const cx = n * spacing + 930 + (rnd(n, 802) - 0.5) * 230 - S.camX * 0.045;
      if (cx < -650 || cx > w + 650) continue;
      const sc = 0.92 + rnd(n, 803) * 0.22, base = gy * (0.735 + rnd(n, 804) * 0.025);
      ctx.save(); ctx.translate(cx, base); ctx.scale(sc, sc);
      // aura del palazzo
      const aura = ctx.createRadialGradient(0, -138, 12, 0, -138, 330);
      aura.addColorStop(0, 'rgba(100,244,224,0.16)'); aura.addColorStop(0.62, 'rgba(57,188,196,0.07)'); aura.addColorStop(1, 'rgba(20,112,142,0)');
      ctx.fillStyle = aura; ctx.fillRect(-350, -450, 700, 470);

      // piattaforma in pietra corallina
      ctx.fillStyle = '#07374e'; ctx.beginPath(); ctx.moveTo(-335, 6); ctx.lineTo(-294, -28); ctx.lineTo(294, -28); ctx.lineTo(335, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6ac8b7'; ctx.fillRect(-285, -32, 570, 8);
      ctx.fillStyle = 'rgba(191,255,222,0.48)'; ctx.fillRect(-245, -38, 490, 3);

      // corpo del palazzo e ombre profonde
      ctx.fillStyle = '#145a70'; ctx.fillRect(-174, -176, 348, 143);
      ctx.fillStyle = '#2b8590'; ctx.fillRect(-164, -169, 328, 126);
      ctx.fillStyle = '#0b405c'; ctx.fillRect(-20, -158, 40, 125);
      ctx.fillStyle = '#07344f'; ctx.beginPath(); ctx.moveTo(-34, -33); ctx.lineTo(-34, -115); ctx.arc(0, -115, 34, Math.PI, 0); ctx.lineTo(34, -33); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6ce4d2'; ctx.beginPath(); ctx.moveTo(-22, -33); ctx.lineTo(-22, -111); ctx.arc(0, -111, 22, Math.PI, 0); ctx.lineTo(22, -33); ctx.closePath(); ctx.fill();

      // cupola principale a conchiglia
      ctx.fillStyle = '#8cd9c8'; ctx.beginPath(); ctx.moveTo(-112, -178); ctx.quadraticCurveTo(-95, -269, 0, -284); ctx.quadraticCurveTo(95, -269, 112, -178); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d5f3d9'; ctx.beginPath(); ctx.moveTo(-85, -183); ctx.quadraticCurveTo(-68, -244, 0, -257); ctx.quadraticCurveTo(68, -244, 85, -183); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e3fff0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-88, -182); ctx.quadraticCurveTo(0, -271, 88, -182); ctx.stroke();
      ctx.fillStyle = '#a1f2d9'; ctx.beginPath(); ctx.arc(0, -280, 8, 0, TAU); ctx.fill();

      // colonne e finestre luminose
      for (let k = 0; k < 8; k++) {
        const x = -145 + k * 41.4;
        ctx.fillStyle = k % 2 ? '#c7ead6' : '#79c8ba'; ctx.fillRect(x, -163, 13, 119);
        ctx.fillStyle = 'rgba(220,255,238,0.65)'; ctx.fillRect(x + 2, -160, 3, 113);
        ctx.fillStyle = 'rgba(3,39,58,0.55)'; ctx.fillRect(x + 13, -160, 4, 116);
      }
      // torri gemelle a cupola e guglie
      for (const side of [-1, 1]) {
        const tx = side * 226, ht = 176 + rnd(n, side + 811) * 44;
        ctx.fillStyle = '#0d4a63'; ctx.fillRect(tx - 43, -ht, 86, ht - 27);
        ctx.fillStyle = '#75c9b9'; ctx.fillRect(tx - 49, -ht - 8, 98, 10);
        ctx.fillStyle = '#c5efdc'; ctx.beginPath(); ctx.ellipse(tx, -ht - 6, 49, 28, 0, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = '#164e65'; ctx.beginPath(); ctx.moveTo(tx - 42, -ht + 1); ctx.lineTo(tx, -ht - 75); ctx.lineTo(tx + 42, -ht + 1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#9af1db'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx, -ht - 63); ctx.lineTo(tx, -ht + 4); ctx.stroke();
        for (let j = 0; j < 3; j++) { ctx.fillStyle = 'rgba(182,255,228,0.72)'; ctx.fillRect(tx - 23 + j * 18, -ht + 38, 7, 30); }
      }
      // statue centrale con tridente
      ctx.fillStyle = '#b7ead4'; ctx.beginPath(); ctx.arc(0, -214, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7ec8b8'; ctx.beginPath(); ctx.moveTo(-13, -203); ctx.lineTo(13, -203); ctx.lineTo(19, -150); ctx.lineTo(-19, -150); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#f1e1a2'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(28, -211); ctx.lineTo(28, -270); ctx.moveTo(16, -263); ctx.lineTo(28, -278); ctx.lineTo(40, -263); ctx.moveTo(28, -265); ctx.lineTo(28, -286); ctx.stroke();

      // archi laterali in rovina
      for (const side of [-1, 1]) {
        const ax = side * 315;
        ctx.strokeStyle = '#69b9ae'; ctx.lineWidth = 17; ctx.beginPath(); ctx.moveTo(ax - 43, -30); ctx.lineTo(ax - 43, -94); ctx.arc(ax, -94, 43, Math.PI, 0); ctx.lineTo(ax + 43, -30); ctx.stroke();
        ctx.strokeStyle = 'rgba(206,255,228,0.72)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ax, -94, 39, Math.PI, 0); ctx.stroke();
      }
      ctx.restore();
    }

    // Manta gigante in controluce, lenta e lontana; piccoli banchi di pesci in diagonale.
    const mantaX = ((S.camX * 0.019 + 540) % (w + 620)) - 310, mantaY = gy * 0.245 + Math.sin(now * 0.22) * 12;
    ctx.save(); ctx.translate(mantaX, mantaY); ctx.scale(1.18, 0.82); ctx.globalAlpha = 0.24; ctx.fillStyle = '#041d37';
    ctx.beginPath(); ctx.moveTo(-150, 0); ctx.quadraticCurveTo(-70, -60, 0, -22); ctx.quadraticCurveTo(72, -64, 150, -2); ctx.quadraticCurveTo(82, 18, 48, 40); ctx.quadraticCurveTo(0, 17, -45, 42); ctx.quadraticCurveTo(-99, 22, -150, 0); ctx.closePath(); ctx.fill();
    ctx.moveTo(4, 24); ctx.quadraticCurveTo(45, 66, 74, 78); ctx.quadraticCurveTo(38, 54, 31, 27); ctx.fill(); ctx.restore();
    for (let school = 0; school < 3; school++) {
      const sx = ((school * 470 + 180 - S.camX * 0.026 + w + 500) % (w + 500)) - 250;
      const sy = gy * (0.33 + school * 0.09) + Math.sin(now * 0.55 + school) * 16;
      ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = 0.52; ctx.fillStyle = school === 1 ? '#9af5e3' : '#d1fff0';
      for (let k = 0; k < 7; k++) { const x = k * 18 - 54, y = Math.sin(k * 0.8 + now * 0.8) * 7; ctx.beginPath(); ctx.moveTo(x + 12, y); ctx.lineTo(x - 3, y - 7); ctx.lineTo(x - 1, y); ctx.lineTo(x - 3, y + 7); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // Bubbles: a few large, reflective ones rather than a noisy particle field.
    for (let i = 0; i < 13; i++) {
      const x = (rnd(i, 941) * w + Math.sin(now * 0.3 + i) * 12) % w;
      const y = gy * (0.23 + rnd(i, 942) * 0.56) - ((now * (9 + rnd(i, 943) * 9) + i * 47) % 150);
      const r = 3 + rnd(i, 944) * 8;
      ctx.globalAlpha = 0.28 + 0.18 * Math.sin(now * 1.3 + i);
      ctx.strokeStyle = '#b9fff1'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(225,255,247,0.45)'; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.34, Math.max(1, r * 0.18), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawEnchantedBackdrop(ctx, w, h, gy, now) {
    const par = S.camX * 0.045;
    const sky = ctx.createLinearGradient(0, 0, 0, gy * 1.12);
    sky.addColorStop(0, '#08162a'); sky.addColorStop(0.44, '#102e3c'); sky.addColorStop(0.78, '#1b4a3d'); sky.addColorStop(1, '#101f2b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // Luna grande dietro una corona d'aurora.
    const mx = w * 0.76, my = gy * 0.19, mr = Math.min(76, gy * 0.115);
    const glow = ctx.createRadialGradient(mx, my, 6, mx, my, mr * 3.7);
    glow.addColorStop(0, 'rgba(208,255,203,0.34)'); glow.addColorStop(0.42, 'rgba(131,220,179,0.15)'); glow.addColorStop(1, 'rgba(97,203,160,0)');
    ctx.fillStyle = glow; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    ctx.fillStyle = '#d8f0cb'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9cc7a8'; ctx.globalAlpha = 0.24; ctx.beginPath(); ctx.arc(mx + mr * 0.31, my - mr * 0.18, mr * 0.78, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;

    // Nastri d'aurora, larghi e lenti: non un fondale blu generico.
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let band = 0; band < 3; band++) {
      const y = gy * (0.20 + band * 0.095);
      ctx.beginPath(); ctx.moveTo(-60, y + 20);
      for (let x = -60; x <= w + 80; x += 24) {
        const yy = y + Math.sin(x * 0.004 + now * (0.12 + band * 0.025) + band) * (28 + band * 9) + Math.sin(x * 0.009 - now * 0.1) * 11;
        ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = band === 1 ? 'rgba(109,247,177,0.24)' : 'rgba(183,147,255,0.20)'; ctx.lineWidth = 22 - band * 4; ctx.stroke();
      ctx.strokeStyle = band === 1 ? 'rgba(205,255,215,0.25)' : 'rgba(204,177,255,0.18)'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();

    // Costellazioni sparse.
    for (let i = 0; i < 54; i++) {
      const x = rnd(i, 951) * w, y = rnd(i, 952) * gy * 0.55, r = 0.8 + rnd(i, 953) * 1.7;
      ctx.globalAlpha = 0.28 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.8 + i)); ctx.fillStyle = i % 5 === 0 ? '#f7d9ff' : '#d4f8d9';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Fondale di foresta: chiome in ombra, radici e tronchi monumentali su piani distinti.
    const treeline = gy * 0.78;
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer ? 0.075 : 0.035, baseY = treeline + layer * 33, spacing = layer ? 490 : 760;
      const first = Math.floor((S.camX * speed - spacing) / spacing), last = Math.floor((S.camX * speed + w + spacing) / spacing);
      for (let n = first; n <= last; n++) {
        const x = n * spacing + spacing * 0.5 + rnd(n, 961 + layer) * 130 - S.camX * speed;
        const ht = (layer ? 175 : 255) + rnd(n, 962 + layer) * 100, wide = ht * (0.7 + rnd(n, 963 + layer) * 0.25);
        ctx.fillStyle = layer ? '#102f31' : '#0b252e';
        ctx.beginPath(); ctx.moveTo(x - 14, baseY); ctx.lineTo(x - 8, baseY - ht * 0.62);
        ctx.quadraticCurveTo(x - wide * 0.7, baseY - ht * 0.78, x - wide * 0.43, baseY - ht * 0.98);
        ctx.quadraticCurveTo(x - wide * 0.3, baseY - ht * 0.75, x, baseY - ht);
        ctx.quadraticCurveTo(x + wide * 0.47, baseY - ht * 0.94, x + wide * 0.55, baseY - ht * 0.70);
        ctx.lineTo(x + 15, baseY); ctx.closePath(); ctx.fill();
      }
    }

    // Alberi antichi a gruppi: tronchi contorti, chiome a più livelli e radici enormi.
    const spacing = 1900, first = Math.floor((S.camX * 0.055 - 650) / spacing), last = Math.floor((S.camX * 0.055 + w + 650) / spacing);
    for (let n = first; n <= last; n++) {
      const cx = n * spacing + 870 + (rnd(n, 970) - 0.5) * 260 - S.camX * 0.055;
      if (cx < -620 || cx > w + 620) continue;
      const base = gy * (0.82 + rnd(n, 971) * 0.035), scale = 0.9 + rnd(n, 972) * 0.22, ht = 380 + rnd(n, 973) * 95;
      ctx.save(); ctx.translate(cx, base); ctx.scale(scale, scale);
      const aura = ctx.createRadialGradient(0, -ht * 0.68, 10, 0, -ht * 0.68, 340);
      aura.addColorStop(0, 'rgba(122,255,181,0.22)'); aura.addColorStop(0.55, 'rgba(87,210,149,0.09)'); aura.addColorStop(1, 'rgba(87,210,149,0)');
      ctx.fillStyle = aura; ctx.fillRect(-350, -ht - 160, 700, ht + 230);
      // trunk twists to the right
      const trunk = ctx.createLinearGradient(-45, 0, 58, -ht);
      trunk.addColorStop(0, '#182f2d'); trunk.addColorStop(0.48, '#604f3b'); trunk.addColorStop(0.7, '#92724d'); trunk.addColorStop(1, '#203f35');
      ctx.fillStyle = trunk; ctx.beginPath(); ctx.moveTo(-78, 8); ctx.bezierCurveTo(-37, -108, -94, -214, -31, -ht); ctx.bezierCurveTo(14, -ht - 20, 88, -ht + 42, 58, -ht * 0.69); ctx.bezierCurveTo(24, -ht * 0.48, 34, -ht * 0.27, 82, 5); ctx.lineTo(36, 5); ctx.bezierCurveTo(2, -115, -20, -176, -43, -ht * 0.79); ctx.bezierCurveTo(-28, -ht * 0.45, -26, -ht * 0.22, -26, 8); ctx.closePath(); ctx.fill();
      // roots
      ctx.fillStyle = '#263d2e';
      for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 22, -15); ctx.quadraticCurveTo(side * 80, 7, side * 160, 7); ctx.quadraticCurveTo(side * 83, -28, side * 38, -62); ctx.closePath(); ctx.fill(); }
      // branches
      ctx.strokeStyle = '#4d4e37'; ctx.lineWidth = 27; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-15, -ht * 0.57); ctx.quadraticCurveTo(-150, -ht * 0.77, -205, -ht * 0.86); ctx.moveTo(28, -ht * 0.64); ctx.quadraticCurveTo(151, -ht * 0.84, 196, -ht * 0.88); ctx.stroke();
      // overlapping canopy clusters
      const leafColors = ['#174c3d', '#236448', '#327d52', '#6aa66a'];
      for (let k = 0; k < 9; k++) {
        const lx = (k - 4) * 48 + (rnd(n, 980 + k) - 0.5) * 22, ly = -ht * (0.73 + rnd(n, 990 + k) * 0.25), rx = 78 + rnd(n, 1000 + k) * 38, ry = 52 + rnd(n, 1010 + k) * 34;
        ctx.fillStyle = leafColors[k % leafColors.length]; ctx.beginPath(); ctx.ellipse(lx, ly, rx, ry, (k - 4) * 0.08, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(188,255,174,0.18)'; ctx.beginPath(); ctx.ellipse(lx - rx * 0.2, ly - ry * 0.28, rx * 0.48, ry * 0.23, -0.18, 0, TAU); ctx.fill();
      }
      // ancient tree hollow: a glowing portal in the trunk
      ctx.fillStyle = '#081d25'; ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(-24, -116); ctx.arc(0, -116, 24, Math.PI, 0); ctx.lineTo(24, -24); ctx.closePath(); ctx.fill();
      const portal = ctx.createRadialGradient(0, -88, 2, 0, -88, 66);
      portal.addColorStop(0, 'rgba(178,255,166,0.75)'); portal.addColorStop(0.5, 'rgba(82,215,150,0.32)'); portal.addColorStop(1, 'rgba(82,215,150,0)');
      ctx.fillStyle = portal; ctx.fillRect(-75, -160, 150, 145);
      ctx.strokeStyle = '#b8e9a4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-28, -24); ctx.lineTo(-28, -115); ctx.arc(0, -115, 28, Math.PI, 0); ctx.lineTo(28, -24); ctx.stroke();
      ctx.restore();
    }

    // Funghi monumentali bioluminescenti, in piccoli gruppi lontani dalla linea di gara.
    const mushroomSpacing = 1640, m0 = Math.floor((S.camX * 0.048 - 520) / mushroomSpacing), m1 = Math.floor((S.camX * 0.048 + w + 520) / mushroomSpacing);
    for (let n = m0; n <= m1; n++) {
      const groupX = n * mushroomSpacing + 820 + (rnd(n, 1021) - 0.5) * 260 - S.camX * 0.048;
      if (groupX < -480 || groupX > w + 480) continue;
      const ground = gy * 0.805;
      for (let j = 0; j < 3; j++) {
        const side = j - 1, x = groupX + side * (72 + rnd(n, 1022 + j) * 28), sc = 0.72 + rnd(n, 1026 + j) * 0.72;
        const stemH = (54 + rnd(n, 1030 + j) * 48) * sc, capW = (32 + rnd(n, 1035 + j) * 19) * sc, capY = ground - stemH;
        const mg = ctx.createRadialGradient(x, capY, 2, x, capY, capW * 2.3); mg.addColorStop(0, 'rgba(233,150,255,0.22)'); mg.addColorStop(1, 'rgba(233,150,255,0)');
        ctx.fillStyle = mg; ctx.fillRect(x - capW * 2.4, capY - capW * 2.4, capW * 4.8, capW * 4.8);
        ctx.fillStyle = '#d9c9a7'; ctx.beginPath(); ctx.moveTo(x - capW * 0.23, ground); ctx.quadraticCurveTo(x - capW * 0.15, capY + 4, x - capW * 0.28, capY + 4); ctx.lineTo(x + capW * 0.28, capY + 4); ctx.quadraticCurveTo(x + capW * 0.13, ground, x + capW * 0.23, ground); ctx.closePath(); ctx.fill();
        const cap = ctx.createLinearGradient(x, capY - 22 * sc, x, capY + 5); cap.addColorStop(0, j === 1 ? '#f4b0ed' : '#c8e88e'); cap.addColorStop(1, j === 1 ? '#a94e9d' : '#5c9b6d');
        ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(x, capY, capW, capW * 0.42, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(248,232,209,0.58)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, capY, capW * 0.92, capW * 0.36, 0, Math.PI, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,246,215,0.88)'; for (let d = -1; d <= 1; d++) { ctx.beginPath(); ctx.arc(x + d * capW * 0.42, capY - 4 * sc, 3.2 * sc, 0, TAU); ctx.fill(); }
      }
    }

    // Cerchio di pietre runiche, raro e memorabile, sospeso sopra la foresta.
    const ringSpan = w + 1280, ringX = ((S.camX * 0.028 + 980) % ringSpan + ringSpan) % ringSpan - 640, ringY = gy * 0.57;
    ctx.save(); ctx.translate(ringX, ringY); ctx.rotate(Math.sin(now * 0.12) * 0.03);
    const rg = ctx.createRadialGradient(0, 0, 38, 0, 0, 190); rg.addColorStop(0, 'rgba(134,255,174,0)'); rg.addColorStop(0.7, 'rgba(114,250,173,0.08)'); rg.addColorStop(1, 'rgba(114,250,173,0)'); ctx.fillStyle = rg; ctx.fillRect(-200, -200, 400, 400);
    ctx.strokeStyle = 'rgba(151,238,177,0.42)'; ctx.lineWidth = 15; ctx.beginPath(); ctx.ellipse(0, 0, 132, 153, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#c6e7aa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 132, 153, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 9; i++) { const a = i * TAU / 9; ctx.fillStyle = '#d5f8bb'; ctx.beginPath(); ctx.arc(Math.cos(a) * 132, Math.sin(a) * 153, 5, 0, TAU); ctx.fill(); }
    ctx.restore();

    // Fireflies in small groups, not an even field of dots.
    for (let group = 0; group < 3; group++) {
      const gx = (group * 487 + 130 - S.camX * 0.07 + w + 700) % (w + 700) - 350;
      for (let i = 0; i < 8; i++) {
        const x = gx + Math.sin(i * 1.7 + now * 0.2) * (28 + i * 4), y = gy * (0.31 + rnd(i, group + 981) * 0.34) + Math.cos(now * 0.45 + i) * 12;
        const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now * 1.7 + i * 1.6 + group));
        ctx.globalAlpha = 0.18 + pulse * 0.52; ctx.fillStyle = i % 3 ? '#b8ffc0' : '#ffdf9e'; ctx.beginPath(); ctx.arc(x, y, 2 + pulse * 1.5, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawNeonBackdrop(ctx, w, h, gy, now) {
    const par = S.camX * 0.052;
    const sky = ctx.createLinearGradient(0, 0, 0, gy * 1.1);
    sky.addColorStop(0, '#060a1d'); sky.addColorStop(0.43, '#121537'); sky.addColorStop(0.75, '#2b1748'); sky.addColorStop(1, '#10142c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

    // Electric atmospheric halo and huge holographic moon.
    const mx = w * 0.77, my = gy * 0.20, mr = 78;
    const halo = ctx.createRadialGradient(mx, my, 4, mx, my, 310); halo.addColorStop(0, 'rgba(255,81,216,0.28)'); halo.addColorStop(0.42, 'rgba(100,102,255,0.15)'); halo.addColorStop(1, 'rgba(44,54,151,0)');
    ctx.fillStyle = halo; ctx.fillRect(mx - 320, my - 320, 640, 640);
    ctx.strokeStyle = 'rgba(91,235,255,0.48)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(mx, my, mr * 1.58, mr * 0.53, -0.28, 0.05, Math.PI * 1.96); ctx.stroke();
    const planet = ctx.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr); planet.addColorStop(0, '#ff73d8'); planet.addColorStop(0.48, '#7b5bd9'); planet.addColorStop(1, '#242b68');
    ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.clip();
    for (let i = 0; i < 7; i++) { ctx.fillStyle = `rgba(21,25,64,${0.12 + i * 0.025})`; ctx.fillRect(mx - mr, my - mr + i * 22, mr * 2, 7); }
    ctx.restore();

    // Thin data lines across the sky.
    ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = '#6bdfff'; ctx.lineWidth = 1;
    for (let y = 36; y < gy * 0.62; y += 54) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let x = 70; x < w; x += 170) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 55, gy * 0.6); ctx.stroke(); }
    ctx.restore();

    // City skyline: deep silhouettes first, then luminous megatowers with distinct profiles.
    const backSpacing = 430, backFirst = Math.floor((S.camX * 0.022 - backSpacing) / backSpacing), backLast = Math.floor((S.camX * 0.022 + w + backSpacing) / backSpacing);
    for (let n = backFirst; n <= backLast; n++) {
      const x = n * backSpacing + backSpacing * 0.5 + rnd(n, 1101) * 110 - S.camX * 0.022;
      const bw = 110 + rnd(n, 1102) * 110, bh = 110 + rnd(n, 1103) * 130, base = gy * 0.79;
      ctx.fillStyle = '#111832'; ctx.beginPath(); ctx.moveTo(x - bw / 2, base); ctx.lineTo(x - bw / 2, base - bh + 22); ctx.lineTo(x - bw * 0.18, base - bh); ctx.lineTo(x + bw * 0.34, base - bh + 9); ctx.lineTo(x + bw / 2, base - bh + 35); ctx.lineTo(x + bw / 2, base); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(60,207,231,0.46)'; ctx.fillRect(x - bw / 2, base - bh + 26, 3, bh - 26);
      for (let r = 0; r < 5; r++) { ctx.fillStyle = r % 2 ? 'rgba(229,72,198,0.42)' : 'rgba(79,225,238,0.45)'; ctx.fillRect(x - bw * 0.28, base - bh + 36 + r * 19, bw * 0.56, 3); }
    }

    // Main skyline group every 1.7 km: art-deco towers, antenna spires, bridge and a signature ring.
    const spacing = 1740, first = Math.floor((S.camX * 0.062 - 700) / spacing), last = Math.floor((S.camX * 0.062 + w + 700) / spacing);
    for (let n = first; n <= last; n++) {
      const cx = n * spacing + 880 + (rnd(n, 1111) - 0.5) * 220 - S.camX * 0.062;
      if (cx < -700 || cx > w + 700) continue;
      const base = gy * 0.83, sc = 0.9 + rnd(n, 1112) * 0.22;
      ctx.save(); ctx.translate(cx, base); ctx.scale(sc, sc);
      // skyline ground glow
      const groundGlow = ctx.createLinearGradient(0, -380, 0, 0); groundGlow.addColorStop(0, 'rgba(69,72,186,0)'); groundGlow.addColorStop(1, 'rgba(80,65,181,0.22)'); ctx.fillStyle = groundGlow; ctx.fillRect(-450, -390, 900, 390);
      const towers = [
        { x: -245, w: 112, h: 270, c: '#172248', top: 'spire' },
        { x: -126, w: 128, h: 350, c: '#1a2147', top: 'flat' },
        { x: 22, w: 148, h: 420, c: '#20224c', top: 'crown' },
        { x: 186, w: 120, h: 312, c: '#171d42', top: 'spire' },
        { x: 296, w: 86, h: 230, c: '#202248', top: 'flat' }
      ];
      for (let k = 0; k < towers.length; k++) {
        const t = towers[k], top = -t.h;
        ctx.fillStyle = t.c; ctx.fillRect(t.x - t.w / 2, top, t.w, t.h);
        ctx.fillStyle = 'rgba(7,12,34,0.58)'; ctx.fillRect(t.x - t.w / 2 + 12, top + 7, t.w - 24, t.h - 7);
        // art-deco vertical light ribs
        ctx.shadowBlur = 12; ctx.shadowColor = k % 2 ? '#f15ccf' : '#50e8f5'; ctx.strokeStyle = k % 2 ? '#ec5fc8' : '#53eafa'; ctx.lineWidth = 3;
        for (let r = -1; r <= 1; r++) { ctx.beginPath(); ctx.moveTo(t.x + r * (t.w * 0.29), top + 12); ctx.lineTo(t.x + r * (t.w * 0.29), -8); ctx.stroke(); }
        ctx.shadowBlur = 0;
        // windows as sparse luminous ribbons
        for (let row = 0; row < Math.floor(t.h / 24); row++) {
          for (let col = 0; col < 3; col++) {
            if (rnd(n * 9 + k, row * 4 + col) < 0.28) continue;
            ctx.fillStyle = (row + col + k) % 2 ? 'rgba(90,235,239,0.82)' : 'rgba(248,91,208,0.78)';
            ctx.fillRect(t.x - t.w * 0.31 + col * t.w * 0.25, top + 16 + row * 24, 8, 12);
          }
        }
        if (t.top === 'spire') { ctx.fillStyle = '#111936'; ctx.beginPath(); ctx.moveTo(t.x - t.w * 0.42, top + 3); ctx.lineTo(t.x, top - 58); ctx.lineTo(t.x + t.w * 0.42, top + 3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#61f4f1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t.x, top - 52); ctx.lineTo(t.x, top - 4); ctx.stroke(); }
        if (t.top === 'crown') { ctx.fillStyle = '#222957'; ctx.beginPath(); ctx.moveTo(t.x - t.w / 2, top + 10); ctx.lineTo(t.x - 48, top - 35); ctx.lineTo(t.x, top - 58); ctx.lineTo(t.x + 48, top - 35); ctx.lineTo(t.x + t.w / 2, top + 10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fa62d8'; ctx.lineWidth = 3; ctx.stroke(); }
      }
      // suspended skybridge with magenta/cyan edge light
      ctx.shadowBlur = 14; ctx.shadowColor = '#55eff2'; ctx.strokeStyle = '#59eaf1'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-330, -198); ctx.lineTo(350, -198); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(245,81,208,0.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-330, -188); ctx.lineTo(350, -188); ctx.stroke();
      // central holographic billboard
      ctx.fillStyle = 'rgba(11,18,48,0.9)'; ctx.fillRect(-66, -335, 132, 72); ctx.strokeStyle = '#67f6f0'; ctx.lineWidth = 3; ctx.strokeRect(-66, -335, 132, 72);
      ctx.shadowBlur = 15; ctx.shadowColor = '#ee5ac9'; ctx.fillStyle = '#f77bdc'; ctx.font = '900 32px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DW', 0, -299); ctx.shadowBlur = 0;
      // elevated maglev and moving cabin
      const railY = -128, trainX = -145 + ((now * 34 + n * 61) % 290);
      ctx.strokeStyle = 'rgba(91,239,247,0.78)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-370, railY); ctx.lineTo(370, railY); ctx.stroke();
      ctx.fillStyle = '#1e2850'; ctx.beginPath(); ctx.roundRect(trainX, railY - 31, 104, 26, 12); ctx.fill(); ctx.strokeStyle = '#ff66d4'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#8bfff0'; ctx.fillRect(trainX + 13, railY - 24, 75, 5);
      ctx.restore();
    }

    // Rain lines and distant traffic trails; low density to keep the rider readable.
    ctx.save(); ctx.globalAlpha = 0.17; ctx.strokeStyle = '#9fd9ff'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 46; i++) {
      const x = (rnd(i, 1151) * (w + 120) - 60 - now * (18 + rnd(i, 1152) * 16)) % (w + 120);
      const y = rnd(i, 1153) * gy * 0.82 + ((now * 62 + i * 29) % 170);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 22); ctx.stroke();
    }
    ctx.restore();
    // Roadside laser reflections near the horizon.
    const horizon = gy * 0.82;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const refl = ctx.createLinearGradient(0, horizon - 25, 0, gy * 1.02); refl.addColorStop(0, 'rgba(78,226,237,0.14)'); refl.addColorStop(1, 'rgba(78,226,237,0)');
    ctx.fillStyle = refl; ctx.fillRect(0, horizon - 25, w, gy * 1.02 - horizon + 25);
    for (let i = 0; i < 14; i++) { const x = (i * 157 + now * (24 + i) + S.camX * 0.03) % (w + 80) - 40, y = horizon + 12 + (i % 4) * 11; ctx.strokeStyle = i % 2 ? 'rgba(255,83,210,0.26)' : 'rgba(81,238,244,0.26)'; ctx.lineWidth = 2 + (i % 3); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34 + (i % 4) * 13, y); ctx.stroke(); }
    ctx.restore();
  }

  function drawBackdrop(ctx) {
    if (!Z.length) { ctx.fillStyle = '#bde3ff'; ctx.fillRect(0, 0, S.w, S.h); return; }
    if (S.world === 'atlantis' || S.world === 'enchanted' || S.world === 'neon') {
      drawDedicatedWorldBackdrop(ctx);
      return;
    }
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

    // sole piatto (stile poster): disco arancio-rosso che "respira" piano, con un alone che pulsa; più rosso verso il tramonto
    if (LAND && (S.world === 'classic' || S.world === 'paradise')) {
      // sole enorme e pallido dietro le montagne: alone sfumato + disco morbido
      const sx = S.sunX, sy = S.sunY, r = S.sunR * 2.3 * (1 + 0.015 * Math.sin(now * 1.2)), sc = S.sunC;
      ctx.globalAlpha = 1 - S.night * 0.6;
      const hg = ctx.createRadialGradient(sx, sy, r * 0.8, sx, sy, r * 2.1);
      hg.addColorStop(0, rgb(mix(sc, S.skyB, 0.25)) .replace('rgb(', 'rgba(').replace(')', ',0.42)')); hg.addColorStop(1, rgb(sc).replace('rgb(', 'rgba(').replace(')', ',0)'));
      ctx.fillStyle = hg; ctx.fillRect(sx - r * 2.2, sy - r * 2.2, r * 4.4, r * 4.4);
      ctx.fillStyle = rgb(mix(sc, [255, 255, 255], 0.08)); ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (POSTER && (S.world === 'classic' || S.world === 'paradise')) {
      const sx = S.sunX, sy = S.sunY, r = S.sunR * 1.3, col = mix(SUN_COL, SUN_WARM, S.warm * 0.7), cs = rgb(col);
      ctx.fillStyle = cs; ctx.globalAlpha = 1 - S.night * 0.4;
      ctx.beginPath(); ctx.arc(sx, sy, r * (1 + 0.02 * Math.sin(now * 1.4)), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (S.world === 'classic' || S.world === 'paradise') {
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

    // Nuvole standard solo nei mondi classici: Paradiso e Inferno hanno
    // atmosfere dedicate (nuvole bianche / banchi di cenere).
    if (S.world === 'classic') for (let i = 0; i < CLOUDS.length; i++) {
      const c = CLOUDS[i];
      let sx = ((c.x0 + now * c.drift - S.camX * c.par) % CLOUD_WRAP + CLOUD_WRAP) % CLOUD_WRAP - 260;
      if (sx > w + 40) continue;
      const cw = 150 * c.s, ch = 90 * c.s, y = c.y * gy;
      const alpha = c.a * (1 - S.night * 0.65);
      ctx.globalAlpha = alpha; ctx.drawImage(atlas.clouds[c.shape], sx, y, cw, ch);
      if (S.warm > 0.05) { ctx.globalAlpha = alpha * S.warm * 0.85; ctx.drawImage(atlas.cloudsWarm[c.shape], sx, y, cw, ch); }
    }
    ctx.globalAlpha = 1;
    drawInfernoAtmosphere(ctx);

    // uccelli (solo di giorno): nel look poster sono gabbiani scuri e spessi, in stormi da tre che sbattono le ali
    if ((S.world === 'classic' || S.world === 'paradise') && S.day > 0.3 && quality < 2) {
      ctx.strokeStyle = S.world === 'paradise' ? 'rgba(255,255,255,0.92)' : LAND ? `rgba(96,44,84,${(0.8 * S.day).toFixed(2)})` : POSTER ? `rgba(36,52,58,${(0.95 * S.day).toFixed(2)})` : `rgba(40,50,80,${(0.6 * S.day).toFixed(2)})`;
      ctx.lineWidth = LAND ? 2.6 : POSTER ? 3.4 : 2; ctx.lineCap = 'round';
      const bp = new Path2D(), nf = POSTER ? 3 : 1;
      for (let i = 0; i < BIRDS.length; i++) {
        const b = BIRDS[i], span = w + 400;
        const x0 = ((b.x0 + now * b.v - S.camX * 0.05) % span + span) % span - 200;
        for (let f = 0; f < nf; f++) {
          const x = x0 - f * 46, y = b.y * gy + Math.sin(now * 0.9 + b.ph + f * 0.7) * 10 + (f === 1 ? 14 : f === 2 ? -5 : 0);
          const fl = Math.sin(now * 7 + b.ph * 3 + f * 1.3), s = b.s * (POSTER ? 12 : 9);
          bp.moveTo(x - s, y - fl * s * 0.7); bp.quadraticCurveTo(x - s * 0.4, y - s * 0.5 - fl * s * 0.3, x, y);
          bp.quadraticCurveTo(x + s * 0.4, y - s * 0.5 - fl * s * 0.3, x + s, y - fl * s * 0.7);
        }
      }
      ctx.stroke(bp);
    }

    // bagliore caldo all'orizzonte
    if (S.warm > 0.05) {
      const hg = ctx.createLinearGradient(0, gy - 280 * S.hs, 0, gy);
      hg.addColorStop(0, 'rgba(255,170,110,0)'); hg.addColorStop(1, `rgba(255,150,90,${(S.warm * 0.3).toFixed(3)})`);
      ctx.fillStyle = hg; ctx.fillRect(0, gy - 280 * S.hs, w, 280 * S.hs);
    }

    // cielo del vulcano: foschia rossa all'orizzonte (si sfuma col bioma)
    const va = (S.A.part === 'ember' ? 1 - S.t : 0) + (S.B.part === 'ember' ? S.t : 0);
    if (va > 0.02) {
      const vg = ctx.createLinearGradient(0, gy - 330 * S.hs, 0, gy);
      vg.addColorStop(0, 'rgba(255,90,40,0)'); vg.addColorStop(1, `rgba(255,96,40,${(va * 0.42 * (1 - S.night * 0.4)).toFixed(3)})`);
      ctx.fillStyle = vg; ctx.fillRect(0, gy - 330 * S.hs, w, 330 * S.hs);
    }
    const hasDedicatedArt = ['atlantis', 'enchanted', 'neon'].includes(S.world)
      && WORLD_ART[S.world] && WORLD_ART[S.world].complete && WORLD_ART[S.world].naturalWidth > 0;
    if (!hasDedicatedArt) {
      for (let l = 0; l < 4; l++) {
        drawLayer(ctx, l);
        if (l === 0) {
          if (va > 0.02) { drawVolcanoes(ctx, va); drawInfernoCitadels(ctx); }
          drawNewWorldStructures(ctx);
        }
      }
    }
    if (S.segment && S.segmentBlend > 0.001) drawSegmentWorldBackdrop(ctx);
    drawDanteLovers(ctx);
    drawParadiseHeaven(ctx);
    drawParadiseIslands(ctx);
  }

  function drawSegmentWorldBackdrop(ctx) {
    const world = S.segment && S.segment.world;
    if (!world || S.segmentBlend <= 0.001) return;
    const old = { world: S.world, e: S.e, warm: S.warm, night: S.night, day: S.day, starA: S.starA };
    S.world = world;
    if (world === 'atlantis') { S.e = 0.72; S.warm = 0; S.night = 0; S.day = 1; S.starA = 0; }
    else if (world === 'enchanted') { S.e = 0.22; S.warm = 0.02; S.night = 0.48; S.day = 0.12; S.starA = 0.22; }
    else { S.e = 0.12; S.warm = 0; S.night = 0.72; S.day = 0.04; S.starA = 0.12; }
    ctx.save(); ctx.globalAlpha *= S.segmentBlend;
    drawDedicatedWorldBackdrop(ctx);
    ctx.restore();
    S.world = old.world; S.e = old.e; S.warm = old.warm; S.night = old.night; S.day = old.day; S.starA = old.starA;
  }

  // coni vulcanici lontani (fra la prima e la seconda fila di montagne): fianchi scuri, cratere che brilla, un filo di lava, pennacchio di fumo
  function drawVolcanoes(ctx, va) {
    const w = S.w, gy = S.gy, now = S.now / 1000, par = S.camX * 0.05, sp = 1450; // coni vulcanici meno ravvicinati
    const s0 = Math.floor((par - 260) / sp), s1 = Math.floor((par + w + 260) / sp);
    for (let s = s0; s <= s1; s++) {
      const cx = s * sp + sp * (0.25 + 0.5 * rnd(s, 71)) - par; if (cx < -260 || cx > w + 260) continue;
      const hh = (150 + 90 * rnd(s, 72)) * S.hs, bw = hh * (1.5 + 0.4 * rnd(s, 73)), base = gy - 92 * S.hs, top = base - hh, cr = bw * 0.1;
      ctx.globalAlpha = va * (1 - S.night * 0.15);
      // fumo prima (dietro il cono): 4 sbuffi che salgono e si allargano
      for (let k = 0; k < 4; k++) {
        const ph = (now * 0.07 + k / 4 + rnd(s, 74)) % 1, py = top - 10 - ph * 130 * S.hs, px = cx + 20 * Math.sin(ph * 5 + s) + ph * 50, pr = 16 + ph * 46 * S.hs;
        ctx.fillStyle = `rgba(60,44,56,${(0.42 * (1 - ph) * va).toFixed(3)})`; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = va;
      const gr = ctx.createLinearGradient(0, top, 0, base); gr.addColorStop(0, rgb(mix([86, 54, 62], S.skyB, 0.18))); gr.addColorStop(1, rgb(mix([52, 34, 44], S.skyB, 0.32)));
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(cx - bw, base + 4); ctx.quadraticCurveTo(cx - bw * 0.35, base - hh * 0.25, cx - cr, top); ctx.lineTo(cx + cr, top); ctx.quadraticCurveTo(cx + bw * 0.35, base - hh * 0.25, cx + bw, base + 4); ctx.closePath(); ctx.fill();
      // bagliore dal cratere + colata di lava lungo un fianco
      const pulse = 0.75 + 0.25 * Math.sin(now * 1.7 + s * 2);
      const cg = ctx.createRadialGradient(cx, top, 2, cx, top, bw * 0.55); cg.addColorStop(0, `rgba(255,170,60,${(0.8 * pulse * va).toFixed(3)})`); cg.addColorStop(1, 'rgba(255,100,30,0)');
      ctx.fillStyle = cg; ctx.fillRect(cx - bw * 0.6, top - bw * 0.55, bw * 1.2, bw * 1.1);
      ctx.fillStyle = `rgba(255,190,80,${(0.95 * va).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(cx, top + 1, cr * 1.05, cr * 0.34, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,120,30,${(0.85 * pulse * va).toFixed(3)})`; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx + cr * 0.4, top + 3); ctx.quadraticCurveTo(cx + bw * 0.12, top + hh * 0.35, cx + bw * 0.2 + 8 * rnd(s, 75), base - hh * 0.1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
    if (LAND && quality < 3) {
      // montagne a facce: per ogni cima, il versante lontano dal sole è un triangolo scuro, quello vicino uno chiaro
      const dir = S.p < 0.5 ? 1 : -1, dark = new Path2D(), lite = new Path2D(), minH = 8 * S.hs;
      for (let i = 1; i < n - 1; i++) {
        const y = ysBuf[i];
        if (!(y < ysBuf[i - 1] && y <= ysBuf[i + 1])) continue;
        let a = i; while (a > 0 && ysBuf[a - 1] >= ysBuf[a]) a--;
        let b = i; while (b < n - 1 && ysBuf[b + 1] >= ysBuf[b]) b++;
        if (Math.min(ysBuf[a], ysBuf[b]) - y < minH) continue;
        const xp = x0 + i * step, lean = 0.12 * (b - a) * step * dir;
        const side = (from, to, yBase, P) => { P.moveTo(xp, y); const st = to > from ? 1 : -1; for (let k = from + st; k !== to + st; k += st) P.lineTo(x0 + k * step, ysBuf[k]); P.lineTo(x0 + to * step, yBase); P.lineTo(xp + lean, yBase); P.closePath(); };
        const yb = Math.max(ysBuf[a], ysBuf[b]) + 2;
        if (dir > 0) { side(i, b, Math.min(yb, gy + 6), dark); side(i, a, Math.min(yb, gy + 6), lite); }
        else { side(i, a, Math.min(yb, gy + 6), dark); side(i, b, Math.min(yb, gy + 6), lite); }
      }
      const na = S.night * 0.12;
      const shadow = S.world === 'paradise' ? 'rgba(53,105,145,' : 'rgba(72,30,104,';
      const light = S.world === 'paradise' ? 'rgba(255,255,255,' : 'rgba(255,238,214,';
      ctx.fillStyle = `${shadow}${(S.world === 'paradise' ? 0.16 + na - l * 0.02 : 0.24 + na - l * 0.025).toFixed(3)})`; ctx.fill(dark);
      ctx.fillStyle = `${light}${(0.2 * (1 - S.night * 0.8) - l * 0.015).toFixed(3)})`; ctx.fill(lite);
    }
    if (!LAND && sh > 0.4 && quality < 1) {
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
    const w = S.w, camX = S.camX, g = ctx.createLinearGradient(0, 0, w, 0), sg = S.segment;
    let last = 0;
    const stop = (zs, ze, zz) => {
      const a = clamp((zs - camX + 110) / w, 0, 1), b = clamp((ze - camX - 110) / w, 0, 1);
      const aa = Math.max(a, last), bb = Math.max(b, aa), c = rgb(pick(zz));
      g.addColorStop(aa, c); g.addColorStop(bb, c); last = bb;
    };
    for (let i = S.zi0; i < Z.length && Z[i].start < camX + w; i++) {
      const z = Z[i];
      // l'ultima zona del tratto speciale è "mezza": oltre la fine del tratto il terreno torna classico
      if (sg && z.specialWorld === sg.world && z.start < sg.end && z.end > sg.end) {
        stop(z.start, sg.end, z); stop(sg.end, z.end, Object.assign({}, z, { specialWorld: null }));
      } else stop(z.start, z.end, z);
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
      const canyon = tz.key === 'gravel', lavaZ = tz.key === 'lava';
      ctx.beginPath(); let yTop = 1e9, yBot = -1e9;
      for (let i = i0; i <= i1; i++) { const y = gy - Terrain.baseHeight(camX + i * step); if (y < yTop) yTop = y; if (i === i0) ctx.moveTo(i * step, y); else ctx.lineTo(i * step, y); }
      for (let i = i1; i >= i0; i--) { const y = gy - surf[i]; if (y > yBot) yBot = y; ctx.lineTo(i * step, y); }
      ctx.closePath();
      if (POSTER) {
        const c1 = lavaZ ? [74, 50, 58] : canyon ? [201, 118, 80] : [190, 150, 96], c2 = lavaZ ? [48, 32, 40] : canyon ? [168, 88, 62] : [150, 112, 72];
        ctx.fillStyle = rgb(tod(c1, 0.2, 0.4)); ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = rgb(tod(c2, 0.2, 0.4)); ctx.fillRect(i0 * step - 4, yTop + (yBot - yTop) * 0.55, (i1 - i0) * step + 8, yBot - yTop); ctx.restore();
        continue;
      }
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      if (lavaZ) { g.addColorStop(0, rgb(tod([70, 48, 54], 0.2, 0.4))); g.addColorStop(0.6, rgb(tod([38, 24, 30], 0.15, 0.4))); g.addColorStop(1, rgb([86, 20, 12])); }
      else if (canyon) { g.addColorStop(0, rgb(tod([196, 124, 74], 0.3, 0.5))); g.addColorStop(0.55, rgb(tod([120, 62, 34], 0.3, 0.6))); g.addColorStop(1, rgb(tod([92, 70, 100], 0.2, 0.6))); }
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
    ctx.fillStyle = zoneGrad(ctx, z => tod(bioAt(z, z.start).soil, 0.25, 0.5)); ctx.fill();
    if (!POSTER) {
      const dk = mix(S.A.soil, [12, 8, 20], 0.78), vg = ctx.createLinearGradient(0, gy - 90, 0, h);
      vg.addColorStop(0, rgba(dk, 0)); vg.addColorStop(1, rgba(dk, 0.62));
      ctx.fillStyle = vg; ctx.fill();
    }

    // 2. strati e sassi sepolti (dentro il terreno)
    if (LAND && quality < 2) {
      // colline in primo piano a fasce ondulate: terreno → ocra → ruggine → marrone → blu notte (mescolate al colore del bioma)
      ctx.save(); ctx.clip();
      const bandsFor = wd => wd === 'paradise'
        ? [[34, [222, 242, 244], 0.38, 0.010], [100, [177, 213, 230], 0.48, 0.0075], [178, [125, 169, 202], 0.60, 0.0062], [270, [79, 119, 161], 0.78, 0.005]]
        : wd === 'atlantis'
          ? [[34, [57, 171, 160], 0.32, 0.010], [100, [15, 105, 126], 0.48, 0.0075], [178, [7, 62, 88], 0.66, 0.0062], [270, [3, 29, 50], 0.82, 0.005]]
        : wd === 'enchanted'
          ? [[34, [113, 160, 91], 0.30, 0.010], [100, [51, 102, 71], 0.48, 0.0075], [178, [28, 63, 51], 0.68, 0.0062], [270, [12, 31, 39], 0.84, 0.005]]
        : wd === 'neon'
          ? [[34, [85, 88, 160], 0.28, 0.010], [100, [53, 47, 108], 0.5, 0.0075], [178, [29, 29, 70], 0.68, 0.0062], [270, [8, 14, 34], 0.86, 0.005]]
        : [[34, [236, 189, 111], 0.42, 0.010], [100, [206, 98, 56], 0.5, 0.0075], [178, [112, 56, 44], 0.62, 0.0062], [270, [29, 37, 64], 0.82, 0.005]];
      let BANDS = bandsFor(S.world);
      if (S.segment && S.segmentBlend > 0.001) { const B1 = bandsFor(S.segment.world), sb = S.segmentBlend; BANDS = BANDS.map((b, i) => [b[0], mix(b[1], B1[i][1], sb), b[2] + (B1[i][2] - b[2]) * sb, b[3]]); }
      BANDS.forEach(([off, tc, k, fq], bi) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const x = i * step, y = gy - surf[i] + off + 12 * Math.sin((x + camX) * fq + bi * 1.9) + 5 * Math.sin((x + camX) * fq * 2.7 + bi); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.lineTo(xLast, h + 6); ctx.lineTo(0, h + 6); ctx.closePath();
        ctx.fillStyle = zoneGrad(ctx, z => tod(mix(bioAt(z, z.start).soil, tc, k), 0.25, 0.5)); ctx.fill();
      });
      ctx.restore();
    } else if (POSTER && quality < 2) {
      // due fasce ondulate piatte, appena più scure del terreno (come le colline dell'illustrazione); niente sassi
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(45,62,72,0.09)';
      for (let k = 0; k < 2; k++) {
        const off = [70, 170][k]; ctx.beginPath();
        for (let i = 0; i < n; i++) { const x = i * step, y = gy - surf[i] + off + 9 * Math.sin((x + camX) * 0.008 + k * 2.4); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.lineTo(xLast, h + 6); ctx.lineTo(0, h + 6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    } else if (quality < 2) {
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
    if (!POSTER) { ctx.strokeStyle = 'rgba(15,23,42,0.55)'; ctx.lineWidth = 13; ctx.stroke(line); }
    ctx.strokeStyle = zoneGrad(ctx, z => tod(bioAt(z, z.start).surf, 0.25, 0.5)); ctx.lineWidth = POSTER ? 20 : 9; ctx.stroke(line);

    // Dettagli di superficie dedicati: piccoli segni leggibili ma mai sopra la ruota.
    if (quality < 2 && (S.world === 'atlantis' || S.world === 'enchanted' || S.world === 'neon')) {
      const getY = wx => { const sx = wx - camX, fi = clamp(sx / step, 0, n - 2), i = Math.floor(fi), f = fi - i; return gy - (surf[i] * (1 - f) + surf[i + 1] * f); };
      const spacing = S.world === 'neon' ? 96 : S.world === 'atlantis' ? 230 : 280;
      for (let k = Math.floor(camX / spacing) - 1; k <= Math.floor((camX + w) / spacing) + 1; k++) {
        const wx = k * spacing + rnd(k, 1291) * spacing * 0.62, sx = wx - camX;
        if (sx < -24 || sx > w + 24) continue;
        const y = getY(wx) - 3, r = rnd(k, 1292);
        const zone = Terrain.ZONES.find(z => wx >= z.start && wx <= z.end);
        if (zone && zone.gap && wx > zone.gap.g0 - 30 && wx < zone.gap.g1 + 30) continue;
        if (S.world === 'atlantis') {
          if (r < 0.52) {
            ctx.fillStyle = '#e3c99a'; ctx.beginPath(); ctx.ellipse(sx, y - 2, 6 + r * 7, 3 + r * 3, r * 4, 0, TAU); ctx.fill();
            ctx.strokeStyle = 'rgba(255,247,208,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, y - 2, 4 + r * 5, Math.PI, TAU); ctx.stroke();
          } else {
            ctx.strokeStyle = r < 0.76 ? '#e58b84' : '#71d6bc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
            for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.moveTo(sx + j * 5, y); ctx.quadraticCurveTo(sx + j * 7, y - 8, sx + j * 12, y - 13 - r * 8); ctx.stroke(); }
          }
        } else if (S.world === 'enchanted') {
          if (r < 0.62) {
            const cap = r < 0.3 ? '#e48fcb' : '#c2dd83'; ctx.fillStyle = '#e8d5af'; ctx.fillRect(sx - 3, y - 12, 6, 12);
            ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(sx, y - 12, 9 + r * 8, 5, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,244,197,0.86)'; ctx.beginPath(); ctx.arc(sx, y - 13, 1.8, 0, TAU); ctx.fill();
          } else {
            ctx.strokeStyle = 'rgba(175,255,188,0.78)'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(sx, y); ctx.quadraticCurveTo(sx - 7, y - 10, sx - 5, y - 17); ctx.quadraticCurveTo(sx + 3, y - 9, sx, y); ctx.stroke();
          }
        } else {
          ctx.save(); ctx.shadowBlur = 9; ctx.shadowColor = r < 0.5 ? '#5bf1f1' : '#ff5bd5';
          ctx.strokeStyle = r < 0.5 ? 'rgba(84,244,238,0.92)' : 'rgba(255,87,211,0.9)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(sx - 22, y - 5); ctx.lineTo(sx + 22, y - 5); ctx.stroke();
          ctx.fillStyle = '#e8fbff'; ctx.beginPath(); ctx.arc(sx, y - 5, 2.2, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
    }

    // 4. dettagli di superficie dei biomi classici; i nuovi mondi hanno segni dedicati sopra.
    if (quality < 2 && !(S.world === 'atlantis' || S.world === 'enchanted' || S.world === 'neon')) {
      const grass = {}, crk = new Path2D(), snow = new Path2D(), spark = new Path2D(), peb = new Path2D(), leafs = [new Path2D(), new Path2D(), new Path2D()];
      let zi = S.zi0;
      for (let s = Math.floor(camX / 34) - 1; s <= Math.floor((camX + w) / 34) + 1; s++) {
        const wx = s * 34 + rnd(s, 1) * 26, sx = wx - camX; if (sx < -20 || sx > w + 20) continue;
        while (zi < Z.length - 1 && Z[zi].end <= wx) zi++;
        const tz = Terrain.ZONES[zi]; if (tz && tz.gap && wx > tz.gap.g0 - 40 && wx < tz.gap.g1 + 40) continue;
        const bi = Z[zi].biome, fi = clamp(sx / step, 0, n - 2), i = Math.floor(fi), f = fi - i;
        const y = gy - (surf[i] * (1 - f) + surf[i + 1] * f), r = rnd(s, 2);
        if (S.world === 'paradise') {
          if (r < 0.20) { spark.moveTo(sx - 4, y - 7); spark.lineTo(sx + 4, y - 7); spark.moveTo(sx, y - 11); spark.lineTo(sx, y - 3); }
          else if (r < 0.28) { const rr = 1.5 + r * 3; peb.moveTo(sx + rr, y - 3); peb.ellipse(sx, y - 3, rr, rr * 0.7, 0, 0, TAU); }
          continue;
        }
        if (bi === 2) {
          if (r < 0.55) { const rx = 8 + r * 18; snow.moveTo(sx + rx, y - 2); snow.ellipse(sx, y - 2, rx, 3 + r * 6, 0, Math.PI, TAU); }
          else if (r < 0.7) { spark.moveTo(sx - 4, y - 12); spark.lineTo(sx + 4, y - 12); spark.moveTo(sx, y - 16); spark.lineTo(sx, y - 8); }
        } else if (bi === 3) {
          if (r < 0.5) { const rr = 2.5 + r * 6; peb.moveTo(sx + rr * 1.3, y - 3); peb.ellipse(sx, y - 3, rr * 1.3, rr, 0, 0, TAU); }
          else if (r < 0.75) { (grass[3] = grass[3] || new Path2D()); const g2 = grass[3], hh = 6 + r * 8; g2.moveTo(sx - 3, y + 1); g2.lineTo(sx - 5, y - hh); g2.moveTo(sx, y + 1); g2.lineTo(sx + 1, y - hh - 3); g2.moveTo(sx + 3, y + 1); g2.lineTo(sx + 6, y - hh + 1); }
        } else if (bi === 7) {
          if (r < 0.4) { const rr = 3 + r * 9; peb.moveTo(sx + rr * 1.2, y - 3); peb.ellipse(sx, y - 3, rr * 1.2, rr * 0.8, 0, 0, TAU); }
          else if (r < 0.62) { crk.moveTo(sx - 9, y + 7); crk.lineTo(sx - 3, y + 11); crk.lineTo(sx + 2, y + 7); crk.lineTo(sx + 9, y + 12); }
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
        const b = ACTIVE_BIOMES[k]; ctx.strokeStyle = rgb(tod(mix(b.surf, POSTER ? [42, 100, 70] : k == 3 ? [120, 90, 50] : k == 5 ? [160, 70, 20] : [14, 90, 40], 0.45), 0.25, 0.5)); ctx.stroke(grass[k]);
      }
      ctx.fillStyle = rgba(tod([255, 255, 255], 0.3, 0.45), 0.96); ctx.fill(snow);
      ctx.strokeStyle = S.world === 'paradise' ? 'rgba(227,184,91,0.95)' : 'rgba(190,235,255,0.95)'; ctx.lineWidth = 1.8; ctx.stroke(spark);
      ctx.fillStyle = S.world === 'paradise' ? 'rgba(239,207,127,0.9)' : rgba(tod(S.A.part === 'ember' ? [40, 30, 36] : [128, 112, 96], 0.2, 0.5), 1); ctx.fill(peb);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255,110,30,0.55)'; ctx.lineWidth = 5; ctx.stroke(crk); ctx.strokeStyle = 'rgba(255,200,90,0.8)'; ctx.lineWidth = 1.8; ctx.stroke(crk); ctx.restore();
      ['#d9531f', '#f08a2a', '#c9372c'].forEach((c, k) => { ctx.fillStyle = c; ctx.fill(leafs[k]); });
    }
  }

  // ---------- acqua: trasparente, disegnata DAVANTI alle bici ---------------------------------
  // ---------- lava: opaca, luminosa, disegnata DAVANTI alle bici (le ruote ci affondano dentro) ----------------
  // gradiente da arancio vivo (in superficie) a rosso scuro (sul fondo); croste scure che scivolano via, vene di luce, bolle che si gonfiano e scoppiano
  // (con scintille), alone caldo sopra il pelo. Tutto deterministico dalla posizione nel mondo + il tempo: niente stato, niente allocazioni per fotogramma.
  function drawLava(ctx, surf, n, step) {
    const camX = S.camX, w = S.w, gy = S.gy, now = S.now / 1000;
    let any = false;
    for (let zi = S.zi0; zi < Z.length && Z[zi].start < camX + w; zi++) if (Z[zi].key === 'lava') { any = true; break; }
    if (!any) return;
    const nightK = S.night * 0.25;
    let i = 0;
    while (i < n) {
      const ll0 = Terrain.lavaLevel(camX + i * step);
      if (!(ll0 > surf[i] + 0.5)) { i++; continue; }
      let j = i, yTop = gy - ll0, yBot = gy - surf[i];
      const tops = [];
      while (j < n) {
        const ll = Terrain.lavaLevel(camX + j * step);
        if (!(ll > surf[j] + 0.5)) break;
        const x = j * step, wx = x + camX, wv = 2.6 * Math.sin(wx * 0.025 + now * 1.6) + 1.7 * Math.sin(wx * 0.06 - now * 2.4) + 1.1 * Math.sin(wx * 0.13 + now * 3.1);
        tops.push(x, gy - ll + wv); yBot = Math.max(yBot, gy - surf[j]); j++;
      }
      const x0 = i * step, x1 = (j - 1) * step;
      // alone caldo sopra la superficie (additivo)
      if (!POSTER) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // (ellisse sfumata: niente bordi rettangolari visibili ai lati dell'alone)
      const hcx = (x0 + x1) / 2, hhw = (x1 - x0) / 2 + 150;
      ctx.translate(hcx, yTop + 4); ctx.scale(hhw / 120, 1);
      const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
      const ha = (0.36 + nightK).toFixed(3);
      hg.addColorStop(0, `rgba(255,110,30,${ha})`); hg.addColorStop(0.45, `rgba(255,95,25,${(ha * 0.45).toFixed(3)})`); hg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = hg; ctx.fillRect(-120, -120, 240, 240); ctx.restore(); }
      ctx.beginPath(); ctx.moveTo(tops[0], tops[1]);
      for (let k = 2; k < tops.length; k += 2) ctx.lineTo(tops[k], tops[k + 1]);
      for (let k = j - 1; k >= i; k--) ctx.lineTo(k * step, gy - surf[k]);
      ctx.closePath();
      if (POSTER) {
        ctx.fillStyle = '#fb5f35'; ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = '#ff8a4c'; ctx.fillRect(x0 - 4, yTop - 10, x1 - x0 + 8, 20);
        ctx.fillStyle = '#c7411f'; ctx.fillRect(x0 - 4, yTop + (yBot - yTop) * 0.62, x1 - x0 + 8, yBot);
        ctx.restore();
      }
      const g = ctx.createLinearGradient(0, yTop, 0, yBot);
      g.addColorStop(0, 'rgba(255,176,50,0.97)'); g.addColorStop(0.18, 'rgba(255,112,26,0.97)'); g.addColorStop(0.6, 'rgba(214,52,14,0.97)'); g.addColorStop(1, 'rgba(120,16,8,0.98)');
      if (!POSTER) { ctx.fillStyle = g; ctx.fill(); }
      if (quality < 2) {
        ctx.save(); ctx.clip();
        // vene luminose che scorrono
        ctx.strokeStyle = POSTER ? 'rgba(245,229,148,0.5)' : 'rgba(255,226,120,0.34)'; ctx.lineWidth = POSTER ? 3 : 2.4; ctx.beginPath();
        for (let k = 1; yTop + 7 + k * 13 < yBot; k++) {
          const y = yTop + 7 + k * 13; ctx.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 18) ctx.lineTo(x, y + 3 * Math.sin((x + camX) * 0.045 - now * (0.9 + k * 0.25) + k * 1.7));
        }
        ctx.stroke();
        // croste scure che galleggiano e vanno alla deriva (più dense in superficie)
        ctx.fillStyle = POSTER ? '#8f2f17' : 'rgba(52,18,14,0.82)';
        const s0 = Math.floor((camX + x0 - 120) / 95), s1 = Math.floor((camX + x1 + 120) / 95);
        for (let sI = s0; sI <= s1; sI++) {
          const drift = (now * (7 + 5 * rnd(sI, 81))) % 95, wx = sI * 95 + rnd(sI, 82) * 70 - drift + 95, sx = wx - camX; if (sx < x0 - 40 || sx > x1 + 40) continue;
          const fi = clamp((sx - x0) / step, 0, tops.length / 2 - 1), a = Math.floor(fi), f = fi - a, ty = tops[a * 2 + 1] * (1 - f) + tops[Math.min(tops.length / 2 - 1, a + 1) * 2 + 1] * f;
          const rw = 14 + 22 * rnd(sI, 83), rh = 3.2 + 3 * rnd(sI, 84), yy = ty + 3 + 14 * rnd(sI, 85) * rnd(sI, 85);
          ctx.beginPath(); ctx.ellipse(sx, yy, rw, rh, 0, 0, TAU); ctx.fill();
          if (!POSTER) { ctx.strokeStyle = 'rgba(255,140,40,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, yy, rw, rh, 0, Math.PI, TAU); ctx.stroke(); }
        }
        ctx.restore();
        // bolle: si gonfiano, scoppiano, lanciano due scintille
        const b0 = Math.floor((camX + x0) / 64), b1 = Math.floor((camX + x1) / 64);
        for (let b = b0; b <= b1; b++) {
          const per = 2.6 + 2.4 * rnd(b, 91), ph = ((now + rnd(b, 92) * per) % per) / per, bx = b * 64 + rnd(b, 93) * 50 - camX; if (bx < x0 + 6 || bx > x1 - 6) continue;
          const fi = clamp((bx - x0) / step, 0, tops.length / 2 - 1), a = Math.floor(fi), f = fi - a, ty = tops[a * 2 + 1] * (1 - f) + tops[Math.min(tops.length / 2 - 1, a + 1) * 2 + 1] * f;
          const R = 5 + 7 * rnd(b, 94);
          if (ph < 0.72) {
            const k = smooth(ph / 0.72), r = R * k;
            ctx.fillStyle = 'rgba(255,184,66,0.9)'; ctx.beginPath(); ctx.ellipse(bx, ty + 1, r, r * 0.75, 0, Math.PI, TAU); ctx.fill();
            if (!POSTER) { ctx.strokeStyle = 'rgba(255,238,160,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(bx, ty + 1, r, r * 0.75, 0, Math.PI, TAU); ctx.stroke(); }
          } else if (quality < 1) {
            const k = (ph - 0.72) / 0.28;   // scoppio: due gocce che saltano
            ctx.fillStyle = `rgba(255,200,80,${(0.9 * (1 - k)).toFixed(3)})`;
            for (let d = -1; d <= 1; d += 2) { const dx = d * (6 + 14 * k), dy = -(Math.sin(k * Math.PI) * (14 + R)); ctx.beginPath(); ctx.arc(bx + dx, ty + dy, 2.2 * (1 - k * 0.5), 0, TAU); ctx.fill(); }
          }
        }
      }
      // bordo: filo chiaro, alone arancio
      ctx.beginPath(); ctx.moveTo(tops[0], tops[1]); for (let k = 2; k < tops.length; k += 2) ctx.lineTo(tops[k], tops[k + 1]);
      ctx.lineJoin = 'round'; if (!POSTER) { ctx.strokeStyle = 'rgba(255,150,40,0.45)'; ctx.lineWidth = 9; ctx.stroke(); }
      ctx.strokeStyle = POSTER ? '#f5e594' : 'rgba(255,244,176,0.95)'; ctx.lineWidth = POSTER ? 5 : 3; ctx.stroke();
      i = j + 1;
    }
  }

  function drawWater(ctx, surf, n, step) {
    if (!Z.length) return;
    drawLava(ctx, surf, n, step);
    const camX = S.camX, w = S.w, gy = S.gy, now = S.now / 1000;
    let any = false;
    for (let zi = S.zi0; zi < Z.length && Z[zi].start < camX + w; zi++) if (Z[zi].key === 'water') { any = true; break; }
    if (!any) return;
    const wc = tod((S.segment && S.segmentBlend > 0.5 ? segBiomes(S.segment.world) : ACTIVE_BIOMES)[4].water, 0.35, 0.55), deep = mix(wc, [10, 40, 90], 0.55);
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
      if (POSTER) {
        ctx.fillStyle = 'rgba(91,181,176,0.74)'; ctx.fill();
        ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(2,122,113,0.55)'; ctx.fillRect(x0 - 4, yTop + (yBot - yTop) * 0.5, x1 - x0 + 8, yBot); ctx.restore();
      } else {
        const g = ctx.createLinearGradient(0, yTop, 0, yBot);
        g.addColorStop(0, rgba(wc, 0.5)); g.addColorStop(1, rgba(deep, 0.86));
        ctx.fillStyle = g; ctx.fill();
      }
      if (quality < 2) {
        ctx.save(); ctx.clip();
        ctx.strokeStyle = POSTER ? 'rgba(248,244,220,0.3)' : 'rgba(255,255,255,0.13)'; ctx.lineWidth = POSTER ? 3 : 2.5; ctx.beginPath();
        for (let k = 1; yTop + 9 + k * 15 < yBot; k++) {
          const y = yTop + 9 + k * 15; ctx.moveTo(x0, y);
          for (let x = x0; x <= x1; x += 22) ctx.lineTo(x, y + 2.5 * Math.sin((x + camX) * 0.05 + now * (1.2 + k * 0.3) + k));
        }
        ctx.stroke(); ctx.restore();
      }
      ctx.beginPath(); ctx.moveTo(tops[0], tops[1]); for (let k = 2; k < tops.length; k += 2) ctx.lineTo(tops[k], tops[k + 1]);
      ctx.strokeStyle = POSTER ? '#f8f4dc' : 'rgba(255,255,255,0.8)'; ctx.lineWidth = POSTER ? 5 : 3; ctx.lineJoin = 'round'; ctx.stroke();
      if (!POSTER) { ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 7; ctx.stroke(); }
      i = j + 1;
    }
  }

  // ---------- primo piano, particelle, luce, titolo del bioma ---------------------------------
  function drawFront(ctx) {
    if (!Z.length) return;
    const w = S.w, h = S.h, camX = S.camX;
    if (quality < 2 && (S.world === 'classic' || S.world === 'paradise' || S.world === 'inferno')) {
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

    // La tinta alba/notte è usata dai mondi classici; i tre nuovi hanno già luce e contrasto propri.
    if (S.world === 'classic' || S.world === 'paradise' || S.world === 'inferno') {
      if (S.warm > 0.02) { ctx.fillStyle = `rgba(255,140,60,${(S.warm * 0.11).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
      if (S.night > 0.02) { ctx.fillStyle = `rgba(8,16,64,${(S.night * 0.32).toFixed(3)})`; ctx.fillRect(0, 0, w, h); }
    }

    // titolo del bioma: entra dall'alto, resta, sfuma
    const age = S.now - S.bannerT;
    if (age >= 0 && age < 3000) {
      const a = Math.min(1, age / 350, (3000 - age) / 700), slide = (1 - smooth(age / 450)) * -26;
      ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = clamp(w * 0.055, 26, 46), y = Math.max(82, S.gy * 0.2) + slide;
      ctx.font = `700 ${Math.round(fs)}px Kalam, "Comic Sans MS", cursive`;
      // se il riquadro in alto a sinistra (minimappa + classifica) coprirebbe il titolo (telefono in verticale), lo si mette sotto di lui
      let yy = y;
      try {
        const hud = document.querySelector('.hud'), cv = ctx.canvas;
        if (hud && cv) {
          const r = hud.getBoundingClientRect(), c = cv.getBoundingClientRect(), sc = w / (c.width || w), half = ctx.measureText(bannerText()).width / 2 + fs * 0.15;
          const hb = (r.bottom - c.top) * sc, hr = (r.right - c.left) * sc, ht = (r.top - c.top) * sc;
          if (r.width > 0 && w / 2 - half < hr + 6 && yy + fs * 0.6 > ht && yy - fs * 0.6 < hb + 4) yy = hb + fs * 0.6 + 10 * sc + slide;
        }
      } catch (e) {}
      if (POSTER) {
        const tx = bannerText(), tw = ctx.measureText(tx).width, pw = tw + fs * 1.3, ph = fs * 1.5, px = w / 2 - pw / 2, py = yy - ph / 2, rr = ph / 2;
        const pill = (y0) => { ctx.beginPath(); ctx.moveTo(px + rr, y0); ctx.arcTo(px + pw, y0, px + pw, y0 + ph, rr); ctx.arcTo(px + pw, y0 + ph, px, y0 + ph, rr); ctx.arcTo(px, y0 + ph, px, y0, rr); ctx.arcTo(px, y0, px + pw, y0, rr); ctx.closePath(); };
        ctx.fillStyle = 'rgba(45,62,72,0.2)'; pill(py + 5); ctx.fill();
        ctx.fillStyle = '#f8f4dc'; pill(py); ctx.fill();
        ctx.fillStyle = '#027a71'; ctx.fillText(tx, w / 2, yy + 1);
      } else {
        ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(16,42,67,0.85)'; ctx.strokeText(bannerText(), w / 2, yy);
        ctx.fillStyle = '#ffffff'; ctx.fillText(bannerText(), w / 2, yy);
      }
      ctx.restore();
    }
  }

  function setQuality(q) { quality = clamp(q | 0, 0, 2); }

  return {
    setTrack, setView, update, drawBackdrop, drawGround, drawWater, drawFront, drawWorldEffects, setQuality, warmup, announce,
    get quality() { return quality; }, get state() { return S; },
  };
})(); // scenery
