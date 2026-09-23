const Terrain = (() => {
  let TRACK_START = -300, TRACK_END = 9000, FINISH_X = 8500, ZONES = [];
  const ZONE_TYPES = ['hills1', 'ice', 'gravel', 'water', 'ramps', 'hills2'];
  
  const ZONE_COLORS = {
    flatStart: '#10b981', hills1: '#059669', ice: '#7dd3fc',
    gravel: '#94a3b8', water: '#3b82f6', ramps: '#f59e0b',
    hills2: '#059669', flatFinish: '#10b981'
  };

  const FRICTION = {
    flatStart: 0.95, hills1: 0.95, ice: 0.015, gravel: 0.6,
    water: 0.95, ramps: 1.1, hills2: 0.95, flatFinish: 0.95
  };

  function generateRandomLayout() {
    const layout = []; for (let i = 0; i < 6; i++) layout.push(ZONE_TYPES[Math.floor(Math.random() * ZONE_TYPES.length)]); return layout;
  }

  function applyLayout(layoutKeys) {
    ZONES = []; let currentX = -300;
    ZONES.push({ key: 'flatStart', start: currentX, end: currentX + 1500, color: ZONE_COLORS.flatStart }); currentX += 1500;
    layoutKeys.forEach(key => { ZONES.push({ key, start: currentX, end: currentX + 1300, color: ZONE_COLORS[key] }); currentX += 1300; });
    ZONES.push({ key: 'flatFinish', start: currentX, end: currentX + 1500, color: ZONE_COLORS.flatFinish });
    TRACK_END = currentX + 1500; FINISH_X = currentX + 400; 
  }

  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function zoneWeight(x, z, feather = 250) {
    if (x <= z.start - feather || x >= z.end + feather) return 0;
    if (x >= z.start + feather && x <= z.end - feather) return 1;
    if (x < z.start + feather) return smoothstep((x - (z.start - feather)) / (2 * feather));
    return smoothstep(((z.end + feather) - x) / (2 * feather));
  }
  function rampWave(x, period, amp) {
    const t = ((x % period) + period) % period, frac = t / period;
    return frac < 0.7 ? (frac / 0.7) * amp : amp * (1 - (frac - 0.7) / 0.3) * 0.4;
  }

  function height(x) {
    let h = 0;
    for (const z of ZONES) {
      const w = zoneWeight(x, z); if (w <= 0) continue;
      if (z.key === 'hills1') h += w * (Math.sin(x / 140) * 80 + Math.sin(x / 35) * 15);
      else if (z.key === 'ice') h += w * -25;
      else if (z.key === 'gravel') h += w * (Math.sin(x / 40) * 20 + Math.cos(x / 18) * 15 + Math.sin(x / 7) * 8);
      else if (z.key === 'water') h += w * -90;
      else if (z.key === 'ramps') h += w * rampWave(x, 280, 140);
      else if (z.key === 'hills2') h += w * (Math.sin(x / 250) * 70 + Math.cos(x / 80) * 25);
    }
    return h;
  }

  function dominantZone(x) {
    let best = ZONES[0], bestW = -1;
    for (const z of ZONES) { const w = zoneWeight(x, z, 50); if (w > bestW) { bestW = w; best = z; } }
    return best || ZONES[0];
  }

  applyLayout(generateRandomLayout()); // Pre-genera una mappa sicura al caricamento

  return { 
    generateRandomLayout, applyLayout, height, frictionAt: (x) => FRICTION[dominantZone(x).key], colorAt: (x) => dominantZone(x).color, 
    get ZONES() { return ZONES; }, get FINISH_X() { return FINISH_X; }, get TRACK_END() { return TRACK_END; }, get TRACK_START() { return TRACK_START; } 
  };
})();
