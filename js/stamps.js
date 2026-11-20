// Timbri di percorso: tre per gara, uno per terzo di pista. Layout e disegno sono identici su host e client.
// Raccolti tutti, sbloccano lo "scatto del mondo" (vedi BUFFS): vale solo per la gara in corso.
const RouteStamps = (() => {
  const TAU = Math.PI * 2;
  let track = null, stamps = [];
  const bursts = [];   // anelli d'inchiostro al momento della raccolta (solo grafica)

  // Una sola fonte dei colori: [cielo, inchiostro]. Li usano cartolina, timbri in gara, contorno/glow del pulsante e scia dello scatto.
  const COLORS = {
    classic: ['#fde0ae','#4d8567'], neon: ['#d8c2ff','#3c336d'], egypt: ['#fee4a1','#a85c37'],
    atlantis: ['#bceeea','#236c83'], enchanted: ['#dcebb8','#3c735e'],
    paradise: ['#fff0bb','#8d7180'], inferno: ['#ffbd91','#783b45']
  };
  function colors(world) { const [sky, ink] = COLORS[world] || COLORS.classic; return {sky, ink}; }
  function worldKey() {
    const seg = Terrain.WORLD_SEGMENT;
    const w = (seg && seg.world) || Terrain.WORLD || 'classic';
    return COLORS[w] ? w : 'classic';
  }

  // Scatto del mondo. Sono varianti, non potenziamenti puri: ognuna cede qualcosa in cambio di qualcosa.
  // ms = durata, rc = ricarica (ms), mult = moltiplicatore di spinta (null = quello base), lift = gravità tolta in aria, ring = ricarica per anello.
  const BUFFS = {
    classic:   {id: 'ink',    ms: 1700, rc: 18000, mult: null},
    neon:      {id: 'spark',  ms: 1300, rc: 15000, mult: 1.40},
    egypt:     {id: 'sand',   ms: 1700, rc: 22000, mult: null},          // durante lo scatto le maledizioni non colpiscono
    atlantis:  {id: 'tide',   ms: 1700, rc: 22000, mult: 1.45, lift: .34},
    enchanted: {id: 'ring',   ms: 1700, rc: 22000, mult: null, ring: .35},
    paradise:  {id: 'breeze', ms: 2200, rc: 22000, mult: 1.30},
    inferno:   {id: 'flame',  ms: 1200, rc: 26000, mult: 1.85}
  };

  function route() {
    if (track === Terrain.ZONES) return stamps;
    track = Terrain.ZONES;
    stamps = []; bursts.length = 0;
    const segment = Terrain.WORLD_SEGMENT;
    const first = segment ? segment.start : 500;
    const last = segment ? segment.end : Terrain.FINISH_X - 400;
    const hazards = [...Terrain.INTERACTIVE_OBSTACLES, ...Terrain.DYNAMIC_OBSTACLES,
      ...Terrain.NEON_GATES, ...Terrain.AIR_RINGS, ...Terrain.PORTALS, ...Terrain.EGYPT_MUMMIES];
    for (let i = 0; i < 3; i++) {
      const start = first + (last - first) * i / 3;
      const end = first + (last - first) * (i + 1) / 3;
      const mid = Math.round((start + end) / 2);
      let chosen = null;
      for (let dx = 0; dx < (end - start) / 2 - 120 && chosen === null; dx += 70) {
        for (const x of [mid + dx, mid - dx]) {
          if (!Terrain.landOk(x) || !Terrain.landOk(x - 85) || !Terrain.landOk(x + 85)) continue;
          if (hazards.some(h => Math.abs(x - h.x) < (h.width || 110) / 2 + 160)) continue;
          chosen = x; break;
        }
      }
      if (chosen !== null) stamps.push({x: chosen, height: Terrain.height(chosen) + [78, 158, 226][i], kind: i, bit: 1 << i});
    }
    return stamps;
  }

  function collect(mask, front, rear, groundY) {
    for (const stamp of route()) {
      if ((mask & stamp.bit) || Math.abs(stamp.x - (front.x + rear.x) / 2) > Math.abs(front.x - rear.x) / 2 + 48) continue;
      const dx = front.x - rear.x, dy = front.y - rear.y;
      const x = stamp.x - rear.x, y = groundY - stamp.height - rear.y;
      const along = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - along * dx, y - along * dy) <= 48) mask |= stamp.bit;
    }
    return mask;
  }

  function count(mask) { return route().filter(s => mask & s.bit).length; }
  function complete(mask) { const n = route().length; return n > 0 && count(mask) === n; }
  // Lo scatto del mondo, solo a set completo; null altrimenti.
  function buff(mask) { return complete(mask || 0) ? BUFFS[worldKey()] : null; }
  function burst(bits) { for (const s of route()) if (bits & s.bit) bursts.push({s, t: null}); }

  // ---- simboli: tre per mondo (basso, medio, alto), disegnati in un riquadro di circa ±12 px ----
  const poly = (c, pts, fill) => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); fill ? c.fill() : c.stroke(); };
  const star = (c, n, ro, ri) => { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, r = i % 2 ? ri : ro; i ? c.lineTo(r * Math.cos(a), r * Math.sin(a)) : c.moveTo(r * Math.cos(a), r * Math.sin(a)); } c.closePath(); c.fill(); };
  const sun = c => { c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill(); for (let i = 0; i < 8; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -9); c.lineTo(0, -12); c.stroke(); } };
  const GLYPHS = {
    classic: [sun,
      c => poly(c, [[-11, 8], [-3, -8], [1, -1], [5, -6], [12, 8]]),
      c => star(c, 5, 12, 5)],
    neon: [
      c => poly(c, [[3, -12], [-7, 2], [-1, 2], [-4, 12], [7, -3], [1, -3]], true),
      c => { c.strokeRect(-10, 0, 6, 10); c.strokeRect(-3, -8, 7, 18); c.strokeRect(5, -3, 6, 13); },
      c => { poly(c, [[0, -12], [10, 0], [0, 12], [-10, 0]]); c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill(); }],
    egypt: [
      c => { poly(c, [[-11, 9], [0, -10], [11, 9]]); c.beginPath(); c.moveTo(-5, 1); c.lineTo(5, 1); c.stroke(); },
      c => { c.beginPath(); c.ellipse(0, 2, 6, 8, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(0, -8, 3, 0, TAU); c.fill();
             for (const s of [-1, 1]) for (const y of [-1, 3, 7]) { c.beginPath(); c.moveTo(s * 6, y); c.lineTo(s * 11, y + 2); c.stroke(); } },
      sun],
    atlantis: [
      c => { for (const y of [-4, 4]) { c.beginPath(); c.moveTo(-11, y); c.quadraticCurveTo(-7, y - 6, -3, y); c.quadraticCurveTo(1, y + 6, 5, y); c.quadraticCurveTo(8, y - 4, 11, y); c.stroke(); } },
      c => { c.beginPath(); c.arc(0, 6, 11, Math.PI, TAU); c.closePath(); c.stroke();
             for (const a of [.35, Math.PI / 2, Math.PI - .35]) { c.beginPath(); c.moveTo(0, 6); c.lineTo(11 * Math.cos(Math.PI + a), 6 + 11 * Math.sin(Math.PI + a)); c.stroke(); } },
      c => { c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill(); c.fillStyle = '#fff3ca'; c.beginPath(); c.arc(-3, -3, 2.4, 0, TAU); c.fill(); }],
    enchanted: [
      c => { c.beginPath(); c.moveTo(-10, 9); c.quadraticCurveTo(-12, -8, 10, -10); c.quadraticCurveTo(12, 8, -10, 9); c.closePath(); c.stroke();
             c.beginPath(); c.moveTo(-8, 8); c.lineTo(6, -6); c.stroke(); },
      c => { c.beginPath(); c.arc(0, 0, 10, Math.PI, TAU); c.closePath(); c.fill(); c.strokeRect(-3, 0, 6, 10); },
      c => { c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill(); c.fillStyle = '#fff3ca'; c.beginPath(); c.arc(4, -3, 8.5, 0, TAU); c.fill(); }],
    paradise: [
      c => { c.beginPath(); c.arc(-5, 3, 5, Math.PI * .5, Math.PI * 1.5); c.arc(-1, -3, 6, Math.PI, TAU); c.arc(6, 2, 5, Math.PI * 1.5, Math.PI * .5); c.closePath(); c.stroke(); },
      c => { c.beginPath(); c.moveTo(-11, 6); c.quadraticCurveTo(-6, -10, 11, -8); c.quadraticCurveTo(4, -2, 8, 0); c.quadraticCurveTo(2, 2, 5, 5); c.quadraticCurveTo(-2, 6, -1, 9); c.closePath(); c.stroke(); },
      c => { c.beginPath(); c.ellipse(0, -6, 9, 3, 0, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 5, 5, 0, TAU); c.fill(); }],
    inferno: [
      c => { c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(11, 0, 6, 8); c.quadraticCurveTo(0, 13, -6, 8); c.quadraticCurveTo(-9, 2, -3, -3); c.quadraticCurveTo(-2, -8, 0, -12); c.closePath(); c.fill(); },
      c => { poly(c, [[-11, 9], [-3, -6], [3, -6], [11, 9]]); c.beginPath(); c.moveTo(-1, -9); c.lineTo(-3, -12); c.moveTo(2, -9); c.lineTo(4, -12); c.stroke(); },
      c => star(c, 4, 12, 3)]
  };
  function glyph(c, world, kind, ink) {
    c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 2.6; c.lineJoin = 'round'; c.lineCap = 'round';
    (GLYPHS[world] || GLYPHS.classic)[kind](c);
  }

  function draw(c, camX, width, groundY, mask, time) {
    const ink = colors(worldKey()).ink, world = worldKey();
    for (const s of route()) {
      const x = s.x - camX;
      if ((mask & s.bit) || x < -35 || x > width + 35) continue;
      c.save();
      c.translate(x, groundY - s.height + 2 * Math.sin(time / 350 + s.kind));
      c.rotate(-0.09);
      c.fillStyle = '#fff3ca'; c.strokeStyle = ink; c.lineWidth = 2.8;
      c.beginPath(); c.roundRect(-24,-16,48,32,5); c.fill(); c.stroke();
      c.setLineDash([2,3]); c.beginPath(); c.moveTo(12,-15); c.lineTo(12,15); c.stroke(); c.setLineDash([]);
      c.translate(-5,0);
      glyph(c, world, s.kind, ink);
      c.restore();
    }
    // anello d'inchiostro dove il timbro è stato appena preso
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; if (b.t === null) b.t = time;
      const k = (time - b.t) / 420;
      if (k >= 1 || k < 0) { bursts.splice(i, 1); continue; }
      const x = b.s.x - camX; if (x < -90 || x > width + 90) continue;
      c.save(); c.translate(x, groundY - b.s.height); c.globalAlpha = 1 - k; c.strokeStyle = ink; c.lineCap = 'round';
      c.lineWidth = 5 * (1 - k) + 1; c.beginPath(); c.arc(0, 0, 14 + 38 * k, 0, TAU); c.stroke();
      c.lineWidth = 3;
      for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4 + .2; c.beginPath(); c.moveTo((24 + 40 * k) * Math.cos(a), (24 + 40 * k) * Math.sin(a)); c.lineTo((32 + 48 * k) * Math.cos(a), (32 + 48 * k) * Math.sin(a)); c.stroke(); }
      c.restore();
    }
  }

  function postcard(canvas, world, racer, wheel, title) {
    const {sky, ink} = colors(world);
    canvas.width = 1000; canvas.height = 520;
    const c = canvas.getContext('2d');
    // ogni cartolina è diversa: il seme si sceglie a caso la prima volta e resta sul risultato, così anteprima e PNG scaricato sono identici
    if (racer && !racer.cardSeed) racer.cardSeed = (Math.random() * 4294967296) >>> 0;
    const plan = (typeof PostcardScenes !== 'undefined' && world !== 'neon') ? PostcardScenes.plan(world, racer ? racer.cardSeed : (Math.random() * 4294967296) >>> 0, sky, ink) : null;
    if (plan) plan.wheel = wheel;
    const psky = plan ? plan.pal.sky : sky, pink = plan ? plan.pal.ink : ink;   // la luce cambia a ogni cartolina (giorno, tramonto, notte...), i testi sotto restano nei colori del mondo
    const sun = plan ? plan.sun : {x: 787, y: 122, r: 63};
    c.fillStyle = '#fff5dc'; c.fillRect(0,0,1000,520);
    c.save(); c.beginPath(); c.rect(24,24,952,338); c.clip();
    c.fillStyle = psky; c.fillRect(24,24,952,338);
    if (!plan || !plan.hideSun) { c.fillStyle = plan ? plan.pal.sun : '#fff4c2'; c.beginPath(); c.arc(sun.x,sun.y,sun.r,0,Math.PI*2); c.fill(); }
    if (plan) PostcardScenes.back(c, plan, world, psky, pink);   // anelli rotanti, archi, aloni: cambiano a ogni cartolina
    // Translucent, faceted ridges printed in the same two inks as the ride.
    for (let layer=0; layer<2; layer++) {
      const y=211+layer*38; c.fillStyle=pink; c.globalAlpha=.17+layer*.11;
      c.beginPath(); c.moveTo(23,362);
      for(let i=0;i<=13;i++) c.lineTo(23+i*80, y+Math.sin(i*2.37+layer*2)*26-Math.cos(i*1.4)*15);
      c.lineTo(1000,362);c.closePath();c.fill();
    }
    c.globalAlpha=1;
    if (typeof WorldArtV19 !== 'undefined') WorldArtV19.drawVisitor(c,world,sun.x < 500 ? 780 : 190,59,150);
    if (world === 'neon') {
      for (let i=0; i<17; i++) {
        const x=20+60*i, y=145+Math.cos(i*2.3)*46;
        c.fillStyle='#a59bc3'; c.fillRect(x,y,47,230);
        c.fillStyle='#c8f3dd';
        for(let row=0;row<3;row++) c.fillRect(x+7,y+11+row*12,32,3);
      }
    }
    const samples = Array.from({length:480}, (_,i) => Terrain.height(Terrain.FINISH_X*i/479));
    const max = Math.max(...samples), min = Math.min(...samples);
    // il paesaggio del mondo poggia sull'orizzonte della sagoma (non sul fondo): così resta visibile qualunque sia il tracciato
    const tops = samples.map(v => 301-(v-min)*102/Math.max(1,max-min)).sort((x,y) => x-y);
    if (plan) PostcardScenes.mid(c, plan, world, psky, pink, Math.max(262, Math.min(318, tops[Math.floor(tops.length*.3)] + 16)));
    c.fillStyle = pink; c.beginPath(); c.moveTo(24,362);
    samples.forEach((v,i) => c.lineTo(24+952*i/479,301-(v-min)*102/Math.max(1,max-min)));
    c.lineTo(976,362); c.closePath(); c.fill();
    c.fillStyle = '#fff5dc'; c.font = 'bold 39px system-ui'; c.fillText(title,51,342,875);
    if (racer.finished) {   // il tempo grande dentro l'immagine: è la cosa che la gente vuole far vedere
      const t = (racer.finishTime/1000).toFixed(2), tx = 950; c.textAlign = 'right'; c.lineJoin = 'round'; c.strokeStyle = pink; c.fillStyle = '#fff5dc';
      c.font = 'bold 30px system-ui'; c.lineWidth = 7; c.strokeText('s', tx, 340); c.fillText('s', tx, 340);   // l'unità piccola a destra, il numero grande accanto
      c.font = 'bold 78px system-ui'; c.lineWidth = 11; c.strokeText(t, tx - 24, 341); c.fillText(t, tx - 24, 341); c.textAlign = 'left';
    }
    c.restore();
    c.fillStyle = ink; c.font = 'bold 20px system-ui'; c.fillText('DOODLE WHEELS',48,401);
    c.font = 'bold 43px system-ui'; c.fillText(racer.name,46,461,470);
    if (racer.finished) { c.font = '24px system-ui'; c.fillText((racer.finishTime/1000).toFixed(2)+' s',49,494); }
    c.strokeStyle = ink; c.lineWidth = 2; c.setLineDash([3,8]); c.beginPath(); c.moveTo(678,382); c.lineTo(678,496); c.stroke(); c.setLineDash([]);
    if (wheel && wheel.length >= 3) {
      const radius = Math.max(1,...wheel.map(p => Math.hypot(p.x,p.y)));
      c.beginPath(); wheel.forEach((p,i) => {
        const x=882+p.x*39/radius, y=442+p.y*39/radius;
        if(i) c.lineTo(x,y); else c.moveTo(x,y);
      });
      c.closePath(); c.lineWidth = 5; c.stroke();
    }
    // francobolli: quelli raccolti pieni e timbrati, gli altri solo come riquadro vuoto
    const list = route(), mask = racer.stampMask || 0, got = count(mask);
    list.forEach((s, i) => {
      const x = 698 + i * 46, y = 401, have = mask & s.bit;
      c.save();
      c.fillStyle = have ? '#fffaf0' : 'rgba(255,250,240,.35)'; c.fillRect(x, y, 40, 50);
      c.strokeStyle = ink; c.lineWidth = 3; c.setLineDash([2.5, 3.5]); c.strokeRect(x, y, 40, 50);   // dentellatura
      c.setLineDash(have ? [] : [4, 4]); c.lineWidth = 1.5; c.strokeRect(x + 5, y + 5, 30, 40);
      if (have) { c.translate(x + 20, y + 25); c.scale(.95, .95); glyph(c, world, s.kind, ink); }
      c.restore();
    });
    if (got) {   // annullo postale ondulato sopra i francobolli
      c.save(); c.strokeStyle = ink; c.globalAlpha = .55; c.lineWidth = 2.2; c.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        c.beginPath(); const y0 = 412 + k * 13;
        for (let x = 690; x <= 836; x += 4) { const y = y0 + Math.sin((x - 690) / 8 + k) * 3 - (x - 690) * .05; x === 690 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
      }
      c.restore();
    }
    if (list.length && got === list.length) { c.strokeStyle = '#d9a521'; c.lineWidth = 3; c.beginPath(); c.roundRect(690, 393, 152, 66, 8); c.stroke(); }
    c.fillStyle = ink; c.textAlign = 'center'; c.font = 'bold 22px system-ui';
    c.fillText(got+' / '+list.length, 765, 487);
  }
  return {route, collect, draw, count, complete, buff, burst, colors, worldKey, postcard};
})();
