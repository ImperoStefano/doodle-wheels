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
  // portali: salto = schizzo d'inchiostro che sale (avanti) o scende (indietro); specchio = nastro al contrario; uscita = campanella
  const portal = (type, d) => {
    if (type === 's') { const up = d > 0; puff('bandpass', up ? 500 : 2400, 1.1, 0.34, 0.2, 0, up ? 2400 : 500); tone(up ? 330 : 660, 0.3, 'triangle', 0.2, 0, up ? 880 : 220); tone(up ? 660 : 330, 0.22, 'sine', 0.12, 0.08); }
    else if (type === 'm') { puff('bandpass', 3200, 1.4, 0.6, 0.22, 0, 260); tone(900, 0.6, 'sawtooth', 0.1, 0, 110); [0, 0.14, 0.28].forEach((t, i) => tone(700 - i * 120, 0.08, 'square', 0.1, t)); }
    else { tone(880, 0.3, 'triangle', 0.2); tone(1320, 0.42, 'triangle', 0.18, 0.12); tone(1760, 0.3, 'sine', 0.1, 0.2); }
  };
  // colpo di uno spigolo della ruota sul terreno: breve e sordo, più forte con la velocità
  const clack = v => { puff('bandpass', 380 + 260 * v, 1.4, 0.05, 0.05 + 0.1 * v); tone(120 + 60 * v, 0.06, 'sine', 0.05 + 0.08 * v, 0, 70); };
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
    // ronzio morbido che sale con la velocità (due oscillatori leggermente scordati)
    const hum = ctx.createOscillator(), hum2 = ctx.createOscillator(), hg = ctx.createGain(), hf = ctx.createBiquadFilter();
    hum.type = 'triangle'; hum2.type = 'sine'; hum.frequency.value = 80; hum2.frequency.value = 121; hg.gain.value = 0; hf.type = 'lowpass'; hf.frequency.value = 420;
    hum.connect(hf); hum2.connect(hf); hf.connect(hg); hg.connect(master); hum.start(); hum2.start();
    roll = { s, flt, g, lg, lfo, am, hum, hum2, hg, tp: 0, tt: performance.now() };
  }
  // chiamata a ogni fotogramma per la propria bici: speed px/tick, surf = chiave di SURF, air = in aria, per = periodo del ritmo (px)
  // tick: colpi al secondo delle ruote poligonali (0 = ruota tonda, rotolamento liscio)
  function update(speed, surf, air, per, tick) {
    if (!ctx) return; if (!roll) rollStart(); if (!roll) return;
    const t = ctx.currentTime, p = SURF[surf] || SURF.grass;
    const v = Math.max(0, Math.min(1, speed / 7.5)), on = ok() && !air && speed > 0.4;
    roll.flt.type = p[0]; roll.flt.frequency.setTargetAtTime(p[1] * (0.7 + 0.7 * v), t, 0.08); roll.flt.Q.value = p[2];
    roll.g.gain.setTargetAtTime(on ? p[3] * (0.25 + 0.75 * v) : 0, t, 0.07);
    // modulazione: per i terreni a ritmo la frequenza segue l'avanzamento (un colpo per periodo di terreno)
    const m = p[4], rate = per > 0 ? Math.min(28, speed * 60 / per) : 7 + 14 * v;
    // ronzio e colpi delle ruote
    roll.hum.frequency.setTargetAtTime(70 + 120 * v, t, 0.12); roll.hum2.frequency.setTargetAtTime((70 + 120 * v) * 1.5 * 1.004, t, 0.12);
    roll.hg.gain.setTargetAtTime(on ? 0.028 + 0.05 * v : 0, t, 0.1);
    const nw = performance.now(), dtm = Math.min(100, nw - roll.tt); roll.tt = nw;
    if (on && tick > 0.5) { roll.tp += Math.min(18, tick) * dtm / 1000; let n = 0; while (roll.tp >= 1 && n < 3) { roll.tp -= 1; n++; clack(v); } if (roll.tp > 3) roll.tp = 0; } else roll.tp = 0;
    roll.lfo.frequency.setTargetAtTime(Math.max(1, rate), t, 0.05); roll.lg.gain.setTargetAtTime(m * 0.5, t, 0.05); roll.am.gain.setTargetAtTime(1 - m * 0.5, t, 0.05);
  }
  function silence() { if (roll && ctx) { roll.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); roll.hg.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } }

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
  return { init, unlock, click, beep, swoosh, finish, land, bump, splash, redraw, portal, update, silence, setMuted, get muted() { return muted; } };
})();
