const Terrain = (() => {
  let TRACK_START = -300, TRACK_END = 12000, FINISH_X = 11500, ZONES = [], FLOWERS = [], BRIDGE = null;
  
  const ZONE_TYPES = ['hills', 'ice', 'gravel', 'water', 'ramps'];
  const ZONE_COLORS = {
    start: '#10b981', hills: '#059669', ice: '#7dd3fc',
    gravel: '#94a3b8', water: '#3b82f6', ramps: '#f59e0b', finish: '#10b981'
  };
  const FRICTION = { start: 0.9, hills: 0.9, ice: 0.1, gravel: 0.6, water: 0.95, ramps: 1.1, finish: 0.9 };

  function generateRandomLayout() {
    const layout = []; for (let i = 0; i < 7; i++) layout.push(ZONE_TYPES[Math.floor(Math.random() * ZONE_TYPES.length)]); return layout;
  }

  function applyLayout(layoutKeys) {
    ZONES = []; let currentX = -300;
    ZONES.push({ key: 'start', start: currentX, end: currentX + 1200, color: ZONE_COLORS.start }); currentX += 1200;
    layoutKeys.forEach(key => { ZONES.push({ key, start: currentX, end: currentX + 1400, color: ZONE_COLORS[key] }); currentX += 1400; });
    ZONES.push({ key: 'finish', start: currentX, end: currentX + 1200, color: ZONE_COLORS.finish });
    TRACK_END = currentX + 1200; FINISH_X = currentX + 300;
    FLOWERS = generateFlowers();
    BRIDGE = generateBridge();
  }

  // The profile is made of sections (by x) plus a per-zone modifier (ice/water/ramps).
  // Both used to switch abruptly, leaving near-vertical cliffs (+95px at x=1180, -96px at x=7980...)
  // that no wheel can climb. Now every switch is cross-faded with a smoothstep over BLEND px.
  const BLEND = 240;
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

  function sections() {
    return [
      { from: -Infinity, f: () => 0 },
      { from: 500,  f: x => Math.sin(x / 250) * 50 },
      { from: 1200, f: x => 50 + Math.sin(x / 120) * 8 },
      { from: 3200, f: x => 40 - Math.sin(((x - 3200) / 2000) * Math.PI) * 90 },
      { from: 5200, f: x => { const p = (x - 5200) / 2800; return p * 130 + Math.sin(p * Math.PI * 4) * 20; } },
      { from: 8000, f: x => Math.sin(x / 250) * 50 },
      { from: TRACK_END - 500, f: () => 0 },
    ];
  }

  // cross-fade between neighbouring items of a list [{from, f}] around each boundary
  function blendAt(list, x) {
    for (let i = 1; i < list.length; i++) {
      const b = list[i].from;
      if (Math.abs(x - b) < BLEND / 2) {
        const t = smooth((x - (b - BLEND / 2)) / BLEND);
        return list[i - 1].f(x) * (1 - t) + list[i].f(x) * t;
      }
    }
    let cur = list[0];
    for (const it of list) if (x >= it.from) cur = it;
    return cur.f(x);
  }

  // Rampa vera: salita netta fino a un picco, poi una discesa più ripida che scende sotto la
  // quota base (un piccolo distacco prima dell'atterraggio), poi un ritorno dolce alla quota
  // base prima della rampa successiva. Tutti e tre i tratti usano lo stesso easing smoothstep
  // già validato altrove (nessuno spigolo), solo più netto di una semplice onda sinusoidale.
  const RAMP_PERIOD = 500, RAMP_RISE = 220, RAMP_DROP = 140, RAMP_PEAK = 70, RAMP_GAP = 15;

  function rampProfile(x) {
    const u = ((x % RAMP_PERIOD) + RAMP_PERIOD) % RAMP_PERIOD;
    if (u < RAMP_RISE) {
      return smooth(u / RAMP_RISE) * RAMP_PEAK;
    } else if (u < RAMP_RISE + RAMP_DROP) {
      const t = (u - RAMP_RISE) / RAMP_DROP;
      return RAMP_PEAK * (1 - smooth(t)) - RAMP_GAP * smooth(t);
    } else {
      const t = (u - RAMP_RISE - RAMP_DROP) / (RAMP_PERIOD - RAMP_RISE - RAMP_DROP);
      return -RAMP_GAP * (1 - smooth(t));
    }
  }

  function zoneModifier(key, x) {
    if (key === 'ice') return -15;
    if (key === 'water') return -60;
    if (key === 'ramps') return rampProfile(x);
    return 0;
  }

  // Fiorellini decorativi lungo il percorso: un piccolo dosso morbido, non un vero ostacolo.
  // Devono essere IDENTICI su host e client (la fisica gira solo sull'host, i client disegnano
  // soltanto), quindi niente Math.random() qui: solo funzioni deterministiche di x, così
  // applyLayout(stessiLayoutKeys) produce sempre lo stesso elenco ovunque sia chiamata.
  function pseudo(x) { const v = Math.sin(x * 12.9898) * 43758.5453; return v - Math.floor(v); } // 0..1

  function generateFlowers() {
    const flowers = [];
    let x = TRACK_START + 1500; // niente fiori appena dopo la partenza
    const STOP_X = TRACK_END - 900; // niente fiori appena prima del traguardo
    let i = 0; // indice del fiore piazzato: usato per far ruotare le specie (non x, che salta
               // in modo irregolare a causa delle zone acqua saltate)
    while (x < STOP_X) {
      const zone = dominantZoneOf(x, ZONES).key;
      if (zone !== 'start' && zone !== 'finish' && zone !== 'water') {
        flowers.push({
          x: Math.round(x),
          r: 9 + pseudo(x) * 6,                   // 9–15px: la "gobba" fisica, piccola rispetto alla ruota (r=80).
                                                    // Invariato apposta: è il valore già testato con la fisica.
          hue: Math.floor(pseudo(x * 3.1) * 5),    // indice colore, 0-4
          // Specie: ruota sempre fra le 3 (0 margherita, 1 tulipano, 2 rosa) invece di sceglierle
          // in modo indipendente — con solo 3 valori il caso puro le raggruppava spesso a coppie
          // o terne uguali. i%3 garantisce la rotazione, +0/1 pseudo-deterministico la rimescola
          // un po' così non sembra un pattern meccanico 1-2-3-1-2-3.
          species: (i + Math.floor(pseudo(x * 7.3) * 2)) % 4, // 0 margherita, 1 tulipano, 2 rosa, 3 girasole
          stemScale: 0.7 + pseudo(x * 4.1) * 1.7,  // altezza dello stelo: solo estetica, non tocca la fisica
        });
        i++;
      }
      x += 460 + pseudo(x * 1.7) * 340; // passo variabile ma deterministico, 460–800px: un accento
                                          // sparso sul paesaggio, non un campo di fiori
    }
    return flowers;
  }

  // Ponte: non in ogni gara (il tiro deterministico qui sotto esce "vero" in circa 45% dei
  // casi), e solo quando il layout ha davvero una zona acqua su cui ha senso che passi. Niente
  // nuova fisica: è solo un tratto di terreno appiattito a un'altezza costante (con lo stesso
  // raccordo smoothstep già usato per i confini di zona) più la decorazione visiva sopra — le
  // ruote lo attraversano esattamente come qualunque altro tratto di terreno.
  function generateBridge() {
    const water = ZONES.find(z => z.key === 'water');
    if (!water) return null;
    const key = ZONES.map(z => z.key + z.start).join('|');
    let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    if ((h % 100) / 100 > 0.45) return null; // ~45% delle gare

    const span = Math.min(480, (water.end - water.start) * 0.85);
    const mid = (water.start + water.end) / 2;
    return { start: mid - span / 2, end: mid + span / 2, peakHeight: 60 };
  }

  // stessa logica di dominantZone, ma prende ZONES come parametro: generateFlowers() viene
  // chiamata mentre applyLayout sta ancora scrivendo ZONES, quindi non può usare la closure.
  function dominantZoneOf(x, zones) {
    for (const z of zones) { if (x >= z.start && x <= z.end) return z; }
    return zones[0] || { key: 'hills' };
  }

  // Altezza "vera" del terreno, senza l'eventuale ponte: serve a game.js per disegnare il
  // vuoto/l'acqua sotto l'impalcato (altrimenti la riva piena nasconderebbe la campata).
  function naturalHeight(x) {
    const zoneList = ZONES.map(z => ({ from: z.start, f: xx => zoneModifier(z.key, xx) }));
    return blendAt(sections(), x) + blendAt(zoneList, x);
  }

  // Quota su cui guidano davvero le ruote: uguale al terreno naturale ovunque, tranne che sopra
  // il ponte, dove diventa un arco che parte e arriva al livello delle due sponde (non una
  // quota fissa) — così l'impalcato si aggancia bene al terreno anche se le due sponde non sono
  // perfettamente alla stessa altezza.
  function height(x) {
    const natural = naturalHeight(x);
    if (!BRIDGE) return natural;
    const { start, end, peakHeight } = BRIDGE;
    if (x < start - BLEND || x > end + BLEND) return natural;

    const hStart = naturalHeight(start), hEnd = naturalHeight(end);
    if (x >= start && x <= end) {
      const t = (x - start) / (end - start);
      const bankLevel = hStart * (1 - t) + hEnd * t;
      const arc = Math.sin(t * Math.PI) * peakHeight;
      return bankLevel + arc;
    }
    const edgeTarget = x < start ? hStart : hEnd;
    const t2 = x < start ? smooth((x - (start - BLEND)) / BLEND) : 1 - smooth((x - end) / BLEND);
    return natural * (1 - t2) + edgeTarget * t2;
  }

  function dominantZone(x) {
    for (const z of ZONES) { if (x >= z.start && x <= z.end) return z; }
    return ZONES[0] || { key: 'hills' };
  }

  applyLayout(generateRandomLayout());

  return { 
    generateRandomLayout, applyLayout, height, 
    frictionAt: (x) => FRICTION[dominantZone(x).key] || 0.9, 
    colorAt: (x) => dominantZone(x).color || '#059669', 
    get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; }, get TRACK_START() { return TRACK_START; }, get FLOWERS() { return FLOWERS; }, get BRIDGE() { return BRIDGE; }, naturalHeight,
    get RAMP_PERIOD() { return RAMP_PERIOD; }, get RAMP_RISE() { return RAMP_RISE; }
  };
})(); // terrain 
