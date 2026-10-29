// Suoni sintetizzati con WebAudio: nessun file da scaricare, nessuna licenza, pochi nodi (un solo contesto, un solo
// "rotolamento" continuo che segue velocità e superficie, il resto sono brevi impulsi). Partono solo dopo il primo tocco
// (regola dei browser mobili) e si spengono col pulsante in basso a sinistra; la scelta resta salvata (localStorage, se c'è).
const Sfx = (() => {
  const KEY = 'dw_sound';
  let ctx = null, master = null, noiseBuf = null, muted = false, roll = null, lastSplash = 0, lastBump = 0, lastLand = 0;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) {}

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctx.destination);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  const ok = () => ctx && !muted && ctx.state === 'running';

  // nota con inviluppo; slide = frequenza finale (glissando)
  function tone(f, dur, type, vol, when, slide) {
    if (!ok()) return; const t = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
  }
  // soffio di rumore filtrato
  function puff(kind, f, q, dur, vol, when, f2) {
    if (!ok()) return; const t = ctx.currentTime + (when || 0), s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; flt.type = kind; flt.frequency.setValueAtTime(f, t); if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur); flt.Q.value = q || 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
  }

  // ---- eventi -------------------------------------------------------------------------------------------
  const click = () => { tone(1250, 0.05, 'triangle', 0.12); };
  const beep = n => { if (n === 0) { tone(660, 0.5, 'square', 0.16); tone(990, 0.5, 'triangle', 0.2); tone(1320, 0.42, 'sine', 0.14, 0.02); } else tone(440, 0.16, 'square', 0.14); };
  const swoosh = ms => { puff('bandpass', 400, 0.8, ms / 1000, 0.2, 0, 2600); puff('highpass', 3000, 0.5, ms / 1000 * 0.8, 0.05, 0.05); };   // pennellata dell'intro
  const finish = place => {
    if (place === 1) [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.22, i * 0.11));
    else if (place > 0) { tone(494, 0.2, 'triangle', 0.18); tone(587, 0.34, 'triangle', 0.18, 0.14); }
    else { tone(330, 0.3, 'triangle', 0.18); tone(262, 0.5, 'triangle', 0.18, 0.22); }
  };
  // atterraggio: v = velocità verticale (px/tick) all'impatto
  const land = v => { const n = performance.now(); if (n - lastLand < 120 || v < 2.2) return; lastLand = n; const k = Math.min(1, (v - 2) / 9); tone(150, 0.18, 'sine', 0.12 + 0.3 * k, 0, 55); puff('lowpass', 900, 0.7, 0.14, 0.1 + 0.25 * k); };
  const bump = k => { const n = performance.now(); if (n - lastBump < 90) return; lastBump = n; puff('bandpass', 520, 1.2, 0.07, 0.06 + 0.12 * k); };
  const splash = k => { const n = performance.now(); if (n - lastSplash < 170) return; lastSplash = n; puff('bandpass', 1500, 0.9, 0.16, 0.05 + 0.12 * k, 0, 700); };
  const redraw = () => { tone(520, 0.1, 'triangle', 0.14); tone(780, 0.14, 'triangle', 0.14, 0.08); };

  // ---- rotolamento continuo ----------------------------------------------------------------------------
  // un unico rumore bianco filtrato (+ un'ampiezza modulata per i terreni "a ritmo": dentiera, strada ad archi, ghiaia)
  const SURF = {   // filtro, frequenza base, Q, volume, modulazione (0 = continua)
    grass: ['lowpass', 520, 0.7, 0.10, 0], gravel: ['bandpass', 1900, 0.6, 0.16, 0.55], ice: ['bandpass', 3400, 2.5, 0.07, 0],
    sand: ['bandpass', 1500, 0.5, 0.12, 0], mud: ['lowpass', 260, 1.2, 0.2, 0.35], rack: ['bandpass', 1100, 3, 0.18, 1], rough: ['lowpass', 700, 1, 0.16, 1], water: ['bandpass', 1100, 0.7, 0.12, 0.3],
  };
  function rollStart() {
    if (roll || !ensure()) return;
    const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; flt.type = 'lowpass'; flt.frequency.value = 500; g.gain.value = 0; am.gain.value = 1;
    lfo.type = 'square'; lfo.frequency.value = 6; lg.gain.value = 0; lfo.connect(lg); lg.connect(am.gain);
    s.connect(flt); flt.connect(am); am.connect(g); g.connect(master); s.start(); lfo.start();
    roll = { s, flt, g, lg, lfo, am };
  }
  // chiamata a ogni fotogramma per la propria bici: speed px/tick, surf = chiave di SURF, air = in aria, per = periodo del ritmo (px)
  function update(speed, surf, air, per) {
    if (!ctx) return; if (!roll) rollStart(); if (!roll) return;
    const t = ctx.currentTime, p = SURF[surf] || SURF.grass;
    const v = Math.max(0, Math.min(1, speed / 7.5)), on = ok() && !air && speed > 0.4;
    roll.flt.type = p[0]; roll.flt.frequency.setTargetAtTime(p[1] * (0.7 + 0.7 * v), t, 0.08); roll.flt.Q.value = p[2];
    roll.g.gain.setTargetAtTime(on ? p[3] * (0.25 + 0.75 * v) : 0, t, 0.07);
    // modulazione: per i terreni a ritmo la frequenza segue l'avanzamento (un colpo per periodo di terreno)
    const m = p[4], rate = per > 0 ? Math.min(28, speed * 60 / per) : 7 + 14 * v;
    roll.lfo.frequency.setTargetAtTime(Math.max(1, rate), t, 0.05); roll.lg.gain.setTargetAtTime(m * 0.5, t, 0.05); roll.am.gain.setTargetAtTime(1 - m * 0.5, t, 0.05);
  }
  function silence() { if (roll && ctx) { roll.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } }

  // ---- muto -------------------------------------------------------------------------------------------
  function setMuted(m) {
    muted = m; try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.03);
    const b = document.getElementById('btn-sound'); if (b) { b.classList.toggle('muted', m); b.setAttribute('aria-pressed', m ? 'true' : 'false'); }
  }
  function init() {
    const b = document.getElementById('btn-sound');
    if (b) { b.classList.toggle('muted', muted); b.setAttribute('aria-pressed', muted ? 'true' : 'false'); b.addEventListener('click', e => { e.stopPropagation(); unlock(); setMuted(!muted); if (!muted) click(); }); }
    const first = () => { unlock(); };
    ['pointerdown', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, first, { passive: true }));
    document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('button, .btn'); if (t && t.id !== 'btn-sound') { unlock(); click(); } }, true);
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (!muted) ctx.resume(); });
  }
  return { init, unlock, click, beep, swoosh, finish, land, bump, splash, redraw, update, silence, setMuted, get muted() { return muted; } };
})();
