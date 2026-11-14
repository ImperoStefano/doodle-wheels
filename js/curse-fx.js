/* Doodle Wheels V34 — purely visual mummy-linen release.
   The authoritative host retains the cursed rear-wheel collider. This animation
   runs only on clients and cannot affect speed, physics, or multiplayer state. */
const CurseFx = (() => {
  'use strict';
  const previous = new Map(), falling = new Map();
  const LIFE_MS = 1150;
  function reset() { previous.clear(); falling.clear(); }
  function draw(ctx, id, racer, visible, camX, projectY, now) {
    // A new spectator/race snapshot should not create false release effects.
    const was = previous.get(id);
    const cursed = (racer.cu || 0) > 0.05;
    if (was === true && !visible && cursed && Number.isFinite(racer.rwX) && Number.isFinite(racer.rwY)) {
      falling.set(id, { t: now, x: racer.rwX, y: racer.rwY,
        rotation: racer.rwAngle || 0, scale: racer.sc || 1 });
    }
    previous.set(id, visible && cursed);
    const fx = falling.get(id);
    if (!fx) return;
    const age = now - fx.t;
    if (age < 0 || age >= LIFE_MS) { falling.delete(id); return; }
    const t = age / 1000;
    const fade = Math.max(0, 1 - Math.pow(age / LIFE_MS, 1.35));
    const spread = (11 + t * 57) * Math.min(fx.scale, 1.7);
    const baseX = fx.x - camX, baseY = projectY(fx.y);
    ctx.save(); ctx.globalAlpha *= fade;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 6; i++) {
      const theta = fx.rotation + i * 2.39996;
      const drift = Math.sin(theta + i * .8) * spread + t * (i % 2 ? 18 : -29);
      const x = baseX + drift, y = baseY + 18 * Math.cos(theta) + 82 * t * t + i * t * 9;
      const width = 3.8 + (i % 3) * 1.1;
      ctx.beginPath(); ctx.moveTo(x - 9, y - 5);
      ctx.quadraticCurveTo(x + 3 + 9 * Math.sin(theta + t * 8), y - 12 - 7 * t,
        x + 13 + t * 17, y + 7 + t * 9);
      ctx.strokeStyle = i % 2 ? '#f5e4be' : '#e7d2a5'; ctx.lineWidth = width; ctx.stroke();
      ctx.strokeStyle = 'rgba(129,98,66,.54)'; ctx.lineWidth = .9; ctx.stroke();
    }
    ctx.restore();
  }
  return { draw, reset };
})();
