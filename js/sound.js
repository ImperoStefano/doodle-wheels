// Audio sintetizzato con WebAudio: nessun file da scaricare, nessuna licenza. Un solo contesto, un solo "rotolamento" continuo
// che segue velocità e superficie, brevi note "di legno" (kalimba/marimba) per gli eventi e una musica di sottofondo generativa
// (pentatonica, pad + basso morbido + arpeggio), calma nei menu e un po' più mossa in gara.
// Tutto passa da un filtro che taglia gli acuti e da un riverbero leggero: niente onde quadre o a dente di sega, niente fruscii aspri.
// Parte solo dopo il primo tocco (regola dei browser mobili) e si spegne col pulsante audio; la scelta resta salvata (localStorage).
const Sfx = (() => {
  const KEY = 'dw_sound';
  let ctx = null, master = null, sfxBus = null, musBus = null, rev = null, noiseBuf = null, muted = false, roll = null, lastSplash = 0, lastBump = 0, lastLand = 0, lastClick = 0;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) {}
  const MASTER = 0.5, MUSIC = { calm: 0.5, drive: 0.4 };
  const now = () => performance.now();

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    // riverbero corto e caldo (risposta all'impulso sintetica: rumore che decade, più cupo col tempo)
    const L = Math.floor(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, L, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < L; i++) { const k = i / L, a = 0.25 + 0.6 * (1 - k); lp += a * ((Math.random() * 2 - 1) - lp); d[i] = lp * Math.pow(1 - k, 2.4) * 1.6; } }
    rev = ctx.createConvolver(); rev.buffer = ir; const rg = ctx.createGain(); rg.gain.value = 0.32; rev.connect(rg); rg.connect(master);
    // effetti: filtro che taglia gli acuti → bus → (secco + un po' di riverbero)
    const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 3600; soft.Q.value = 0.4;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1; soft.connect(sfxBus); sfxBus.connect(master); const sr = ctx.createGain(); sr.gain.value = 0.18; sfxBus.connect(sr); sr.connect(rev);
    sfxBus.__in = soft;
    // musica: bus proprio (il livello cambia con l'umore), un po' più riverbero
    musBus = ctx.createGain(); musBus.gain.value = MUSIC.calm; musBus.connect(master); const mr = ctx.createGain(); mr.gain.value = 0.5; musBus.connect(mr); mr.connect(rev);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); if (c && !muted) musicStart(); }
  const ok = () => ctx && !muted && ctx.state === 'running';
  const out = () => sfxBus.__in;

  // nota con inviluppo; slide = frequenza finale (glissando). Solo onde morbide (sine/triangle).
  function tone(f, dur, type, vol, when, slide) {
    if (!ok()) return; const t = ctx.currentTime + (when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type === 'triangle' ? 'triangle' : 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.018); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out()); o.start(t); o.stop(t + dur + 0.03);
  }
  // nota "di legno" (marimba/kalimba): fondamentale + un'armonica breve, attacco morbido, decadimento rapido
  function pluck(f, dur, vol, when, bus) {
    if (!ok()) return; const t = ctx.currentTime + (when || 0), dst = bus || out();
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g1 = ctx.createGain(), g2 = ctx.createGain();
    o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 3.97;
    g1.gain.setValueAtTime(0.0001, t); g1.gain.exponentialRampToValueAtTime(vol, t + 0.006); g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vol * 0.18, t + 0.004); g2.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.14));
    o1.connect(g1); o2.connect(g2); g1.connect(dst); g2.connect(dst); o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  // soffio di rumore filtrato (sempre passa-basso/passa-banda: niente sibili)
  function puff(kind, f, q, dur, vol, when, f2) {
    if (!ok()) return; const t = ctx.currentTime + (when || 0), s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; flt.type = kind; flt.frequency.setValueAtTime(f, t); if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur); flt.Q.value = q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(out()); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.03);
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---- eventi -------------------------------------------------------------------------------------------
  // clic dei pulsanti: un "toc" di legno basso e breve (e mai più di uno ogni 60 ms)
  const click = () => { const n = now(); if (n - lastClick < 60) return; lastClick = n; pluck(hz(67), 0.09, 0.07); puff('bandpass', 700, 1.2, 0.03, 0.03); };
  const beep = n => { if (n === 0) { [60, 64, 67].forEach((m, i) => pluck(hz(m + 12), 0.9, 0.14, i * 0.025)); pluck(hz(48), 0.7, 0.1); } else pluck(hz(60), 0.32, 0.15); };
  const swoosh = ms => { puff('bandpass', 380, 0.7, ms / 1000, 0.1, 0, 1700); };   // pennellata dell'intro
  const finish = place => {
    if (place === 1) [72, 76, 79, 84].forEach((m, i) => pluck(hz(m), 0.9, 0.16, i * 0.11));
    else if (place > 0) { pluck(hz(69), 0.5, 0.13); pluck(hz(74), 0.8, 0.13, 0.14); }
    else { pluck(hz(64), 0.5, 0.12); pluck(hz(57), 0.9, 0.12, 0.2); }
  };
  // atterraggio: v = velocità verticale (px/tick) all'impatto
  const land = v => { const n = now(); if (n - lastLand < 140 || v < 2.2) return; lastLand = n; const k = Math.min(1, (v - 2) / 9); tone(120, 0.2, 'sine', 0.08 + 0.2 * k, 0, 52); puff('lowpass', 600, 0.7, 0.14, 0.04 + 0.08 * k); };
  const bump = k => { const n = now(); if (n - lastBump < 140) return; lastBump = n; puff('bandpass', 420, 1, 0.07, 0.03 + 0.07 * k); };
  const splash = k => { const n = now(); if (n - lastSplash < 220) return; lastSplash = n; puff('bandpass', 1100, 0.8, 0.2, 0.04 + 0.08 * k, 0, 520); };
  // portali: salto = glissando morbido che sale (avanti) o scende (indietro); specchio = due note che si inseguono al contrario; uscita = campanella
  const portal = (type, d) => {
    if (type === 's') { const up = d > 0; puff('bandpass', up ? 420 : 1500, 0.9, 0.34, 0.1, 0, up ? 1500 : 420); tone(up ? 330 : 520, 0.34, 'sine', 0.14, 0, up ? 700 : 260); tone(up ? 495 : 390, 0.26, 'sine', 0.08, 0.07); }
    else if (type === 'm') { puff('bandpass', 1800, 1, 0.55, 0.1, 0, 260); tone(640, 0.55, 'sine', 0.12, 0, 120); [0, 0.15, 0.3].forEach((t, i) => pluck(hz(76 - i * 3), 0.25, 0.1, t)); }
    else { pluck(hz(79), 0.7, 0.14); pluck(hz(86), 0.8, 0.11, 0.12); }
  };
  // colpo di uno spigolo della ruota sul terreno: appena percettibile, molto sordo; a ritmi alti si dirada
  const clack = v => { puff('lowpass', 420 + 160 * v, 0.8, 0.05, 0.015 + 0.035 * v); tone(95 + 40 * v, 0.07, 'sine', 0.02 + 0.045 * v, 0, 60); };
  // uscita da un salto: il "pop" dell'anello che si apre
  const portalOut = d => { tone(d > 0 ? 440 : 360, 0.16, 'sine', 0.14, 0, d > 0 ? 760 : 600); puff('bandpass', 1200, 0.9, 0.2, 0.07, 0, 500); pluck(hz(84), 0.5, 0.07, 0.06); };
  const redraw = () => { pluck(hz(72), 0.4, 0.1); pluck(hz(76), 0.5, 0.1, 0.09); };

  // ---- rotolamento continuo ----------------------------------------------------------------------------
  // un unico rumore filtrato (+ un'ampiezza modulata per i terreni "a ritmo": dentiera, strada ad archi, ghiaia).
  // Volumi e frequenze ridotti rispetto alla prima versione: è un tappeto, non deve farsi notare.
  const SURF = {   // filtro, frequenza base, Q, volume, modulazione (0 = continua)
    grass: ['lowpass', 380, 0.6, 0.042, 0], gravel: ['bandpass', 1250, 0.5, 0.063, 0.45], ice: ['bandpass', 2200, 1.6, 0.028, 0],
    sand: ['bandpass', 1000, 0.5, 0.049, 0], mud: ['lowpass', 220, 1, 0.084, 0.3], rack: ['bandpass', 800, 2, 0.070, 0.9], rough: ['lowpass', 520, 0.9, 0.070, 0.9], water: ['bandpass', 800, 0.6, 0.049, 0.25],
  };
  function rollStart() {
    if (roll || !ensure()) return;
    const s = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; flt.type = 'lowpass'; flt.frequency.value = 400; g.gain.value = 0; am.gain.value = 1;
    lfo.type = 'sine'; lfo.frequency.value = 6; lg.gain.value = 0; lfo.connect(lg); lg.connect(am.gain);
    s.connect(flt); flt.connect(am); am.connect(g); g.connect(master); s.start(); lfo.start();
    // ronzio morbido che sale con la velocità (due sinusoidi leggermente scordate)
    const hum = ctx.createOscillator(), hum2 = ctx.createOscillator(), hg = ctx.createGain(), hf = ctx.createBiquadFilter();
    hum.type = 'sine'; hum2.type = 'sine'; hum.frequency.value = 80; hum2.frequency.value = 121; hg.gain.value = 0; hf.type = 'lowpass'; hf.frequency.value = 320;
    hum.connect(hf); hum2.connect(hf); hf.connect(hg); hg.connect(master); hum.start(); hum2.start();
    roll = { s, flt, g, lg, lfo, am, hum, hum2, hg, tp: 0, tt: now(), cn: 0 };
  }
  // chiamata a ogni fotogramma per la propria bici: speed px/tick, surf = chiave di SURF, air = in aria, per = periodo del ritmo (px)
  // tick: colpi al secondo delle ruote poligonali (0 = ruota tonda, rotolamento liscio)
  function update(speed, surf, air, per, tick) {
    if (!ctx) return; if (!roll) rollStart(); if (!roll) return;
    const t = ctx.currentTime, p = SURF[surf] || SURF.grass;
    const v = Math.max(0, Math.min(1, speed / 7.5)), on = ok() && !air && speed > 0.4;
    roll.flt.type = p[0]; roll.flt.frequency.setTargetAtTime(p[1] * (0.7 + 0.6 * v), t, 0.1); roll.flt.Q.value = p[2];
    roll.g.gain.setTargetAtTime(on ? p[3] * (0.25 + 0.75 * v) : 0, t, 0.09);
    // modulazione: per i terreni a ritmo la frequenza segue l'avanzamento (un colpo per periodo di terreno), ma mai oltre 14 Hz (oltre diventa un ronzio fastidioso)
    const m = p[4], rate = per > 0 ? Math.min(14, speed * 60 / per) : 5 + 8 * v;
    // ronzio e colpi delle ruote
    roll.hum.frequency.setTargetAtTime(66 + 90 * v, t, 0.14); roll.hum2.frequency.setTargetAtTime((66 + 90 * v) * 1.5 * 1.004, t, 0.14);
    roll.hg.gain.setTargetAtTime(on ? 0.010 + 0.019 * v : 0, t, 0.12);
    const nw = now(), dtm = Math.min(100, nw - roll.tt); roll.tt = nw;
    // colpi delle ruote poligonali: al massimo 9 al secondo (più in fretta diventano una raffica); a ritmi alti se ne suona uno ogni due
    if (on && tick > 0.5) { roll.tp += Math.min(18, tick) * dtm / 1000; let n = 0; while (roll.tp >= 1 && n < 3) { roll.tp -= 1; n++; roll.cn++; if (tick <= 9 || (roll.cn & 1)) clack(v); } if (roll.tp > 3) roll.tp = 0; } else roll.tp = 0;
    roll.lfo.frequency.setTargetAtTime(Math.max(1, rate), t, 0.08); roll.lg.gain.setTargetAtTime(m * 0.4, t, 0.08); roll.am.gain.setTargetAtTime(1 - m * 0.4, t, 0.08);
  }
  function silence() { if (roll && ctx) { roll.g.gain.setTargetAtTime(0, ctx.currentTime, 0.05); roll.hg.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } }

  // ---- musica generativa ---------------------------------------------------------------------------------
  // Do maggiore pentatonico, 88 bpm. Quattro battute per progressione (accordi di una battuta), scelte a caso fra alcune
  // progressioni facili da ascoltare; l'arpeggio sceglie note vicine alla precedente e sugli accenti cade sull'accordo.
  const BPM = 88, STEP = 60 / BPM / 2;   // passo = un ottavo
  const PROGS = [   // [radice MIDI, minore?]
    [[48, 0], [45, 1], [41, 0], [43, 0]],
    [[41, 0], [43, 0], [40, 1], [45, 1]],
    [[48, 0], [43, 0], [45, 1], [41, 0]],
    [[45, 1], [41, 0], [48, 0], [43, 0]],
  ];
  const PENTA = [0, 2, 4, 7, 9];
  const POOL = []; for (let o = 60; o <= 84; o += 12) PENTA.forEach(d => POOL.push(o + d)); POOL.sort((a, b) => a - b);
  const DENS = { calm: [0.95, 0.22, 0.5, 0.3, 0.8, 0.22, 0.5, 0.3], drive: [0.95, 0.35, 0.65, 0.4, 0.85, 0.35, 0.65, 0.45] };
  const mus = { on: false, timer: 0, next: 0, step: 0, bar: 0, prog: PROGS[0], pi: 0, last: 72, mood: 'calm', pat: 0 };
  function kal(m, t, vol) {   // kalimba: sinusoide + "tine" metallico breve
    const f = hz(m), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g1 = ctx.createGain(), g2 = ctx.createGain();
    o1.type = 'sine'; o2.type = 'sine'; o1.frequency.value = f; o2.frequency.value = f * 5.4;
    g1.gain.setValueAtTime(0.0001, t); g1.gain.exponentialRampToValueAtTime(vol, t + 0.005); g1.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vol * 0.1, t + 0.003); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o1.connect(g1); o2.connect(g2); g1.connect(musBus); g2.connect(musBus); o1.start(t); o2.start(t); o1.stop(t + 1.3); o2.stop(t + 1.3);
  }
  function padNote(m, t, dur, vol) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = hz(m); o2.frequency.value = hz(m) * 1.004; f.type = 'lowpass'; f.frequency.value = 760; f.Q.value = 0.3;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.7); g.gain.setValueAtTime(vol, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musBus); o.start(t); o2.start(t); o.stop(t + dur + 1); o2.stop(t + dur + 1);
  }
  function bassNote(m, t, vol, len) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(musBus); o.start(t); o.stop(t + len + 0.05);
  }
  function thump(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(105, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.14);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); g.connect(musBus); o.start(t); o.stop(t + 0.22);
  }
  function brush(t, vol) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(f); f.connect(g); g.connect(musBus); s.start(t, Math.random() * 1.5); s.stop(t + 0.1);
  }
  function chordTones(root, minor) { return [root, root + (minor ? 3 : 4), root + 7]; }
  function playStep(t) {
    const s = mus.step % 8, drive = mus.mood === 'drive';
    if (s === 0) {
      if (mus.bar % 4 === 0) { let p; do { p = Math.floor(Math.random() * PROGS.length); } while (PROGS[p] === mus.prog && PROGS.length > 1); mus.prog = PROGS[p]; mus.pat = Math.floor(Math.random() * 3); }
      mus.pi = mus.bar % 4;
      const [root, minor] = mus.prog[mus.pi], ct = chordTones(root, minor), len = STEP * 8;
      ct.forEach(m => padNote(m + 12, t, len, 0.02));
    }
    const [root, minor] = mus.prog[mus.pi], ct = chordTones(root, minor);
    // basso: battuta 1 e 3 (in corsa anche un colpetto sul "e" del 2)
    if (s === 0) bassNote(root - 12, t, 0.12, 1.4);
    if (s === 4) bassNote(root - 12 + (mus.pat === 1 ? 7 : 0), t, 0.08, 1.0);
    if (drive && s === 7) bassNote(root - 12, t, 0.045, 0.4);
    // in corsa: tocco di cassa sulle battute 1 e 3, spazzola sui levare
    if (drive) { if (s === 0 || s === 4) thump(t, 0.09); if (s === 2 || s === 6) brush(t, 0.02); }
    // arpeggio
    const bar4 = mus.bar % 4 === 3, dens = DENS[drive ? 'drive' : 'calm'], pr = dens[s] * (bar4 && s > 4 ? 0.5 : 1) * (mus.pat === 2 && (s === 1 || s === 5) ? 1.6 : 1);
    if (Math.random() < pr || s === 0) {
      let m;
      if (s === 0 || s === 4) { const cand = ct.map(x => { while (x < 67) x += 12; while (x > 88) x -= 12; return x; }); m = cand.reduce((b, x) => Math.abs(x - mus.last) < Math.abs(b - mus.last) ? x : b, cand[0]); if (m === mus.last) m = cand[(cand.indexOf(m) + 1) % 3]; }
      else { const i0 = POOL.findIndex(x => x >= mus.last), j = Math.max(0, Math.min(POOL.length - 1, (i0 < 0 ? POOL.length - 1 : i0) + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)])); m = POOL[j]; while (m < 67) m += 12; while (m > 88) m -= 12; }
      mus.last = m; kal(m, t + (s % 2 ? 0.012 : 0), (s === 0 ? 0.26 : s === 4 ? 0.22 : 0.17) * (0.85 + Math.random() * 0.3));
    }
    mus.step++; if (s === 7) mus.bar++;
  }
  function musicPump(upTo) { if (!ok()) return; if (mus.next < ctx.currentTime) mus.next = ctx.currentTime + 0.05; while (mus.next < upTo) { playStep(mus.next); mus.next += STEP; } }
  function musicStart() {
    if (!ctx || mus.on || muted) return; mus.on = true; mus.next = ctx.currentTime + 0.2;
    mus.timer = setInterval(() => { if (ctx && ctx.state === 'running') musicPump(ctx.currentTime + 0.8); }, 160);
  }
  function musicStop() { mus.on = false; clearInterval(mus.timer); mus.timer = 0; }
  // umore: 'calm' (menu, lobby, disegno, risultati) o 'drive' (gara: un po' di basso e di ritmo, musica poco più bassa)
  function mood(name) { mus.mood = name === 'drive' ? 'drive' : 'calm'; if (musBus && ctx) musBus.gain.setTargetAtTime(MUSIC[mus.mood], ctx.currentTime, 0.6); }

  // ---- muto -------------------------------------------------------------------------------------------
  function setMuted(m) {
    muted = m; try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch (e) {}
    if (master) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.05);
    if (m) musicStop(); else musicStart();
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
  // solo per i test di misura (contesto offline): avvia il motore musicale senza timer e lo fa avanzare a mano
  const _test = { start() { ensure(); mus.on = true; mus.next = 0; }, pump(upTo) { while (mus.next < upTo) { playStep(mus.next); mus.next += STEP; } }, mood, ensure };
  return { init, unlock, click, beep, swoosh, finish, land, bump, splash, redraw, portal, portalOut, update, silence, setMuted, mood, _test, get muted() { return muted; } };
})();
