/*
 * Terrain — a deterministic height field shared by physics (host only)
 * and rendering (everyone, including the minimap). Because it's a pure
 * function of x with no randomness, host and clients always agree on
 * what the track looks like without ever sending terrain data over the
 * network.
 */
const Terrain = (() => {
  const TRACK_START = -300;
  const TRACK_END = 6600;

  // Ordered zones covering the whole track, back to back.
  const ZONES = [
    { key: 'flatStart', start: -300, end: 1200, color: '#8fce6a', label: 'Partenza' },
    { key: 'hills1', start: 1200, end: 2600, color: '#5fa845', label: 'Colline' },
    { key: 'gravel', start: 2600, end: 3800, color: '#9a978c', label: 'Ghiaia' },
    { key: 'ramps', start: 3800, end: 4700, color: '#e07b2b', label: 'Rampe' },
    { key: 'hills2', start: 4700, end: 5700, color: '#5fa845', label: 'Colline' },
    { key: 'flatFinish', start: 5700, end: 6600, color: '#8fce6a', label: 'Arrivo' },
  ];

  // Grippy flat ground, slippery loose gravel, extra-grippy rubbery ramps.
  const FRICTION = {
    flatStart: 0.95, hills1: 0.95, gravel: 0.5, ramps: 1.05, hills2: 0.95, flatFinish: 0.95,
  };

  function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function zoneWeight(x, z, feather = 250) {
    if (x <= z.start - feather || x >= z.end + feather) return 0;
    if (x >= z.start + feather && x <= z.end - feather) return 1;
    if (x < z.start + feather) return smoothstep((x - (z.start - feather)) / (2 * feather));
    return smoothstep(((z.end + feather) - x) / (2 * feather));
  }

  // Repeating ramp: gradual climb, then a sharp drop — enough to launch a wheel.
  function rampWave(x, period, amp) {
    const t = ((x % period) + period) % period;
    const frac = t / period;
    return frac < 0.7 ? (frac / 0.7) * amp : amp * (1 - (frac - 0.7) / 0.3);
  }

  function height(x) {
    let h = 0;
    for (const z of ZONES) {
      const w = zoneWeight(x, z);
      if (w <= 0) continue;
      if (z.key === 'hills1') h += w * Math.sin(x / 260) * 55;
      else if (z.key === 'gravel') h += w * (Math.sin(x / 70) * 14 + Math.sin(x / 33) * 9);
      else if (z.key === 'ramps') h += w * rampWave(x, 220, 60);
      else if (z.key === 'hills2') h += w * Math.sin(x / 320) * 30;
      // flatStart / flatFinish add nothing — stay level
    }
    return h;
  }

  function dominantZone(x) {
    let best = ZONES[0], bestW = -1;
    for (const z of ZONES) {
      const w = zoneWeight(x, z, 50);
      if (w > bestW) { bestW = w; best = z; }
    }
    return best;
  }

  function frictionAt(x) { return FRICTION[dominantZone(x).key]; }
  function colorAt(x) { return dominantZone(x).color; }

  return { TRACK_START, TRACK_END, ZONES, height, frictionAt, colorAt };
})();
