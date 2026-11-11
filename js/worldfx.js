// WorldFX — effetti e dettagli extra dei mondi speciali (Atlantide, Bosco Incantato, Città Neon, Paradiso, Inferno).
// Due livelli: drawGround (decorazioni sul terreno, dietro a ruote e ostacoli) e drawFore (particelle e luci in primo piano).
// Tutto è deterministico rispetto alla coordinata di pista (stesse decorazioni per tutti i giocatori), usa sprite pre-renderizzati
// per i bagliori (niente shadowBlur) e rispetta la qualità grafica: qualità 1 = metà particelle, qualità 2 = nessun effetto.
const WorldFX = (() => {
  const TAU = Math.PI * 2;
  const fr = v => v - Math.floor(v);
  const H = (a, b = 0) => fr(Math.sin(a * 12.9898 + b * 78.233 + 4.17) * 43758.5453);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mod = (v, m) => ((v % m) + m) % m;

  // ---- sprite di bagliore (cerchio sfumato) in cache ------------------------------------------
  const sprites = {};
  function glow(col) {
    if (sprites[col]) return sprites[col];
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col); gr.addColorStop(0.25, col.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (sprites[col] = c);
  }
  const blob = (ctx, col, x, y, r, a = 1) => { ctx.globalAlpha = a; ctx.drawImage(glow(col), x - r, y - r, r * 2, r * 2); };

  // ---- quale mondo è attivo e con che intensità (dissolvenza ai bordi del tratto speciale) ---------
  function active(camX, w) {
    const seg = Terrain.WORLD_SEGMENT, mid = camX + w * 0.5;
    if (seg && seg.world) {
      const k = clamp(Math.min(mid - (seg.start - 320), (seg.end + 320) - mid) / 320, 0, 1);
      return k > 0.01 ? { world: seg.world, k, seg } : null;
    }
    const wd = Terrain.WORLD;
    return wd && wd !== 'classic' ? { world: wd, k: 1, seg: null } : null;
  }
  const qual = () => (typeof Scenery !== 'undefined' ? Scenery.quality : 0);
  const groundAt = (gy, x) => gy - Terrain.height(x);
  const slopeAt = x => Math.atan2(-(Terrain.height(x + 16) - Terrain.height(x - 16)), 32);

  // =============================================================================================
  //  DECORAZIONI SUL TERRENO
  // =============================================================================================
  function props(ctx, camX, w, gy, t, A) {
    const cell = A.world === 'atlantis' ? 150 : A.world === 'enchanted' ? 130 : A.world === 'neon' ? 170 : (A.world === 'inferno' || A.world === 'paradise') ? 235 : 0; if (!cell) return;
    const seed = A.world === 'atlantis' ? 1 : A.world === 'enchanted' ? 2 : A.world === 'neon' ? 3 : A.world === 'inferno' ? 4 : 5;
    const i0 = Math.floor((camX - 120) / cell), i1 = Math.floor((camX + w + 120) / cell);
    for (let i = i0; i <= i1; i++) {
      if (H(i, seed) > 0.66) continue;
      const wx = i * cell + H(i, seed + 9) * cell * 0.7, sx = wx - camX;
      if (A.seg && (wx < A.seg.start - 30 || wx > A.seg.end + 30)) continue;
      if (Math.abs(Terrain.height(wx + 14) - Terrain.height(wx - 14)) > 34) continue;   // niente sulle pareti ripide
      const y = groundAt(gy, wx), ang = slopeAt(wx), kind = Math.floor(H(i, seed + 5) * 6), r = H(i, seed + 3), ph = H(i, seed + 7) * 6.28;
      ctx.save(); ctx.translate(sx, y + 1); ctx.rotate(ang); ctx.globalAlpha = A.k;
      if (A.world === 'atlantis') atlantisProp(ctx, kind, r, ph, t, wx);
      else if (A.world === 'enchanted') enchantedProp(ctx, kind, r, ph, t, wx);
      else if (A.world === 'neon') neonProp(ctx, kind, r, ph, t, wx);
      else if (A.world === 'inferno') infernoProp(ctx, kind, r, ph, t);
      else paradiseProp(ctx, kind, r, ph, t);
      ctx.restore();
    }
  }

  // Ostacoli scenici al suolo: niente cespugli, sassi o arredi di altri biomi.
  function infernoProp(ctx, kind, r, ph, t) {
    if (kind % 3 === 0) { // lama di roccia gotica, a lato della traiettoria
      ctx.fillStyle='#322237';ctx.strokeStyle='#b05b70';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-16,2);ctx.lineTo(-9,-26-r*23);ctx.lineTo(0,-55-r*37);ctx.lineTo(9,-17);ctx.lineTo(18,2);ctx.closePath();ctx.fill();ctx.stroke();
    } else if (kind % 3 === 1) { // anime che sorgono nel vento
      ctx.globalAlpha *= .64;ctx.fillStyle='#a87895';ctx.beginPath();ctx.arc(0,-29,7,0,TAU);ctx.fill();
      ctx.beginPath();ctx.moveTo(-6,-20);ctx.quadraticCurveTo(-28,-8,-17,0);ctx.quadraticCurveTo(8,-6,19,-22);ctx.quadraticCurveTo(10,1,18,5);ctx.lineTo(-12,5);ctx.closePath();ctx.fill();
    } else { // ceneri e schegge al suolo
      ctx.strokeStyle='#ea897d';ctx.lineWidth=2;ctx.beginPath();
      for(let j=0;j<4;j++){let x=(j-1.5)*13;ctx.moveTo(x,0);ctx.lineTo(x+Math.sin(t*2+ph+j)*5,-12-j*5)}ctx.stroke();
    }
  }
  function paradiseProp(ctx, kind, r, ph, t) {
    if(kind%3===0){ctx.fillStyle='#f8f5e3';ctx.strokeStyle='#d6b878';ctx.lineWidth=2;ctx.fillRect(-7,-39-r*19,14,39+r*19);ctx.strokeRect(-7,-39-r*19,14,39+r*19);ctx.beginPath();ctx.arc(0,-40-r*19,12,Math.PI,0);ctx.stroke();}
    else if(kind%3===1){ctx.fillStyle='#f2e2a2';ctx.beginPath();ctx.ellipse(0,-9,16,4,0,0,TAU);ctx.fill();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(-7,-13,12,9,0,0,TAU);ctx.ellipse(7,-14,12,10,0,0,TAU);ctx.fill();}
    else {ctx.strokeStyle='#e9d6a0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-27);ctx.moveTo(-9,-18);ctx.lineTo(9,-18);ctx.stroke();}
  }

  function atlantisProp(ctx, kind, r, ph, t) {
    if (kind === 0) {              // stella marina
      const R = 8 + r * 5; ctx.rotate(-0.35 + r); ctx.translate(0, -R * 0.45);
      ctx.fillStyle = r > 0.5 ? '#ff9a62' : '#f27ea8'; ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.42 : R; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,240,210,0.7)';
      for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, 1.4, 0, TAU); ctx.fill(); }
    } else if (kind === 1) {       // alghe che ondeggiano
      for (let j = 0; j < 4; j++) {
        const hgt = 30 + H(r * 9, j) * 34, bx = (j - 1.5) * 7, sw = Math.sin(t * 1.25 + ph + j * 0.9) * (7 + hgt * 0.08);
        ctx.strokeStyle = j % 2 ? '#2fae8f' : '#1f8d7c'; ctx.lineWidth = 4.2 - j * 0.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.bezierCurveTo(bx - 6 + sw * 0.3, -hgt * 0.35, bx + 6 + sw * 0.8, -hgt * 0.68, bx + sw, -hgt); ctx.stroke();
      }
    } else if (kind === 2) {       // conchiglia aperta con perla
      ctx.fillStyle = '#c5a5e6'; ctx.beginPath(); ctx.ellipse(0, -5, 13, 7, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#9b7bc9'; ctx.beginPath(); ctx.ellipse(0, -2, 13, 3.2, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 2.6, -3); ctx.lineTo(k * 4.6, -11); ctx.stroke(); }
      const p = 0.7 + 0.3 * Math.sin(t * 2 + ph); ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(210,255,250,1)', 0, -6, 15 * p);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -6, 2.8, 0, TAU); ctx.fill();
    } else if (kind === 3) {       // anemone di mare
      for (let k = 0; k < 9; k++) {
        const bx = (k - 4) * 2.3, sw = Math.sin(t * 1.6 + ph + k * 0.7) * 5;
        ctx.strokeStyle = k % 2 ? '#ff8fb5' : '#ffb6cf'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx * 1.6 + sw * 0.4, -10, bx * 2.1 + sw, -18 - (k % 3) * 2); ctx.stroke();
        ctx.fillStyle = '#fff2f7'; ctx.beginPath(); ctx.arc(bx * 2.1 + sw, -18 - (k % 3) * 2, 1.7, 0, TAU); ctx.fill();
      }
    } else if (kind === 4) {       // ventaglio di corallo
      ctx.strokeStyle = r > 0.5 ? '#ff7f9c' : '#b779e8'; ctx.lineCap = 'round';
      for (let k = -3; k <= 3; k++) {
        const a = -Math.PI / 2 + k * 0.28, L = 26 - Math.abs(k) * 2.5; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke();
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Math.cos(a) * L * 0.55, Math.sin(a) * L * 0.55); ctx.lineTo(Math.cos(a + 0.5) * L * 0.85, Math.sin(a + 0.5) * L * 0.85); ctx.stroke();
      }
    } else {                       // piante bioluminescenti
      for (let j = 0; j < 3; j++) {
        const hgt = 20 + j * 9, bx = (j - 1) * 9, sw = Math.sin(t * 1.1 + ph + j) * 3;
        ctx.strokeStyle = '#1d8e86'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx + sw, -hgt * 0.5, bx + sw * 1.5, -hgt); ctx.stroke();
        const p = 0.6 + 0.4 * Math.sin(t * 2.2 + ph + j * 1.7); ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(110,255,240,1)', bx + sw * 1.5, -hgt, 12 * p + 3);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#d9fffb'; ctx.beginPath(); ctx.arc(bx + sw * 1.5, -hgt, 2.5, 0, TAU); ctx.fill();
      }
    }
  }

  function enchantedProp(ctx, kind, r, ph, t) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 1.7 + ph);
    if (kind === 0) {              // funghi luminosi
      for (let j = 0; j < 3; j++) {
        const bx = (j - 1) * 13, hh = 11 + (j === 1 ? 7 : 0) + r * 4, cr = 8 + (j === 1 ? 4 : 0);
        ctx.fillStyle = '#f0e2c8'; ctx.fillRect(bx - 2, -hh, 4, hh);
        ctx.fillStyle = j === 1 ? '#b45fe0' : '#4fc9c0'; ctx.beginPath(); ctx.ellipse(bx, -hh, cr, cr * 0.7, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(bx - cr * 0.35, -hh - cr * 0.3, 1.5, 0, TAU); ctx.arc(bx + cr * 0.3, -hh - cr * 0.15, 1.1, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(196,120,255,1)', 0, -12, 40 * pulse, 0.55); ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 1) {       // campanule azzurre
      for (let j = 0; j < 4; j++) {
        const hh = 20 + H(r * 7, j) * 14, bx = (j - 1.5) * 6, sw = Math.sin(t * 1.0 + ph + j) * 2.5;
        ctx.strokeStyle = '#2f7d4d'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx + 4 + sw, -hh * 0.6, bx + sw * 2, -hh); ctx.stroke();
        ctx.fillStyle = '#7fb5ff'; ctx.beginPath(); ctx.moveTo(bx + sw * 2 - 4, -hh); ctx.quadraticCurveTo(bx + sw * 2, -hh + 9, bx + sw * 2 + 4, -hh); ctx.quadraticCurveTo(bx + sw * 2, -hh - 4, bx + sw * 2 - 4, -hh); ctx.fill();
        ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(120,180,255,1)', bx + sw * 2, -hh + 3, 14 * pulse, 0.6); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    } else if (kind === 2) {       // felce
      ctx.strokeStyle = '#3f9a5a'; ctx.lineCap = 'round';
      for (let j = -3; j <= 3; j++) {
        const a = -Math.PI / 2 + j * 0.34 + Math.sin(t * 0.9 + ph + j) * 0.04, L = 30 - Math.abs(j) * 3.5; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a) * L * 0.5, Math.sin(a) * L * 0.5 - 6, Math.cos(a + 0.35) * L, Math.sin(a + 0.35) * L); ctx.stroke();
        ctx.lineWidth = 1; for (let k = 1; k < 5; k++) { const px = Math.cos(a + 0.2) * L * k / 5, py = Math.sin(a + 0.2) * L * k / 5 - 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 4, py + 3); ctx.moveTo(px, py); ctx.lineTo(px - 4, py + 3); ctx.stroke(); }
      }
    } else if (kind === 3) {       // cerchio di fate: punti luminosi in sequenza
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * TAU, x = Math.cos(a) * 34, y = Math.sin(a) * 4 - 3, p = Math.max(0, Math.sin(t * 2.4 - k * 0.7 + ph));
        ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,230,140,1)', x, y, 5 + p * 8, 0.35 + p * 0.65); ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
      }
    } else if (kind === 4) {       // sasso muschiato con runa
      ctx.fillStyle = '#4b5a63'; ctx.beginPath(); ctx.ellipse(0, -9, 17, 12, 0, Math.PI, 0); ctx.lineTo(17, 0); ctx.lineTo(-17, 0); ctx.fill();
      ctx.fillStyle = '#3f9a5a'; ctx.beginPath(); ctx.ellipse(-3, -17, 14, 5, -0.1, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = `rgba(150,255,210,${0.55 + 0.45 * pulse})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -13); ctx.moveTo(-4, -9); ctx.lineTo(4, -9); ctx.moveTo(-3, -12); ctx.lineTo(3, -6); ctx.stroke();
      ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(120,255,200,1)', 0, -9, 20 * pulse, 0.5); ctx.globalCompositeOperation = 'source-over';
    } else {                       // fiore-lanterna
      const sw = Math.sin(t * 1.2 + ph) * 3;
      ctx.strokeStyle = '#3b8a55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(9, -22, 3 + sw, -40); ctx.quadraticCurveTo(-1 + sw, -43, -2 + sw, -36); ctx.stroke();
      ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,200,90,1)', -2 + sw, -32, 24 * pulse, 0.75); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffd88a'; ctx.beginPath(); ctx.ellipse(-2 + sw, -32, 4.5, 6, 0, 0, TAU); ctx.fill();
    }
  }

  function neonProp(ctx, kind, r, ph, t, wx) {
    const chase = k => Math.max(0, Math.sin(t * 3.2 - k * 0.9 + ph));
    if (kind === 0 || kind === 3) {  // pozzanghera con riflessi al neon
      const W = 26 + r * 34;
      const g = ctx.createLinearGradient(-W, 0, W, 0); g.addColorStop(0, 'rgba(244,87,222,0.55)'); g.addColorStop(0.5, 'rgba(120,120,255,0.35)'); g.addColorStop(1, 'rgba(70,245,238,0.6)');
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 1, W, 3.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      for (let k = 0; k < 2; k++) { const q = fr(t * 0.8 + ph + k * 0.5); ctx.globalAlpha *= 1; ctx.beginPath(); ctx.ellipse((k ? 0.4 : -0.3) * W * 0.6, 1, 3 + q * 12, 0.7 + q * 2, 0, 0, TAU); ctx.globalAlpha = (1 - q) * 0.8; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 1) {         // sfiato di vapore
      ctx.fillStyle = '#1b1838'; ctx.fillRect(-12, -3, 24, 4); ctx.fillStyle = 'rgba(70,245,238,0.85)'; for (let k = -2; k <= 2; k++) ctx.fillRect(k * 4.5 - 1, -2.5, 2, 3);
      for (let k = 0; k < 5; k++) {
        const q = fr(t * 0.45 + ph + k / 5), x = Math.sin(q * 5 + k) * 6 + q * 9, y = -q * 62, rad = 5 + q * 15;
        ctx.globalAlpha = (1 - q) * 0.34; ctx.fillStyle = k % 2 ? '#c9b8ff' : '#a9f4ff'; ctx.beginPath(); ctx.arc(x, y - 4, rad, 0, TAU); ctx.fill();
      }
    } else if (kind === 2) {         // emettitore olografico
      ctx.fillStyle = '#231f4a'; ctx.fillRect(-9, -6, 18, 6); ctx.fillStyle = '#46f2ef'; ctx.fillRect(-9, -6, 18, 1.5);
      const g = ctx.createLinearGradient(0, -6, 0, -66); g.addColorStop(0, 'rgba(70,245,238,0.35)'); g.addColorStop(1, 'rgba(70,245,238,0)');
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(8, -6); ctx.lineTo(24, -66); ctx.lineTo(-24, -66); ctx.fill();
      const sx = Math.cos(t * 1.6 + ph), cy = -42 + Math.sin(t * 2 + ph) * 3; ctx.strokeStyle = '#8ffcff'; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.moveTo(0, cy - 15); ctx.lineTo(sx * 11, cy); ctx.lineTo(0, cy + 15); ctx.lineTo(-sx * 11, cy); ctx.closePath(); ctx.moveTo(0, cy - 15); ctx.lineTo(0, cy + 15); ctx.moveTo(sx * 11, cy); ctx.lineTo(-sx * 11, cy); ctx.stroke();
      blob(ctx, 'rgba(70,245,238,1)', 0, cy, 26, 0.5); ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 4) {         // bitta a righe con luce lampeggiante
      ctx.fillStyle = '#2a2560'; ctx.fillRect(-4, -22, 8, 22); ctx.fillStyle = '#f457de'; ctx.fillRect(-4, -18, 8, 3); ctx.fillRect(-4, -9, 8, 3);
      const on = Math.sin(t * 6 + ph) > 0; ctx.fillStyle = on ? '#ffe36b' : '#6b5b2a'; ctx.beginPath(); ctx.arc(0, -25, 3, 0, TAU); ctx.fill();
      if (on) { ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,220,90,1)', 0, -25, 20, 0.8); ctx.globalCompositeOperation = 'source-over'; }
    } else {                         // freccette al neon "a inseguimento" sul manto stradale
      for (let k = 0; k < 3; k++) {
        const a = 0.25 + chase(k) * 0.75; ctx.strokeStyle = k % 2 ? `rgba(244,87,222,${a})` : `rgba(70,245,238,${a})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-10 + k * 16, -8); ctx.lineTo(-3 + k * 16, -3); ctx.lineTo(-10 + k * 16, 2); ctx.stroke();
      }
    }
  }

  // =============================================================================================
  //  PRIMO PIANO: particelle, luci, atmosfera
  // =============================================================================================
  function drift(i, camX, w, f, off = 0) { return mod(H(i, 11 + off) * (w + 240) - camX * f, w + 240) - 120; }

  function fore(ctx, camX, w, gy, t, A, q) {
    const n = q === 1 ? 0.5 : 1, k = A.k;
    ctx.save();
    if (A.world === 'atlantis') {
      // marine snow + bolle in salita con riflesso
      ctx.fillStyle = 'rgba(210,255,250,0.55)';
      for (let i = 0; i < 34 * n; i++) { const x = drift(i, camX, w, 0.35 + H(i, 2) * 0.5), y = mod(H(i, 3) * gy * 0.95 + t * (6 + H(i, 4) * 9), gy * 0.95); ctx.globalAlpha = k * 0.5; ctx.fillRect(x, y, 1.6, 1.6); }
      for (let i = 0; i < 20 * n; i++) {
        const f = 0.55 + H(i, 5) * 0.7, rad = 2 + H(i, 6) * 5.5, x = drift(i, camX, w, f, 3) + Math.sin(t * 1.2 + i) * 8, y = gy - mod(t * (22 + rad * 6) + H(i, 7) * gy, gy * 1.05) + 10;
        ctx.globalAlpha = k * (0.55 + 0.25 * f); ctx.strokeStyle = 'rgba(214,255,250,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.24, 0, TAU); ctx.fill();
      }
      // banchi di pesciolini
      for (let s = 0; s < 2; s++) {
        const dir = s ? -1 : 1, base = mod(t * (38 + s * 11) * dir + s * 700 - camX * 0.25, w + 520) - 260, cy = gy * (0.22 + s * 0.17);
        for (let j = 0; j < 7 * Math.max(0.6, n); j++) {
          const x = base - dir * (j % 4) * 20 - dir * j * 5, y = cy + Math.sin(t * 1.5 + j * 1.3 + s) * 12 + (j % 3 - 1) * 14, flap = Math.sin(t * 9 + j) * 3;
          ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.globalAlpha = k * 0.85; ctx.fillStyle = s ? '#ffb347' : '#7fe7e0';
          ctx.beginPath(); ctx.ellipse(0, 0, 8, 3.6, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-13, -4 + flap); ctx.lineTo(-13, 4 + flap); ctx.fill();
          ctx.fillStyle = '#0b3948'; ctx.beginPath(); ctx.arc(4.5, -0.8, 0.9, 0, TAU); ctx.fill(); ctx.restore();
        }
      }
      // meduse luminose
      for (let j = 0; j < 2; j++) {
        const x = drift(j + 40, camX, w, 0.18, 1), y = gy * (0.2 + 0.18 * j) + Math.sin(t * 0.5 + j * 2) * 16, p = 0.5 + 0.5 * Math.sin(t * 1.6 + j * 2.3), bw = 22 - p * 4, bh = 15 + p * 5;
        ctx.globalAlpha = k; ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,140,230,1)', x, y, 50, 0.45);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = k * 0.75; ctx.fillStyle = 'rgba(255,170,240,0.6)'; ctx.beginPath(); ctx.ellipse(x, y, bw, bh, 0, Math.PI, 0); ctx.quadraticCurveTo(x, y + 8, x - bw, y); ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,246,0.75)'; ctx.lineWidth = 1.3; for (let m = -2; m <= 2; m++) { ctx.beginPath(); ctx.moveTo(x + m * 7, y + 3); ctx.quadraticCurveTo(x + m * 7 + Math.sin(t * 2 + m) * 6, y + 20, x + m * 7 + Math.sin(t * 2 + m + 1) * 9, y + 38); ctx.stroke(); }
      }
      // vignetta marina profonda
      const v = ctx.createRadialGradient(w / 2, gy * 0.5, w * 0.25, w / 2, gy * 0.5, w * 0.78); v.addColorStop(0, 'rgba(0,40,70,0)'); v.addColorStop(1, 'rgba(0,30,60,0.32)');
      ctx.globalAlpha = k; ctx.fillStyle = v; ctx.fillRect(0, 0, w, gy * 1.3);
    } else if (A.world === 'enchanted') {
      // fasci di luce dalla chioma
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 4; i++) {
        const x = mod(i * 330 + 90 - camX * 0.12 + Math.sin(t * 0.25 + i) * 30, w + 500) - 250, a = 0.05 + 0.04 * Math.sin(t * 0.6 + i * 1.7);
        const g = ctx.createLinearGradient(x, 0, x + 120, gy); g.addColorStop(0, `rgba(255,243,170,${a * 2})`); g.addColorStop(1, 'rgba(255,243,170,0)');
        ctx.globalAlpha = k; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 24, 0); ctx.lineTo(x + 26, 0); ctx.lineTo(x + 190, gy); ctx.lineTo(x + 40, gy); ctx.fill();
      }
      // lucciole
      for (let i = 0; i < 28 * n; i++) {
        const f = 0.45 + H(i, 5) * 0.8, bx = drift(i, camX, w, f, 2), by = gy * (0.18 + H(i, 8) * 0.74), x = bx + Math.sin(t * (0.5 + H(i, 9) * 0.7) + i) * 26, y = by + Math.cos(t * (0.4 + H(i, 10) * 0.6) + i * 2) * 18;
        const fl = Math.max(0, Math.sin(t * (1.4 + H(i, 12)) + i * 3.1)); const s = 7 + fl * 14;
        blob(ctx, i % 5 === 0 ? 'rgba(160,255,200,1)' : 'rgba(255,238,130,1)', x, y, s, k * (0.25 + fl * 0.75));
      }
      ctx.globalCompositeOperation = 'source-over';
      // foglie e petali che cadono
      for (let i = 0; i < 14 * n; i++) {
        const x = drift(i, camX, w, 0.7 + H(i, 5) * 0.5, 6) + Math.sin(t * 0.9 + i * 1.7) * 30, y = mod(H(i, 13) * gy + t * (22 + H(i, 14) * 18), gy * 1.05) - 10, rot = t * (0.8 + H(i, 15)) + i;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(rot * 0.7))); ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = i % 3 === 0 ? '#ff9ad0' : i % 3 === 1 ? '#8fd16a' : '#e6c76a'; ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
      // nebbia radente al suolo
      const mg = ctx.createLinearGradient(0, gy - 70, 0, gy + 20); mg.addColorStop(0, 'rgba(170,230,210,0)'); mg.addColorStop(1, 'rgba(170,230,210,0.16)');
      ctx.globalAlpha = k; ctx.fillStyle = mg; ctx.fillRect(0, gy - 70, w, 90);
      // rampicanti con boccioli luminosi dai bordi alti
      for (let side = 0; side < 2; side++) {
        const x = side ? w - 26 - Math.sin(t * 0.7) * 3 : 24 + Math.sin(t * 0.8) * 3, hh = gy * (0.32 + 0.08 * side);
        ctx.strokeStyle = '#3d7d4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 14 * Math.sin(t * 0.9 + side), hh * 0.35, x - 12, hh * 0.7, x + 6 * Math.sin(t + side * 2), hh); ctx.stroke();
        for (let b = 1; b <= 3; b++) { const bx = x + Math.sin(t * 0.9 + side) * 4 * b / 3, by = hh * b / 3.2; ctx.fillStyle = '#6fbf6a'; ctx.beginPath(); ctx.ellipse(bx + (b % 2 ? 7 : -7), by, 6, 2.8, 0.6, 0, TAU); ctx.fill(); }
        ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,190,240,1)', x + 6 * Math.sin(t + side * 2), hh, 13, 0.8); ctx.globalCompositeOperation = 'source-over';
      }
    } else if (A.world === 'neon') {
      // fasci dei riflettori che scandagliano il cielo
      ctx.globalCompositeOperation = 'screen';
      for (let s = 0; s < 2; s++) {
        const bx = w * (0.2 + 0.55 * s) - (camX * 0.06) % 40, ang = Math.sin(t * 0.5 + s * 2) * 0.45 + (s ? 0.15 : -0.15), L = gy * 1.1;
        const g = ctx.createLinearGradient(bx, 0, bx + Math.sin(ang) * L, Math.cos(ang) * L); g.addColorStop(0, s ? 'rgba(244,87,222,0.28)' : 'rgba(70,245,238,0.28)'); g.addColorStop(1, 'rgba(70,245,238,0)');
        ctx.globalAlpha = k; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - 5, 0); ctx.lineTo(bx + 5, 0); ctx.lineTo(bx + Math.sin(ang) * L + 46, Math.cos(ang) * L); ctx.lineTo(bx + Math.sin(ang) * L - 46, Math.cos(ang) * L); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      // droni con luce
      for (let j = 0; j < 2; j++) {
        const dir = j ? -1 : 1, x = mod(t * (46 + j * 17) * dir + j * 500 - camX * 0.3, w + 400) - 200, y = gy * (0.2 + 0.13 * j) + Math.sin(t * 2 + j) * 5;
        ctx.globalAlpha = k * 0.95; ctx.fillStyle = '#241f52'; ctx.beginPath(); ctx.ellipse(x, y, 11, 4.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = j ? '#f457de' : '#46f2ef'; ctx.fillRect(x - 11, y - 1, 22, 1.5);
        ctx.strokeStyle = '#8f8bd8'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 14, y - 5); ctx.lineTo(x - 5, y - 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x + 14, y - 5); ctx.stroke();
        ctx.globalCompositeOperation = 'screen'; blob(ctx, j ? 'rgba(244,87,222,1)' : 'rgba(70,245,238,1)', x, y + 3, 22, 0.7); ctx.globalCompositeOperation = 'source-over';
      }
      // flussi di dati che salgono (quadratini e trattini)
      for (let i = 0; i < 22 * n; i++) {
        const x = drift(i, camX, w, 0.3 + H(i, 3) * 0.5, 4), y = gy - mod(t * (30 + H(i, 5) * 40) + H(i, 6) * gy, gy * 0.9);
        ctx.globalAlpha = k * (0.25 + 0.5 * H(i, 7)); ctx.fillStyle = i % 2 ? '#46f2ef' : '#f457de';
        if (i % 3) ctx.fillRect(x, y, 2.4, 2.4); else ctx.fillRect(x, y, 7, 1.6);
      }
      // pioggia inclinata + schizzi sul manto
      ctx.lineCap = 'round';
      for (let i = 0; i < 70 * n; i++) {
        const f = 0.8 + H(i, 2) * 0.6, x = drift(i, camX, w, f, 1), y = mod(H(i, 3) * gy * 1.1 + t * (520 + H(i, 4) * 260), gy * 1.1) - 20, L = 12 + H(i, 5) * 14;
        ctx.globalAlpha = k * (0.18 + 0.2 * H(i, 6)); ctx.strokeStyle = i % 4 === 0 ? '#ff9be9' : '#bfeeff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - L * 0.22, y + L); ctx.stroke();
      }
      for (let i = 0; i < 12 * n; i++) {
        const q = fr(t * 1.6 + H(i, 8)), wx = camX + H(i, 9) * w, y = groundAt(gy, wx);
        ctx.globalAlpha = k * (1 - q) * 0.7; ctx.strokeStyle = i % 2 ? '#8ffcff' : '#ff9be9'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.ellipse(wx - camX, y + 1.5, 2 + q * 11, 0.8 + q * 2.2, 0, 0, TAU); ctx.stroke();
      }
      // fremito dei neon (sfarfallio di bordo)
      const fl = Math.sin(t * 13) * Math.sin(t * 5.3) > 0.93 ? 0.1 : 0;
      if (fl) { ctx.globalAlpha = k * fl; ctx.fillStyle = '#f457de'; ctx.fillRect(0, 0, w, gy * 1.3); }
    } else if (A.world === 'paradise') {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 20 * n; i++) { const x = drift(i, camX, w, 0.5 + H(i, 5) * 0.6, 2) + Math.sin(t + i) * 18, y = mod(H(i, 3) * gy * 0.9 - t * (8 + H(i, 4) * 12), gy * 0.9), tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.9); blob(ctx, 'rgba(255,238,170,1)', x, y, 4 + tw * 6, k * (0.3 + tw * 0.5)); }
      ctx.globalCompositeOperation = 'source-over';
      for (let j = 0; j < 3; j++) {  // stormo di uccelli lontani
        const x = mod(t * 22 + j * 340 - camX * 0.12, w + 300) - 150, y = gy * (0.16 + 0.07 * j) + Math.sin(t * 0.9 + j) * 8, fl = Math.sin(t * 6 + j) * 3;
        ctx.globalAlpha = k * 0.55; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        for (let b = 0; b < 3; b++) { const bx = x + b * 16, by = y + (b % 2) * 6; ctx.beginPath(); ctx.moveTo(bx - 7, by + fl); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by); ctx.quadraticCurveTo(bx + 3, by - 3, bx + 7, by + fl); ctx.stroke(); }
      }
    } else if (A.world === 'inferno') {
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 38 * n; i++) {
        const f = 0.5 + H(i, 5) * 0.8, x = drift(i, camX, w, f, 2) + Math.sin(t * 1.3 + i) * 14, y = gy * 1.02 - mod(t * (40 + H(i, 4) * 60) + H(i, 3) * gy, gy * 1.02), life = y / gy;
        blob(ctx, life > 0.5 ? 'rgba(255,180,70,1)' : 'rgba(255,90,30,1)', x, y, 2.5 + H(i, 6) * 4, k * (0.35 + life * 0.55));
      }
      ctx.globalCompositeOperation = 'source-over';
      const hg = ctx.createLinearGradient(0, gy - 40, 0, gy + 70); hg.addColorStop(0, 'rgba(255,110,40,0)'); hg.addColorStop(1, 'rgba(255,90,30,0.2)');
      ctx.globalAlpha = k * (0.8 + 0.2 * Math.sin(t * 3)); ctx.fillStyle = hg; ctx.fillRect(0, gy - 40, w, 110);
    }
    ctx.restore();
  }


  // sagome scure in primo piano lungo il bordo inferiore (parallasse più veloce del terreno)
  function silhouettes(ctx, camX, w, h, t, A) {
    const f = 1.28, step = A.world === 'neon' ? 70 : 24, i0 = Math.floor(camX * f / step) - 1, i1 = i0 + Math.ceil(w / step) + 3;
    ctx.globalAlpha = A.k * 0.92;
    for (let i = i0; i <= i1; i++) {
      const x = i * step + H(i, 21) * step * 0.6 - camX * f, r = H(i, 22), r2 = H(i, 23);
      if (A.world === 'atlantis') {
        if (r > 0.55) continue; const hh = 46 + r2 * 70, sw = Math.sin(t * 1.1 + i) * 9;
        ctx.strokeStyle = '#04283a'; ctx.lineWidth = 5 + r2 * 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, h + 4); ctx.bezierCurveTo(x - 8 + sw * 0.3, h - hh * 0.35, x + 8 + sw * 0.7, h - hh * 0.7, x + sw, h - hh); ctx.stroke();
      } else if (A.world === 'enchanted') {
        const hh = 26 + r2 * 46, sw = Math.sin(t * 0.9 + i * 0.7) * 5;
        ctx.fillStyle = '#071d18'; ctx.beginPath(); ctx.moveTo(x - 5, h + 4); ctx.quadraticCurveTo(x + sw * 0.4, h - hh * 0.6, x + sw + 2, h - hh); ctx.quadraticCurveTo(x + 4 + sw * 0.4, h - hh * 0.55, x + 6, h + 4); ctx.fill();
        if (r > 0.9) { const p = 0.5 + 0.5 * Math.sin(t * 2 + i); ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,170,230,1)', x + sw + 2, h - hh, 14 * p + 4, A.k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = A.k * 0.92; }
      } else {
        if (r > 0.5) continue; const hh = 40 + r2 * 60;
        ctx.fillStyle = '#080720'; ctx.fillRect(x - 2.5, h - hh, 5, hh + 4); ctx.fillRect(x - 9, h - hh + 8, 18, 2.5);
        const on = Math.sin(t * 3 + i * 2) > -0.2; if (on) { ctx.globalCompositeOperation = 'screen'; blob(ctx, i % 2 ? 'rgba(244,87,222,1)' : 'rgba(70,245,238,1)', x, h - hh, 9, A.k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = A.k * 0.92; }
      }
    }
  }


  // =============================================================================================
  //  "SKIN" DEGLI OSTACOLI: dentro il tratto speciale ostacoli, rampe e ponti vengono ridipinti con la tavolozza del mondo
  //  (stessa forma e stessa fisica di sempre, aspetto riconoscibile). I colori passati a fillStyle/strokeStyle/gradienti
  //  vengono rimappati mentre la skin è attiva; la mappa è in cache, quindi il costo è trascurabile.
  // =============================================================================================
  const SK = {
    paradise: { dark: [64, 112, 137], mid: [185, 213, 208], light: [255, 252, 225], acc: [[236, 209, 137], [242, 246, 234]] },
    inferno: { dark: [35, 21, 37], mid: [118, 59, 79], light: [245, 164, 152], acc: [[232, 93, 86], [174, 115, 172]] },
    atlantis: { dark: [5, 45, 66], mid: [31, 163, 155], light: [205, 255, 240], acc: [[255, 127, 156], [255, 176, 110]] },
    enchanted: { dark: [14, 33, 27], mid: [84, 160, 98], light: [236, 255, 208], acc: [[180, 95, 224], [255, 205, 110]] },
    neon: { dark: [10, 8, 36], mid: [66, 52, 150], light: [143, 252, 255], acc: [[244, 87, 222], [70, 245, 238]] },
  };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const skCache = Object.fromEntries(Object.keys(SK).map(k => [k, new Map()]));
  function parseCol(s) {
    let m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(s))) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1]; }
    if ((m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s))) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), m[2] ? parseInt(m[2], 16) / 255 : 1]; }
    if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/i.exec(s))) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    return null;
  }
  function mapColor(world, s) {
    const cache = skCache[world]; let o = cache.get(s); if (o !== undefined) return o;
    const c = parseCol(s); if (!c) { cache.set(s, s); return s; }
    const P = SK[world], mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]), l = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255, sat = mx ? (mx - mn) / mx : 0;
    let r = l < 0.5 ? mixc(P.dark, P.mid, l * 2) : mixc(P.mid, P.light, (l - 0.5) * 2);
    if (sat > 0.4 && mx > 90) { const warm = c[0] >= c[1] && c[0] >= c[2], ac = P.acc[warm ? 0 : 1], k = 0.55 + 0.7 * l; r = mixc(r, [ac[0] * k, ac[1] * k, ac[2] * k], 0.78); }
    o = `rgba(${r[0] | 0},${r[1] | 0},${r[2] | 0},${c[3]})`; cache.set(s, o); return o;
  }
  const proto = CanvasRenderingContext2D.prototype;
  const DESC = ['fillStyle', 'strokeStyle', 'shadowColor'].map(k => [k, Object.getOwnPropertyDescriptor(proto, k)]);
  let skinOn = null;                       // { ctx, world }
  function skinBegin(ctx, world) {
    skinOn = { ctx, world };
    for (const [k, d] of DESC) Object.defineProperty(ctx, k, { configurable: true, get() { return d.get.call(ctx); }, set(v) { d.set.call(ctx, typeof v === 'string' ? mapColor(world, v) : v); } });
    const mk = name => { const orig = proto[name]; ctx[name] = function () { const g = orig.apply(ctx, arguments), add = g.addColorStop.bind(g); g.addColorStop = (p, c) => add(p, typeof c === 'string' ? mapColor(world, c) : c); return g; }; };
    mk('createLinearGradient'); mk('createRadialGradient');
  }
  function skinOff(ctx) {
    if (!skinOn) return; for (const [k] of DESC) delete ctx[k]; delete ctx.createLinearGradient; delete ctx.createRadialGradient; skinOn = null;
  }
  // attiva/disattiva la skin in base alla coordinata di pista x (dentro/fuori dal tratto speciale)
  function skinX(ctx, x) {
    const s = Terrain.WORLD_SEGMENT, inside = s && s.world && SK[s.world] && x >= s.start && x <= s.end && qual() < 2;
    if (inside && !skinOn) skinBegin(ctx, s.world); else if (!inside && skinOn) skinOff(ctx);
  }
  // dettagli di mondo sopra a un ostacolo + "portali" di inizio e fine che lo rendono riconoscibile da lontano
  function trim(ctx, p, camX, gy, x0, x1, t) {
    const s = Terrain.WORLD_SEGMENT; if (!s || !SK[s.world]) return; const mid = (p.a + p.b) / 2; if (mid < s.start || mid > s.end || qual() >= 2) return;
    const W = s.world, Y = x => gy - Terrain.height(x), sx = x => x - camX, step = 12;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); for (let x = x0; x <= x1 + 0.1; x += step) { const px = sx(x), py = Y(x) - 1; x === x0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    if (W === 'neon') {
      ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = 'rgba(70,245,238,0.22)'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = 'rgba(244,87,222,0.9)'; ctx.lineWidth = 2.4; ctx.stroke();
    } else if (W === 'enchanted') {
      ctx.strokeStyle = 'rgba(96,180,92,0.7)'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = 'rgba(190,255,150,0.55)'; ctx.lineWidth = 1.8; ctx.stroke();
    } else if (W === 'inferno') {
      ctx.strokeStyle = 'rgba(182,111,145,0.60)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(230,164,165,0.53)'; ctx.lineWidth = 1.7; ctx.stroke();
    } else if (W === 'paradise') {
      ctx.strokeStyle = 'rgba(232,205,140,0.72)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,250,226,0.78)'; ctx.lineWidth = 1.9; ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(210,255,246,0.55)'; ctx.lineWidth = 2.2; ctx.stroke();
    }
    ctx.restore();
    const i0 = Math.ceil(x0 / 26), i1 = Math.floor(x1 / 26);
    for (let i = i0; i <= i1; i++) {
      const x = i * 26 + H(i, 31) * 10, r = H(i, 32); if (r > 0.6 || x < p.a + 6 || x > p.b - 6) continue; const px = sx(x), py = Y(x) - 1;
      ctx.save(); ctx.translate(px, py);
      if (W === 'atlantis') { const sw = Math.sin(t * 1.3 + i) * 3; ctx.strokeStyle = r > 0.3 ? '#2fae8f' : '#ff7f9c'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sw, -9, sw * 1.6, -14 - r * 8); ctx.stroke(); ctx.fillStyle = '#e8fffb'; ctx.beginPath(); ctx.arc(sw * 1.6, -14 - r * 8, 1.8, 0, TAU); ctx.fill(); }
      else if (W === 'enchanted') { ctx.fillStyle = r > 0.3 ? '#ffd88a' : '#ff9ad0'; const p2 = 0.6 + 0.4 * Math.sin(t * 2 + i); ctx.globalCompositeOperation = 'screen'; blob(ctx, r > 0.3 ? 'rgba(255,216,138,1)' : 'rgba(255,154,208,1)', 0, -5, 9 * p2 + 3, 0.8); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, -5, 1.8, 0, TAU); ctx.fill(); }
      else if (W === 'inferno') { ctx.fillStyle='#a56e8a'; ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(-4,0);ctx.lineTo(4,0);ctx.closePath();ctx.fill(); }
      else if (W === 'paradise') { ctx.fillStyle='#f8e4aa';ctx.beginPath();ctx.arc(0,-4,2.3,0,TAU);ctx.fill(); }
      else { const on = Math.sin(t * 4 + i * 1.7) > -0.3; ctx.fillStyle = i % 2 ? '#46f2ef' : '#f457de'; if (on) { ctx.globalCompositeOperation = 'screen'; blob(ctx, i % 2 ? 'rgba(70,245,238,1)' : 'rgba(244,87,222,1)', 0, -3, 8, 0.8); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; } ctx.fillRect(-1.2, -5, 2.4, 5); }
      ctx.restore();
    }
    // portali a inizio e fine ostacolo
    for (const ex of [p.a, p.b]) {
      const px = sx(ex); if (px < -40 || px > ctx.canvas.width / (ctx.getTransform().a || 1) + 40) continue;   // larghezza in unità logiche (non in pixel del canvas: cambia con la risoluzione adattiva)
       const py = Y(ex), pulse = 0.65 + 0.35 * Math.sin(t * 2.4 + ex * 0.01);
      ctx.save(); ctx.translate(px, py);
      if (W === 'neon') { ctx.fillStyle = '#16123e'; ctx.fillRect(-3, -46, 6, 46); ctx.fillStyle = '#46f2ef'; ctx.fillRect(-3, -46, 6, 2.5); ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(244,87,222,1)', 0, -50, 22 * pulse + 6, 0.9); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#ffc2f4'; ctx.beginPath(); ctx.arc(0, -50, 3.2, 0, TAU); ctx.fill(); }
      else if (W === 'enchanted') { ctx.strokeStyle = '#5a3d28'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -42); ctx.quadraticCurveTo(8, -48, 12, -40); ctx.stroke(); ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(255,200,90,1)', 12, -36, 20 * pulse + 6, 0.9); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.fillStyle = '#ffe3a0'; ctx.beginPath(); ctx.ellipse(12, -36, 3.5, 5, 0, 0, TAU); ctx.fill(); }
      else if (W === 'inferno') {
        ctx.fillStyle='#261d30';ctx.strokeStyle='#a76180';ctx.lineWidth=2.5;
        ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(-7,-31);ctx.lineTo(0,-56);ctx.lineTo(7,-31);ctx.lineTo(9,0);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#e6a0a1';ctx.fillRect(-1.5,-36,3,9);
      } else if (W === 'paradise') {
        ctx.fillStyle='#f7f0dd';ctx.strokeStyle='#d7bf8c';ctx.lineWidth=2.5;
        ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(-10,-35);ctx.quadraticCurveTo(0,-50,10,-35);ctx.lineTo(10,0);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.strokeStyle='#debd82';ctx.beginPath();ctx.moveTo(0,-57);ctx.lineTo(0,-73);ctx.moveTo(-8,-66);ctx.lineTo(8,-66);ctx.stroke();
      } else { ctx.strokeStyle = '#ff7f9c'; ctx.lineWidth = 4; ctx.lineCap = 'round'; for (const [dx, hh] of [[-5, 30], [0, 44], [5, 26]]) { ctx.beginPath(); ctx.moveTo(dx, 0); ctx.quadraticCurveTo(dx + Math.sin(t + dx) * 2, -hh * 0.5, dx * 1.6, -hh); ctx.stroke(); } ctx.globalCompositeOperation = 'screen'; blob(ctx, 'rgba(210,255,250,1)', 0, -46, 16 * pulse + 5, 0.8); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore();
    }
  }

  // =============================================================================================
  // Portali monumentali sotto cui correre: sono scenografie senza collisione.
  // Le rampe e i salti rimangono affidati alla fisica del terreno.
  function monuments(ctx, camX, w, gy, t, A) {
    if (!A.seg) return;
    const span = 930, origin = A.seg.start + 350;
    const left = Math.max(0, Math.floor((camX - origin - 250) / span));
    const right = Math.ceil((camX + w - origin + 250) / span);
    for(let i=left; i<=right; i++) {
      const wx=origin+i*span;
      if(wx<A.seg.start+180 || wx>A.seg.end-200)continue;
      const x=wx-camX, y=gy-Terrain.height(wx);
      // Rimane a distanza dalla ruota; si apre un grande varco centrale.
      ctx.save();ctx.translate(x,y);ctx.globalAlpha=A.k*.89;
      const arch=A.world==='neon', sea=A.world==='atlantis', wood=A.world==='enchanted', heaven=A.world==='paradise';
      const main=arch?'#3c2c81':sea?'#88c4b5':wood?'#594b63':heaven?'#f9edcf':'#3c293e';
      const edge=arch?'#5cfff5':sea?'#c6eadd':wood?'#bce4a3':heaven?'#e8cc88':'#ad687c';
      ctx.strokeStyle=main;ctx.lineWidth=21;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(-130,-1);ctx.lineTo(-130,-118);ctx.quadraticCurveTo(-130,-194,0,-202);
      ctx.quadraticCurveTo(130,-194,130,-118);ctx.lineTo(130,-1);ctx.stroke();
      ctx.strokeStyle=edge;ctx.lineWidth=4;ctx.beginPath();
      ctx.moveTo(-118,-4);ctx.lineTo(-118,-116);ctx.quadraticCurveTo(-118,-182,0,-190);
      ctx.quadraticCurveTo(118,-182,118,-116);ctx.lineTo(118,-4);ctx.stroke();
      if(arch){
        ctx.fillStyle='#d45df6';for(let j=0;j<7;j++)ctx.fillRect(-110+j*37,-137-26*Math.sin(j*Math.PI/6),13,5);
        ctx.strokeStyle='#ff7be0';ctx.beginPath();ctx.moveTo(-27,-201);ctx.lineTo(-27,-238);ctx.lineTo(27,-238);ctx.lineTo(27,-201);ctx.stroke();
      }else if(sea){
        ctx.strokeStyle='#e7e8c7';ctx.lineWidth=3;
        for(let j=0;j<4;j++){const px=j%2?-136:136;ctx.beginPath();ctx.moveTo(px,-28-j*18);ctx.lineTo(px+(j%2?17:-17),-41-j*18);ctx.stroke();}
        ctx.fillStyle='#f5dba9';ctx.beginPath();ctx.arc(0,-195,17,0,TAU);ctx.fill();
      }else if(wood){
        ctx.strokeStyle='#a0d179';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-132,-110);ctx.bezierCurveTo(-173,-164,-160,-213,-110,-227);ctx.moveTo(132,-110);ctx.bezierCurveTo(177,-163,158,-213,108,-229);ctx.stroke();
        for(let j=-1;j<=1;j++){ctx.fillStyle=j%2?'#f3b3f1':'#b7f6b0';ctx.beginPath();ctx.ellipse(j*26,-205,9,5,0,0,TAU);ctx.fill();}
      }else if(heaven){
        ctx.fillStyle='#fff8d9';ctx.beginPath();ctx.arc(0,-201,15,0,TAU);ctx.fill();ctx.strokeStyle='#e8cc88';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-225);ctx.lineTo(0,-251);ctx.moveTo(-11,-240);ctx.lineTo(11,-240);ctx.stroke();
      }else{
        ctx.strokeStyle='#e38a97';ctx.lineWidth=2;
        for(let j=0;j<3;j++){const yy=-55-j*45;ctx.beginPath();ctx.moveTo(-130,yy);ctx.bezierCurveTo(-48,yy-24,48,yy+26,130,yy);ctx.stroke();}
        ctx.fillStyle='#bd849a';ctx.beginPath();ctx.arc(0,-202,14,0,TAU);ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawGround(ctx, camX, w, gy, t) {
    skinOff(ctx);   // rete di sicurezza: a inizio frame la skin degli ostacoli non deve mai restare attiva
    const q = qual(); if (q >= 2) return; const A = active(camX, w); if (!A) return;
    monuments(ctx, camX, w, gy, t / 1000, A);
    props(ctx, camX, w, gy, t / 1000, A);
    ctx.globalAlpha = 1;
  }
  function drawFore(ctx, camX, w, gy, t, h) {
    const q = qual(); if (q >= 2) return; const A = active(camX, w); if (!A) return;
    fore(ctx, camX, w, gy, t / 1000, A, q);
    if (h && (A.world === 'atlantis' || A.world === 'enchanted' || A.world === 'neon')) silhouettes(ctx, camX, w, h, t / 1000, A);
    ctx.globalAlpha = 1;
  }
  return { drawGround, drawFore, skinX, skinOff, trim };
})();
