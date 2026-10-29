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
  let ZONES = [], FLOWERS = [], LILIES = [], BRIDGES = [], PATCHES = [], PORTALS = [];

  const ZONE_TYPES = ['hills', 'ice', 'gravel', 'water', 'ramps'];
  const ZONE_COLORS = {
    start: '#10b981', hills: '#059669', ice: '#7dd3fc',
    gravel: '#94a3b8', water: '#3b82f6', ramps: '#f59e0b', finish: '#10b981'
  };
  const FRICTION = { start: 0.9, hills: 0.9, ice: 0.1, gravel: 0.6, water: 0.95, ramps: 1.1, finish: 0.9 };
  // lunghezza base di ogni zona (px); ogni zona la varia di ±12% in modo deterministico
  const ZONE_LEN = { start: 1400, hills: 1750, ice: 1700, gravel: 1750, water: 2400, ramps: 2000, finish: 1400 };
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
      case 'jump': { // trampolino, fossato, risalita: chi arriva veloce lo salta, chi arriva piano ci scende dentro e deve risalire
        return p.H * smooth((u - p.s) / p.rl) - (p.H + p.D) * smooth((u - p.u1) / p.ex) + p.D * smooth((u - p.u2) / p.rr);
      }
      case 'drop': { // gradino in discesa, lungo tratto più basso, poi una salita larga: la discesa dà velocità, la risalita la chiede
        return -p.D * smooth((u - p.s) / p.ex) + p.D * smooth((u - p.s2) / p.rr);
      }
      case 'rack': { const w = smooth(u / 100) * smooth((L - u) / 100), f = (u / p.per) % 1; return w * p.A * (1 - Math.abs(2 * f - 1)); }   // dentiera: denti a V
      default: return 0;
    }
  }
  const PATCH_FLAT = { arch: 1, stairs: 1, holes: 1, ripples: 0.7, logs: 0.8, mud: 1, rack: 0.8, sand: 1, boulders: 1, whoops: 0.8, ridges: 1, bowl: 1, jump: 1, drop: 1 };
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
      case 'bowl': { const L = 440 + Math.round(rnd() * 80), D = 60 + Math.round(rnd() * 20); return { kind, len: L + 160, s: 80, L, D }; }
      case 'jump': { const H = 34 + Math.round(rnd() * 10), D = 38 + Math.round(rnd() * 8), pw = 120 + Math.round(rnd() * 30), s = 60, rl = 150, u1 = s + rl + 10, ex = 85, u2 = u1 + ex + pw, rr = 110; return { kind, len: u2 + rr + 70, H, D, pw, s, rl, u1, ex, u2, rr }; }
      case 'drop': { const D = 46 + Math.round(rnd() * 16), s = 70, ex = 120, pl = 200 + Math.round(rnd() * 60), s2 = s + ex + pl, rr = 240; return { kind, len: s2 + rr + 70, D, s, ex, s2, rr }; }
      case 'mud': { const rl = 260, pl = 300; return { kind, len: 2 * rl + pl, rl, pl, H: -22 }; }
    }
    return null;
  }
  const PATCH_TABLE = {            // per bioma: [tipo, probabilità] — il resto del tempo la zona resta "pulita"
    hills:  [['arch', 0.25], ['holes', 0.3], ['mud', 0.12], ['rack', 0.2], ['sand', 0.2], ['stairs', 0.05]],
    ice:    [['arch', 0.3], ['rack', 0.3]],   // il ghiaccio agisce su tutta la zona (vedi gripAt); dove c'è un tratto a tema vale quello
    gravel: [['ripples', 0.22], ['stairs', 0.2], ['rack', 0.3], ['sand', 0.2], ['arch', 0.1]],
    water:  [],                      // laguna: ponti e bacini (nessun terreno speciale)
    ramps:  [['logs', 0.4], ['mud', 0.27], ['sand', 0.15]],
  };
  // seconda scelta (più leggera): ostacoli corti, integrati nel bioma, che si aggiungono al terreno a tema se c'è posto
  const LIGHT = { boulders: 1, whoops: 1, ridges: 1, bowl: 1, jump: 1, drop: 1 };
  const PATCH_EXTRA = {
    hills:  [['boulders', 0.5], ['drop', 0.4], ['bowl', 0.3]],
    gravel: [['boulders', 0.5], ['jump', 0.3], ['drop', 0.25], ['bowl', 0.25]],
    ramps:  [['whoops', 0.5], ['jump', 0.35], ['boulders', 0.2]],
    ice:    [['ridges', 0.65]],
    water:  [['boulders', 0.35], ['whoops', 0.3]],   // laguna: massi sulla riva e dossi di sabbia fra un bacino e l'altro
  };
  function planPatches(rnd, force) {
    PATCHES = [];
    // "sapore" della gara: ogni pista accentua alcuni terreni e ne riduce altri, così non vince sempre la stessa forma
    const flavor = {}; ['arch', 'mud', 'holes', 'stairs', 'ripples', 'logs', 'rack', 'sand', 'boulders', 'whoops', 'ridges', 'bowl', 'jump', 'drop'].forEach(k => { flavor[k] = 0.2 + 2.1 * rnd() * rnd() + 0.5 * rnd(); });
    ZONES.forEach(z => {
      z.patches = [];
      if (force && (force.nopatch || (force.only && !force[z.index]))) return;
      const forced = force && force[z.index];
      const tbl = PATCH_TABLE[z.key];
      const pick = t2 => { const r0 = rnd(); let acc = 0; for (const [k, pr] of t2) { acc += Math.min(0.95, pr * flavor[k]); if (r0 < acc) return [k]; } return []; };
      let picks = forced ? forced : (tbl ? pick(tbl) : []);
      if (!forced && PATCH_EXTRA[z.key]) picks = picks.concat(pick(PATCH_EXTRA[z.key]));
      picks.forEach(kind => {
        const spec = typeof kind === 'string' ? makePatch(kind, rnd) : kind;
        if (!spec) return;
        // intervalli liberi: lontano dai bordi della zona, dal vuoto sotto un ponte e dagli altri tratti già piazzati
        const light = LIGHT[spec.kind], m0 = light ? 110 : 200, m1 = light ? 150 : 220, m2 = light ? 110 : 170;   // ostacoli corti: margini più stretti, così trovano posto anche accanto a un terreno a tema
        const lo = z.start + m0, hi = z.end - m0;
        const blocks = (z.gap ? [[z.gap.g0 - m1, z.gap.g1 + m1]] : []).concat(z.patches.map(q => [q.a - m2, q.b + m2])).sort((a, b) => a[0] - b[0]);
        const free = []; let cur = lo;
        for (const [b0, b1] of blocks) { if (b0 > cur) free.push([cur, Math.min(b0, hi)]); cur = Math.max(cur, b1); }
        if (hi > cur) free.push([cur, hi]);
        free.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
        const slot = free.find(f => f[1] - f[0] >= spec.len); if (!slot) return;
        const frac = forced ? 0.5 : (picks.length > 1 && !z.patches.length) ? (rnd() < 0.5 ? 0.03 : 0.97) : 0.25 + rnd() * 0.5;   // con un ostacolo in più in arrivo, il primo si sposta verso un'estremità per lasciare posto
        const a = Math.round(slot[0] + (slot[1] - slot[0] - spec.len) * frac);
        const pt = Object.assign({}, spec, { a, b: a + spec.len, zone: z.index, zkey: z.key });
        z.patches.push(pt); PATCHES.push(pt);
      });
    });
  }


  // ---- portali (modalità pazza) ----------------------------------------------------------------------------
  //  shift   anello d'inchiostro: a ogni passaggio ti sposta avanti o indietro di 150–400 px, a caso (lo decide l'host)
  //  mirror  ti specchia la vista (solo a te) e la bici va davvero all'indietro, come se corresse verso il traguardo ma al contrario
  //  exit    portale d'uscita, ~650–900 px dietro lo specchio: chi arriva da dietro lo attraversa, rimette tutto com'era
  // Posizioni deterministiche dal layout (RNG separato: la pista normale non cambia). Mai su ponti/vuoti né su tratti a tema,
  // e l'intero tratto fra uscita e specchio è libero, così la retromarcia si fa su terreno pulito.
  function planPortals(keys) {
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
    const taken = [];     // intervalli già occupati da portali
    const clear = (a, b) => taken.every(t => b < t[0] - 330 || a > t[1] + 330);
    const spread = (n, validAt, make) => {
      for (let k = 0; k < n; k++) {
        const tgt = lo + (hi - lo) * ((k + 0.5) / n) + (rnd() - 0.5) * 500, cands = [];
        for (let x = lo; x <= hi; x += 40) cands.push(x);
        cands.sort((a, b) => Math.abs(a - tgt) - Math.abs(b - tgt));
        for (const x of cands) { const r = validAt(x); if (r && clear(r[0], r[1])) { taken.push(r); make(x, r); break; } }
      }
    };
    const pairs = nz <= 7 ? 1 : nz <= 11 ? 2 : 3, shifts = nz <= 7 ? 2 : nz <= 11 ? 3 : 5;
    let id = 0;
    spread(pairs, x => { const R = 650 + Math.round(rnd() * 250); return free(x - R - 70, x + 70) ? [x - R - 70, x + 70, R] : null; },
      (x, r) => { const R = r[2]; PORTALS.push({ id: id++, kind: 'exit', x: Math.round(x - R) }, { id: id++, kind: 'mirror', x: Math.round(x), exit: id - 2 }); });
    spread(shifts, x => free(x - 120, x + 120) ? [x - 120, x + 120] : null, x => PORTALS.push({ id: id++, kind: 'shift', x: Math.round(x) }));
    PORTALS.sort((a, b) => a.x - b.x);
  }
  // terreno su cui si può atterrare dopo un salto: non sul vuoto/ponte, non in acqua, dentro la pista
  function landOk(x) {
    if (x < TRACK_START + 500 || x > FINISH_X - 300) return false;
    for (const z of ZONES) if (z.gap && x > z.gap.g0 - 150 && x < z.gap.g1 + 150) return false;
    return true;
  }

  // ---- costruzione delle zone ---------------------------------------------------------------
  function applyLayout(layoutKeys, force) {
    const keys = (layoutKeys && layoutKeys.length ? layoutKeys : generateRandomLayout()).slice();
    const rnd = mulberry32(hashStr(keys.join(',')));
    ZONES = []; BRIDGES = []; lastZ = 0;
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
    PORTALS = []; if (force && force.crazy) planPortals(keys);
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
    generateRandomLayout, applyLayout, height, naturalHeight, baseHeight, waterLevel, isWater, zoneAt, bridgeAt,
    frictionAt: x => FRICTION[zoneAt(x).key] || 0.9,
    colorAt: x => zoneAt(x).color || '#059669',
    zoneKeyAt: x => zoneAt(x).key,
    LENGTHS,
    get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; },
    get TRACK_START() { return TRACK_START; }, get FLOWERS() { return FLOWERS; }, get LILIES() { return LILIES; },
    get BRIDGES() { return BRIDGES; }, get PATCHES() { return PATCHES; }, get PORTALS() { return PORTALS; }, landOk,
    // tipo di presa speciale sotto la ruota: 'mud' (fango), 'ice' (ghiaccio) o null
    // N lati della strada ad archi sotto la ruota (0 se non è una strada ad archi): serve a chi ha esattamente N punte
    gripN: x => { const z = zoneAt(x); if (z.patches) for (const p of z.patches) if (p.kind === 'arch' && x >= p.a && x <= p.b) return p.n; return 0; },
    gripAt: x => { const z = zoneAt(x); if (z.patches) for (const p of z.patches) if (x >= p.a && x <= p.b) { if (p.kind === 'mud') return 'mud'; if (p.kind === 'arch' || p.kind === 'ripples') return 'rough'; if (p.kind === 'rack') return 'rack'; if (p.kind === 'sand') return 'sand'; } return z.key === 'ice' ? 'ice' : null; },
    _archSpec: archSpec,
    patchAt: x => { const z = zoneAt(x); for (const p of z.patches) if (x >= p.a && x <= p.b) return p; return null; },
    RAMP_PERIOD, RAMP_RISE, RAMP_LEAD,
  };
})(); // terrain
