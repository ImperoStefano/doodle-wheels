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
  let SEASON = null, PACE = "classica", WORLD = 'classic', WORLD_SEGMENT = null, ZONES = [], FLOWERS = [], LILIES = [], BRIDGES = [], INFERNO_ISLANDS = [], PATCHES = [], PORTALS = [], UPDRAFTS = [], GEYSERS = [], CLOUD_PADS = [], BUBBLE_VENTS = [], NEON_BOOSTS = [], HALO_RINGS = [], ASH_GUSTS = [], TIDAL_CURRENTS = [], ROOT_RIDGES = [], NEON_GATES = [], DYNAMIC_OBSTACLES = [];
  const WORLD_KEYS = ['classic', 'paradise', 'inferno', 'atlantis', 'enchanted', 'neon'];
  const SEGMENT_WORLDS = ['paradise', 'inferno', 'atlantis', 'enchanted', 'neon'];
  const isSegmentWorld = world => SEGMENT_WORLDS.includes(world);
  const overlapsWorldSegment = z => !!(WORLD_SEGMENT && z.start < WORLD_SEGMENT.end && z.end > WORLD_SEGMENT.start);
  const zoneInsideWorldSegment = z => overlapsWorldSegment(z) && WORLD_SEGMENT && WORLD_SEGMENT.world === 'neon';

  const ZONE_TYPES = ['hills', 'ice', 'gravel', 'water', 'ramps', 'lava'];
  const ZONE_COLORS = {
    start: '#10b981', hills: '#059669', ice: '#7dd3fc',
    gravel: '#94a3b8', water: '#3b82f6', ramps: '#f59e0b', lava: '#dc2626', finish: '#10b981'
  };
  const FRICTION = { start: 0.9, hills: 0.9, ice: 0.1, gravel: 0.6, water: 0.95, ramps: 1.1, lava: 0.9, finish: 0.9 };
  // lunghezza base di ogni zona (px); ogni zona la varia di ±12% in modo deterministico
  const ZONE_LEN = { start: 1400, hills: 2000, ice: 1950, gravel: 2000, water: 2750, ramps: 2300, lava: 3000, finish: 1400 };
  // quante zone "a tema" ha la pista: sono i tre formati che l'host può scegliere in lobby
  const LENGTHS = { corta: 7, media: 11, lunga: 15 };

  // ---- utilità deterministiche --------------------------------------------------------------
  const smooth = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  // Rampa vera: raccordo concavo (arco di raggio R, così le ruote non sbattono contro lo spigolo) → piano inclinato a pendenza COSTANTE (angolo th) → labbro netto a quota H.
  // q = { H, th, R, xt, yt, tn, run }: xt/yt = fine dell'arco, tn = tan(th), run = lunghezza orizzontale dall'inizio della rampa al labbro.
  function mkRamp(H, thDeg, R) {
    const th = thDeg * Math.PI / 180, xt = R * Math.sin(th), yt = R * (1 - Math.cos(th)), tn = Math.tan(th);
    return { H, th, R, xt, yt, tn, run: xt + (H - yt) / tn };
  }
  function rampY(ux, q) {
    if (ux <= 0) return 0;
    if (ux < q.xt) return q.R - Math.sqrt(q.R * q.R - ux * ux);
    const y = q.yt + (ux - q.xt) * q.tn; return y > q.H ? q.H : y;
  }
  function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a) {
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function pseudo(x) { const v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); } // 0..1

  // ---- layout casuale: nessuna zona uguale alla precedente, tutte le specie ben distribuite ----
  function worldZoneTypes(world) {
    // I tre nuovi mondi sono eventi locali: il resto della gara continua a usare i biomi classici.
    if (isSegmentWorld(world)) return ZONE_TYPES;
    if (world === 'paradise') return ['hills', 'ice', 'gravel', 'water', 'ramps'];
    if (world === 'inferno') return ['hills', 'ice', 'gravel', 'water', 'ramps', 'lava'];
    if (world === 'atlantis') return ['water', 'hills', 'gravel', 'ramps', 'ice'];
    if (world === 'enchanted') return ['hills', 'ramps', 'gravel', 'water', 'ice'];
    if (world === 'neon') return ['gravel', 'ramps', 'hills', 'ice', 'water'];
    return ZONE_TYPES;
  }
  function ensureWorldCoreLayout(layout, world) {
    if (isSegmentWorld(world) || layout.length < 5) return layout;
    const core = world === 'atlantis' ? 'water' : world === 'enchanted' ? 'hills' : world === 'neon' ? 'gravel' : null;
    if (!core || layout.filter(k => k === core).length >= 2) return layout;
    const candidates = Array.from({ length: layout.length - 2 }, (_, i) => i + 1);
    let needed = 2 - layout.filter(k => k === core).length;
    for (const i of candidates) {
      if (!needed) break;
      if (layout[i] === core || layout[i - 1] === core || layout[i + 1] === core) continue;
      const previous = layout[i];
      if (previous === 'lava') continue;
      layout[i] = core; needed--;
    }
    return layout;
  }
  function ensureInfernoLava(layout, world) {
    if (world !== 'inferno' || layout.length < 5 || layout.includes('lava')) return layout;
    // Anche quando il generatore trova subito una stagione compatibile, Inferno deve
    // contenere almeno un lago di lava: è la meccanica che identifica il mondo.
    const mid = Math.floor(layout.length * 0.52);
    const candidates = Array.from({ length: layout.length - 2 }, (_, i) => i + 1)
      .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const at = candidates.find(i => layout[i - 1] !== 'lava' && layout[i + 1] !== 'lava');
    if (at !== undefined) layout[at] = 'lava';
    return layout;
  }
  function generateRandomLayout(count = LENGTHS.lunga, crazy = false, season = null, world = 'classic') {
    const types = worldZoneTypes(world);
    if (!crazy) return generateFreeLayout(count, season, world);
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const out = []; let bag = [];
    while (out.length < count) {
      if (!bag.length) bag = shuffle(types.slice());
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
        if (out[i] === 'water' || out[i] === 'gravel' || out[i] === 'lava') continue;
        out[i] = key; have++;
      }
    };
    if (types.includes('water') && count >= 5) need('water', count >= 11 ? 2 : 1);
    if (types.includes('gravel') && count >= 7) need('gravel', count >= 11 ? 2 : 1);
    if (world === 'inferno' && count >= 5) need('lava', count >= 11 ? 2 : 1);
    // mai il vulcano subito dopo la partenza: la ruota non ha ancora ritmo e il lago arriverebbe senza preavviso
    if (out[0] === 'lava') {
      for (let j = 2; j < out.length; j++) {
        const k = out[j];
        if (k === 'lava' || k === out[1]) continue;
        if (out[j - 1] === 'lava' || out[j + 1] === 'lava') continue;
        if (j === 2 && out[1] === 'lava') continue;
        out[0] = k; out[j] = 'lava'; break;
      }
    }
    return ensureWorldCoreLayout(out, world);
  }

  // ---- STAGIONI di gara: un tema raro per pista, che pesa biomi e tipi di ostacolo (bw = peso del bioma, km = moltiplicatore del tipo, m = umore generale,
  //      bridge = probabilità del ponte su acqua/ghiaiato, lava = quanti vulcani al massimo, in frazione delle zone). Dipende SOLO dalla lista dei biomi (hash),
  //      quindi host e client la ricavano uguale senza scambiarsi altro. Il generatore dei biomi la sceglie prima e rigenera finché l'hash coincide.
  const SEASONS = [
    { key: 'classica',   w: 4.5, bw: {}, km: {}, m: 1, bridge: null, lava: 0.2 },
    { key: 'salti',      w: 1.0, bw: { ramps: 2.2, hills: 1.3, ice: 0.8, water: 0.8 }, km: { kicker: 2, twostage: 2, twin: 2, dropin: 2, jump: 2, ravine: 1.6, gapland: 2, pipe: 1.5, boulders: 0.4, whoops: 0.4, mud: 0.4, sand: 0.4, rack: 0.5 }, m: 1.05, bridge: null, lava: 0.2, ramps: true, add: [['kicker', 0.35], ['twin', 0.25], ['twostage', 0.25], ['dropin', 0.2], ['jump', 0.3]] },
    { key: 'tranquilla', w: 1.0, bw: { hills: 1.6, water: 1.5, ramps: 1.2, lava: 0, ice: 0.6, gravel: 0.8 }, km: { ravine: 0.3, gapland: 0.2, pipe: 0.3, rack: 0.4, boulders: 0.5, twostage: 0.5 }, m: 0.55, bridge: 0.8, lava: 0, add: [['bowl', 0.3], ['whoops', 0.25], ['jump', 0.15]] },
    { key: 'palude',     w: 1.0, bw: { water: 3, gravel: 0.9, hills: 0.8, ramps: 0.5, ice: 0.4, lava: 0.2 }, km: { mud: 3, sand: 2.5, ripples: 2.5, holes: 1.5, whoops: 1.5, kicker: 0.5, pipe: 0, gapland: 0 }, m: 0.95, bridge: 0.8, lava: 0.1, add: [['mud', 0.45], ['sand', 0.35], ['ripples', 0.3], ['holes', 0.2]] },
    { key: 'gelo',       w: 1.0, bw: { ice: 3, hills: 1, water: 0.6, gravel: 0.5, ramps: 0.8, lava: 0 }, km: { ridges: 2, rack: 1.6, bowl: 1.6, arch: 1.4, pipe: 1.8, twin: 1.5, mud: 0, sand: 0, kicker: 0.6 }, m: 1, bridge: null, lava: 0, add: [['ridges', 0.35], ['rack', 0.3], ['arch', 0.25], ['bowl', 0.2]] },
    { key: 'fuoco',      w: 0.8, bw: { lava: 2.4, gravel: 1.2, hills: 0.7, ice: 0.2, water: 0.3, ramps: 0.8 }, km: { gapland: 2, boulders: 1.8, ridges: 1.6, rack: 1.5 }, m: 1.1, bridge: null, lava: 0.34, add: [['boulders', 0.3], ['ridges', 0.3], ['rack', 0.2]] },
    { key: 'canyon',     w: 1.0, bw: { gravel: 3, water: 1.3, hills: 0.9, ramps: 0.7, ice: 0.4, lava: 0.5 }, km: { ravine: 2, arch: 2, stairs: 2.5, pipe: 1.6, twostage: 1.6, rack: 1.4, kicker: 0.6 }, m: 1, bridge: 0.6, lava: 0.2, add: [['stairs', 0.35], ['arch', 0.3], ['ravine', 0.3], ['rack', 0.2]] },
  ];
  const SEASON_W = SEASONS.reduce((a, q) => a + q.w, 0);
  function seasonOf(keys) {   // stessa lista di biomi → stessa stagione, su ogni dispositivo
    let r = (hashStr(keys.join(',') + '#stagione') % 100003) / 100003 * SEASON_W;
    for (const q of SEASONS) { r -= q.w; if (r <= 0) return q; }
    return SEASONS[0];
  }
  // ---- RITMO: curva di difficoltà lungo la pista (t = 0 prima zona … 1 ultima). Moltiplica il "budget" di ostacoli di ogni zona.
  //      Sempre un inizio morbido e un finale pieno; in mezzo cambia: sale, a onde, a montagne russe o con un respiro a metà.
  const PACES = {
    classica: t => 0.55 + 0.75 * Math.sin(Math.min(1, t / 0.7) * Math.PI / 2) - (t > 0.7 ? 0.45 * Math.sin((t - 0.7) / 0.3 * Math.PI) : 0) + (t > 0.9 ? 0.2 : 0),
    crescendo: t => 0.45 + 0.95 * t,
    onda: t => 0.75 + 0.5 * Math.sin(t * Math.PI * 3.2 - 0.6) + 0.25 * t,
    montagne: t => 0.5 + 0.8 * (Math.floor(t * 9) % 2) + 0.35 * t,
    respiro: t => 0.5 + 0.9 * Math.min(1, t * 2.2) * (t < 0.45 ? 1 : 0) + (t >= 0.45 && t < 0.62 ? 0.2 : 0) + (t >= 0.62 ? 0.55 + 0.7 * (t - 0.62) / 0.38 : 0),
  };
  const PACE_KEYS = Object.keys(PACES);
  // "costo" di difficoltà di ogni ostacolo: la zona ha un budget e pesca finché c'è margine (un burrone vale più di un gruppo di massi)
  const COST = { boulders: 0.6, whoops: 0.6, ridges: 0.6, bowl: 0.7, drop: 0.7, jump: 1.0, kicker: 1.0, twostage: 1.1, twin: 1.3, dropin: 1.2, mud: 0.8, sand: 0.6, holes: 0.9, ripples: 0.6, stairs: 0.8, logs: 0.9, rack: 0.8, arch: 1.0, ravine: 1.6, pipe: 1.6, gapland: 2.0 };
  // pezzo forte dell'ultima zona (se la stagione e il "sapore" della gara lo permettono)
  const FINALE = { hills: ['ravine', 'twostage', 'gapland'], ice: ['pipe', 'ravine', 'twin'], gravel: ['pipe', 'ravine', 'twostage'], water: ['twostage', 'twin'], ramps: ['ravine', 'twin', 'gapland'], lava: ['gapland'] };

  // Gara normale: ogni pista estrae un "peso" casuale per ogni bioma, quindi il mix cambia da gara a gara e un bioma (acqua, canyon, vulcano…) può anche
  // mancare del tutto: niente garanzie su ponti o laghi. Mai due zone uguali di fila, mai il vulcano subito dopo la partenza, almeno 4 biomi diversi.
  function generateFreeLayout(count, want, world = 'classic') {
    const types = worldZoneTypes(world);
    let sr = Math.random() * SEASON_W, S = SEASONS[0]; for (const q of SEASONS) { sr -= q.w; if (sr <= 0) { S = q; break; } }   // stagione scelta in anticipo
    if (want) S = SEASONS.find(q => q.key === want) || S;   // il campionato la impone
    let fallback = null;
    for (let tries = 0; tries < 600; tries++) {
      const worldBias = isSegmentWorld(world) ? {} : (world === 'atlantis' ? { water: 3.5, hills: 0.7, gravel: 0.42, ramps: 0.55, ice: 0.25 }
        : world === 'enchanted' ? { hills: 2.4, ramps: 1.3, gravel: 1.0, water: 0.42, ice: 0.32 }
        : world === 'neon' ? { gravel: 1.8, ramps: 1.65, hills: 1.05, ice: 0.48, water: 0.58 } : {}); 
      const w = {}; types.forEach(k => { w[k] = (Math.random() < 0.18 ? 0.12 : 0.45 + 1.15 * Math.random()) * (S.bw[k] !== undefined ? S.bw[k] : 1) * (worldBias[k] || 1); });
      const out = [];
      while (out.length < count) {
        const prev = out[out.length - 1], nl = out.filter(k => k === 'lava').length;
        const lavaCap = world === 'inferno' ? Math.max(1, Math.ceil(count * 0.25)) : Math.max(1, Math.ceil(count * (S.lava || 0.2)));
        const c = types.filter(k => k !== prev && !(out.length === 0 && k === 'lava') && !(k === 'lava' && ((world !== 'inferno' && S.lava === 0) || nl >= lavaCap)) && w[k] > 0);   // vulcano: al massimo uno ogni cinque zone (ogni lago scioglie la ruota)
        let tot = 0; c.forEach(k => { tot += w[k]; }); let r = Math.random() * tot, pick = c[c.length - 1];
        for (const k of c) { r -= w[k]; if (r <= 0) { pick = k; break; } }
        out.push(pick);
      }
      if (new Set(out).size >= Math.min(4, count)) { if (seasonOf(out) === S) return ensureWorldCoreLayout(ensureInfernoLava(out, world), world); fallback = fallback || out; }   // la stagione la ricavano tutti dall'hash: si rigenera finché coincide
    }
    return ensureWorldCoreLayout(ensureInfernoLava(fallback || types.slice(0, count), world), world);
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
      case 'lava':   return 20 * Math.sin(u / 250 + z.ph) + 7 * Math.sin(u / 97 + z.ph * 2.3);   // basalto: dossi bassi e larghi
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
        for (let j = 0; j < p.k; j++) { const d = Math.abs(u - (j + 0.5) * p.sp) / p.w; if (d < 1) return p.H * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d), 0.75); }
        return 0;
      }
      case 'mud': { // un'altura fangosa: salita, pianoro, discesa (la presa decide chi sale)
        return p.H * (smooth(u / p.rl) - smooth((u - p.rl - p.pl) / p.rl)); }
      case 'sand': return 0;
      case 'boulders': { // massi tondeggianti di varie dimensioni, spaziati a caso: chi ha le ruote grandi/tonde li sale meglio
        let best = 0;
        for (const q of p.rocks) { const d = Math.abs(u - q.c) / q.w; if (d < 1) { const v = q.H * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d), 0.7); if (v > best) best = v; } }
        return best;
      }
      case 'whoops': { // serie di dossi stile motocross: ritmo irregolare, ogni dosso è un piccolo trampolino
        for (const q of p.hs) { const v = (u - q.s) / q.l; if (v >= 0 && v <= 1) { const s = Math.sin(Math.PI * v); return q.A * s * s; } }
        return 0;
      }
      case 'ridges': { // creste di pressione sul ghiaccio: spigolose, strette
        let best = 0;
        for (const q of p.rocks) { const d = Math.abs(u - q.c) / q.w; if (d < 1) { const v = q.H * Math.pow(1 - d, 1.25); if (v > best) best = v; } }
        return best;
      }
      case 'bowl': { // conca: si entra veloci, si scende, si risale (la velocità accumulata decide)
        const v = (u - p.s) / p.L; return v >= 0 && v <= 1 ? -p.D * (0.5 - 0.5 * Math.cos(2 * Math.PI * v)) : 0;
      }
      case 'ravine':
      case 'jump': { // trampolino, fossato, risalita: chi arriva veloce lo salta, chi arriva piano ci scende dentro e deve risalire
        return rampY(u - p.s, p) - (p.H + p.D) * smooth((u - p.u1) / p.ex) + p.D * smooth((u - p.u2) / p.rr);
      }
      case 'kicker': { // rampa vera: piano inclinato a pendenza costante, labbro netto, poi il suolo (il labbro cade su una sola colonna fisica da 20 px). A due stadi: prima dolce, un pianerottolo, poi la salita ripida
        const y1 = u <= p.u1 ? u : p.u1, y = rampY(y1 - p.s, p) + (p.r2 ? rampY(y1 - p.s2, p.r2) : 0);
        if (u <= p.u1) return y;
        const d = (u - p.u1) / p.ex; return d >= 1 ? 0 : y * (1 - d);
      }
      case 'pipe': { // mezzo tubo: discesa, fondo piatto, curva concava fino al labbro (più alto di quando si è partiti solo di poco), poi il vuoto
        return -p.D * smooth((u - p.s0) / p.dl) + rampY(u - p.s, p) - p.Ht * smooth((u - p.u1) / p.ex);
      }
      case 'gapland': { // rampa di lancio, vuoto, parete d'arrivo, cresta e discesa: si atterra sulla pendenza
        return rampY(u - p.s, p) - (p.H + p.D) * smooth((u - p.u1) / p.ex) + (p.D + p.Hl) * smooth((u - p.u2) / p.rr) - p.Hl * smooth((u - p.u3) / p.dl);
      }
      case 'drop': { // gradino in discesa, lungo tratto più basso, poi una salita larga: la discesa dà velocità, la risalita la chiede
        return -p.D * smooth((u - p.s) / p.ex) + p.D * smooth((u - p.s2) / p.rr);
      }
      case 'rack': { const w = smooth(u / 100) * smooth((L - u) / 100), f = (u / p.per) % 1; return w * p.A * (1 - Math.abs(2 * f - 1)); }   // dentiera: denti a V
      default: return 0;
    }
  }
  const PATCH_FLAT = { arch: 1, stairs: 1, holes: 1, ripples: 0.7, logs: 0.8, mud: 1, rack: 0.8, sand: 1, boulders: 1, whoops: 0.8, ridges: 1, bowl: 1, jump: 1, drop: 1, ravine: 1, kicker: 1, pipe: 1, gapland: 1 };
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
  function mkKicker(tier, rnd) {
    const T = [[30, 42, 17, 110], [60, 84, 29, 160], [100, 132, 32, 210]][tier];
    const H = T[0] + Math.round(rnd() * (T[1] - T[0])), rp = mkRamp(H, T[2] + (rnd() * 3 - 1.5), T[3]), s = 70, u1 = Math.round(s + rp.run), ex = 20;
    return Object.assign({ kind: 'kicker', len: u1 + ex + 120, s, u1, ex, tier }, rp);
  }
  function makePatch(kind, rnd) {
    switch (kind) {
      case 'arch': return archSpec(3 + Math.floor(rnd() * 4), rnd);
      case 'stairs': { const n = 3 + Math.floor(rnd() * 2), T = 150 + Math.round(rnd() * 15), rw = 30, h = 32 + Math.round(rnd() * 8), P = 150, D = 200; return { kind, len: n * T + rw + P + D, n, T, rw, h, P, D }; }
      case 'holes': { const k = 3 + Math.floor(rnd() * 2), sp = 340, W = 140 + Math.round(rnd() * 15); return { kind, len: k * sp, k, sp, W, D: 48, e: 30 }; }
      case 'ripples': { const lam = 100 + Math.round(rnd() * 20); return { kind, len: 8 * lam, lam, A: 17 }; }
      case 'logs': { const k = 3 + Math.floor(rnd() * 2); return { kind, len: k * 320, k, sp: 320, w: 52, H: 34 }; }
      case 'rack': { const per = 64 + Math.round(rnd() * 12); return { kind, len: 14 * per, per, A: 15 }; }
      case 'sand': return { kind, len: 880 + Math.round(rnd() * 120) };
      case 'boulders': { const k = 2 + Math.floor(rnd() * 2), sp = 270, rocks = []; for (let j = 0; j < k; j++) rocks.push({ c: Math.round((j + 0.5) * sp + (rnd() - 0.5) * 70), w: Math.round(72 + rnd() * 30), H: Math.round(28 + rnd() * 28) }); return { kind, len: k * sp, rocks }; }
      case 'whoops': { const n = 4 + Math.floor(rnd() * 2), hs = []; let s = 40; for (let j = 0; j < n; j++) { const l = Math.round(150 + rnd() * 60), A = Math.round(28 + rnd() * 18); hs.push({ s, l, A }); s += l + Math.round(30 + rnd() * 30); } return { kind, len: s + 20, hs }; }
      case 'ridges': { const k = 3 + Math.floor(rnd() * 2), sp = Math.round(210 + rnd() * 30), rocks = []; for (let j = 0; j < k; j++) rocks.push({ c: Math.round((j + 0.5) * sp), w: 46, H: Math.round(26 + rnd() * 10) }); return { kind, len: k * sp, rocks }; }
      case 'bowl': {   // avvallamento: valle dolce di profondità e lunghezza diverse (la pendenza massima resta ≈ 0,5: più è profonda, più è lunga)
        const D = 42 + Math.round(rnd() * rnd() * 100 + rnd() * 18), L = Math.round(Math.max(420, 6.1 * D) + rnd() * 110);
        return { kind, len: L + 160, s: 80, L, D };
      }
      case 'jump': {   // trampolino vero + fossato di due taglie: basso (si vola o si scende e si risale), medio (la risalita è lunga ma si sente)
        const tier = rnd() < 0.5 ? 0 : 1, big = tier === 1;
        const H = big ? 52 + Math.round(rnd() * 14) : 32 + Math.round(rnd() * 10), D = big ? 78 + Math.round(rnd() * 34) : 38 + Math.round(rnd() * 12), pw = (big ? 150 : 120) + Math.round(rnd() * 40);
        const rp = mkRamp(H, big ? 22 : 17, big ? 150 : 110), s = 60, u1 = Math.round(s + rp.run), ex = big ? 70 : 85, u2 = u1 + ex + pw, rr = big ? Math.round(150 + D * 1.3) : 110;
        return Object.assign({ kind, len: u2 + rr + 70, D, pw, s, u1, ex, u2, rr, tier }, rp);
      }
      case 'kicker': {   // rampa di lancio isolata, a tre altezze: la piccola è un dosso da salto, la grande lancia davvero (più alta = più ripida e più lunga)
        return mkKicker(rnd() < 0.45 ? 0 : 1, rnd);   // solo piccole e medie: le rampe alte bloccavano
      }
      case 'twostage': {   // rampa a due stadi: salita dolce, pianerottolo, seconda salita ripida (più spinta al labbro)
        const h1 = 30 + Math.round(rnd() * 12), h2 = 40 + Math.round(rnd() * 24), r1 = mkRamp(h1, 13 + rnd() * 3, 120), r2 = mkRamp(h2, 29 + rnd() * 3, 170);
        const s = 70, s2 = Math.round(s + r1.run + 50 + rnd() * 40), u1 = Math.round(s2 + r2.run), ex = 20;
        return Object.assign({ kind: 'kicker', len: u1 + ex + 130, s, u1, ex, tier: 2, s2, r2 }, r1, { H: h1 + h2 });
      }
      case 'twin': {   // gemelle: una rampa piccola/media e una più grande, una dopo l'altra (due rampe normali, piazzate insieme)
        const t1 = rnd() < 0.6 ? 0 : 1, t2 = 1, A = mkKicker(t1, rnd), B = mkKicker(t2, rnd), off = A.u1 + A.ex + 190 - B.s;
        return { kind, len: off + B.len, parts: [[A, 0], [B, off]] };
      }
      case 'dropin': {   // discesa e lancio: scivolo ripido (velocità), tratto piatto, rampa, atterraggio sul piano basso e lunga risalita
        const D = 70 + Math.round(rnd() * 50), ex = Math.round(D * 2.5), K = mkKicker(rnd() < 0.4 ? 0 : 1, rnd), s = 70, offK = s + ex + 150 - K.s;
        const s2 = offK + K.u1 + K.ex + 280, rr = Math.round(210 + D * 2.2);
        return { kind, len: s2 + rr + 70, parts: [[{ kind: 'drop', len: s2 + rr + 70, D, s, ex, s2, rr }, 0], [K, offK]] };
      }
      case 'pipe': {   // mezzo tubo: discesa, fondo, curva concava (R 250, fino a 52°) e labbro appena più alto della partenza: la discesa dà la velocità per risalire
        const D = 90 + Math.round(rnd() * 20), Ht = Math.round(rnd() * 10), rp = mkRamp(D + Ht, 48, 250), s0 = 80, dl = Math.round(D * 2.6), s = s0 + dl + 140, u1 = Math.round(s + rp.run), ex = 20;
        return Object.assign({ kind, len: u1 + ex + 140, D, Ht, s0, dl, s, u1, ex, tier: 2 }, rp);
      }
      case 'gapland': {   // rampa, vuoto largo, parete, cresta e discesa: il volo deve arrivare sulla pendenza. Chi cade viene riportato sulla cresta
        const tier = 1, H = tier === 1 ? 60 + Math.round(rnd() * 24) : 100 + Math.round(rnd() * 30), rp = mkRamp(H, tier === 1 ? 29 : 32, tier === 1 ? 160 : 210);
        const s = 70, u1 = Math.round(s + rp.run), ex = 34, pw = (tier === 1 ? 190 : 240) + Math.round(rnd() * 50), D = 110 + Math.round(rnd() * 50), Hl = Math.round(H * 0.45), rr = 40, u2 = u1 + ex + pw, u3 = u2 + rr + 60, dl = Math.round(Hl / Math.tan(18 * Math.PI / 180));
        return Object.assign({ kind, len: u3 + dl + 130, D, pw, s, u1, ex, u2, rr, u3, dl, Hl, tier }, rp);
      }
      case 'ravine': {   // burrone vero: rampa di lancio ripida, vuoto profondo SENZA ponte, parete di arrivo ripida. Si scavalca saltando (rampa + salto/doppio salto); chi cade viene riportato sul bordo dopo un po'
        const H = 50 + Math.round(rnd() * 14), D = 130 + Math.round(rnd() * 140), pw = RAVINE_W + Math.round(rnd() * 50);
        const rp = mkRamp(H, 26, 160), s = 70, u1 = Math.round(s + rp.run) + 10, ex = 34, u2 = u1 + ex + pw, rr = 38;
        return Object.assign({ kind, len: u2 + rr + 100, D, pw, s, u1, ex, u2, rr }, rp);
      }
      case 'drop': { const D = 40 + Math.round(rnd() * rnd() * 80 + rnd() * 14), s = 70, ex = 120, pl = 200 + Math.round(rnd() * 60), s2 = s + ex + pl, rr = Math.round(210 + D * 2.2); return { kind, len: s2 + rr + 70, D, s, ex, s2, rr }; }
      case 'mud': { const rl = 260, pl = 300; return { kind, len: 2 * rl + pl, rl, pl, H: -22 }; }
    }
    return null;
  }
  const RAVINE_W = 140;   // larghezza minima del vuoto (px), +0..50: senza salto non si supera mai, con un salto a metà dei casi, col doppio salto sempre (misurato con i bot)
  const PATCH_TABLE = {            // per bioma: [tipo, probabilità] — il resto del tempo la zona resta "pulita"
    hills:  [['ravine', 0.42], ['arch', 0.25], ['holes', 0.3], ['mud', 0.12], ['rack', 0.2], ['sand', 0.2], ['stairs', 0.05]],
    ice:    [['ravine', 0.3], ['arch', 0.3], ['rack', 0.3]],   // il ghiaccio agisce su tutta la zona (vedi gripAt); dove c'è un tratto a tema vale quello
    gravel: [['ravine', 0.38], ['ripples', 0.22], ['stairs', 0.2], ['rack', 0.3], ['sand', 0.2], ['arch', 0.1]],
    water:  [],                      // laguna: ponti e bacini (nessun terreno speciale)
    ramps:  [['ravine', 0.5], ['logs', 0.4], ['mud', 0.27], ['sand', 0.15]],
    lava:   [],                      // vulcano: laghi di lava (con o senza ponte di basalto), nessun terreno speciale
  };
  // seconda scelta (più leggera): ostacoli corti, integrati nel bioma, che si aggiungono al terreno a tema se c'è posto
  const LIGHT = { boulders: 1, whoops: 1, ridges: 1, bowl: 1, jump: 1, drop: 1, kicker: 1 };
  const PATCH_EXTRA = {   // pesi (non ordine): si pesca in proporzione a peso × sapore della gara × moltiplicatore della stagione
    hills:  [['kicker', 0.22], ['dropin', 0.14], ['twin', 0.14], ['bowl', 0.3], ['jump', 0.2], ['drop', 0.2], ['boulders', 0.2]],
    gravel: [['pipe', 0.32], ['kicker', 0.2], ['twostage', 0.14], ['bowl', 0.25], ['jump', 0.25], ['drop', 0.2], ['boulders', 0.15]],
    ramps:  [['kicker', 0.3], ['dropin', 0.14], ['twin', 0.14], ['jump', 0.22], ['bowl', 0.2], ['whoops', 0.25], ['drop', 0.1], ['boulders', 0.1]],
    ice:    [['pipe', 0.2], ['twin', 0.2], ['bowl', 0.3], ['kicker', 0.18], ['ridges', 0.3], ['jump', 0.2]],
    water:  [['twostage', 0.2], ['kicker', 0.18], ['bowl', 0.15], ['jump', 0.2], ['boulders', 0.2], ['whoops', 0.2]],   // laguna: rampe e dossi di sabbia fra un bacino e l'altro
    lava:   [['gapland', 0.45], ['kicker', 0.18], ['jump', 0.15], ['boulders', 0.45], ['ridges', 0.45]],  // vulcano: rampe di basalto, fossati di lava, massi e creste sulla riva
  };
  function planPatches(rnd, force) {
    PATCHES = [];
    const S = SEASON || SEASONS[0];
    // "sapore" della gara: ogni pista accentua alcuni terreni e ne riduce altri, così non vince sempre la stessa forma
    const flavor = {}; ['arch', 'mud', 'holes', 'stairs', 'ripples', 'logs', 'rack', 'sand', 'boulders', 'whoops', 'ridges', 'bowl', 'jump', 'drop', 'ravine', 'kicker', 'twostage', 'twin', 'dropin', 'pipe', 'gapland'].forEach(k => { const base = 0.2 + 2.1 * rnd() * rnd() + 0.5 * rnd(); flavor[k] = (rnd() < 0.3 ? 0 : 1) * base; });   // ~30% dei generi manca del tutto in questa gara
    const RAMPKINDS = ['kicker', 'twostage', 'twin', 'dropin', 'pipe', 'gapland'];
    const noRamps = rnd() < 0.2;
    if (noRamps && !S.ramps) RAMPKINDS.forEach(k => { flavor[k] = 0; });   // una gara su cinque senza rampe (non nella stagione dei salti)
    // la stagione porta in primo piano i suoi tipi (almeno un po' di presenza) e spegne quelli che non le appartengono
    for (const k in S.km) { if (S.km[k] === 0) flavor[k] = 0; else if (S.km[k] >= 1.5) flavor[k] = Math.max(flavor[k], 0.6); }
    const crazyMode = !!(force && force.crazy), mood = (rnd() < 0.3 ? 0.55 : rnd() < 0.6 ? 0.85 : 1.15) * S.m * (crazyMode ? 2.2 : 1);   // gara tranquilla / media / piena
    // ritmo della pista
    const pr = rnd() * (PACE_KEYS.length + 1); PACE = pr < 2 ? 'classica' : PACE_KEYS[Math.min(PACE_KEYS.length - 1, Math.floor(pr) - 1)];
    const real = ZONES.filter(z => z.key !== 'start' && z.key !== 'finish'), lastReal = real[real.length - 1];
    ZONES.forEach(z => {
      z.patches = []; z.budget = 0;
      if (force && (force.nopatch || (force.only && !force[z.index]))) return;
      const forced = force && force[z.index];
      const ri = real.indexOf(z), t = ri < 0 ? 0 : real.length > 1 ? ri / (real.length - 1) : 0;
      const budget = z.budget = ri < 0 ? 0 : mood * 1.45 * Math.max(0.15, PACES[PACE](t)) * (0.45 + 1.1 * Math.pow(rnd(), 1.1)) * (ri === 0 ? 0.55 : 1);   // la prima zona è sempre morbida
      const cands = [];
      for (const [k, p] of (PATCH_TABLE[z.key] || []).concat(PATCH_EXTRA[z.key] || []).concat(z.key === 'lava' ? [] : (S.add || []))) { const w = p * flavor[k] * (S.km[k] !== undefined ? S.km[k] : 1); if (w > 0) cands.push([k, w]); }
      let picks = [];
      if (forced) forced.forEach(k => picks.push(k));
      else if (cands.length) {
        let left = budget;
        // pezzo forte nell'ultima zona: un finale spettacolare (meno spesso nella stagione tranquilla), se la gara non l'ha spento del tutto
        if (z === lastReal && ri > 0 && rnd() < (S.key === 'tranquilla' ? 0.35 : 0.8)) {
          const fin = (FINALE[z.key] || []).filter(k => flavor[k] > 0 && !(S.km[k] === 0));
          if (fin.length) { const k = fin[Math.floor(rnd() * fin.length)]; picks.push(k); left -= COST[k] * 0.6; }
        }
        const maxN = crazyMode ? 4 : 3;
        while (picks.length < maxN && left > 0.28) {
          const ws = cands.map(([k, w]) => w * (COST[k] <= left + 0.8 ? 1 : 0.15)), tot = ws.reduce((a, b) => a + b, 0);
          if (!(tot > 0) || rnd() >= Math.min(0.93, 0.35 + left * 0.55)) break;
          let r0 = rnd() * tot, ch = cands[0][0]; for (let i = 0; i < ws.length; i++) { r0 -= ws[i]; if (r0 <= 0) { ch = cands[i][0]; break; } }
          picks.push(ch); left -= COST[ch];
        }
        picks.sort((a, b) => (LIGHT[a] ? 1 : 0) - (LIGHT[b] ? 1 : 0));   // prima i pezzi lunghi, i corti riempiono gli spazi che restano
      }
      if (WORLD_SEGMENT && overlapsWorldSegment(z)) {
        // V18: riserva una corsia di avvicinamento realmente leggibile agli ostacoli
        // caratteristici. La parte 'exit' non viene svuotata perché il mondo speciale
        // dura solo metà dell'ultima zona, poi torna la pista classica.
        const sw = WORLD_SEGMENT.world;
        if (z.specialPart !== 'exit' && (
          (sw === 'atlantis' && z.key === 'water') ||
          (sw === 'paradise' && z.key === 'hills') ||
          (sw === 'inferno' && z.key === 'hills') ||
          (sw === 'enchanted' && z.key === 'hills') ||
          (sw === 'neon' && z.key === 'hills')
        )) picks = [];
        const forbidden = WORLD_SEGMENT.world === 'paradise'
          ? ['ravine', 'gapland', 'pipe', 'mud', 'sand', 'boulders', 'logs', 'holes']
          : WORLD_SEGMENT.world === 'inferno' ? ['ravine', 'gapland', 'pipe', 'mud', 'sand', 'logs', 'holes', 'arch']
          : WORLD_SEGMENT.world === 'neon'
          ? ['ravine', 'gapland', 'pipe', 'arch', 'stairs', 'boulders', 'sand', 'mud', 'holes', 'logs', 'rack']
          : WORLD_SEGMENT.world === 'enchanted' ? ['ravine', 'gapland', 'pipe', 'sand']
          : WORLD_SEGMENT.world === 'atlantis' ? ['ravine', 'gapland', 'pipe', 'sand', 'mud'] : [];
        picks = picks.filter(k => !forbidden.includes(typeof k === 'string' ? k : k.kind));
      }
      picks.forEach(kind => {
        const spec = typeof kind === 'string' ? makePatch(kind, rnd) : kind;
        if (!spec) return;
        // intervalli liberi: lontano dai bordi della zona, dal vuoto sotto un ponte e dagli altri tratti già piazzati
        const light = LIGHT[spec.kind] || spec.parts || spec.kind === 'pipe' || spec.kind === 'gapland', m0 = light ? 110 : 200, m1 = light ? 150 : 220, m2 = light ? 110 : 170;   // ostacoli corti: margini più stretti, così trovano posto anche accanto a un terreno a tema
        const lo = z.start + m0, hi = z.end - m0;
        const blocks = (z.gap ? [[z.gap.g0 - m1, z.gap.g1 + m1]] : []).concat(z.patches.map(q => [q.a - m2, q.b + m2])).sort((a, b) => a[0] - b[0]);
        const free = []; let cur = lo;
        for (const [b0, b1] of blocks) { if (b0 > cur) free.push([cur, Math.min(b0, hi)]); cur = Math.max(cur, b1); }
        if (hi > cur) free.push([cur, hi]);
        free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
        const slot = free.find(f => f[1] - f[0] >= spec.len); if (!slot) return;
        const frac = forced ? 0.5 : (picks.length > 1 && !z.patches.length) ? (rnd() < 0.5 ? 0.03 : 0.97) : 0.25 + rnd() * 0.5;   // con un ostacolo in più in arrivo, il primo si sposta verso un'estremità per lasciare posto
        const a = Math.round(slot[0] + (slot[1] - slot[0] - spec.len) * frac);
        for (const [part, off] of spec.parts || [[spec, 0]]) {   // twin e dropin sono due tratti normali piazzati insieme
          const pa = a + off, pt = Object.assign({}, part, { a: pa, b: pa + part.len, zone: z.index, zkey: z.key });
          if (pt.th !== undefined) { const d = Math.round((pa + pt.u1) / 20) * 20 - (pa + pt.u1); pt.u1 += d; if (pt.u2 !== undefined) { pt.u2 += d; if (pt.u3 !== undefined) pt.u3 += d; } }   // il labbro cade esattamente su un bordo di colonna fisica: la fisica e il disegno coincidono
          z.patches.push(pt); PATCHES.push(pt);
        }
      });
    });
  }


  // ---- portali (modalità pazza) ----------------------------------------------------------------------------
  //  shift   anello d'inchiostro: a ogni passaggio ti sposta avanti o indietro di 150–400 px, a caso (lo decide l'host)
  //  mirror  ti specchia la vista (solo a te) e la bici va davvero all'indietro, come se corresse verso il traguardo ma al contrario
  //  grow    anello che ingigantisce le ruote (stessa forma, crescita graduale) · big: anello GRANDE, 1400–1900 px dopo, che le riporta normali
  //  exit    portale d'uscita, ~650–900 px dietro lo specchio: chi arriva da dietro lo attraversa, rimette tutto com'era
  // Posizioni deterministiche dal layout (RNG separato: la pista normale non cambia). Mai su ponti/vuoti né su tratti a tema,
  // e l'intero tratto fra uscita e specchio è libero, così la retromarcia si fa su terreno pulito.
  function planPortals(keys, np) {
    PORTALS = [];
    const rnd = mulberry32(hashStr(keys.join(',') + '#portali'));
    const nz = ZONES.length - 2, lo = ZONES[1].start + 900, hi = FINISH_X - 650;
    const free = (a, b) => {
      for (const z of ZONES) {
        if (z.gap && a < z.gap.g1 + 130 && b > z.gap.g0 - 130) return false;
        for (const p of z.patches || []) if (a < p.b + 90 && b > p.a - 90) return false;
      }
      return a >= lo - 700 && b <= FINISH_X - 400;
    };
    // il tratto gigante può contenere ostacoli (massi, dossi, fango: sono il bello, una ruota enorme ci passa sopra) ma non laghi, canyon o lava
    const freeG = (a, b) => {
      for (const z of ZONES) if (z.gap && a < z.gap.g1 + 130 && b > z.gap.g0 - 130) return false;
      return a >= lo - 700 && b <= FINISH_X - 400;
    };
    // Portali di famiglie diverse possono sovrapporsi (uno specchio dentro un tratto gigante, un anello d'inchiostro nel mezzo di una retromarcia…):
    // così a volte gli effetti si mescolano. Fra portali della STESSA famiglia i tratti restano separati, e due anelli non stanno mai uno sull'altro.
    // gli anelli d'inchiostro possono stare anche su rampe, dossi e burroni corti (con il salto si scavalcano): bloccano solo vuoti e terreni a tema
    const freeS = (a, b) => {
      for (const z of ZONES) {
        if (z.gap && a < z.gap.g1 + 130 && b > z.gap.g0 - 130) return false;
        for (const p of z.patches || []) if (!LIGHT[p.kind] && a < p.b + 90 && b > p.a - 90) return false;
      }
      return a >= lo - 700 && b <= FINISH_X - 400;
    };
    const taken = { pair: [], grow: [], shift: [] }, anchors = [];
    const ANCHOR_GAP = 300;
    const clear = (fam, a, b) => taken[fam].every(t => b < t[0] - 200 || a > t[1] + 200);
    const spread = (n, fam, validAt, make) => {
      for (let k = 0; k < n; k++) {
        const tgt = lo + (hi - lo) * ((k + 0.5) / n) + (rnd() - 0.5) * 500, cands = [];
        for (let x = lo; x <= hi; x += 40) cands.push(x);
        cands.sort((a, b) => Math.abs(a - tgt) - Math.abs(b - tgt));
        for (const x of cands) {
          const r = validAt(x); if (!r || !clear(fam, r[0], r[1])) continue;
          if (r[3].some(px => anchors.some(ax => Math.abs(ax - px) < ANCHOR_GAP))) continue;
          taken[fam].push(r); anchors.push(...r[3]); make(x, r); break;
        }
      }
    };
    // quanti portali: calibrati per 5 giocatori e in proporzione al numero di giocatori (il primo che passa consuma il portale, quindi
    // con pochi giocatori ognuno ne incontrerebbe troppi): non più di quanti ne servano. Minimo 2 coppie e 3 salti.
    const f = Math.max(0.2, Math.min(1, (np || 5) / 5));
    const pairs = Math.max(2, Math.round((nz <= 7 ? 5 : nz <= 11 ? 7 : 9) * f)), shifts = Math.max(3, Math.round((nz <= 7 ? 11 : nz <= 11 ? 17 : 24) * f));
    let id = 0;
    spread(pairs, 'pair', x => { const R = 650 + Math.round(rnd() * 250); return free(x - R - 70, x + 70) ? [x - R - 70, x + 70, R, [x - R, x]] : null; },
      (x, r) => { const R = r[2]; PORTALS.push({ id: id++, kind: 'exit', x: Math.round(x - R) }, { id: id++, kind: 'mirror', x: Math.round(x), exit: id - 2 }); });
    // portale gigante + portale grande: ruote ingrandite (stessa forma) per 1400–1900 px di terreno pulito. Non si consumano: li usa ognuno una volta sola
    const grows = nz <= 7 ? 2 : nz <= 11 ? 3 : 4;
    spread(grows, 'grow', x => { const R = 1400 + Math.round(rnd() * 500); return freeG(x - R - 70, x + 170) ? [x - R - 70, x + 170, R, [x - R, x]] : null; },
      (x, r) => { const R = r[2]; PORTALS.push({ id: id++, kind: 'grow', x: Math.round(x - R) }, { id: id++, kind: 'big', x: Math.round(x), grow: id - 2 }); });
    spread(shifts, 'shift', x => freeS(x - 120, x + 120) ? [x - 120, x + 120, 0, [x]] : null, x => PORTALS.push({ id: id++, kind: 'shift', x: Math.round(x) }));
    PORTALS.sort((a, b) => a.x - b.x);
  }
  // la rampa (kicker, trampolino del fossato, rampa del burrone) di cui x è sul piano inclinato o appena oltre il labbro
  function rampAt(x, before, after) {
    const z = zoneAt(x); if (!z || !z.patches) return null;
    for (const p of z.patches) if (p.th !== undefined && x >= p.a + p.u1 - (before === undefined ? 110 : before) && x <= p.a + p.u1 + (after === undefined ? 30 : after)) return p;
    return null;
  }
  // x sta sul piano della rampa (dove l'attrito è quello del legno/pietra, anche sul ghiaccio)
  function onRamp(x) {
    const z = zoneAt(x); if (!z || !z.patches) return false;
    for (const p of z.patches) if (p.th !== undefined && x >= p.a + p.s && x <= p.a + p.u1 + 20) return true;
    return false;
  }
  // il burrone (patch 'ravine') in cui si trova x, se x è nel vuoto o sulla parete di arrivo
  function ravineAt(x) {
    const z = zoneAt(x); if (!z || !z.patches) return null;
    for (const p of z.patches) if ((p.kind === 'ravine' || p.kind === 'gapland' || (p.kind === 'jump' && p.tier === 1)) && x >= p.a + p.u1 && x <= p.a + p.u2 + p.rr) return p;   // anche il fossato medio: chi resta sul fondo viene riportato fuori
    return null;
  }
  // terreno su cui si può atterrare dopo un salto: non sul vuoto/ponte, non in acqua, dentro la pista
  function landOk(x) {
    if (x < TRACK_START + 500 || x > FINISH_X - 300) return false;
    for (const z of ZONES) { if (z.gap && x > z.gap.g0 - 150 && x < z.gap.g1 + 150) return false; for (const p of z.patches || []) { if ((p.kind === 'ravine' || (p.kind === 'jump' && p.tier === 1)) && x > p.a + p.s - 60 && x < p.a + p.u2 + p.rr + 150) return false; if (p.kind === 'gapland' && x > p.a + p.s - 60 && x < p.a + p.u3 + p.dl + 150) return false; if (p.kind === 'pipe' && x > p.a + p.s0 - 60 && x < p.a + p.u1 + p.ex + 90) return false; if (p.kind === 'kicker' && x > p.a + p.s - 60 && x < p.a + p.u1 + p.ex + 90) return false; } }
    return true;
  }

  // V18: set-piece deterministici. Non c'è casualità nel loop fisico né nello shader:
  // le stesse chiavi e lo stesso mondo producono le stesse coordinate per host e client.
  function planWorldEvents(layoutKeys) {
    UPDRAFTS = []; GEYSERS = []; CLOUD_PADS = []; BUBBLE_VENTS = []; NEON_BOOSTS = [];
    HALO_RINGS = []; ASH_GUSTS = []; TIDAL_CURRENTS = []; ROOT_RIDGES = []; NEON_GATES = [];
    const world = WORLD_SEGMENT ? WORLD_SEGMENT.world : WORLD;
    const rnd = mulberry32(hashStr(layoutKeys.join(',') + '#world-v18-' + world));
    const inside = x => !WORLD_SEGMENT || (x >= WORLD_SEGMENT.start + 110 && x <= WORLD_SEGMENT.end - 110);
    const active = z => !WORLD_SEGMENT || overlapsWorldSegment(z);
    // Cercatore unico di posizioni guidabili: margine dagli ostacoli, dai canali e
    // dai bordi della scena speciale, pendenza testata su 100 px di terreno reale.
    const reserved = [];
    const find = (z, width, fractions, nearGap = false) => {
      for (const f of fractions) {
        const x = Math.round(z.start + f * z.len);
        if (!inside(x) || x - width / 2 < z.start + 130 || x + width / 2 > z.end - 130) continue;
        if (!nearGap && z.gap && x > z.gap.g0 - width / 2 - 90 && x < z.gap.g1 + width / 2 + 90) continue;
        if ((z.patches || []).some(p => x > p.a - width / 2 - 80 && x < p.b + width / 2 + 80)) continue;
        if (reserved.some(q => Math.abs(x - q.x) < (width + q.width) * 0.5 + 80)) continue;
        if (Math.abs(height(x + 50) - height(x - 50)) > 23) continue;
        reserved.push({ x, width });
        return x;
      }
      return null;
    };
    const slots = [0.28, 0.62, 0.43, 0.77, 0.20, 0.54, 0.35, 0.70];

    for (const z of ZONES) {
      if (!active(z)) continue;
      if (world === 'paradise') {
        if (['hills', 'ramps'].includes(z.key)) {
          const x = find(z, 220, slots);
          if (x !== null) UPDRAFTS.push({ id: UPDRAFTS.length, x, width: 260, height: 225, strength: 1 });
          const padX = find(z, 140, slots.slice().reverse());
          if (padX !== null) CLOUD_PADS.push({ id: CLOUD_PADS.length, x: padX, width: 124, power: 6.5 });
          // Anello alto: puoi evitarlo guidando, ma chi salta lo attraversa e ottiene
          // una piccola spinta verticale. Non viene attivato da una ruota a terra.
          // L'anello vola sopra la corsia e può coincidere con una corrente ascensionale:
          // viene cercato separatamente dalle strutture appoggiate a terra.
          const haloX = [0.46, 0.31, 0.69, 0.55, 0.21].map(f => Math.round(z.start + z.len * f)).find(px =>
            inside(px) && (!z.gap || px < z.gap.g0 - 80 || px > z.gap.g1 + 80) &&
            !(z.patches || []).some(p => px > p.a - 110 && px < p.b + 110) &&
            Math.abs(height(px + 45) - height(px - 45)) < 32
          );
          if (haloX !== undefined) HALO_RINGS.push({ id: HALO_RINGS.length, x: haloX, rise: 105, width: 94, lift: 2.6, boost: 0.5 });
        }
      } else if (world === 'inferno') {
        if (z.key === 'lava' && z.gap && !z.bridge) {
          const span = z.gap.g1 - z.gap.g0;
          // Le eruzioni stanno nei canali, non sulla corona fisica dell'isolotto.
          for (const f of [0.32, 0.72]) {
            const period = 3.8 + rnd() * 0.7;
            GEYSERS.push({ id: GEYSERS.length, x: Math.round(z.gap.g0 + span * f), width: 92, period, phase: rnd() * period, burst: 0.70, power: 5.9 + rnd() * 0.6 });
          }
        } else if (['hills', 'ramps'].includes(z.key)) {
          const x = find(z, 240, slots);
          if (x !== null) {
            const period = 4.3;
            ASH_GUSTS.push({ id: ASH_GUSTS.length, x, width: 240, period, phase: rnd() * period, burst: 1.25, warning: 0.85, drag: 0.065 });
          }
        }
      } else if (world === 'atlantis' && z.key === 'water' && z.gap) {
        // Ogni canale ha una corrente direzionata e una colonna di bolle. In fondo al
        // bacino la ruota perde un po' di velocità, nel getto la recupera.
        const mid = Math.round((z.gap.g0 + z.gap.g1) / 2);
        const period = 3.9;
        TIDAL_CURRENTS.push({ id: TIDAL_CURRENTS.length, x: mid - 125, width: 300, period, phase: rnd() * period, burst: 2.45, push: 0.12 });
        BUBBLE_VENTS.push({ id: BUBBLE_VENTS.length, x: mid + 110, width: 180, height: 145, power: 2.7, phase: rnd() * Math.PI * 2 });
      } else if (world === 'enchanted' && ['hills', 'ramps'].includes(z.key)) {
        const rootX = find(z, 200, [0.32, 0.66, 0.44, 0.77, 0.23]);
        if (rootX !== null && z.key === 'hills') ROOT_RIDGES.push({ id: ROOT_RIDGES.length, x: rootX, width: 200, height: 24 + rnd() * 7 });
        const padX = find(z, 130, slots.slice().reverse());
        if (padX !== null) CLOUD_PADS.push({ id: CLOUD_PADS.length, x: padX, width: 126, power: 6.8, kind: 'mushroom' });
      } else if (world === 'neon' && ['hills', 'ramps'].includes(z.key)) {
        const boostX = find(z, 160, slots);
        if (boostX !== null) NEON_BOOSTS.push({ id: NEON_BOOSTS.length, x: boostX, width: 150, boost: 2.6 + rnd() * 0.5 });
        const gateX = find(z, 110, slots.slice().reverse());
        if (gateX !== null) {
          const period = 3.7;
          NEON_GATES.push({ id: NEON_GATES.length, x: gateX, width: 92, period, phase: rnd() * period, burst: 1.05, warning: 0.72, slow: 0.80 });
        }
      }
    }
    // Evita che una pista fortunata senza spazi liberi rimuova completamente una
    // meccanica iconica. In quel caso restano le altre già pianificate, non si
    // mette un evento sopra una rampa/una voragine.
  }

  // V20 — solidi veri. Ostacoli progettati dalla stessa lista di zone su host e client.
  // I body Matter sono creati SOLO dall'host (js/obstacles.js); il rendering si basa
  // sugli stessi x/kind/phase e sul tempo gara comunicato negli snapshot.
  function planDynamicObstacles(keys) {
    DYNAMIC_OBSTACLES = [];
    const wd = WORLD_SEGMENT ? WORLD_SEGMENT.world : WORLD;
    const rand = mulberry32(hashStr(keys.join('|') + '#physical-v21-' + wd));
    const events = [].concat(UPDRAFTS, GEYSERS, CLOUD_PADS, BUBBLE_VENTS, NEON_BOOSTS,
      HALO_RINGS, ASH_GUSTS, TIDAL_CURRENTS, ROOT_RIDGES, NEON_GATES);
    const fractions = [0.31, 0.69, 0.49, 0.19, 0.83, 0.40, 0.59];
    for (const z of ZONES) {
      if (z.key === 'start' || z.key === 'finish') continue;
      const special = !!(WORLD_SEGMENT && z.start < WORLD_SEGMENT.end && z.end > WORLD_SEGMENT.start);
      // Difficulty curve: introduce physical obstacles gradually; the finale can be busier.
      const progression = Math.max(0, Math.min(1, z.start / Math.max(1, FINISH_X)));
      if (!special && rand() > 0.54 + 0.23 * progression) continue;
      const localWorld = special ? wd : 'classic';
      let kind;
      if (localWorld === 'paradise') kind = 'bell';
      else if (localWorld === 'inferno') kind = 'meteor';
      else if (localWorld === 'atlantis') kind = 'shell';
      else if (localWorld === 'enchanted') kind = 'log';
      else if (localWorld === 'neon') kind = 'piston';
      else kind = ({ hills: 'roller', gravel: 'roller', ice: 'iceblock',
        water: 'log', lava: 'roller', ramps: 'seesaw' })[z.key] || 'roller';
      let found = null;
      const radius = kind === 'seesaw' || kind === 'log' ? 118 : kind === 'bell' || kind === 'meteor' ? 140 : 92;
      for (const f of fractions) {
        const x = Math.round(z.start + z.len * f);
        if (x < z.start + 280 || x > z.end - 280 || x < 1160 || x > FINISH_X - 540) continue;
        if (special && (x < WORLD_SEGMENT.start + 190 || x > WORLD_SEGMENT.end - 190)) continue;
        if (z.gap && x > z.gap.g0 - 225 && x < z.gap.g1 + 225) continue;
        if ((z.patches || []).some(p => x > p.a - 215 && x < p.b + 215)) continue;
        // Protect the full collision envelope and the approach, not merely the centre.
        // Otherwise a triangular/star wheel can be squeezed between a moving solid and a hill.
        const h0=height(x-150), h1=height(x-75), hc=height(x), h2=height(x+75), h3=height(x+150);
        if (Math.max(h0,h1,hc,h2,h3)-Math.min(h0,h1,hc,h2,h3) > (special ? 62 : 52)) continue;
        if (Math.abs(h2-h1)>29) continue;
        if (events.some(e => e.x !== undefined && Math.abs(e.x - x) < (special ? 180 : 235))) continue;
        if (DYNAMIC_OBSTACLES.some(e => Math.abs(e.x - x) < (special ? 465 : 520))) continue;
        // PENDOLI: lunghezza 110 e oscillazione fino a 50px, con spazio libero ai lati.
        if (Math.abs(height(x + radius) - height(x - radius)) > 39) continue;
        found = x; break;
      }
      if (found === null) continue;
      DYNAMIC_OBSTACLES.push({ id: DYNAMIC_OBSTACLES.length, x: found, kind,
        biome: localWorld, zone: z.key, period: (kind === 'piston' ? 4.6 : kind === 'bell' || kind === 'meteor' ? 3.8 : 3.4) + rand()*0.55,
        phase: rand() * 6.283185307179586 });
    }
  }

  // ---- costruzione delle zone ---------------------------------------------------------------
  function applyLayout(layoutKeys, force) {
    const selectedWorld = force && WORLD_KEYS.includes(force.world) ? force.world : 'classic';
    const segmented = isSegmentWorld(selectedWorld);
    WORLD = segmented ? 'classic' : selectedWorld; // solo il tratto locale cambia mondo; il resto resta il gioco classico
    WORLD_SEGMENT = null;
    ROOT_RIDGES = []; // V18: non lasciare profili fisici della gara precedente durante planPatches.
    const rawKeys = (layoutKeys && layoutKeys.length ? layoutKeys : generateRandomLayout()).slice();
    const rnd = mulberry32(hashStr(rawKeys.join(',')));
    SEASON = force && force.season ? SEASONS.find(q => q.key === force.season) || SEASONS[0] : (force && (force.crazy || force.only || force.nopatch)) ? SEASONS[0] : seasonOf(rawKeys);   // stagione calcolata sui biomi estratti, prima di inserire il set-piece
    const keys = rawKeys.slice();
    let segmentOffset = -1;
    if (segmented && keys.length >= 7) {
      // Posizione variabile ma deterministica: almeno una zona di respiro prima e almeno una dopo.
      const sr = mulberry32(hashStr(rawKeys.join(',') + '#setpiece-' + selectedWorld));
      const maxOffset = Math.max(1, keys.length - 4);
      segmentOffset = 1 + Math.floor(sr() * maxOffset); // indice nell'array dei biomi (zona reale = indice + 1)
      const motif = selectedWorld === 'atlantis' ? ['water', 'water', 'hills']
        : selectedWorld === 'enchanted' ? ['hills', 'ramps', 'hills']
        : selectedWorld === 'neon' ? ['ramps', 'hills', 'ramps']
        : selectedWorld === 'paradise' ? ['hills', 'ramps', 'hills']
        : ['hills', 'lava', 'ramps']; // Dante V: un solo bacino delle anime deformato, fra bufera e architetture gotiche
      for (let i = 0; i < 3; i++) keys[segmentOffset + i] = motif[i];
    }
    ZONES = []; BRIDGES = []; INFERNO_ISLANDS = []; lastZ = 0;
    let x = TRACK_START, level = 0;

    const LEVEL_DELTA = { hills: [-90, 110], gravel: [-50, 70], ramps: [-30, 30], water: [-20, 20], ice: [-25, 25], lava: [-30, 40] };
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

    if (segmented && segmentOffset >= 0) {
      const first = segmentOffset + 1; // ZONES[0] è la partenza
      const a = ZONES[first], b = ZONES[first + 1], c = ZONES[first + 2];
      if (a && b && c) {
        const start = a.start, end = start + a.len + b.len + c.len * 0.5;
        WORLD_SEGMENT = { world: selectedWorld, start, end, length: end - start, firstZone: first, lastZone: first + 2, zoneSpan: 2.5 };
        ZONES.forEach(z => { if (z.start < end && z.end > start) { z.specialWorld = selectedWorld; z.specialPart = z.index === first ? 'entry' : z.index === first + 1 ? 'heart' : 'exit'; } });
      }
    }

    if (!(force && force.nogap)) planGaps(rnd, !!(force && force.crazy));
    planPatches(rnd, force);
    planWorldEvents(keys);
    planDynamicObstacles(keys);
    PORTALS = []; if (force && force.crazy) planPortals(keys, force.np);
    FLOWERS = generateFlowers(rnd).filter(f => !DYNAMIC_OBSTACLES.some(o => Math.abs(o.x - f.x) < 180));
    LILIES = generateLilies();
  }

  // Ogni zona acqua ha una "buca" (il bacino); alcune hanno invece un VERO vuoto sotto un ponte:
  //  - zona acqua  -> fiume profondo + ponte ad arco in pietra
  //  - zona canyon -> crepaccio profondo + ponte sospeso di assi e corde
  // Il ponte è la quota su cui guidano le ruote; il vuoto sotto è solo terreno "naturale" più basso.
  function planGaps(rnd, crazy) {
    const cand = ZONES.filter(z => (z.key === 'water' || z.key === 'gravel') && !overlapsWorldSegment(z));   // nella Città Neon niente canyon, gole o vuoti sotto la strada
    const wants = new Map();
    cand.forEach(z => wants.set(z, rnd() < (crazy ? (z.key === 'water' ? 0.85 : 0.8) : (SEASON.bridge != null ? SEASON.bridge : (z.key === 'water' ? 0.55 : 0.5)))));
    if (crazy && cand.length && ![...wants.values()].some(Boolean)) wants.set(cand[Math.floor(rnd() * cand.length)], true); // modalità pazza: almeno un ponte; in gara normale può non esserci

    ZONES.forEach(z => {
      if (z.key === 'water') {
        if (WORLD_SEGMENT && WORLD_SEGMENT.world === 'atlantis' && overlapsWorldSegment(z)) {
          // V18: due canali poco profondi attraversabili: il fondo e il livello dell'acqua
          // coincidono in fisica, rendering e gioco multiplayer. Niente bridge generico.
          const span = Math.min(1120, z.len * 0.49);
          const mid = z.start + z.len * 0.51;
          z.gap = { g0: mid - span / 2, g1: mid + span / 2, D: 57, W: 370, atlantis: true };
          z.bridge = null;
        } else if (overlapsWorldSegment(z)) {
          z.gap = null; z.bridge = null;
        } else if (wants.get(z)) {
          const span = 520, mid = z.start + z.len * (0.46 + rnd() * 0.08);
          z.gap = { g0: mid - span / 2, g1: mid + span / 2, D: 110, W: 150 };
          z.bridge = { kind: 'arch', start: z.gap.g0, end: z.gap.g1, peak: 58 };
        } else {
          z.gap = { g0: z.start + z.len * 0.2, g1: z.end - z.len * 0.2, D: 60, W: 290 };
        }
      } else if (z.key === 'lava') {
        // lago di lava: bacino largo, 56 px di fondo con pareti dolci; il pelo sta 26 px sotto la riva (come l'acqua), quindi la lava è profonda al più 30 px.
        // Solo di rado (circa una volta su quattordici) c'è un ponte di basalto (arco in pietra): chi lo prende non tocca la lava.
        const damned = !!(WORLD_SEGMENT && WORLD_SEGMENT.world === 'inferno' && overlapsWorldSegment(z));
        // L'Inferno usa una voragine a lobi e contrafforti di pietra, non un cratere vulcanico.
        // Tutti i parametri sono deterministici fra host e client; la deformazione E' collisione.
        const span = damned ? 1420 : 940, mid = z.start + z.len * (damned ? 0.515 : 0.44 + rnd() * 0.12);
        z.gap = { g0: mid - span / 2, g1: mid + span / 2, D: damned ? 78 : 56, W: damned ? 360 : 300, damned };
        if (damned) {
          // Bacino più grande e leggibile: due modi per attraversarlo.
          // 1) tenere la linea bassa, immergendosi nella lava e uscendo dall'altra riva;
          // 2) usare il doppio salto per atterrare su un unico isolotto monumentale e poi rilanciarsi.
          // L'isolotto è fisico, non decorativo: la sommità coincide con la collisione.
          const spanI = z.gap.g1 - z.gap.g0;
          z.islands = [
            { t: 0.52, width: 426, topDepth: 4.6, id: 0, kind: 'cathedral' },
          ].map(q => ({ ...q, zone: z.index, x: Math.round(z.gap.g0 + spanI * q.t) }));
          z.thorns = {
            left:  { x: Math.round(z.gap.g0 + 170), width: 210, topDepth: 18 },
            midL:  { x: Math.round(z.islands[0].x - 126), width: 126, topDepth: 9.2 },
            midR:  { x: Math.round(z.islands[0].x + 126), width: 126, topDepth: 9.2 },
            right: { x: Math.round(z.gap.g1 - 170), width: 210, topDepth: 18 },
          };
          INFERNO_ISLANDS.push(...z.islands);
        }
        if (!damned && !overlapsWorldSegment(z) && rnd() < 0.07) z.bridge = { kind: 'arch', start: z.gap.g0, end: z.gap.g1, peak: 52 };
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
    if (lastZ >= n) lastZ = 0;   // dopo un layout più corto l'indice in cache può non esistere più
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
    // Le radici incantate sono una parte della collisione reale, non un overlay grafico.
    // Profilo C1 ai margini: evita spigoli e picchi di accelerazione ai 60 Hz.
    if (ROOT_RIDGES.length && WORLD_SEGMENT && WORLD_SEGMENT.world === 'enchanted') {
      for (const q of ROOT_RIDGES) {
        const d = Math.abs(x - q.x) / (q.width * 0.5);
        if (d < 1) { const a = 0.5 + 0.5 * Math.cos(Math.PI * d); h += q.height * a * a; }
      }
    }
    return h;
  }

  function gapDepth(z, x) {
    const g = z.gap; if (!g || x <= g.g0 || x >= g.g1) return 0;
    const edge = smooth((x - g.g0) / g.W) * smooth((g.g1 - x) / g.W);
    if (!g.damned) return g.D * edge;
    const t = (x - g.g0) / (g.g1 - g.g0);
    // Bacino asimmetrico e contorto, con una nervatura gotica centrale e bordi corrosi dal vento.
    // Oscillazioni ampie ma lisce: pendenza compatibile con la fisica delle ruote.
    const folds = 0.91 + 0.115 * Math.sin(t * Math.PI * 5.3 + 0.35) + 0.032 * Math.sin(t * Math.PI * 14.4 + 1.4);
    const rib = 0.35 * Math.exp(-Math.pow((t - 0.55) / 0.085, 2));
    let depth = g.D * edge * Math.max(0.34, folds - rib);
    // Picchi piatti al centro, spalle curve agli estremi: isole fisiche indipendenti dalla grafica.
    // Non creano un ponte continuo: fra gli isolotti resta lava vera e pericolosa.
    if (z.islands) for (const island of z.islands) {
      const a = Math.abs(x - island.x) / (island.width * 0.5);
      if (a < 1) {
        const crown = 1 - smooth((a - 0.24) / 0.76);
        depth = depth * (1 - crown) + island.topDepth * crown;
      }
    }
    if (g.damned && z.thorns) {
      const helpers = [z.thorns.left, z.thorns.midL, z.thorns.midR, z.thorns.right];
      for (const h of helpers) {
        const a = Math.abs(x - h.x) / (h.width * 0.5);
        if (a < 1) {
          const kick = 1 - smooth((a - 0.10) / 0.90);
          depth = depth * (1 - kick) + h.topDepth * kick;
        }
      }
    }
    return depth;
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

  // Tratto "pulito": niente ostacoli, vuoti, ponti né forti pendenze nei dintorni. Serve al suggerimento "sei lento": se la bici è lenta dentro un fossato, su una
  // rampa o in salita ripida non è colpa della forma della ruota, quindi lì il suggerimento non deve comparire.
  function plainAt(x, m) {
    m = m || 90; const z = zoneAt(x); if (!z || z.key === 'lava' || z.key === 'finish' || z.key === 'start') return false;   // vulcano: la lava frena e basta; traguardo e partenza: niente suggerimenti
    if (z.gap && x > z.gap.g0 - 160 && x < z.gap.g1 + 160) return false;
    for (const q of [z, ZONES[z.index - 1], ZONES[z.index + 1]]) if (q && q.patches) for (const p of q.patches) if (x > p.a - m && x < p.b + m) return false;
    const sl = (height(x + 50) - height(x - 50)) / 100; return Math.abs(sl) < 0.3;
  }
  function bridgeAt(x) { for (const b of BRIDGES) if (x >= b.start && x <= b.end) return b; return null; }

  // Pelo dell'acqua: nelle zone acqua, 28px sotto la riva. Dove il fondo sta più in alto non c'è acqua.
  function waterLevel(x) { const z = zoneAt(x); return z.key === 'water' && z.gap ? zoneBase(z, x) - 28 : -Infinity; }
  function isWater(x) { const z = zoneAt(x); return z.key === 'water' && !bridgeAt(x) && naturalHeight(x) < waterLevel(x); }

  // Lava: il pelo sta 26 px sotto la riva; dove il fondo è più in alto non c'è lava, e sotto il ponte non si tocca.
  function lavaLevel(x) {
    const z = zoneAt(x); if (z.key !== 'lava' || !z.gap) return -Infinity;
    if (!z.gap.damned) return zoneBase(z, x) - 26;
    // Liquido rosso-violaceo contorto: livello fisico identico per tutti i client.
    const t = (x - z.gap.g0) / (z.gap.g1 - z.gap.g0);
    const curl = 3.2 * Math.sin(t * Math.PI * 5.8 + .6) + 1.5 * Math.sin(t * Math.PI * 12.6);
    return zoneBase(z, x) - (26 + curl);
  }
  function isLava(x) { const z = zoneAt(x); return z.key === 'lava' && z.gap && !bridgeAt(x) && naturalHeight(x) < lavaLevel(x); }
  // x dentro il tratto (con un po' di margine) dove può esserci lava: serve a non fare conti inutili altrove
  function nearLava(x, m) { const z = zoneAt(x); return z.key === 'lava' && !!z.gap && !z.bridge && x > z.gap.g0 - (m || 0) && x < z.gap.g1 + (m || 0); }

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
        if (Math.abs(height(px + 10) - height(px - 10)) > 11) return false;   // né su pendenze forti (>~28°): il fiore sembrerebbe sospeso
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
    generateRandomLayout, applyLayout, plainAt, SEASONS, seasonOf, PACES, height, naturalHeight, baseHeight, waterLevel, isWater, lavaLevel, isLava, nearLava, zoneAt, bridgeAt,
    get WORLD() { return WORLD; }, get WORLD_SEGMENT() { return WORLD_SEGMENT; }, get DYNAMIC_OBSTACLES() { return DYNAMIC_OBSTACLES; }, get UPDRAFTS() { return UPDRAFTS; }, get GEYSERS() { return GEYSERS; }, get CLOUD_PADS() { return CLOUD_PADS; }, get BUBBLE_VENTS() { return BUBBLE_VENTS; }, get NEON_BOOSTS() { return NEON_BOOSTS; }, get HALO_RINGS() { return HALO_RINGS; }, get ASH_GUSTS() { return ASH_GUSTS; }, get TIDAL_CURRENTS() { return TIDAL_CURRENTS; }, get ROOT_RIDGES() { return ROOT_RIDGES; }, get NEON_GATES() { return NEON_GATES; },
    frictionAt: x => { const f = FRICTION[zoneAt(x).key] || 0.9; return f < 0.9 && onRamp(x) ? 0.9 : f; },   // il piano della rampa tiene sempre (anche nel ghiaccio)
    colorAt: x => zoneAt(x).color || '#059669',
    zoneKeyAt: x => zoneAt(x).key,
    LENGTHS,
    get SEASON() { return SEASON; }, get PACE() { return PACE; }, get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; },
    get TRACK_START() { return TRACK_START; }, get FLOWERS() { return FLOWERS; }, get LILIES() { return LILIES; },
    get BRIDGES() { return BRIDGES; }, get INFERNO_ISLANDS() { return INFERNO_ISLANDS; }, get PATCHES() { return PATCHES; }, get PORTALS() { return PORTALS; }, PORTAL_RY: 88, landOk, ravineAt, rampAt, onRamp, makePatch, mkRamp, rampY,
    // tipo di presa speciale sotto la ruota: 'mud' (fango), 'ice' (ghiaccio) o null
    // N lati della strada ad archi sotto la ruota (0 se non è una strada ad archi): serve a chi ha esattamente N punte
    gripN: x => { const z = zoneAt(x); if (z.patches) for (const p of z.patches) if (p.kind === 'arch' && x >= p.a && x <= p.b) return p.n; return 0; },
    gripAt: x => { const z = zoneAt(x); if (z.patches) for (const p of z.patches) if (x >= p.a && x <= p.b) { if (p.kind === 'mud') return 'mud'; if (p.kind === 'arch' || p.kind === 'ripples') return 'rough'; if (p.kind === 'rack') return 'rack'; if (p.kind === 'sand') return 'sand'; } return z.key === 'ice' ? 'ice' : null; },
    _archSpec: archSpec,
    patchAt: x => { const z = zoneAt(x); for (const p of z.patches) if (x >= p.a && x <= p.b) return p; return null; },
    RAMP_PERIOD, RAMP_RISE, RAMP_LEAD,
  };
})(); // terrain
