const Terrain = (() => {
  let TRACK_START = -300, TRACK_END = 12000, FINISH_X = 11500, ZONES = [];
  
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
    get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; }, get TRACK_START() { return TRACK_START; } 
  };
})(); // terrain 
