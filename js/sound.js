// Audio con WebAudio: effetti sintetizzati (nessun file, nessuna licenza) + la tua canzone tagliata sulle battute (audio/musica.mp3) e fatta entrare a tempo.
// Un solo contesto, un solo "rotolamento" continuo che segue velocità e superficie, brevi note "di legno" per gli eventi,
// la canzone a sezioni (calma nei menu, drop sul via, finale ai risultati; un po' più bassa in gara).
// Tutto passa da un filtro che taglia gli acuti e da un riverbero leggero: niente onde quadre o a dente di sega, niente fruscii aspri.
// Parte solo dopo il primo tocco (regola dei browser mobili) e si spegne col pulsante audio; la scelta resta salvata (localStorage).
const Sfx = (() => {
  const KEY = 'dw_sound';
  let ctx = null, master = null, sfxBus = null, musBus = null, rev = null, noiseBuf = null, muted = false, mode = 'all', roll = null, lastSplash = 0, lastBump = 0, lastLand = 0, lastClick = 0;
  try { const v = localStorage.getItem(KEY); mode = v === 'off' ? 'off' : v === 'fx' ? 'fx' : 'all'; muted = mode === 'off'; } catch (e) {}
  const MASTER = 0.5, MUSIC = { calm: 0.7, drive: 0.32 };   // le sezioni calme del file sono già alzate di 6 dB (−19 LUFS contro −15 della gara): con questi guadagni escono a circa −25 / −26 LUFS, sotto gli effetti forti
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
    musBus = ctx.createGain(); musBus.gain.value = mode === 'all' ? MUSIC.calm : 0; musBus.connect(master);
    musFilt = ctx.createBiquadFilter(); musFilt.type = 'lowpass'; musFilt.frequency.value = 18000; musFilt.Q.value = 0.5; musDuck = ctx.createGain(); musDuck.connect(musFilt); musFilt.connect(musBus);   // clip → (abbassa per gli effetti) → (ovatta in acqua) → livello
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); if (c && mode === 'all') musicStart(); }
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
  // 3-2-1: un Do; via: accordo Do-Sol-Re (sus2, sta bene sia col Do minore sia col maggiore della canzone) sul colpo del drop. sched = già programmato da raceStart
  const beep = (n, when, sched) => { if (!sched && now() < mus.beepsUntil) return; const w = when || 0; if (n === 0) { [60, 67, 74].forEach((m, i) => pluck(hz(m + 12), 0.9, 0.12, w + i * 0.02)); pluck(hz(48), 0.7, 0.1, w); } else pluck(hz(60), 0.32, 0.15, w); };
  const swoosh = ms => { puff('bandpass', 380, 0.7, ms / 1000, 0.1, 0, 1700); };   // pennellata dell'intro
  const finish = place => {
    duck(0.4, 0.7, 0.9);
    if (place === 1) [72, 74, 79, 84].forEach((m, i) => pluck(hz(m), 0.9, 0.16, i * 0.11));
    else if (place > 0) { pluck(hz(67), 0.5, 0.13); pluck(hz(74), 0.8, 0.13, 0.14); }
    else { pluck(hz(62), 0.5, 0.12); pluck(hz(55), 0.9, 0.12, 0.2); }
  };
  // atterraggio: v = velocità verticale (px/tick) all'impatto
  const land = v => { const n = now(); if (n - lastLand < 140 || v < 2.2) return; lastLand = n; const k = Math.min(1, (v - 2) / 9); tone(120, 0.2, 'sine', 0.08 + 0.2 * k, 0, 52); if (k > 0.5) duck(0.7, 0.05, 0.3); puff('lowpass', 600, 0.7, 0.14, 0.04 + 0.08 * k); };
  const bump = k => { const n = now(); if (n - lastBump < 140) return; lastBump = n; puff('bandpass', 420, 1, 0.07, 0.03 + 0.07 * k); };
  const splash = k => { const n = now(); if (n - lastSplash < 220) return; lastSplash = n; puff('bandpass', 1100, 0.8, 0.2, 0.04 + 0.08 * k, 0, 520); };
  // portali: salto = glissando morbido che sale (avanti) o scende (indietro); specchio = due note che si inseguono al contrario; uscita = campanella
  const portal = (type, d) => {
    duck(0.75, 0.15, 0.4);
    if (type === 's') { const up = d > 0; puff('bandpass', up ? 420 : 1500, 0.9, 0.34, 0.1, 0, up ? 1500 : 420); tone(up ? 330 : 520, 0.34, 'sine', 0.14, 0, up ? 700 : 260); tone(up ? 495 : 390, 0.26, 'sine', 0.08, 0.07); }
    else if (type === 'm') { puff('bandpass', 1800, 1, 0.55, 0.1, 0, 260); tone(640, 0.55, 'sine', 0.12, 0, 120); [0, 0.15, 0.3].forEach((t, i) => pluck(hz([74, 70, 67][i]), 0.25, 0.1, t)); }
    else { pluck(hz(79), 0.7, 0.14); pluck(hz(86), 0.8, 0.11, 0.12); }
  };
  // colpo di uno spigolo della ruota sul terreno: appena percettibile, molto sordo; a ritmi alti si dirada
  const clack = v => { puff('lowpass', 420 + 160 * v, 0.8, 0.05, 0.015 + 0.035 * v); tone(95 + 40 * v, 0.07, 'sine', 0.02 + 0.045 * v, 0, 60); };
  // uscita da un salto: il "pop" dell'anello che si apre
  const portalOut = d => { tone(d > 0 ? 440 : 360, 0.16, 'sine', 0.14, 0, d > 0 ? 760 : 600); puff('bandpass', 1200, 0.9, 0.2, 0.07, 0, 500); pluck(hz(84), 0.5, 0.07, 0.06); };
  const redraw = () => { pluck(hz(72), 0.4, 0.1); pluck(hz(74), 0.5, 0.1, 0.09); };

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
    muffle(surf === 'water' && !air);
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

  // ---- la canzone, a sezioni --------------------------------------------------------------------------------
  // audio/musica.mp3 è la TUA canzone (120 BPM, 4/4, tonalità di Do) tagliata sulle battute (2 s l'una) e rimessa in un solo file:
  //   0–14 s   battute 1–7 dell'intro (calme), 14 s = il "drop" (inizio battuta 8): la gara parte esattamente lì
  //   14–50 s  il drop e due frasi da 8 battute (si ripetono in loop dalla battuta 10)
  //   50,2–58,2  quattro battute calme prese dal break (per allungare il loop calmo)
  //   58,4–70,4  il finale (le ultime battute, con la coda)
  // Tutto parte e cambia SULLE BATTUTE: ogni pezzo è lungo un numero intero di battute e comincia su una battuta, quindi la griglia resta unica.
  // Il motore programma i pezzi sull'orologio dell'audio (ctx.currentTime), non con i timer: niente ritardi o scatti.
  const PACK = { src: 'audio/musica.mp3', total: 70.4 }, BAR = 2, XF = 0.08, DROP = 14, RACE_END = 50;
  const SEQ = { calm: [[0, 8], [50.2, 58.2]], race: [[18, 50]], fin: [[58.4, 70.4]] };   // pezzi [inizio, fine] in secondi dentro al file
  const mus = { want: 'calm', buf: null, loading: false, live: [], sec: 'calm', i: 0, nextT: 0, grid: 0, xIn: 0.5, first: null, timer: 0, goT: 0, pad: 0, off: 0, beepsUntil: 0 };
  let musDuck = null, musFilt = null, wetNow = false;
  const CURVE = (() => { const n = 24, a = new Float32Array(n), b = new Float32Array(n); for (let k = 0; k < n; k++) { a[k] = Math.sin(k / (n - 1) * Math.PI / 2); b[k] = Math.cos(k / (n - 1) * Math.PI / 2); } return { in: a, out: b }; })();

  function musLoad() {   // scarica e decodifica una volta sola (~1,3 MB di mp3; in memoria sono circa 25 MB)
    if (mus.buf || mus.loading || !ctx) return; mus.loading = true;
    fetch(PACK.src).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .then(b => { mus.buf = b; mus.loading = false; const ex = b.duration - PACK.total; mus.pad = ex > 0.02 ? 1105 / 44100 : 0; musicStart(); })   // se il browser non toglie il ritardo dell'encoder mp3 (~25 ms) lo togliamo noi
      .catch(() => { mus.loading = false; });
  }
  function nextBar() {
    const t = ctx.currentTime + 0.05; if (!mus.live.length) return t;
    return mus.grid + BAR * Math.max(0, Math.ceil((t - mus.grid) / BAR));
  }
  // cambia sezione. at = quando (di default alla prossima battuta), x = durata della dissolvenza (corta = dissolvenza PRIMA della battuta, il colpo resta intatto),
  // first = primo pezzo (per l'"arrivo" al drop), grid = dove cade una battuta della nuova sezione
  function goto(sec, o) {
    o = o || {}; const silent = !mus.live.length, t = o.at != null ? o.at : nextBar(), x = o.x != null ? o.x : silent ? 0.5 : XF;
    for (const n of mus.live) {
      if (n.t0 >= t + (x > 0.1 ? x : 0) - 0.001) { try { n.src.stop(); } catch (e) {} try { n.gx.disconnect(); } catch (e) {} n.dead = true; continue; }
      const w0 = x > 0.1 ? t : t - x; n.gx.gain.cancelScheduledValues(w0); n.gx.gain.setValueAtTime(1, w0); n.gx.gain.setValueCurveAtTime(CURVE.out, w0, x);
      try { n.src.stop(w0 + x + 0.06); } catch (e) {}
    }
    mus.live = mus.live.filter(n => !n.dead);
    mus.sec = sec; mus.i = 0; mus.nextT = t; mus.xIn = x; mus.first = o.first || null; mus.grid = o.grid != null ? o.grid : t;
    pump();
  }
  function schedNext() {
    let clip = mus.first; mus.first = null;
    if (!clip) { if (mus.i >= SEQ[mus.sec].length) { mus.i = 0; if (mus.sec === 'fin') { mus.sec = 'calm'; mus.xIn = 1.5; } } clip = SEQ[mus.sec][mus.i++]; }
    const a = clip[0], b = clip[1], dur = b - a, t = mus.nextT, xi = mus.xIn, e = t + dur;
    const src = ctx.createBufferSource(), g = ctx.createGain(), gx = ctx.createGain(); src.buffer = mus.buf;
    let ts = t, off = a;
    if (xi <= 0.1) { const pre = Math.min(xi, a); ts = t - pre; off = a - pre; const w = Math.max(pre, 0.004); g.gain.setValueAtTime(0, ts); g.gain.setValueCurveAtTime(CURVE.in, ts, w); }
    else { g.gain.setValueAtTime(0, t); g.gain.setValueCurveAtTime(CURVE.in, t, xi); }
    g.gain.setValueAtTime(1, e - XF); g.gain.setValueCurveAtTime(CURVE.out, e - XF, XF);
    src.connect(g); g.connect(gx); gx.connect(musDuck);
    src.start(Math.max(ts, ctx.currentTime), off + mus.pad + (ts < ctx.currentTime ? ctx.currentTime - ts : 0), dur + (t - ts) + 0.02);
    mus.live.push({ src, g, gx, t0: t, t1: e }); mus.nextT = e; mus.xIn = XF;
  }
  function pump() {
    if (!ctx || !mus.buf || mode !== 'all') return;
    let guard = 0; while (mus.nextT < ctx.currentTime + 1.5 && guard++ < 6) schedNext();
    const c = ctx.currentTime; mus.live = mus.live.filter(n => n.t1 + 0.3 > c);
  }
  function killAll() { clearInterval(mus.timer); mus.timer = 0; mus.live.forEach(n => { try { n.src.stop(); } catch (e) {} try { n.gx.disconnect(); } catch (e) {} }); mus.live = []; }
  function raceEntry() {   // la gara parte su una battuta: si arriva al drop con le battute dell'intro e il colpo cade esattamente al "via"
    const c = ctx.currentTime, tGo = mus.goT, left = tGo - c;
    if (left > 0.5) { const k = Math.min(7, Math.floor((left - 0.2) / BAR)); if (k >= 1) goto('race', { at: tGo - k * BAR, x: 0.5, first: [DROP - k * BAR, RACE_END], grid: tGo }); else goto('race', { at: c + 0.05, x: 0.3, first: [DROP - (left - 0.05), RACE_END], grid: tGo }); }
    else goto('race', { at: c + 0.05, x: 0.5 });   // già in gara (musica riaccesa dopo il via): si entra nel ciclo
  }
  function musicStart() {
    if (!ctx || mode !== 'all') return; clearTimeout(mus.off);
    if (!mus.buf) { musLoad(); return; }
    if (!mus.timer) mus.timer = setInterval(pump, 200);
    if (mus.live.length) return;
    if (mus.want === 'race') raceEntry(); else goto(mus.want === 'fin' ? 'fin' : 'calm', { at: ctx.currentTime + 0.05, x: 0.5 });
  }
  function musicStop() { clearTimeout(mus.off); mus.off = setTimeout(() => { if (mode !== 'all') killAll(); }, 400); }   // dopo la dissolvenza
  // umore (lo chiama il cambio di schermata): 'calm' = menu, lobby, disegno; 'drive' = gara (il motore la fa partire con raceStart); 'finale' = risultati
  function mood(name) {
    const w = name === 'drive' ? 'race' : name === 'finale' ? 'fin' : 'calm'; mus.want = w;
    if (musBus && ctx && mode === 'all') musBus.gain.setTargetAtTime(MUSIC[w === 'race' ? 'drive' : 'calm'], ctx.currentTime, 0.6);
    if (!ctx || mode !== 'all' || !mus.buf || !mus.live.length || w === 'race') return;
    if (w === 'calm' && mus.sec !== 'calm') goto('calm', { x: 1.5 });
    else if (w === 'fin' && mus.sec !== 'fin') goto('fin', { x: XF });
  }
  // la gara parte a startMs (Date.now): programma 3-2-1-via sull'orologio dell'audio e il drop della canzone sul "via"
  function raceStart(startMs) {
    if (!ensure()) return; const left = (startMs - Date.now()) / 1000, lat = Math.min(0.25, ctx.outputLatency || 0);
    mus.goT = ctx.currentTime + left - lat; mus.want = 'race';
    if (ctx.state === 'running' && !muted) {
      mus.beepsUntil = now() + left * 1000 + 1200;
      [3, 2, 1, 0].forEach(n => { const w = mus.goT - n - ctx.currentTime; if (w > -0.02) beep(n, Math.max(0, w), true); });
    }
    if (mode === 'all') { if (mus.buf) raceEntry(); else musicStart(); }
  }
  // gli effetti forti abbassano un attimo la musica (e l'acqua la rende ovattata)
  function duck(d, hold, rel) { if (!ctx || !musDuck) return; const t = ctx.currentTime; musDuck.gain.cancelScheduledValues(t); musDuck.gain.setTargetAtTime(d, t, 0.03); musDuck.gain.setTargetAtTime(1, t + hold, rel / 3); }
  function muffle(on) { if (on === wetNow || !ctx || !musFilt) return; wetNow = on; musFilt.frequency.setTargetAtTime(on ? 750 : 18000, ctx.currentTime, on ? 0.1 : 0.25); }

  // ---- modalità audio: 'all' (musica + effetti) → 'fx' (solo effetti) → 'off' (muto) ---------------------------
  function paintBtn() { const b = document.getElementById('btn-sound'); if (!b) return; b.classList.toggle('muted', mode === 'off'); b.classList.toggle('fx', mode === 'fx'); b.setAttribute('aria-pressed', mode === 'off' ? 'true' : 'false'); b.dataset.mode = mode; }
  function setMode(m) {
    mode = m; muted = m === 'off'; try { localStorage.setItem(KEY, m); } catch (e) {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
    if (musBus) musBus.gain.setTargetAtTime(m === 'all' ? MUSIC[mus.want === 'race' ? 'drive' : 'calm'] : 0, ctx.currentTime, 0.08);
    if (m === 'all') musicStart(); else musicStop();
    paintBtn(); try { window.dispatchEvent(new CustomEvent('dw-sound-mode', { detail: m })); } catch (e) {}
  }
  const setMuted = m => setMode(m ? 'off' : 'all');
  function init() {
    const b = document.getElementById('btn-sound');
    paintBtn();
    if (b) b.addEventListener('click', e => { e.stopPropagation(); unlock(); setMode(mode === 'all' ? 'fx' : mode === 'fx' ? 'off' : 'all'); if (mode !== 'off') click(); });
    const first = () => { unlock(); };
    ['pointerdown', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, first, { passive: true }));
    document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('button, .btn'); if (t && t.id !== 'btn-sound') { unlock(); click(); } }, true);
    document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (!muted) { ctx.resume(); if (mode === 'all') musicStart(); } });
  }
  return { init, unlock, click, beep, swoosh, finish, land, bump, splash, redraw, portal, portalOut, update, silence, setMuted, mood, raceStart, get muted() { return muted; }, get mode() { return mode; } };
})();
