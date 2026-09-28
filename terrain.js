const Terrain = (() => {
  let TRACK_START = -300, TRACK_END = 12000, FINISH_X = 11500, ZONES = [], FLOWERS = [];
  
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

  function zoneModifier(key, x) {
    if (key === 'ice') return -15;
    if (key === 'water') return -60;
    if (key === 'ramps') return Math.abs(Math.sin(x / 90)) * 45;
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
          species: (i + Math.floor(pseudo(x * 7.3) * 2)) % 3,
          stemScale: 0.7 + pseudo(x * 4.1) * 1.7,  // altezza dello stelo: solo estetica, non tocca la fisica
        });
        i++;
      }
      x += 460 + pseudo(x * 1.7) * 340; // passo variabile ma deterministico, 460–800px: un accento
                                          // sparso sul paesaggio, non un campo di fiori
    }
    return flowers;
  }

  // stessa logica di dominantZone, ma prende ZONES come parametro: generateFlowers() viene
  // chiamata mentre applyLayout sta ancora scrivendo ZONES, quindi non può usare la closure.
  function dominantZoneOf(x, zones) {
    for (const z of zones) { if (x >= z.start && x <= z.end) return z; }
    return zones[0] || { key: 'hills' };
  }

  function height(x) {
    const zoneList = ZONES.map(z => ({ from: z.start, f: xx => zoneModifier(z.key, xx) }));
    return blendAt(sections(), x) + blendAt(zoneList, x);
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
    get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; }, get TRACK_START() { return TRACK_START; }, get FLOWERS() { return FLOWERS; } 
  };
})(); // terrain 
