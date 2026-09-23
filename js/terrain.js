const Terrain = (() => {
  let TRACK_START = -300, TRACK_END = 12000, FINISH_X = 11500, ZONES = [];
  
  const ZONE_TYPES = ['hills', 'ice', 'gravel', 'water', 'ramps'];
  const ZONE_COLORS = {
    start: '#10b981', hills: '#059669', ice: '#7dd3fc',
    gravel: '#94a3b8', water: '#3b82f6', ramps: '#f59e0b', finish: '#10b981'
  };
  const FRICTION = { start: 0.9, hills: 0.9, ice: 0.02, gravel: 0.6, water: 0.95, ramps: 1.1, finish: 0.9 };

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

  function height(x) {
    if (x < 500 || x > TRACK_END - 500) return 0;
    
    let h = 0;
    
    if (x >= 1200 && x < 3200) {
      h = 50 + Math.sin(x / 120) * 8; 
    } 
    else if (x >= 3200 && x < 5200) {
      let progress = (x - 3200) / 2000;
      h = 40 - Math.sin(progress * Math.PI) * 90; 
    } 
    else if (x >= 5200 && x < 8000) {
      let progress = (x - 5200) / 2800;
      h = progress * 130 + Math.sin(progress * Math.PI * 4) * 20; 
    } 
    else {
      h = Math.sin(x / 250) * 50; 
    }
    
    let z = dominantZone(x);
    if (z.key === 'ice') h -= 15;
    if (z.key === 'water') h -= 60; 
    if (z.key === 'ramps') h += Math.abs(Math.sin(x / 90)) * 45; 

    return h;
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
})();
