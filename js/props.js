/*
 * Props — gli oggetti "costruiti" lungo la pista: ponti (ad arco in pietra, sospeso di corde),
 * assi delle rampe, cartelli di zona, traguardo con festoni e palloncini.
 *
 * Sono solo disegno: la fisica conosce soltanto Terrain.height(), che sopra un ponte è
 * l'impalcato. Qui si disegna esattamente quella curva, così la ruota ci rotola sopra davvero.
 */
const Props = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const ZONE_LABEL = { hills: 'Colline', ice: 'Ghiacciaio', gravel: 'Canyon', water: 'Laguna', ramps: 'Bosco d\'autunno', finish: 'Traguardo' };

  // ---------- ponti ---------------------------------------------------------------------------
  function drawBridges(ctx, camX, w, gy, S) {
    const bs = Terrain.BRIDGES;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.end - camX < -80 || b.start - camX > w + 80) continue;
      if (b.kind === 'rope') ropeBridge(ctx, b, camX, gy, S); else archBridge(ctx, b, camX, gy, S);
    }
  }

  function samples(b, camX, gy, N) {
    const xs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) { const wx = b.start + (b.end - b.start) * i / N; xs[i] = wx - camX; ys[i] = gy - Terrain.height(wx); }
    return { xs, ys, N };
  }

  // ponte ad arco di pietra: sotto, l'intradosso curvo (più spesso agli appoggi), sopra strada e parapetto
  function archBridge(ctx, b, camX, gy, S) {
    const N = 28, { xs, ys } = samples(b, camX, gy, N);
    const thick = i => 16 + 54 * Math.pow(Math.abs(i / N - 0.5) * 2, 2.2);   // intradosso: sottile in chiave, spesso agli appoggi
    const night = S.night, warm = S.warm;
    const stone = [186, 179, 165], dark = '#5a5349';

    // corpo in pietra
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i]);
    for (let i = N; i >= 0; i--) ctx.lineTo(xs[i], ys[i] + thick(i));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Math.min(...ys) - 10, 0, Math.max(...ys) + 80);
    g.addColorStop(0, `rgb(${stone[0]},${stone[1]},${stone[2]})`); g.addColorStop(1, 'rgb(128,120,108)');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = dark; ctx.lineJoin = 'round'; ctx.stroke();
    // conci
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(70,62,52,0.5)'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i <= N; i += 2) { ctx.moveTo(xs[i], ys[i]); ctx.lineTo(xs[i], ys[i] + thick(i)); }
    for (let k = 1; k < 4; k++) { ctx.moveTo(xs[0], ys[0] + thick(0) * k / 4); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] + thick(i) * k / 4); }
    ctx.stroke(); ctx.restore();

    // strada acciottolata
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0]); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i]);
    ctx.strokeStyle = '#a58963'; ctx.lineWidth = 9; ctx.lineCap = 'butt'; ctx.stroke();
    ctx.strokeStyle = '#7d6643'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i <= N; i++) { ctx.moveTo(xs[i], ys[i] - 3); ctx.lineTo(xs[i], ys[i] + 4); }
    ctx.stroke();

    // parapetto (dietro la bici): muretto con pietra di copertura, pilastri alle estremità e al centro
    const wallH = 24;
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0] - 4);
    for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] - 4);
    for (let i = N; i >= 0; i--) ctx.lineTo(xs[i], ys[i] - wallH);
    ctx.closePath(); ctx.fillStyle = `rgb(${stone[0] - 14},${stone[1] - 14},${stone[2] - 14})`; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0] - wallH - 2); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] - wallH - 2);
    ctx.strokeStyle = '#d6d0c2'; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = dark; ctx.lineWidth = 1.5; ctx.stroke();
    const post = (i, tall) => {
      const x = xs[i], y = ys[i] - 4;
      ctx.fillStyle = '#c9c2b2'; ctx.fillRect(x - 9, y - wallH - tall, 18, wallH + tall); ctx.strokeStyle = dark; ctx.lineWidth = 2; ctx.strokeRect(x - 9, y - wallH - tall, 18, wallH + tall);
      ctx.fillStyle = '#d9d3c5'; ctx.fillRect(x - 12, y - wallH - tall - 6, 24, 7); ctx.strokeRect(x - 12, y - wallH - tall - 6, 24, 7);
      // lanterna: si accende al tramonto
      const lit = clamp(warm * 0.8 + night, 0, 1), ly = y - wallH - tall - 20;
      ctx.fillStyle = '#374151'; ctx.fillRect(x - 1.5, ly + 8, 3, 8);
      if (lit > 0.05) { const gl = ctx.createRadialGradient(x, ly, 2, x, ly, 46); gl.addColorStop(0, `rgba(255,220,120,${(0.7 * lit).toFixed(2)})`); gl.addColorStop(1, 'rgba(255,220,120,0)'); ctx.fillStyle = gl; ctx.fillRect(x - 46, ly - 46, 92, 92); }
      ctx.fillStyle = lit > 0.2 ? '#fde68a' : '#e5e7eb'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, ly, 7, 0, TAU); ctx.fill(); ctx.stroke();
    };
    post(0, 14); post(N >> 1, 6); post(N, 14);
  }

  // ponte sospeso: due piloni di legno, assi che cedono un po', corde con i tiranti
  function ropeBridge(ctx, b, camX, gy, S) {
    const N = 34, { xs, ys } = samples(b, camX, gy, N), t = performance.now() / 1000;
    const x0 = xs[0], x1 = xs[N], tower = 92;
    const sway = i => Math.sin(t * 1.6 + i * 0.5) * 0.8 * Math.sin(Math.PI * i / N);
    // corde maestre (dietro le assi): da cima a cima, con la pancia
    const rope = (dy, width, col) => {
      ctx.beginPath(); ctx.moveTo(x0, ys[0] - tower + dy);
      ctx.quadraticCurveTo((x0 + x1) / 2, (ys[N >> 1] - 26 + dy) * 2 - (ys[0] - tower + dy + ys[N] - tower + dy) / 2, x1, ys[N] - tower + dy);
      ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
    };
    // tiranti: dal filo alla tavola
    ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 2; i < N; i += 3) {
      const u = i / N, topY = (1 - u) * (1 - u) * (ys[0] - tower) + 2 * u * (1 - u) * (((ys[N >> 1] - 26) * 2 - (ys[0] - tower + ys[N] - tower) / 2)) + u * u * (ys[N] - tower);
      ctx.moveTo(xs[i], topY); ctx.lineTo(xs[i], ys[i] - 3);
    }
    ctx.stroke();
    rope(0, 4.5, '#caa56a'); rope(0, 1.5, '#6b4a22');
    // assi
    for (let i = 0; i < N; i++) {
      const sw = sway(i);
      ctx.strokeStyle = i % 2 ? '#a06a3c' : '#8a5630'; ctx.lineWidth = 9; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(xs[i] + 0.5, ys[i] + 4 + sw); ctx.lineTo(xs[i + 1] - 0.5, ys[i + 1] + 4 + sway(i + 1)); ctx.stroke();
      ctx.strokeStyle = 'rgba(60,35,15,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(xs[i + 1], ys[i + 1]); ctx.lineTo(xs[i + 1], ys[i + 1] + 9); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(xs[0], ys[0] + 9); for (let i = 1; i <= N; i++) ctx.lineTo(xs[i], ys[i] + 9 + sway(i)); ctx.strokeStyle = '#3f2a14'; ctx.lineWidth = 3; ctx.stroke();    // trave sotto
    // piloni a "A" di legno
    [[x0, ys[0], -1], [x1, ys[N], 1]].forEach(([x, y, d]) => {
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - d * 4, y + 8); ctx.lineTo(x - d * 4, y - tower); ctx.stroke();
      ctx.strokeStyle = '#85603a'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x + d * 18, y + 14); ctx.lineTo(x - d * 4, y - tower + 10); ctx.stroke();
      ctx.fillStyle = '#4a3219'; ctx.beginPath(); ctx.arc(x - d * 4, y - tower, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#caa56a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x - d * 4, y - tower, 8, 0.4, 5.4); ctx.stroke();
    });
  }

  // ---------- rampe: assi di legno sulla salita --------------------------------------------------
  function drawRamps(ctx, camX, w, gy) {
    const Zs = Terrain.ZONES, period = Terrain.RAMP_PERIOD, rise = Terrain.RAMP_RISE, lead = Terrain.RAMP_LEAD;
    for (let zi = 0; zi < Zs.length; zi++) {
      const z = Zs[zi]; if (z.key !== 'ramps' || z.end < camX || z.start > camX + w) continue;
      for (let sx = 0; sx <= w + 14; sx += 14) {
        const wx = sx + camX, u = wx - z.start - lead;
        if (u < 0 || wx > z.end - 200) continue;
        const ph = u % period; if (ph >= rise - 8) continue;
        const y = gy - Terrain.height(wx), sl = (Terrain.height(wx + 7) - Terrain.height(wx - 7)) / 14, a = Math.atan(sl);
        ctx.save(); ctx.translate(sx, y - 1.5); ctx.rotate(-a);
        ctx.fillStyle = (Math.floor(u / 14) % 2) ? '#a8723a' : '#94622f'; ctx.fillRect(-6.5, -3, 13, 6);
        ctx.strokeStyle = 'rgba(60,32,10,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(-6.5, -3, 13, 6);
        ctx.restore();
      }
    }
  }

  // ---------- cartelli di zona ------------------------------------------------------------------
  function drawSigns(ctx, camX, w, gy) {
    const Zs = Terrain.ZONES;
    for (let zi = 1; zi < Zs.length; zi++) {
      const z = Zs[zi], sx = z.start + 150 - camX; if (sx < -90 || sx > w + 90) continue;
      if (!ZONE_LABEL[z.key]) continue; const label = I18n.t('sign.' + z.key);
      const y = gy - Terrain.height(z.start + 150);
      ctx.save(); ctx.translate(sx, y);
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-4, -92, 8, 94); ctx.strokeStyle = '#3f2a14'; ctx.lineWidth = 1.5; ctx.strokeRect(-4, -92, 8, 94);
      ctx.font = '700 17px Kalam, "Comic Sans MS", cursive';
      const tw = ctx.measureText(label).width + 34, bw = Math.max(96, tw);
      ctx.fillStyle = '#d9a35c'; ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-bw / 2, -112); ctx.lineTo(bw / 2 - 8, -112); ctx.lineTo(bw / 2 + 12, -96); ctx.lineTo(bw / 2 - 8, -80); ctx.lineTo(-bw / 2, -80); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2f12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, -4, -95);
      ctx.restore();
    }
  }

  // ---------- traguardo --------------------------------------------------------------------------
  function drawFinish(ctx, camX, w, gy, S) {
    const fx = Terrain.FINISH_X, x0 = fx - camX; if (x0 < -620 || x0 > w + 620) return;
    const y = gy - Terrain.height(fx), t = performance.now() / 1000, H = 205;
    // festoni di bandierine, in entrambe le direzioni
    const cols = ['#ef4444', '#3b82f6', '#facc15', '#22c55e', '#ec4899', '#f97316'];
    [-1, 1].forEach(dir => {
      const xa = x0, xb = x0 + dir * 560, ya = y - H + 8, yb = gy - Terrain.height(fx + dir * 560) - 120;
      const sag = 46;
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i <= 14; i++) { const q = i / 14, px = xa + (xb - xa) * q, py = ya + (yb - ya) * q + Math.sin(q * Math.PI) * sag; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
      for (let i = 1; i < 14; i++) {
        const q = i / 14, px = xa + (xb - xa) * q, py = ya + (yb - ya) * q + Math.sin(q * Math.PI) * sag, fl = Math.sin(t * 3 + i) * 3;
        ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(px - 9, py); ctx.lineTo(px + 9, py); ctx.lineTo(px + fl, py + 24); ctx.closePath(); ctx.fill();
      }
      // palo di sostegno
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(xb, yb + 4); ctx.lineTo(xb, yb + 120); ctx.stroke();
    });
    // due pilastri a scacchi e il cartellone
    const px = [x0 - 62, x0 + 62];
    px.forEach(x => {
      for (let k = 0; k < H / 18; k++) { ctx.fillStyle = k % 2 ? '#0f172a' : '#ffffff'; ctx.fillRect(x - 9, y - 18 * (k + 1), 9, 18); ctx.fillStyle = k % 2 ? '#ffffff' : '#0f172a'; ctx.fillRect(x, y - 18 * (k + 1), 9, 18); }
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.strokeRect(x - 9, y - H, 18, H);
    });
    ctx.fillStyle = '#1d4ed8'; ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(x0 - 92, y - H - 26, 184, 44); ctx.fill(); ctx.stroke();
    for (let k = 0; k < 18; k++) { ctx.fillStyle = k % 2 ? '#0f172a' : '#fff'; ctx.fillRect(x0 - 92 + k * 10.2, y - H - 26, 10.2, 7); ctx.fillStyle = k % 2 ? '#fff' : '#0f172a'; ctx.fillRect(x0 - 92 + k * 10.2, y - H + 11, 10.2, 7); }
    ctx.fillStyle = '#ffffff'; ctx.font = '700 24px Kalam, "Comic Sans MS", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(I18n.t('gate'), x0, y - H - 4);
    // palloncini
    [[-86, '#ef4444'], [-110, '#facc15'], [-64, '#3b82f6'], [86, '#22c55e'], [112, '#ec4899'], [66, '#f97316']].forEach(([dx, c], i) => {
      const bx = x0 + dx, by = y - H - 40 - 36 * (i % 3) + Math.sin(t * 1.4 + i) * 5;
      ctx.strokeStyle = 'rgba(30,41,59,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.quadraticCurveTo(bx + Math.sin(t + i) * 5, by + 40, x0 + Math.sign(dx) * 62, y - H); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(bx, by, 14, 18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(bx - 5, by - 6, 3.5, 6, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(bx, by + 18); ctx.lineTo(bx - 3, by + 23); ctx.lineTo(bx + 3, by + 23); ctx.closePath(); ctx.fill();
    });
  }

  return { drawBridges, drawRamps, drawSigns, drawFinish };
})(); // props
