/* Doodle Wheels V20 — emote near visible bikes, edge indicators for off-screen players.
 * Pure CSS-pixel layout, shared by desktop/mobile; no dependence on camera zoom.
 */
const EmoteLayout = (() => {
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function layout(anchors, viewport) {
    if (!Array.isArray(anchors) || !anchors.length) return [];
    const w = viewport.width, h = viewport.height;
    if (!(w > 0 && h > 0)) return [];
    const small = !!viewport.compact, short = h < 450;
    const edge = 6, gap = 6;
    const placed = [];
    const avoid = Array.isArray(viewport.avoid) ? viewport.avoid : [];
    for (const a of anchors) {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) continue;
      const offscreen = !!a.offscreen;
      const side = offscreen ? (a.side || (a.x < 0 ? 'left' : 'right')) : null;
      const icon = offscreen ? (short ? 38 : small ? 44 : 48) : (small ? 72 : 84);
      const hw = icon / 2 + (offscreen ? 8 : 10);
      const hh = icon / 2 + (offscreen ? 7 : 8);
      const tail = offscreen ? 7 : 12;
      const occupiedH = 2 * hh + tail;
      const xMin = hw + edge, xMax = Math.max(xMin, w - hw - edge);
      const yMin = hh + edge, yMax = Math.max(yMin, h - hh - tail - edge);
      const rawName = String(a.name || 'Giocatore');
      const maxChars = w < 420 ? 8 : w < 600 ? 10 : 13;
      const displayName = rawName.length <= maxChars ? rawName :
        rawName.slice(0, maxChars - 2) + '…' + rawName.slice(-1);
      const tagW = offscreen ? Math.min(108, 22 + displayName.length * 6.3) : 0;
      let x0, y0;
      if (offscreen) {
        if (side === 'left') x0 = xMin + 2;
        else if (side === 'right') x0 = xMax - 2;
        else x0 = clamp(a.x, xMin + tagW / 2, xMax - tagW / 2);
        // Mantieni gli indicatori lontani dai comandi in basso e dall'HUD in alto.
        const top = short ? 60 : 112;
        const bottom = short ? 35 : 100;
        const lo = clamp(top, yMin, yMax), hi = clamp(h - bottom, lo, yMax);
        y0 = side === 'up' ? lo : side === 'down' ? hi : clamp(a.y, lo, hi);
      } else {
        x0 = clamp(a.x, xMin, xMax);
        y0 = clamp(a.y - (small ? 52 : 83) - tail - hh - (a.drift || 0), yMin, yMax);
      }
      const boxAt = (x,y) => ({
        x1: x - hw - ((offscreen && side === 'right') ? tagW + 7 : 0),
        y1: y - hh,
        x2: x + hw + ((offscreen && side === 'left') ? tagW + 7 : 0),
        y2: y + hh + tail,
      });
      let best = null;
      const candidates = [];
      if (offscreen && (side === 'left' || side === 'right')) {
        // Tutti gli avversari lontani rimangono sulla loro estremità dello schermo.
        // Cerca posizioni verticali in modo da visualizzarli anche simultaneamente.
        const minY = clamp(short ? 46 : 105, yMin, yMax);
        const maxY = clamp(h - (short ? 30 : 70), minY, yMax);
        candidates.push([x0, clamp(y0, minY, maxY)]);
        for (let yy = minY; yy <= maxY; yy += 6) candidates.push([x0, yy]);
        candidates.push([x0, maxY]);
      } else {
        for (const row of [0,-1,1,-2,2,-3,3]) {
          const yy = clamp(y0 + row * (occupiedH + gap), yMin, yMax);
          for (const col of [0,1,-1,2,-2,3,-3]) {
            candidates.push([clamp(x0 + col * (2 * hw + gap), xMin, xMax), yy]);
          }
        }
      }
      for (const [x,y] of candidates) {
        const rect = boxAt(x,y);
        let overlap = 0;
        for (const p of placed) {
          const iw = Math.max(0, Math.min(rect.x2 + gap, p.rect.x2) - Math.max(rect.x1 - gap, p.rect.x1));
          const ih = Math.max(0, Math.min(rect.y2 + gap, p.rect.y2) - Math.max(rect.y1 - gap, p.rect.y1));
          overlap += iw * ih;
        }
        // HUD, minimap and touch buttons are drawn above the canvas: avoid placing
        // a chip underneath one of them (including an opened emote picker).
        for (const block of avoid) {
          if (!block || !Number.isFinite(block.x1)) continue;
          const iw = Math.max(0, Math.min(rect.x2 + gap, block.x2) - Math.max(rect.x1 - gap, block.x1));
          const ih = Math.max(0, Math.min(rect.y2 + gap, block.y2) - Math.max(rect.y1 - gap, block.y1));
          overlap += iw * ih;
        }
        const movement = (x - x0) ** 2 + 0.85 * (y - y0) ** 2;
        const score = overlap * 9000 + movement;
        if (!best || score < best.score) best = {x,y,rect,score};
      }
      if (best) placed.push({...a, x:best.x, y:best.y, icon, displayName, side, offscreen, rect:best.rect});
    }
    return placed.map(({rect,score,...a}) => a);
  }
  return {layout};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = EmoteLayout;
