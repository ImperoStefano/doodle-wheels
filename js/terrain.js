/*
 * Terrain — profilo della pista, zone, ponti e fiori.
 *
 * Tutto qui è DETERMINISTICO a partire dall'elenco di zone (layoutKeys): host e client chiamano
 * applyLayout(stesse chiavi) e ottengono lo stesso identico percorso senza scambiarsi altro.
 * La fisica (solo host) usa height(); i client disegnano soltanto.
 *
 * Il profilo non è più una tabella fissa di sezioni per x ma una catena di zone: ogni zona parte
 * dalla quota a cui è arrivata la precedente (L0) e arriva a una quota L1 con un raccordo
 * smoothstep, più un'onda propria del bioma che sfuma a zero ai bordi. Risultato: nessuna
 * scarpata ai confini di zona, e una pista lunga quanto si vuole.
 */
const Terrain = (() => {
  let TRACK_START = -300, TRACK_END = 12000, FINISH_X = 11500;
  let ZONES = [], FLOWERS = [], LILIES = [], BRIDGES = [], PATCHES = [];

  const ZONE_TYPES = ['hills', 'ice', 'gravel', 'water', 'ramps'];
  const ZONE_COLORS = {
    start: '#10b981', hills: '#059669', ice: '#7dd3fc',
    gravel: '#94a3b8', water: '#3b82f6', ramps: '#f59e0b', finish: '#10b981'
  };
  const FRICTION = { start: 0.9, hills: 0.9, ice: 0.1, gravel: 0.6, water: 0.95, ramps: 1.1, finish: 0.9 };
  // lunghezza base di ogni zona (px); ogni zona la varia di ±12% in modo deterministico
  const ZONE_LEN = { start: 1400, hills: 2000, ice: 1800, gravel: 2000, water: 2400, ramps: 2200, finish: 1400 };
  // quante zone "a tema" ha la pista: sono i tre formati che l'host può scegliere in lobby
  const LENGTHS = { corta: 7, media: 11, lunga: 15 };

  // ---- utilità deterministiche --------------------------------------------------------------
  const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a) {
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pseudo(x) { const v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); } // 0..1

  // ---- layout casuale: nessuna zona uguale alla precedente, tutte le specie ben distribuite ----
  function generateRandomLayout(count = LENGTHS.lunga) {
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const out = []; let bag = [];
    while (out.length < count) {
      if (!bag.length) bag = shuffle(ZONE_TYPES.slice());
      let k = bag.pop();
      if (out.length && out[out.length - 1] === k) {
        if (!bag.length) continue;          // rimescola al prossimo giro
        const alt = bag.pop(); bag.push(k); k = alt;
        if (out[out.length - 1] === k) continue;
      }
      out.push(k);
    }
    // sempre almeno un po' d'acqua (e di canyon) per avere dei ponti, due ciascuno sulle piste lunghe
    const need = (key, n) => {
      let have = out.filter(k => k === key).length, guard = 0;
      while (have < n && guard++ < 50) {
        const i = 1 + Math.floor(Math.random() * (out.length - 1));
        if (out[i] === key || out[i - 1] === key || out[i + 1] === key) continue;
        if (out[i] === 'water' || out[i] === 'gravel') continue;
        out[i] = key; have++;
      }
    };
    if (count >= 5) need('water', count >= 11 ? 2 : 1);
    if (count >= 7) need('gravel', count >= 11 ? 2 : 1);
    return out;
  }

  // ---- onde proprie di ogni bioma (si annullano ai bordi della zona) -------------------------
  // Pendenza massima di ciascuna ≈ 0.2–0.25: la stessa già validata con la fisica.
  function zoneWave(z, u) {
    switch (z.key) {
      case 'hills':  return 40 * Math.sin(u / 280 + z.ph) + 6 * Math.sin(u / 110 + z.ph * 2.1);
      case 'gravel': return 14 * Math.sin(u / 120 + z.ph) + 6 * Math.sin(u / 52 + z.ph * 1.7);
      case 'ice':    return 13 * Math.sin(u / 380 + z.ph);
      case 'water':  return 12 * Math.sin(u / 300 + z.ph);
      case 'ramps':  return rampProfile(u - RAMP_LEAD);
      default:       return 0;
    }
  }

  // Rampa vera: salita netta fino a un picco, poi una discesa più ripida che scende sotto la
  // quota base (un piccolo distacco prima dell'atterraggio), poi un ritorno dolce alla quota
  // base prima della rampa successiva. Costanti già validate con la fisica.
  const RAMP_PERIOD = 500, RAMP_RISE = 220, RAMP_DROP = 140, RAMP_PEAK = 70, RAMP_GAP = 15, RAMP_LEAD = 300;
  function rampProfile(x) {
    if (x < 0) return 0;
    const u = x % RAMP_PERIOD;
    if (u < RAMP_RISE) return smooth(u / RAMP_RISE) * RAMP_PEAK;
    if (u < RAMP_RISE + RAMP_DROP) { const t = (u - RAMP_RISE) / RAMP_DROP; return RAMP_PEAK * (1 - smooth(t)) - RAMP_GAP * smooth(t); }
    const t = (u - RAMP_RISE - RAMP_DROP) / (RAMP_PERIOD - RAMP_RISE - RAMP_DROP);
    return -RAMP_GAP * (1 - smooth(t));
  }


  // ---- terreni a tema (patch) ---------------------------------------------------------------------
  // Dentro ogni bioma, un tratto di terreno che premia FORME DI RUOTA diverse (la tonda non vince
  // ovunque). Tutto deterministico (stesso layout => stessa pista) e senza icone: il giocatore lo
  // scopre guidando. Ogni patch parte e finisce a quota 0 rispetto alla riva, quindi si innesta senza salti.
  //   arch    strada acciottolata ad archi (catenarie): il QUADRATO rotola liscio, la tonda sobbalza
  //   stairs  scalinata di roccia/ghiaccio seguita da un altopiano: le punte (stella) si agganciano
  //   holes   buche: la tonda le scavalca, le forme spigolose ci cadono dentro
  //   ripples dune a lamiera ondulata: il ritmo dei vertici decide
  //   logs    tronchi caduti: un grosso diametro li supera meglio
  //   mud     fango (nessun profilo): la ruota liscia slitta, quella con punte morde (vedi gripAt)
    function patchOffset(p, x) {
    const u = x - p.a, L = p.b - p.a;
    if (u < 0 || u > L) return 0;
    switch (p.kind) {
      case 'arch': { const t = ((u % p.S) + p.S) % p.S - p.S / 2; return p.f * p.ac * (p.c - Math.cosh(t / p.ac)); }
      case 'stairs': {
        let h = 0; const top = p.n * p.h;
        for (let k = 1; k <= p.n; k++) h += p.h * smooth((u - k * p.T) / p.rw);
        const d0 = p.n * p.T + p.rw + p.P;
        return h - top * smooth((u - d0) / p.D);
      }
      case 'holes': {
        let best = 0;
        for (let j = 0; j < p.k; j++) {
          const d = Math.abs(u - (j + 0.5) * p.sp), e = p.e;
          const v = d < p.W / 2 - e ? 1 : d > p.W / 2 ? 0 : 1 - smooth((d - (p.W / 2 - e)) / e);
          if (v > best) best = v;
        }
        return -p.D * best;
      }
      case 'ripples': { const w = smooth(u / 120) * smooth((L - u) / 120); return w * p.A * (0.5 - 0.5 * Math.cos(2 * Math.PI * u / p.lam)); }
      case 'logs': {
        for (let j = 0; j < p.k; j++) { const d = Math.abs(u - (j + 0.5) * p.sp) / p.w; if (d < 1) return p.H * Math.pow(1 - d * d, 0.6); }
        return 0;
      }
      case 'mud': { // un'altura fangosa: salita, pianoro, discesa (la presa decide chi sale)
        return p.H * (smooth(u / p.rl) - smooth((u - p.rl - p.pl) / p.rl)); }
      default: return 0;
    }
  }
  const PATCH_FLAT = { arch: 1, stairs: 1, holes: 1, ripples: 0.7, logs: 0.8, mud: 1 };
  // quanto il tratto "appiattisce" l'onda del bioma sotto di sé (0..1)
  function patchMask(z, x) {
    let m = 0;
    for (const p of z.patches) {
      const f = PATCH_FLAT[p.kind]; if (!f) continue;
      const v = smooth((x - (p.a - 110)) / 160) * smooth(((p.b + 110) - x) / 160) * f; if (v > m) m = v;
    }
    return m;
  }
  function patchSum(z, x) { let h = 0; for (const p of z.patches) h += patchOffset(p, x); return h; }

  // Strada ad archi per un poligono regolare a N lati (lato S = 2·80·sin(π/N)): la catenaria rovesciata
  // y = a(1/sin(π/N) − cosh(x/a)), a = S / (2·ln cot(π/2N)), fa rotolare quel poligono "dritto" (il centro non sale né scende).
  // Chi ha N lati ci va liscio; le altre forme sobbalzano.
  function archSpec(n, rnd, f) {
    const S = 2 * 80 * Math.sin(Math.PI / n);
    const ac = S / (2 * Math.log(1 / Math.tan(Math.PI / (2 * n))));
    const k = Math.ceil(880 / S) + (rnd ? Math.floor(rnd() * 2) : 0);
    return { kind: 'arch', n, S, ac, c: 1 / Math.sin(Math.PI / n), f: f == null ? 1.2 : f, len: k * S };
  }
  // costruttori dei tipi di patch (lunghezza e parametri); il centro lo sceglie planPatches
  function makePatch(kind, rnd) {
    switch (kind) {
      case 'arch': return archSpec(3 + Math.floor(rnd() * 3), rnd);
      case 'stairs': { const n = 3 + Math.floor(rnd() * 2), T = 150 + Math.round(rnd() * 15), rw = 30, h = 32 + Math.round(rnd() * 8), P = 150, D = 200; return { kind, len: n * T + rw + P + D, n, T, rw, h, P, D }; }
      case 'holes': { const k = 3 + Math.floor(rnd() * 2), sp = 340, W = 150 + Math.round(rnd() * 20); return { kind, len: k * sp, k, sp, W, D: 55, e: 30 }; }
      case 'ripples': { const lam = 100 + Math.round(rnd() * 20); return { kind, len: 8 * lam, lam, A: 17 }; }
      case 'logs': { const k = 3 + Math.floor(rnd() * 2); return { kind, len: k * 320, k, sp: 320, w: 52, H: 34 }; }
      case 'mud': { const rl = 260, pl = 300; return { kind, len: 2 * rl + pl, rl, pl, H: -22 }; }
    }
    return null;
  }
  const PATCH_TABLE = {            // per bioma: [tipo, probabilità] — il resto del tempo la zona resta "pulita"
    hills:  [['arch', 0.4], ['holes', 0.25], ['mud', 0.15], ['stairs', 0.1]],
    ice:    [],                      // il ghiaccio agisce su tutta la zona (vedi gripAt): liscia scivola, punte mordono
    gravel: [['ripples', 0.4], ['stairs', 0.25], ['arch', 0.1]],
    water:  [],                      // laguna: ponti e bacini (nessun terreno speciale)
    ramps:  [['logs', 0.3], ['mud', 0.35]],
  };
  function planPatches(rnd, force) {
    PATCHES = [];
    // "sapore" della gara: ogni pista accentua alcuni terreni e ne riduce altri, così non vince sempre la stessa forma
    const flavor = {}; ['arch', 'mud', 'holes', 'stairs', 'ripples', 'logs'].forEach(k => { flavor[k] = 0.2 + 2.1 * rnd() * rnd() + 0.5 * rnd(); });
    ZONES.forEach(z => {
      z.patches = [];
      if (force && force.nopatch) return;
      const forced = force && force[z.index];
      const tbl = PATCH_TABLE[z.key];
      const picks = forced ? forced : (tbl ? (() => { const r = rnd(); let acc = 0; for (const [k, pr] of tbl) { acc += Math.min(0.95, pr * flavor[k]); if (r < acc) return [k]; } return []; })() : []);
      picks.forEach(kind => {
        const spec = typeof kind === 'string' ? makePatch(kind, rnd) : kind;
        if (!spec) return;
        // intervalli liberi: lontano dai bordi della zona e dal vuoto sotto un ponte
        const lo = z.start + 260, hi = z.end - 260;
        const blocks = z.gap ? [[z.gap.g0 - 220, z.gap.g1 + 220]] : [];
        const free = []; let cur = lo;
        for (const [b0, b1] of blocks) { if (b0 > cur) free.push([cur, Math.min(b0, hi)]); cur = Math.max(cur, b1); }
        if (hi > cur) free.push([cur, hi]);
        free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
        const slot = free.find(f => f[1] - f[0] >= spec.len); if (!slot) return;
        const a = Math.round(slot[0] + (slot[1] - slot[0] - spec.len) * (forced ? 0.5 : 0.25 + rnd() * 0.5));
        const pt = Object.assign({}, spec, { a, b: a + spec.len, zone: z.index, zkey: z.key });
        z.patches.push(pt); PATCHES.push(pt);
      });
    });
  }

  // ---- costruzione delle zone ---------------------------------------------------------------
  function applyLayout(layoutKeys, force) {
    const keys = (layoutKeys && layoutKeys.length ? layoutKeys : generateRandomLayout()).slice();
    const rnd = mulberry32(hashStr(keys.join(',')));
    ZONES = []; BRIDGES = [];
    let x = TRACK_START, level = 0;

    const LEVEL_DELTA = { hills: [-90, 110], gravel: [-50, 70], ramps: [-30, 30], water: [-20, 20], ice: [-25, 25] };
    const add = key => {
      const base = ZONE_LEN[key];
      const len = (key === 'start' || key === 'finish') ? base : Math.round(base * (0.88 + rnd() * 0.24) / 10) * 10;
      const z = { key, index: ZONES.length, start: x, end: x + len, len, color: ZONE_COLORS[key], L0: level, L1: level, ph: rnd() * 6.283, gap: null, bridge: null };
      const d = LEVEL_DELTA[key];
      if (d) {
        let delta = d[0] + rnd() * (d[1] - d[0]);
        if (level + delta > 150 || level + delta < -30) delta = -delta;   // resta fra -30 e +150
        z.L1 = Math.max(-30, Math.min(150, level + delta));
      }
      ZONES.push(z); x += len; level = z.L1;
    };
    add('start');
    keys.forEach(add);
    add('finish');
    TRACK_END = x;
    FINISH_X = ZONES[ZONES.length - 1].start + 300;

    if (!(force && force.nogap)) planGaps(rnd);
    planPatches(rnd, force);
    FLOWERS = generateFlowers(rnd);
    LILIES = generateLilies();
  }

  // Ogni zona acqua ha una "buca" (il bacino); alcune hanno invece un VERO vuoto sotto un ponte:
  //  - zona acqua  -> fiume profondo + ponte ad arco in pietra
  //  - zona canyon -> crepaccio profondo + ponte sospeso di assi e corde
  // Il ponte è la quota su cui guidano le ruote; il vuoto sotto è solo terreno "naturale" più basso.
  function planGaps(rnd) {
    const cand = ZONES.filter(z => z.key === 'water' || z.key === 'gravel');
    const wants = new Map();
    cand.forEach(z => wants.set(z, rnd() < (z.key === 'water' ? 0.75 : 0.5)));
    if (cand.length && ![...wants.values()].some(Boolean)) wants.set(cand[Math.floor(rnd() * cand.length)], true); // almeno un ponte

    ZONES.forEach(z => {
      if (z.key === 'water') {
        if (wants.get(z)) {
          const span = 520, mid = z.start + z.len * (0.46 + rnd() * 0.08);
          z.gap = { g0: mid - span / 2, g1: mid + span / 2, D: 110, W: 150 };
          z.bridge = { kind: 'arch', start: z.gap.g0, end: z.gap.g1, peak: 58 };
        } else {
          z.gap = { g0: z.start + z.len * 0.2, g1: z.end - z.len * 0.2, D: 60, W: 290 };
        }
      } else if (z.key === 'gravel' && wants.get(z)) {
        const span = 560, mid = z.start + z.len * (0.46 + rnd() * 0.08);
        z.gap = { g0: mid - span / 2, g1: mid + span / 2, D: 150, W: 130 };
        z.bridge = { kind: 'rope', start: z.gap.g0, end: z.gap.g1, peak: -12 };   // peak negativo = la corda cede
      }
      if (z.bridge) BRIDGES.push(Object.assign({ zone: z.index }, z.bridge));
    });
  }

  // ---- altezze --------------------------------------------------------------------------------
  let lastZ = 0;
  function zoneAt(x) {
    const n = ZONES.length;
    if (!n) return null;
    let z = ZONES[lastZ];
    if (x >= z.start && x < z.end) return z;
    if (x < ZONES[0].start) return (lastZ = 0, ZONES[0]);
    if (x >= ZONES[n - 1].end) return (lastZ = n - 1, ZONES[n - 1]);
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (ZONES[m].start <= x) lo = m; else hi = m - 1; }
    lastZ = lo; return ZONES[lo];
  }

  // quota di "riva": il profilo della zona senza vuoti né ponti
  function zoneBase(z, x) {
    let u = x - z.start; const len = z.len;
    if (u < 0) u = 0; else if (u > len) u = len;
    let h = z.L0 + (z.L1 - z.L0) * smooth(u / len);
    const win = smooth(u / 260) * smooth((len - u) / 260);
    if (win > 0) {
      let w = zoneWave(z, u);
      if (z.bridge) w *= 1 - smooth((x - (z.gap.g0 - 150)) / 150) * smooth((z.gap.g1 + 150 - x) / 150);  // piatto vicino al ponte
      h += win * w * (1 - (z.patches && z.patches.length ? patchMask(z, x) : 0));
    }
    if (z.patches && z.patches.length) h += patchSum(z, x);
    return h;
  }

  function gapDepth(z, x) {
    const g = z.gap; if (!g || x <= g.g0 || x >= g.g1) return 0;
    return g.D * smooth((x - g.g0) / g.W) * smooth((g.g1 - x) / g.W);
  }

  // Terreno "vero", compreso il vuoto sotto i ponti (serve a chi disegna: acqua, crepaccio…)
  function naturalHeight(x) { const z = zoneAt(x); return zoneBase(z, x) - gapDepth(z, x); }

  // Quota su cui guidano davvero le ruote: uguale al terreno naturale ovunque, tranne sopra un
  // ponte, dove è l'impalcato (un arco che parte e arriva a filo delle due rive, senza spigoli).
  function height(x) {
    const z = zoneAt(x);
    const b = z.bridge;
    if (b && x >= b.start && x <= b.end) {
      const t = (x - b.start) / (b.end - b.start);
      return zoneBase(z, x) + b.peak * Math.pow(Math.sin(t * Math.PI), 1.45);
    }
    return zoneBase(z, x) - gapDepth(z, x);
  }

  const baseHeight = x => zoneBase(zoneAt(x), x);   // quota di riva: senza vuoti né ponti (serve a chi disegna il vuoto)

  function bridgeAt(x) { for (const b of BRIDGES) if (x >= b.start && x <= b.end) return b; return null; }

  // Pelo dell'acqua: nelle zone acqua, 28px sotto la riva. Dove il fondo sta più in alto non c'è acqua.
  function waterLevel(x) { const z = zoneAt(x); return z.key === 'water' && z.gap ? zoneBase(z, x) - 28 : -Infinity; }
  function isWater(x) { const z = zoneAt(x); return z.key === 'water' && !bridgeAt(x) && naturalHeight(x) < waterLevel(x); }

  // ---- fiori ----------------------------------------------------------------------------------
  // Specie: 0 margherita, 1 tulipano, 2 rosa, 3 girasole, 4 bucaneve, 5 cristallo di ghiaccio,
  //         6 fungo, 7 cactus fiorito. Ogni bioma ha la sua piccola "flora", scelta a rotazione
  //         pesata (non a caso puro, che raggrupperebbe le specie a coppie).
  // I fiori sono piccoli dossi fisici (r 9–15px, già validati): la ruota li scavalca. Tutto il
  // resto (altezza dello stelo, animazione) è solo estetica e non tocca la fisica.
  const FLORA_BY_ZONE = {
    start:  [0, 0, 1, 0, 3, 0, 2],
    hills:  [3, 0, 3, 1, 2, 3, 0],
    ramps:  [6, 2, 6, 1, 3, 6],
    ice:    [4, 4, 5, 4, 5],
    gravel: [7, 7, 0, 7],
  };
  const FLORA_GAP = { start: 1.0, hills: 0.9, ramps: 0.85, ice: 1.25, gravel: 1.1 };

  function generateFlowers(rnd) {
    const flowers = [];
    const zoneSpan = z => [Math.max(z.start + 260, TRACK_START + 1500), z.end - 300];
    let cyc = 0;
    ZONES.forEach(z => {
      const table = FLORA_BY_ZONE[z.key];
      if (!table) return;
      let [x, xEnd] = zoneSpan(z);
      if (z.bridge) { /* non sul ponte né sul crepaccio */ }
      const place = (px, species, scale) => {
        if (z.gap && px > z.gap.g0 - 120 && px < z.gap.g1 + 120) return false;   // niente fiori sul ponte
        if (z.patches && z.patches.some(p => px > p.a - 90 && px < p.b + 90)) return false;   // né sui terreni a tema
        flowers.push({
          x: Math.round(px),
          r: 9 + pseudo(px) * 6,
          hue: Math.floor(pseudo(px * 3.1) * 5),
          species,
          stemScale: scale != null ? scale : 0.7 + pseudo(px * 4.1) * 1.7,
          zone: z.key,
          seed: pseudo(px * 9.7),
        });
        return true;
      };
      // un "campo di girasoli" ogni tanto, nelle colline: 4 girasoli vicini che si voltano insieme
      if (z.key === 'hills' && rnd() < 0.7) {
        let sx = z.start + z.len * (0.3 + rnd() * 0.3);
        for (let k = 0; k < 4; k++) { place(sx, 3, 1.3 + pseudo(sx * 5.3) * 0.9); sx += 85 + pseudo(sx * 2.3) * 55; }
      }
      const gap = FLORA_GAP[z.key] || 1;
      while (x < xEnd) {
        const sp = table[(cyc + Math.floor(pseudo(x * 7.3) * 2)) % table.length];
        if (place(x, sp)) cyc++;
        x += (460 + pseudo(x * 1.7) * 340) * gap;
      }
    });
    // niente sovrapposizioni dopo il campo di girasoli
    flowers.sort((a, b) => a.x - b.x);
    return flowers.filter((f, i) => i === 0 || f.x - flowers[i - 1].x > 60 ? true : (f.x = flowers[i - 1].x + 70, true));
  }

  // Ninfee sull'acqua (solo decorazione, nessuna fisica): gruppi di 1–3 foglie con un fiore rosa.
  function generateLilies() {
    const out = [];
    ZONES.forEach(z => {
      if (z.key !== 'water' || !z.gap) return;
      const a = z.gap.g0 + 60, b = z.gap.g1 - 60;
      for (let x = a; x < b; x += 90 + pseudo(x * 1.3) * 120) {
        if (pseudo(x * 6.1) < 0.35) continue;
        out.push({ x: Math.round(x), size: 0.8 + pseudo(x * 2.9) * 0.7, bloom: pseudo(x * 8.3) < 0.55, seed: pseudo(x * 4.4) });
      }
    });
    return out;
  }

  applyLayout(generateRandomLayout());

  return {
    generateRandomLayout, applyLayout, height, naturalHeight, baseHeight, waterLevel, isWater, zoneAt, bridgeAt,
    frictionAt: x => FRICTION[zoneAt(x).key] || 0.9,
    colorAt: x => zoneAt(x).color || '#059669',
    zoneKeyAt: x => zoneAt(x).key,
    LENGTHS,
    get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; },
    get TRACK_START() { return TRACK_START; }, get FLOWERS() { return FLOWERS; }, get LILIES() { return LILIES; },
    get BRIDGES() { return BRIDGES; }, get PATCHES() { return PATCHES; },
    // tipo di presa speciale sotto la ruota: 'mud' (fango), 'ice' (ghiaccio) o null
    gripAt: x => { const z = zoneAt(x); if (z.key === 'ice') return 'ice'; if (z.patches) for (const p of z.patches) if (x >= p.a && x <= p.b) { if (p.kind === 'mud') return 'mud'; if (p.kind === 'arch' || p.kind === 'ripples') return 'rough'; } return null; },
    _archSpec: archSpec,
    patchAt: x => { const z = zoneAt(x); for (const p of z.patches) if (x >= p.a && x <= p.b) return p; return null; },
    RAMP_PERIOD, RAMP_RISE, RAMP_LEAD,
  };
})(); // terrain
