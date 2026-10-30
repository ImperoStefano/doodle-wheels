(() => {
  const els = {
    menu: document.getElementById('screen-menu'), lobby: document.getElementById('screen-lobby'),
    draw: document.getElementById('screen-draw'), race: document.getElementById('screen-race'),
    results: document.getElementById('screen-results'), name: document.getElementById('input-name'),
    code: document.getElementById('input-code'), btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'), menuError: document.getElementById('menu-error'),
    roomCode: document.getElementById('room-code'), playerList: document.getElementById('player-list'),
    btnStartRace: document.getElementById('btn-start-race'), lobbyHint: document.getElementById('lobby-hint'),
    lenPicker: document.getElementById('len-picker'), lenHint: document.getElementById('len-hint'), modePicker: document.getElementById('mode-picker'), modeHint: document.getElementById('mode-hint'),
    raceWrap: document.querySelector('.race-wrap'), portalFlash: document.getElementById('portal-flash'), portalNote: document.getElementById('portal-note'),
    drawTimer: document.getElementById('draw-timer'), drawCanvas: document.getElementById('draw-canvas'),
    btnClear: document.getElementById('btn-clear'), btnSubmitWheel: document.getElementById('btn-submit-wheel'),
    drawWait: document.getElementById('draw-wait'), redrawUi: document.getElementById('redraw-ui'),
    btnRedrawTrigger: document.getElementById('btn-redraw-trigger'), redrawModal: document.getElementById('redraw-modal'),
    redrawCanvas: document.getElementById('redraw-canvas'), btnCancelRedraw: document.getElementById('btn-cancel-redraw'),
    btnSubmitRedraw: document.getElementById('btn-submit-redraw'), raceCanvas: document.getElementById('race-canvas'),
    countdown: document.getElementById('countdown-overlay'), hudFill: document.getElementById('hud-progress-fill'),
    hudBoard: document.getElementById('hud-leaderboard'), minimap: document.getElementById('minimap-canvas'),
    lastCall: document.getElementById('lastcall'),
    resultsList: document.getElementById('results-list'), btnRematch: document.getElementById('btn-rematch'),
    btnBackMenu: document.getElementById('btn-back-menu'),
  };

  const preRaceDrawer = createWheelDrawer(els.drawCanvas); preRaceDrawer.init();
  const inRaceDrawer = createWheelDrawer(els.redrawCanvas); inRaceDrawer.init();

  // Misure di fluidità (solo con ?perf=1 nell'indirizzo): fps, fotogrammi lunghi, costo del passo fisico, età degli snapshot.
  // Esporta anche window.__perf per gli script di prova. Spento: un solo controllo per fotogramma.
  const Perf = (() => {
    const on = /[?&]perf=1/.test(location.search); if (!on) return { on: false, frame() {}, tick() {}, snap() {} };
    const F = [], T = [], D = { long50: 0, long100: 0, frames: 0, tickMax: 0, snapGapMax: 0, lastSnap: 0 }; let last = 0, el = null, nextUi = 0;
    const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
    return {
      on, D,
      frame(ts, cost) {
        if (last) { const d = ts - last; if (d < 1000) { F.push(d); if (F.length > 240) F.shift(); D.frames++; if (d > 50) D.long50++; if (d > 100) D.long100++; } } last = ts;
        if (cost !== undefined) { T.push(cost); if (T.length > 240) T.shift(); }
        if (ts < nextUi) return; nextUi = ts + 500;
        if (!el) { el = document.createElement('div'); el.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;background:rgba(0,0,0,.72);color:#9f9;font:11px/1.35 monospace;padding:5px 7px;border-radius:6px;pointer-events:none;white-space:pre'; document.body.appendChild(el); }
        const avg = F.length ? F.reduce((a, b) => a + b, 0) / F.length : 0;
        el.textContent = `fps ${avg ? (1000 / avg).toFixed(0) : '-'}  p95 ${q(F, 0.95).toFixed(0)}ms  max ${Math.max(0, ...F).toFixed(0)}ms\n>50ms: ${D.long50}  >100ms: ${D.long100}  su ${D.frames}\ndisegno ${q(T, 0.5).toFixed(1)}ms (p95 ${q(T, 0.95).toFixed(1)})  fisica max ${D.tickMax.toFixed(1)}ms\nsnapshot: buco max ${D.snapGapMax.toFixed(0)}ms`;
      },
      tick(ms) { if (ms > D.tickMax) D.tickMax = ms; },
      snap(now) { if (D.lastSnap) { const g = now - D.lastSnap; if (g > D.snapGapMax) D.snapGapMax = g; } D.lastSnap = now; },
    };
  })();
  if (Perf.on) window.__perf = Perf;
  // Timer della fisica dell'host: un Worker non viene rallentato dal browser quando la scheda va in secondo piano
  // (i setInterval sul thread principale scendono a 1 Hz e bloccherebbero la gara per tutti). Fallback: setInterval.
  const Ticker = (() => {
    const SRC = 'let id=0;onmessage=e=>{clearInterval(id);if(e.data!=="stop")id=setInterval(()=>postMessage(0),e.data);};';
    return {
      start(fn, ms) {
        try {
          const url = URL.createObjectURL(new Blob([SRC], { type: 'application/javascript' })), w = new Worker(url); URL.revokeObjectURL(url);
          let last = 0; w.onmessage = () => { const n = performance.now(); if (n - last < ms * 0.5) return; last = n; fn(); };   // niente raffiche dopo un blocco
          w.postMessage(ms); return { w };
        } catch (e) { return setInterval(fn, ms); }
      },
      stop(h) { if (!h) return; if (h.w) { try { h.w.postMessage('stop'); h.w.terminate(); } catch (e) {} } else clearInterval(h); }
    };
  })();
  let myVertices = null, wheels = {}, drawTimerHandle = null, latestRacers = {}, raceMeta = {}, raceLoopHandle = null, snapshotLoopHandle = null;
  let ctx2d = null, minimapCtx = null, smoothCamX = 0, particles = [], myRedrawsLeft = 2;
  // viewW/viewH: dimensioni del mondo visibili sullo schermo, in "unità logiche" (indipendenti
  // dalla risoluzione fisica). Su schermi stretti (telefoni) viewScale < 1 così si vede più
  // pista invece di restare incollati a un fotogramma stretto come su desktop.
  let viewScale = 1, viewW = 0, viewH = 0, minimapMetrics = { w: 0, h: 0 };
  // lunghezza della pista scelta dall'host in lobby, e ultima pista giocata (per "Rigioca stessa pista")
  let trackLen = 'lunga', currentLayout = null, keepTrack = false, crazy = false;
  let lastCallSent = false, lastCallEnd = 0;

  function showScreen(name) { ['menu', 'lobby', 'draw', 'race', 'results'].forEach(s => els[s].classList.toggle('screen--active', s === name)); }

  els.btnHost.addEventListener('click', () => { const name = els.name.value.trim(); if (name) { Net.hostGame(name); try { Sim.warmCalibration && Sim.warmCalibration(); } catch (e) {} } else showMenuError(I18n.t('menu.err.name')); });
  els.btnJoin.addEventListener('click', () => {
    const name = els.name.value.trim(), code = els.code.value.trim();
    if (!name || code.length !== 4) return showMenuError(I18n.t('menu.err.namecode')); Net.joinGame(code, name);
  });
  function showMenuError(msg) { els.menuError.textContent = msg; }

  Net.on('error', err => showMenuError(err.message || I18n.t('menu.err.net')));
  Net.on('hostLeft', () => { alert(I18n.t('race.hostleft')); location.reload(); });
  Net.on('roomReady', ({ code }) => { els.roomCode.textContent = code; renderPlayerList(); showScreen('lobby'); });
  Net.on('playersChanged', () => {
    renderPlayerList();
    // Only a client still on the menu is moved to the lobby. (Before, ANY update — e.g. someone
    // disconnecting mid-race — threw every client back to the lobby.)
    if (!Net.isHost && els.menu.classList.contains('screen--active')) { showScreen('lobby'); els.roomCode.textContent = els.code.value.trim().toUpperCase(); }
    // host: a player leaving while everyone else already submitted must start the race
    if (Net.isHost && els.draw.classList.contains('screen--active')) checkAllWheelsIn();
  });

  function renderPlayerList() {
    els.playerList.innerHTML = '';
    Object.values(Net.players).forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="color-dot" style="background:${p.color}"></span><span class="player-name">${escapeHtml(p.name)}</span>${p.isHost ? '<span class="host-badge">HOST</span>' : ''}`;
      els.playerList.appendChild(li);
    });
    const c = Object.keys(Net.players).length;
    if (Net.isHost) { els.btnStartRace.disabled = c < 1; els.btnStartRace.style.display = 'block'; els.lobbyHint.textContent = ''; els.lenPicker.style.display = els.modePicker.style.display = 'block'; }
    else { els.btnStartRace.style.display = 'none'; els.lobbyHint.textContent = I18n.t('lobby.hostcfg'); els.lenPicker.style.display = els.modePicker.style.display = 'none'; }
  }

  // Scelta lunghezza pista (solo host). Le durate sono quelle misurate in simulazione con ruote diverse.
  function rankLabel(n) { if (I18n.lang === 'en') { const v = n % 100; return n + ((v >= 11 && v <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10 > 3 ? 0 : n % 10]); } return n + '°'; }
  const LEN_HINTS = {
    corta: '7 zone · circa 40 secondi',
    media: '11 zone · circa 1 minuto',
    lunga: '15 zone con ponti · circa 1 minuto e mezzo',
  };
  els.lenPicker.querySelectorAll('[data-len]').forEach(btn => btn.addEventListener('click', () => {
    trackLen = btn.dataset.len; keepTrack = false;
    els.lenPicker.querySelectorAll('[data-len]').forEach(b => b.classList.toggle('seg-btn--on', b === btn));
    els.lenHint.textContent = I18n.t('len.hint.' + trackLen);
  }));
  els.lenHint.textContent = I18n.t('len.hint.' + trackLen);
  els.modePicker.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
    crazy = btn.dataset.mode === 'crazy';
    els.modePicker.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('seg-btn--on', b === btn));
    els.modeHint.textContent = I18n.t('mode.hint.' + (crazy ? 'crazy' : 'normal'));
  }));
  els.modeHint.textContent = I18n.t('mode.hint.normal');

  I18n.onChange(() => {
    els.lenHint.textContent = I18n.t('len.hint.' + trackLen); els.modeHint.textContent = I18n.t('mode.hint.' + (crazy ? 'crazy' : 'normal'));
    if (els.btnRedrawTrigger && els.btnRedrawTrigger.textContent) els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft });
    if (lastCallEnd) updateLastCall();
    try { if (els.lobby.classList.contains('screen--active')) renderPlayerList(); } catch (e) {}
  });

  els.btnStartRace.addEventListener('click', () => { if (Net.isHost) { wheels = {}; Net.broadcast({ type: 'goToDraw' }); enterDrawPhase(); } });
  els.btnClear.addEventListener('click', () => preRaceDrawer.clear());
  els.drawCanvas.addEventListener('pointerup', () => els.btnSubmitWheel.disabled = !preRaceDrawer.isValid());
  els.btnSubmitWheel.addEventListener('click', () => submitWheel());

  els.btnRedrawTrigger.addEventListener('click', () => {
    if (myRedrawsLeft > 0) { inRaceDrawer.clear(); els.btnSubmitRedraw.disabled = true; els.redrawModal.style.display = 'flex'; }
  });
  els.redrawCanvas.addEventListener('pointerup', () => els.btnSubmitRedraw.disabled = !inRaceDrawer.isValid());
  els.btnCancelRedraw.addEventListener('click', () => els.redrawModal.style.display = 'none');
  els.btnSubmitRedraw.addEventListener('click', () => {
    if (!inRaceDrawer.isValid()) return;
    const v = inRaceDrawer.getNormalizedVertices(80); els.redrawModal.style.display = 'none'; myRedrawsLeft--; if (typeof Sfx !== 'undefined') Sfx.redraw();
    els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft });
    if (myRedrawsLeft <= 0) els.redrawUi.style.display = 'none';
    if (Net.isHost) { Sim.updateRacerWheel(Net.myId, v); raceMeta[Net.myId].vertices = v; Net.broadcast({ type: 'wheelUpdated', id: Net.myId, vertices: v }); }
    else { Net.send({ type: 'wheelUpdate', vertices: v }); }
  });

  Net.on('data', ({ from, data }) => {
    if (data.type === 'goToDraw') enterDrawPhase();
    if (data.type === 'wheel' && Net.isHost) receiveWheel(from, data.vertices);
    if (data.type === 'allReady') { wheels = data.wheels || wheels; currentLayout = data.trackLayout; crazy = !!data.crazy; Terrain.applyLayout(data.trackLayout, crazy ? { crazy: true, np: data.np } : undefined); startCountdown(data.startTime); }
    if (data.type === 'snap') { if (data.pu) syncUsed(data.pu); applySnapshot(data.racers, data.ts); }
    if (data.type === 'results') showResults(data.standings);
    if (data.type === 'lastCall') showLastCall(data.ms);
    if (data.type === 'restartToDraw') enterDrawPhase();
    if (data.type === 'wheelUpdate' && Net.isHost && raceMeta[from]) { Sim.updateRacerWheel(from, data.vertices); raceMeta[from].vertices = data.vertices; Net.broadcast({ type: 'wheelUpdated', id: from, vertices: data.vertices }); }
    if (data.type === 'wheelUpdated') { if (raceMeta[data.id]) raceMeta[data.id].vertices = data.vertices; }
  });

  // Wake Lock: senza, lo schermo si spegne da solo dopo un po' di inattività (tipico durante
  // una gara in cui si guarda senza toccare) — sul telefono host questo blocca anche la fisica,
  // perché il browser rallenta drasticamente i timer di una scheda non visibile. Supportato su
  // tutti i browser principali (anche Safari iOS, da qualche tempo), ma con controllo esplicito
  // perché su versioni più vecchie l'API semplicemente non esiste: in quel caso il gioco
  // funziona comunque, solo senza questa protezione.
  let wakeLock = null;
  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { /* negato dal sistema o dall'utente: il gioco funziona comunque */ }
  }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }
  // Il wake lock si rilascia da solo quando la scheda passa in background, e va richiesto di
  // nuovo quando torna visibile — altrimenti dopo un cambio app rapido lo schermo tornerebbe a spegnersi da solo.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' &&
        (els.draw.classList.contains('screen--active') || els.race.classList.contains('screen--active'))) {
      requestWakeLock();
    }
  });

  function enterDrawPhase() {
    requestWakeLock();
    stopRaceLoops(); raceStarting = false; preRaceDrawer.clear(); myVertices = null; els.btnSubmitWheel.disabled = true; els.drawWait.textContent = ''; showScreen('draw');
    let t = 30; els.drawTimer.textContent = t; clearInterval(drawTimerHandle);
    drawTimerHandle = setInterval(() => { t--; els.drawTimer.textContent = Math.max(t, 0); if (t <= 0) { clearInterval(drawTimerHandle); if (!myVertices) submitWheel(true); } }, 1000);
  }

  function submitWheel(forced) {
    if (myVertices || (!preRaceDrawer.isValid() && !forced)) return;
    myVertices = preRaceDrawer.isValid() ? preRaceDrawer.getNormalizedVertices(80) : preRaceDrawer.fallbackCircle();
    clearInterval(drawTimerHandle); els.btnSubmitWheel.disabled = true; els.drawWait.textContent = I18n.t('draw.wait');
    if (Net.isHost) receiveWheel(Net.myId, myVertices); else Net.send({ type: 'wheel', vertices: myVertices });
  }

  let raceStarting = false; // host: never start the countdown twice

  // La taratura non dipende dalla pista: l'host la fa partire appena arriva ogni ruota (a fette di 8 ms), mentre gli altri
  // stanno ancora disegnando, così al via è già pronta anche su telefoni lenti. Al conto alla rovescia resta in cache.
  function receiveWheel(id, vertices) { wheels[id] = vertices; if (Net.isHost) Sim.calibrate(vertices, () => {}); checkAllWheelsIn(); }

  // Counts only players still connected: a player who leaves while drawing can't hang the host
  // forever waiting for a wheel that will never arrive.
  function checkAllWheelsIn() {
    if (raceStarting) return;
    const ids = Object.keys(Net.players), got = ids.filter(id => wheels[id]).length;
    els.drawWait.textContent = I18n.t('draw.ready', { got, n: ids.length });
    if (ids.length > 0 && got >= ids.length) {
      raceStarting = true;
      const start = Date.now() + 3500 + (Intro.DUR || 0) + 300;  // intro col pennello, poi 3-2-1
      // "Rigioca stessa pista" riusa il percorso appena giocato; altrimenti ne nasce uno nuovo della lunghezza scelta
      const track = (keepTrack && currentLayout) ? currentLayout : Terrain.generateRandomLayout(Terrain.LENGTHS[trackLen] || Terrain.LENGTHS.lunga);
      currentLayout = track; keepTrack = false;
      const np = ids.length; Terrain.applyLayout(track, crazy ? { crazy: true, np } : undefined); Net.broadcast({ type: 'allReady', wheels, startTime: start, trackLayout: track, crazy, np }); startCountdown(start);
    }
  }

  // Durante il conto alla rovescia le bici stanno ferme in griglia (stesse posizioni di partenza
  // della fisica), così si vede già il mondo e chi c'è in gara; il primo snapshot le sostituisce.
  function placeGrid() {
    latestRacers = {}; snapBuf.length = 0; snapOff = null;
    Object.keys(raceMeta).forEach((id, i) => {
      const x = 60, y = Sim.GROUND_Y - Terrain.height(x) - 70;   // stesso punto di partenza per tutti (come nella fisica)
      latestRacers[id] = { id, x, y, angle: 0, fwX: x + 90, fwY: y, fwAngle: 0, rwX: x - 90, rwY: y, rwAngle: 0, vx: 0, finished: false, finishTime: null };
    });
  }

  // Più la gara è lunga, più cambi forma hai: corta 2, media 4, lunga 6 (le zone vere sono ZONES meno partenza e arrivo)
  function redrawsForTrack() { const n = Math.max(0, (Terrain.ZONES ? Terrain.ZONES.length : 0) - 2); return n <= 7 ? 2 : n <= 11 ? 4 : 6; }

  function startCountdown(startTime) {
    showScreen('race'); setupCanvas(); myRedrawsLeft = redrawsForTrack(); els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft }); els.redrawUi.style.display = 'block';
    raceMeta = {}; Object.values(Net.players).forEach(p => raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || preRaceDrawer.fallbackCircle() });
    // l'host tara in anticipo ogni ruota (a fette, durante l'intro): così su terreno normale vanno tutte alla pari
    if (Net.isHost) { Object.values(raceMeta).forEach(m => Sim.calibrate(m.vertices, () => {})); Sim.prepareAsync(); }   // mondo fisico costruito a fette durante l'intro
    hideLastCall(); lastCallSent = false;
    Scenery.setTrack(Terrain.ZONES, Terrain.FINISH_X); Flora.setTrack(); Scenery.setQuality(0); Flora.setQuality(0); qSlow = 0;
    Scenery.warmup();
    placeGrid();
    const me = latestRacers[Net.myId]; smoothCamX = me ? me.x - viewW * 0.34 : 0; particles = []; cam.dy = 0; cam.vx = 0; cam.lead = 0.34; lastCamTs = 0;
    startRenderLoop();
    Intro.init(); Intro.play(startTime);

    resetPortals(); let lastCd = -2; aud.fin = false; aud.y = null; aud.air = false; aud.wet = false; aud.ang = undefined;
    const tick = setInterval(() => {
      const left = startTime - Date.now();
      if (left <= 3000 && Intro.isRunning()) Intro.stop();   // il 3-2-1 non si sovrappone mai all'intro
      const cd = left > 3000 ? -1 : left > 2000 ? 3 : left > 1000 ? 2 : left > 0 ? 1 : 0;
      if (cd !== lastCd) { lastCd = cd; if (cd >= 0 && typeof Sfx !== 'undefined') Sfx.beep(cd === 0 ? 0 : cd); }
      if (left > 3000) els.countdown.textContent = ''; else if (left > 2000) els.countdown.textContent = '3'; else if (left > 1000) els.countdown.textContent = '2'; else if (left > 0) els.countdown.textContent = '1';
      else { els.countdown.textContent = I18n.t('race.go'); clearInterval(tick); setTimeout(() => els.countdown.textContent = '', 700); Scenery.announce(performance.now());
             if (Net.isHost) beginRace(); }
    }, 50);
  }

  function startRenderLoop() { if (!raceLoopHandle) raceLoopHandle = requestAnimationFrame(renderRace); }

  function beginRace() {
    Sim.ensureWorld(); let i = 0; Object.entries(raceMeta).forEach(([id, m]) => Sim.addRacer(id, m.vertices, m.color, m.name, i++));
    Sim.start(); let last = performance.now();
    let lastSend = 0;
    snapshotLoopHandle = Ticker.start(() => {
      const now = performance.now(), dt = Math.min(now - last, 100); last = now;
      const pt = Perf.on ? performance.now() : 0; Sim.tick(dt); const snap = Sim.snapshot(), pu = Sim.usedPortals(); syncUsed(pu); applySnapshot(snap); if (Perf.on) Perf.tick(performance.now() - pt);
      if (now - lastSend >= 48) { lastSend = now; Net.broadcast({ type: 'snap', racers: snap, ts: now, pu }); }
      // primo traguardo: gli altri hanno un tempo limitato, e lo sanno
      const gl = Sim.graceLeft();
      if (gl !== null && !lastCallSent) { lastCallSent = true; Net.broadcast({ type: 'lastCall', ms: gl }); showLastCall(gl); }
      if (Sim.allFinished() || Sim.isTimedOut()) { Ticker.stop(snapshotLoopHandle); snapshotLoopHandle = null; const s = Sim.standings(); Net.broadcast({ type: 'results', standings: s }); showResults(s); }
    }, 16);
    startRenderLoop();
  }

  function showLastCall(ms) { lastCallEnd = performance.now() + ms; els.lastCall.style.display = 'block'; updateLastCall(); }
  function hideLastCall() { lastCallEnd = 0; els.lastCall.style.display = 'none'; }
  function updateLastCall() {
    if (!lastCallEnd) return;
    const s = Math.max(0, Math.ceil((lastCallEnd - performance.now()) / 1000));
    els.lastCall.textContent = I18n.t('race.lastcall', { s });
  }

  // Fluidità: la fisica gira a scatti (host: ogni ~16 ms, ma i client ricevono 20 snapshot/s) mentre lo schermo va a 60/120 Hz.
  // Disegnare l'ultimo snapshot fa "scattare" bici e ruote a 20 fps. Si tengono gli ultimi snapshot e si disegna un istante
  // nel passato (INTERP_MS) interpolando fra i due che lo racchiudono: nessun controllo da inseguire, quindi il ritardo è invisibile.
  const snapBuf = [];
  const INTERP_HOST_MS = 45, INTERP_CLIENT_MS = 130;
  // Tempo di riproduzione: sul client gli snapshot arrivano a raffiche (rete, riordino, pause del thread), quindi datarli
  // con l'istante di ARRIVO fa muovere le bici a scatti anche se l'host li ha prodotti a ritmo costante. L'host li timbra
  // (ts, il suo orologio) e il client li colloca sul proprio orologio con lo scarto minimo osservato (latenza minima),
  // che risale piano per seguire la deriva degli orologi: lo spaziamento resta quello dell'host.
  let snapOff = null;
  function applySnapshot(racers, ts) {
    const m = {}; racers.forEach(r => { m[r.id] = r; latestRacers[r.id] = r; });
    const arr = performance.now(); let t = arr;
    if (!Net.isHost && typeof ts === 'number') {
      const off = arr - ts;
      snapOff = snapOff === null ? off : Math.min(off, snapOff + 0.4);
      t = ts + snapOff;
      const last = snapBuf.length ? snapBuf[snapBuf.length - 1].t : -1e9;
      if (t <= last) t = last + 1;                      // ordine garantito
    }
    if (Perf.on && !Net.isHost) Perf.snap(arr);
    snapBuf.push({ t, m }); if (snapBuf.length > 16) snapBuf.shift();
  }
  const angLerp = (a, b, k) => { let d = b - a; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  function interpolateRacers(now) {
    const n = snapBuf.length; if (!n) return;
    const rt = now - (Net.isHost ? INTERP_HOST_MS : INTERP_CLIENT_MS);
    let a = snapBuf[0], b = snapBuf[0];
    if (rt >= snapBuf[n - 1].t) {
      a = b = snapBuf[n - 1];
      // snapshot in ritardo: invece di fermare le bici si prosegue sulla velocità dell'ultimo intervallo (al massimo 120 ms)
      if (n >= 2 && rt - b.t > 0 && rt - b.t < 400) {
        const p = snapBuf[n - 2], dt = b.t - p.t;
        if (dt > 1) {
          const kx = Math.min(rt - b.t, 120) / dt;
          for (const id in b.m) {
            const rb = b.m[id], ra = p.m[id]; if (!ra || ra === rb || Math.abs(rb.x - ra.x) > 250 || rb.pe !== ra.pe) { latestRacers[id] = rb; continue; }
            const ex = (u, v) => v + (v - u) * kx, ea = (u, v) => { let d = v - u; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return v + d * kx; };
            latestRacers[id] = { id, finished: rb.finished, finishTime: rb.finishTime, x: ex(ra.x, rb.x), y: ex(ra.y, rb.y), angle: ea(ra.angle, rb.angle), vx: rb.vx, dir: rb.dir, pe: rb.pe, pt: rb.pt, pd: rb.pd, pi: rb.pi, im: rb.im,
              fwX: ex(ra.fwX, rb.fwX), fwY: ex(ra.fwY, rb.fwY), fwAngle: ea(ra.fwAngle, rb.fwAngle), rwX: ex(ra.rwX, rb.rwX), rwY: ex(ra.rwY, rb.rwY), rwAngle: ea(ra.rwAngle, rb.rwAngle) };
          }
          return;
        }
      }
    }
    else if (rt > snapBuf[0].t) { for (let i = n - 1; i > 0; i--) if (snapBuf[i - 1].t <= rt) { a = snapBuf[i - 1]; b = snapBuf[i]; break; } }
    const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
    for (const id in b.m) {
      const rb = b.m[id], ra = a.m[id];
      if (!ra || ra === rb || Math.abs(rb.x - ra.x) > 250 || rb.pe !== ra.pe) { latestRacers[id] = rb; continue; }   // portale (teletrasporto) o nuovo arrivato o salto (rimessa in pista): niente scivolata
      latestRacers[id] = {
        id, finished: rb.finished, finishTime: rb.finishTime,
        x: ra.x + (rb.x - ra.x) * k, y: ra.y + (rb.y - ra.y) * k, angle: angLerp(ra.angle, rb.angle, k), vx: ra.vx + (rb.vx - ra.vx) * k, dir: rb.dir, pe: rb.pe, pt: rb.pt, pd: rb.pd, pi: rb.pi, im: rb.im,
        fwX: ra.fwX + (rb.fwX - ra.fwX) * k, fwY: ra.fwY + (rb.fwY - ra.fwY) * k, fwAngle: angLerp(ra.fwAngle, rb.fwAngle, k),
        rwX: ra.rwX + (rb.rwX - ra.rwX) * k, rwY: ra.rwY + (rb.rwY - ra.rwY) * k, rwAngle: angLerp(ra.rwAngle, rb.rwAngle, k)
      };
    }
  }
  function setupCanvas() { ctx2d = els.raceCanvas.getContext('2d'); installTextFix(ctx2d); minimapCtx = els.minimap.getContext('2d'); resizeCanvas(); }

  // Lo zoom guardava solo la larghezza: un telefono ruotato in orizzontale è largo (sopra la
  // soglia, quindi "zoom 1, nessun ritocco") ma bassissimo — bici enormi, HUD che copre tutto,
  // pochissima pista visibile. Ora guarda la dimensione PIÙ STRETTA fra le due (larghezza
  // rispetto a REF_W, altezza rispetto a REF_H) e zooma di conseguenza, qualunque sia
  // l'orientamento. Sopra entrambe le soglie resta 1 = nessun cambiamento rispetto a desktop.
  const REF_W = 760, REF_H = 900, MIN_VIEW_SCALE = 0.42;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth, cssH = window.innerHeight;

    viewScale = Math.min(1, Math.max(MIN_VIEW_SCALE, Math.min(cssW / REF_W, cssH / REF_H)));
    viewW = cssW / viewScale;
    viewH = cssH / viewScale;

    // Backing store a risoluzione fisica (nitido sugli schermi retina/telefono), dimensione CSS
    // invariata; poi un'unica trasformazione che unisce DPR e zoom, così tutto il resto del
    // codice di disegno continua a lavorare in "unità logiche" (viewW/viewH) senza saperlo.
    els.raceCanvas.width = Math.round(cssW * dpr);
    els.raceCanvas.height = Math.round(cssH * dpr);
    els.raceCanvas.style.width = cssW + 'px';
    els.raceCanvas.style.height = cssH + 'px';
    if (ctx2d) ctx2d.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
    Scenery.setView(dpr, viewScale);

    resizeMinimap();
  }
  window.addEventListener('resize', resizeCanvas);

  // Stessa correzione DPR per la minimappa: legge la sua dimensione CSS reale (qualunque essa
  // sia) e adatta la risoluzione interna, invece di restare sfocata sugli schermi retina.
  function resizeMinimap() {
    if (!minimapCtx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = els.minimap.getBoundingClientRect();
    if (!rect.width || !rect.height) return; // non ancora visibile/layoutato
    els.minimap.width = Math.round(rect.width * dpr);
    els.minimap.height = Math.round(rect.height * dpr);
    minimapMetrics = { w: rect.width, h: rect.height };
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Altezza visiva del terreno campionata ogni SURF_STEP px di schermo: la calcolo UNA volta per
  // fotogramma e la passo a scenery (terreno, acqua) invece di richiamare Terrain per ogni disegno.
  const SURF_STEP = 20;
  const surfBuf = new Float32Array(256);
  let hudAt = 0, lastTs = 0, qSlow = 0;

  // ---- Telecamera ---------------------------------------------------------------------------------
  // - segue la tua bici con una morbidezza indipendente dagli fps (prima era un 8% fisso a fotogramma);
  // - guarda avanti: più vai forte, più la bici scivola verso sinistra e vedi la pista che arriva;
  // - segue anche in verticale: su rampe e salite la bici resta nella fascia 30%-72% dello schermo
  //   (prima la linea del terreno era fissa e un salto alto portava la bici fuori quadro);
  // - dopo il traguardo (o se sei fuori) segue il primo ancora in gara, senza fermarsi sul vuoto.
  const cam = { dy: 0, lead: 0.34, vx: 0 };
  let lastCamTs = 0;
  const camK = (k, dt) => 1 - Math.exp(-k * dt);
  function updateCamera(dt, w, h) {
    let t = latestRacers[Net.myId];
    if (t && t.finished) {
      let best = null; for (const id in latestRacers) { const r = latestRacers[id]; if (!r.finished && (!best || r.x > best.x)) best = r; }
      if (best) t = best;
    }
    if (!t) return;
    if (!dt) dt = 1 / 60;
    cam.vx += ((t.vx || 0) * 60 - cam.vx) * camK(3, dt);
    const speed = Math.min(1, Math.abs(cam.vx) / 520), ld = 0.34 - 0.13 * speed;   // specchiato: la bici va verso sinistra nel mondo (= destra sullo schermo), quindi si guarda davanti a lei
    cam.lead += ((t.dir === -1 ? 1 - ld : ld) - cam.lead) * camK(2.5, dt);
    smoothCamX += ((t.x - w * cam.lead) - smoothCamX) * camK(5.5, dt);
    // verticale: dove finirebbe la bici sullo schermo con la linea di terra al 80% dell'altezza
    const y0 = (t.y - Sim.GROUND_Y) + h * 0.8, lo = h * 0.30, hi = h * 0.72;
    let want = 0;
    if (y0 < lo) want = lo - y0; else if (y0 > hi) want = hi - y0;
    want = Math.max(-h * 0.12, Math.min(h * 0.5, want));
    cam.dy += (want - cam.dy) * camK(3, dt);
  }

  // ---- suoni della propria bici: rotolamento per superficie, atterraggi, schizzi (nessun dato in più sulla rete) ----
  const aud = { air: false, vy: 0, y: null, t: 0, fin: false, wet: false };
  function wheelR(meta) { if (!meta) return 20; if (meta.R) return meta.R; let m = 20; try { m = Math.max(...meta.vertices.map(v => Array.isArray(v) ? Math.hypot(v[0], v[1]) : Math.hypot(v.x, v.y))); } catch (e) {} return meta.R = Math.max(14, Math.min(60, m)); }
  function raceAudio(r, meta, now) {
    if (r.finished) { if (!aud.fin) { aud.fin = true; Sfx.silence(); let pl = 1; for (const id in latestRacers) { const o = latestRacers[id]; if (id !== r.id && o.finished && o.finishTime <= r.finishTime) pl++; } Sfx.finish(pl); } return; }
    const dt = aud.t ? Math.max(1, now - aud.t) : 16; aud.t = now;
    const R = wheelR(meta), gr = Sim.GROUND_Y - Terrain.height(r.rwX) - r.rwY, gf = Sim.GROUND_Y - Terrain.height(r.fwX) - r.fwY;
    const air = Math.min(gr, gf) - R > 12, vy = aud.y === null ? 0 : (r.y - aud.y) / (dt / 16.67);
    aud.y = r.y;
    if (aud.air && !air) Sfx.land(Math.max(aud.vy, vy));
    aud.air = air; aud.vy = vy;
    const zk = Terrain.zoneKeyAt(r.rwX), wet = zk === 'water' && Terrain.isWater(r.rwX);
    if (wet && !aud.wet) Sfx.splash(Math.min(1, Math.abs(r.vx) / 8));
    aud.wet = wet;
    const gk = Terrain.gripAt(r.rwX), p = Terrain.patchAt(r.rwX);
    let surf = gk || (zk === 'gravel' ? 'gravel' : zk === 'water' ? 'water' : 'grass');
    if (wet) surf = 'water'; else if (p && (p.kind === 'boulders' || p.kind === 'logs' || p.kind === 'stairs' || p.kind === 'holes' || p.kind === 'whoops')) surf = 'rough';
    // colpi dei vertici: giri al secondo della ruota posteriore × numero di vertici (solo forme con pochi spigoli; le tonde rotolano lisce)
    let ticks = 0; const nv = meta && meta.vertices ? meta.vertices.length : 0;
    if (aud.ang !== undefined && nv >= 3 && nv <= 14) { let d = r.rwAngle - aud.ang; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; ticks = Math.abs(d) / (2 * Math.PI) / (dt / 1000) * nv; }
    aud.ang = r.rwAngle;
    Sfx.update(Math.abs(r.vx), surf, air && !wet, gk === 'rack' && p ? p.per : gk === 'rough' && p && p.S ? p.S : 0, ticks);
  }

  // alone luminoso della bici immune ai portali (dopo un salto): nel colore del giocatore, pulsa e si spegne negli ultimi 600 ms
  function drawGlow(ctx, x, y, color, im, now, top) {
    const a = Math.min(1, im / 600), pul = 0.85 + 0.15 * Math.sin(now / 110), R = 165 * pul, rgb = hexRgb(color);
    ctx.save();
    const gr = ctx.createRadialGradient(x, y, 20, x, y, R);
    gr.addColorStop(0, `rgba(255,255,255,${(0.7 * a).toFixed(3)})`); gr.addColorStop(0.45, `rgba(${rgb},${(0.42 * a).toFixed(3)})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    if (!top) { ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
    // anello tratteggiato (bianco sotto, colore sopra: si legge su ogni sfondo)
    ctx.lineCap = 'round'; ctx.setLineDash([9, 11]); ctx.lineDashOffset = -now / 35;
    for (const [col, w] of [[`rgba(255,255,255,${(0.95 * a).toFixed(3)})`, 6], [`rgba(${rgb},${a.toFixed(3)})`, 3]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(x, y, 122 * pul, 82 * pul, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.setLineDash([]);
    // scintille che salgono
    for (let k = 0; k < 9; k++) { const t = now / 560 + k * 0.7, rr = 78 + 36 * Math.sin(t * 1.7 + k), px = x + Math.cos(t) * rr * 1.35, py = y + Math.sin(t) * rr * 0.82 - ((now / 22 + k * 11) % 36) * 0.5, s = 2.2 + (k % 3);
      ctx.fillStyle = `rgba(255,255,255,${(0.95 * a).toFixed(3)})`; ctx.beginPath(); ctx.arc(px, py, s + 1.6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`; ctx.beginPath(); ctx.arc(px, py, s, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return '255,255,255'; const n = parseInt(m[1], 16); return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255); }
  // ---- portali (modalità pazza): effetti solo per la propria bici ----
  const pst = { gone: {}, mirrored: false, myExit: -1, pe: 0, now: 0 }, arrAt = {}, peSeen = {};
  const easeOutBack = u => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  let noteTimer = 0, mirrorF = 1, mirT = 0;   // mirrorF: 1 = normale, -1 = specchiato (si anima in ~0,55 s)
  // Lo specchio è nel disegno (non in CSS) così le scritte restano leggibili: ogni testo viene raddrizzato attorno al suo punto di ancoraggio.
  function installTextFix(ctx) {
    if (ctx.__tfix) return; ctx.__tfix = true;
    const ft = ctx.fillText.bind(ctx), st = ctx.strokeText.bind(ctx);
    const wrap = fn => (t, x, y, mw) => {
      const f = mirrorF; if (f === 1) return fn(t, x, y, mw);
      if (Math.abs(f) < 0.05) return;
      ctx.save(); ctx.translate(x, y); ctx.scale(1 / f, 1);
      if (f < 0) { const a = ctx.textAlign; ctx.textAlign = (a === 'left' || a === 'start') ? 'right' : (a === 'right' || a === 'end') ? 'left' : a; }
      fn(t, 0, 0, mw); ctx.restore();
    };
    ctx.fillText = wrap(ft); ctx.strokeText = wrap(st);
  }
  function showNote(key, ms, extra) {
    const n = els.portalNote; n.textContent = I18n.t(key) + (extra ? ' ' + extra : ''); n.style.display = 'block'; n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
    clearTimeout(noteTimer); if (ms) noteTimer = setTimeout(() => { n.style.display = 'none'; }, ms);
  }
  function setMirrorView(on) { els.raceWrap.classList.toggle('mirrored', on); }
  // portali consumati da qualcuno (lo dice l'host in ogni snapshot): spariscono per tutti, con la dissolvenza a schizzi
  function syncUsed(pu) { const n = performance.now(); for (let i = 0; i < pu.length; i++) if (!pst.gone[pu[i]]) pst.gone[pu[i]] = n; }
  function resetPortals() { for (const k in arrAt) delete arrAt[k]; for (const k in peSeen) delete peSeen[k]; pst.gone = {}; pst.mirrored = false; pst.myExit = -1; pst.pe = 0; mirrorF = 1; mirT = 0; clearTimeout(noteTimer); els.portalNote.style.display = 'none'; setMirrorView(false); }
  // anello d'arrivo: dove la bici riappare dopo un salto. Si apre veloce, resta un attimo e si dissolve in schizzi (come i portali usati).
  const ARR_Q = { id: 9000, kind: 'shift', x: 0 };
  function drawArrivals(ctx, camX, w, gy, now, layer) {
    for (const id in arrAt) {
      const a = arrAt[id], tt = now - a.t0; if (tt > 1900) { delete arrAt[id]; continue; }
      const sx = a.x - camX; if (sx < -120 || sx > w + 120) continue;
      const k = Math.min(1, easeOutBack(Math.min(1, tt / 380))), d = Math.max(0, (tt - 1000) / 900);
      Props.portalDraw(ctx, ARR_Q, sx, gy - Terrain.height(a.x), now / 1000, Math.max(0.01, k * (1 - d * d)), d, pst, layer);
    }
  }
  function portalFx(me, now) {
    pst.now = now; if (!Terrain.PORTALS.length) return;
    for (const id in latestRacers) { const r = latestRacers[id]; if (r.pe === undefined) continue; if (r.pe !== (peSeen[id] || 0)) { peSeen[id] = r.pe; if (r.pt === 's') arrAt[id] = { t0: now, x: r.x, from: r.x - r.pd, mine: id === Net.myId }; } }
    if (!me) return;
    if (me.pe !== pst.pe) {
      pst.pe = me.pe; if (me.pi >= 0) pst.gone[me.pi] = now;
      if (me.pt === 's') { els.portalFlash.classList.remove('go'); void els.portalFlash.offsetWidth; els.portalFlash.classList.add('go'); showNote(me.pd > 0 ? 'crazy.fwd' : 'crazy.back', 1800, (me.pd > 0 ? '+' : '−') + Math.round(Math.abs(me.pd))); }
      else if (me.pt === 'm') { const mp = Terrain.PORTALS.find(p => p.id === me.pi); pst.myExit = mp ? mp.exit : -1; showNote('crazy.mirror', 0); }
      else if (me.pt === 'x') { clearTimeout(noteTimer); els.portalNote.style.display = 'none'; }
      if (typeof Sfx !== 'undefined') { Sfx.portal(me.pt, me.pd); if (me.pt === 's') setTimeout(() => { try { Sfx.portalOut(me.pd); } catch (e) {} }, 330); }
    }
    const mir = me.dir === -1; if (mir !== pst.mirrored) { pst.mirrored = mir; setMirrorView(mir); }
  }

  window.__dw = { racers: () => latestRacers, portals: () => pst };   // solo per i test
  function renderRace(ts) {
    const t0 = performance.now();
    interpolateRacers(t0);
    const w = viewW, h = viewH, me = latestRacers[Net.myId];
    updateCamera(Math.min(0.1, (ts - (lastCamTs || ts)) / 1000), w, h); lastCamTs = ts;
    const groundY = h * 0.8 + cam.dy, camX = smoothCamX;
    const SC = Scenery.state;

    Scenery.update(camX, w, h, groundY, t0);
    Flora.update(SC.dt, camX, w, latestRacers);
    // specchio (modalità "meno classica"): tutto il mondo si ribalta attorno al centro dello schermo
    const mdt = mirT ? Math.min(0.1, (t0 - mirT) / 1000) : 0; mirT = t0;
    const mt = pst.mirrored ? -1 : 1; if (mirrorF !== mt) { mirrorF = mirrorF < mt ? Math.min(mt, mirrorF + mdt * 3.6) : Math.max(mt, mirrorF - mdt * 3.6); }
    const mirrored = mirrorF !== 1; if (mirrored) { ctx2d.save(); ctx2d.translate(w / 2, 0); ctx2d.scale(mirrorF, 1); ctx2d.translate(-w / 2, 0); }
    Scenery.drawBackdrop(ctx2d);

    // Spruzzi delle ruote (ghiaccio, ghiaia, acqua)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx2d.fillStyle = `${p.col}${p.life})`; ctx2d.beginPath(); ctx2d.arc(p.x - camX, p.y - Sim.GROUND_Y + groundY, p.size, 0, Math.PI * 2); ctx2d.fill();
    }

    // Terreno: altezza "naturale" (compreso il vuoto sotto i ponti, dove si vede l'acqua o il crepaccio)
    const n = Math.min(256, Math.floor((w + SURF_STEP) / SURF_STEP) + 1);
    for (let i = 0; i < n; i++) surfBuf[i] = Terrain.naturalHeight(camX + i * SURF_STEP);
    Scenery.drawGround(ctx2d, surfBuf, n, SURF_STEP);

    Props.drawPatches(ctx2d, camX, w, groundY, SC);
    Props.drawRamps(ctx2d, camX, w, groundY);
    Props.drawSigns(ctx2d, camX, w, groundY);
    Props.drawFinish(ctx2d, camX, w, groundY, SC);
    Props.drawBridges(ctx2d, camX, w, groundY, SC);
    Flora.drawLilies(ctx2d, camX, w, groundY, SC);
    Flora.draw(ctx2d, camX, w, groundY, SC);

    portalFx(me, t0);
    if (Terrain.PORTALS.length) { Props.drawPortals(ctx2d, camX, w, groundY, t0 / 1000, pst, 'back'); drawArrivals(ctx2d, camX, w, groundY, t0, 'back'); }
    // la propria bici per ultima: alla partenza (stesso punto per tutti) resta sopra le altre
    Object.entries(latestRacers).sort((a, b) => (a[0] === Net.myId) - (b[0] === Net.myId)).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return;
      const cy = (y) => y - Sim.GROUND_Y + groundY, cx = r.x - camX;
      if (cx < -250 || cx > w + 250) return;
      let sc = 1; const ar = arrAt[id];
      if (ar) { const tt = t0 - ar.t0; sc = tt < 130 ? 0.001 : Math.max(0.001, Math.min(1.15, easeOutBack(Math.min(1, (tt - 130) / 420)))); }
      if (sc !== 1) { ctx2d.save(); ctx2d.translate(cx, cy(r.y)); ctx2d.scale(sc, sc); ctx2d.translate(-cx, -cy(r.y)); }
      if (r.im > 0) drawGlow(ctx2d, cx, cy(r.y), meta.color, r.im, t0);
      drawBike(cx, cy(r.y), r.angle, meta.color);
      drawWheel(r.rwX - camX, cy(r.rwY), r.rwAngle, meta.vertices, meta.color, id === Net.myId);
      drawWheel(r.fwX - camX, cy(r.fwY), r.fwAngle, meta.vertices, meta.color, id === Net.myId);
      drawRider(cx, cy(r.y), r.angle, meta.color, meta.name, id === Net.myId);
      if (r.im > 0) drawGlow(ctx2d, cx, cy(r.y), meta.color, r.im, t0, true);
      if (sc !== 1) ctx2d.restore();

      const zk = Terrain.zoneKeyAt(r.x);
      const wet = zk === 'water' && Terrain.isWater(r.x);
      if (r.vx > 1.5 && Terrain.gripAt(r.rwX) === 'sand' && Math.random() > 0.35 && particles.length < 90) particles.push({ x: r.rwX, y: r.rwY + 22, vx: -Math.random() * (r.vx * 0.6) - 0.6, vy: -Math.random() * 3.2 - 0.6, life: 1, size: Math.random() * 3 + 2, col: 'rgba(226,196,126,' });
      if (r.vx > 2 && (zk === 'gravel' || zk === 'ice' || wet) && Math.random() > 0.4 && particles.length < 90) {
        let col = 'rgba(148,163,184,', sz = Math.random() * 3 + 2, vy = -Math.random() * 3;
        if (zk === 'ice') { col = 'rgba(255,255,255,'; sz = 2.5; }
        else if (wet) { col = 'rgba(59,130,246,'; sz = Math.random() * 5 + 3; vy = -Math.random() * 6 - 2; }
        particles.push({ x: r.rwX, y: r.rwY + 20, vx: -Math.random() * (r.vx * 0.5) - 1, vy, life: 1, size: sz, col });
      }
    });

    if (Terrain.PORTALS.length) { Props.drawPortals(ctx2d, camX, w, groundY, t0 / 1000, pst, 'front'); drawArrivals(ctx2d, camX, w, groundY, t0, 'front'); }
    if (me && typeof Sfx !== 'undefined') raceAudio(me, raceMeta[Net.myId], t0);
    Scenery.drawWater(ctx2d, surfBuf, n, SURF_STEP);
    Scenery.drawFront(ctx2d);

    if (mirrored) ctx2d.restore();
    if (t0 - hudAt > 120) { hudAt = t0; updateHud(); updateLastCall(); }
    drawMinimap();
    if (Perf.on) Perf.frame(ts, performance.now() - t0);
    qualityGuard(ts, performance.now() - t0);
    raceLoopHandle = requestAnimationFrame(renderRace);
  }

  // Se il dispositivo fatica davvero (fotogrammi lenti E disegno costoso) si abbassa la qualità dello
  // scenario di un gradino: meno particelle/ombre, poi niente primo piano. Non risale: evita oscillazioni.
  function qualityGuard(ts, cost) {
    if (lastTs) {
      const d = ts - lastTs;
      if (d < 250) { if (d > 28 && cost > 7) qSlow++; else if (d < 20 && qSlow > 0) qSlow--; }
    }
    lastTs = ts;
    if (qSlow > 90 && Scenery.quality < 2) { Scenery.setQuality(Scenery.quality + 1); Flora.setQuality(Scenery.quality); qSlow = 0; }
  }

  function drawBike(x, y, a, c) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(a); ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round';
    ctx2d.shadowColor = 'rgba(0,0,0,0.4)'; ctx2d.shadowBlur = 10; ctx2d.shadowOffsetY = 8;
    ctx2d.lineWidth = 7; ctx2d.strokeStyle = c; ctx2d.beginPath();
    ctx2d.moveTo(-90, 0); ctx2d.lineTo(0, 0); ctx2d.lineTo(-20, -55); ctx2d.lineTo(-90, 0);
    ctx2d.moveTo(0, 0); ctx2d.lineTo(55, -45); ctx2d.lineTo(-20, -55); ctx2d.stroke();
    ctx2d.shadowColor = 'transparent';
    ctx2d.strokeStyle = '#94a3b8'; ctx2d.lineWidth = 6; ctx2d.beginPath(); ctx2d.moveTo(90, 0); ctx2d.lineTo(55, -45); ctx2d.stroke();
    ctx2d.strokeStyle = '#1e293b'; ctx2d.lineWidth = 5; ctx2d.beginPath(); ctx2d.moveTo(55, -45); ctx2d.lineTo(45, -70); ctx2d.lineTo(60, -80); ctx2d.stroke();
    ctx2d.fillStyle = c; ctx2d.beginPath(); ctx2d.arc(60, -80, 7, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.strokeStyle = '#1e293b'; ctx2d.lineWidth = 5; ctx2d.beginPath(); ctx2d.moveTo(-20, -55); ctx2d.lineTo(-25, -75); ctx2d.stroke();
    ctx2d.fillStyle = '#1e293b'; ctx2d.beginPath(); ctx2d.ellipse(-30, -78, 16, 5, Math.PI/12, 0, 2*Math.PI); ctx2d.fill();
    ctx2d.fillStyle = '#475569'; ctx2d.beginPath(); ctx2d.arc(0, 0, 10, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.restore();
  }

  function drawWheel(x, y, a, v, c, isMe) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(a);

    // Raggi adattabili dinamicamente alla forma tracciata
    if (v && v.length > 0) {
      ctx2d.lineWidth = 2;
      ctx2d.strokeStyle = 'rgba(15,23,42,0.2)';
      const step = Math.max(1, Math.floor(v.length / 6));
      for (let i = 0; i < v.length; i += step) {
        let p = v[i];
        ctx2d.beginPath(); ctx2d.moveTo(0, 0); ctx2d.lineTo(p.x, p.y); ctx2d.stroke();
      }
    }

    ctx2d.beginPath(); v.forEach((p, i) => i === 0 ? ctx2d.moveTo(p.x, p.y) : ctx2d.lineTo(p.x, p.y)); ctx2d.closePath();
    ctx2d.fillStyle = c; ctx2d.globalAlpha = 0.85; ctx2d.fill();
    ctx2d.globalAlpha = 1; ctx2d.lineWidth = isMe ? 4 : 2.5; ctx2d.strokeStyle = '#0f172a'; ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(0, 0, 8, 0, Math.PI * 2); ctx2d.fillStyle = '#0f172a'; ctx2d.fill(); ctx2d.restore();
  }

  function drawRider(x, y, a, c, n, isMe) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(a); ctx2d.translate(-15, -105);
    ctx2d.beginPath(); ctx2d.arc(0, 0, 18, 0, Math.PI * 2); ctx2d.fillStyle = '#fff'; ctx2d.fill();
    ctx2d.lineWidth = 4; ctx2d.strokeStyle = c; ctx2d.stroke();
    ctx2d.fillStyle = '#0f172a'; ctx2d.font = 'bold 12px "Space Grotesk"'; ctx2d.textAlign = 'center'; ctx2d.fillText((n||'?').trim().slice(0,2).toUpperCase(), 0, 5);
    if (isMe) { ctx2d.rotate(-a); ctx2d.fillStyle = '#0f172a'; ctx2d.font = 'bold 14px "Kalam"'; ctx2d.fillText(I18n.t('race.you'), 0, -32); }
    ctx2d.restore();
  }

  function updateHud() {
    const me = latestRacers[Net.myId]; if (me) els.hudFill.style.width = Math.max(0, Math.min(100, (me.x / Terrain.FINISH_X) * 100)) + '%';
    const rkd = Object.entries(latestRacers).map(([id, r]) => ({ id, x: r.x, meta: raceMeta[id] })).filter(r => r.meta).sort((a, b) => b.x - a.x);
    els.hudBoard.innerHTML = ''; rkd.forEach((r, i) => {
      const li = document.createElement('li'); if (r.id === Net.myId) li.classList.add('is-me');
      li.innerHTML = `<span class="rank-num">${i + 1}</span><span class="color-dot" style="background:${r.meta.color}"></span><span>${escapeHtml(r.meta.name)}</span>`;
      els.hudBoard.appendChild(li);
    });
  }

  function drawMinimap() {
    const w = minimapMetrics.w, h = minimapMetrics.h, tL = Terrain.FINISH_X; minimapCtx.clearRect(0, 0, w, h);
    const toPx = (x) => (Math.max(0, Math.min(1, x / tL))) * (w - 10) + 5;
    Terrain.ZONES.forEach(z => {
      const zS = Math.max(0, z.start), zE = Math.min(tL, z.end); if (zE <= zS) return;
      minimapCtx.fillStyle = z.color; minimapCtx.fillRect(toPx(zS), h/2 - 4, Math.max(1, toPx(zE) - toPx(zS)), 8);
    });
    minimapCtx.strokeStyle = '#0f172a'; minimapCtx.lineWidth = 1.5; minimapCtx.strokeRect(5, h/2 - 4, w - 10, 8);
    // i ponti come piccoli archi sopra la barra
    minimapCtx.strokeStyle = '#7c4a1d'; minimapCtx.lineWidth = 2;
    Terrain.BRIDGES.forEach(b => { const a = toPx(b.start), c = toPx(b.end); minimapCtx.beginPath(); minimapCtx.moveTo(a, h/2 - 4); minimapCtx.quadraticCurveTo((a + c) / 2, h/2 - 12, c, h/2 - 4); minimapCtx.stroke(); });
    minimapCtx.fillStyle = '#0f172a'; minimapCtx.fillRect(w - 6, h/2 - 10, 2, 20);
    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return; const isMe = id === Net.myId;
      minimapCtx.beginPath(); minimapCtx.arc(toPx(r.x), h/2, isMe ? 6 : 4, 0, Math.PI * 2);
      minimapCtx.fillStyle = meta.color; minimapCtx.fill(); minimapCtx.lineWidth = 1.5; minimapCtx.strokeStyle = '#0f172a'; minimapCtx.stroke();
    });
  }

  function stopRaceLoops() { if (typeof Sfx !== 'undefined') Sfx.silence(); resetPortals(); if (raceLoopHandle) cancelAnimationFrame(raceLoopHandle); if (snapshotLoopHandle) Ticker.stop(snapshotLoopHandle); raceLoopHandle = snapshotLoopHandle = null; latestRacers = {}; hideLastCall(); els.redrawUi.style.display = els.redrawModal.style.display = 'none'; }
  function showResults(st) { stopRaceLoops(); releaseWakeLock(); if (typeof Sfx !== 'undefined' && !aud.fin) Sfx.finish(0); els.resultsList.innerHTML = ''; st.forEach((s, i) => { const li = document.createElement('li'); li.innerHTML = `<span class="results-rank">${rankLabel(i + 1)}</span><span class="color-dot" style="background:${s.color}"></span><span>${escapeHtml(s.name)}</span><span class="results-time">${s.finished ? `${(s.finishTime / 1000).toFixed(2)}s` : I18n.t('res.dnf')}</span>`; els.resultsList.appendChild(li); }); showScreen('results'); }
  els.btnRematch.addEventListener('click', () => { if (Net.isHost) { wheels = {}; keepTrack = true; Net.broadcast({ type: 'restartToDraw' }); enterDrawPhase(); } });
  els.btnBackMenu.addEventListener('click', () => location.reload()); function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } els.code.addEventListener('input', () => els.code.value = els.code.value.toUpperCase());
  I18n.init(); if (typeof Sfx !== 'undefined') Sfx.init();
})();
