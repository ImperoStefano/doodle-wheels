(() => {
  const els = {
    menu: document.getElementById('screen-menu'), lobby: document.getElementById('screen-lobby'),
    draw: document.getElementById('screen-draw'), race: document.getElementById('screen-race'),
    results: document.getElementById('screen-results'), name: document.getElementById('input-name'),
    code: document.getElementById('input-code'), btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'), menuError: document.getElementById('menu-error'),
    roomCode: document.getElementById('room-code'), playerList: document.getElementById('player-list'),
    btnStartRace: document.getElementById('btn-start-race'), lobbyHint: document.getElementById('lobby-hint'),
    lenPicker: document.getElementById('len-picker'), lenHint: document.getElementById('len-hint'),
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

  let myVertices = null, wheels = {}, drawTimerHandle = null, latestRacers = {}, raceMeta = {}, raceLoopHandle = null, snapshotLoopHandle = null;
  let ctx2d = null, minimapCtx = null, smoothCamX = 0, particles = [], myRedrawsLeft = 2;
  // viewW/viewH: dimensioni del mondo visibili sullo schermo, in "unità logiche" (indipendenti
  // dalla risoluzione fisica). Su schermi stretti (telefoni) viewScale < 1 così si vede più
  // pista invece di restare incollati a un fotogramma stretto come su desktop.
  let viewScale = 1, viewW = 0, viewH = 0, minimapMetrics = { w: 0, h: 0 };
  // lunghezza della pista scelta dall'host in lobby, e ultima pista giocata (per "Rigioca stessa pista")
  let trackLen = 'lunga', currentLayout = null, keepTrack = false;
  let lastCallSent = false, lastCallEnd = 0;

  function showScreen(name) { ['menu', 'lobby', 'draw', 'race', 'results'].forEach(s => els[s].classList.toggle('screen--active', s === name)); }

  els.btnHost.addEventListener('click', () => { const name = els.name.value.trim(); if (name) Net.hostGame(name); else showMenuError(I18n.t('menu.err.name')); });
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
    if (Net.isHost) { els.btnStartRace.disabled = c < 1; els.btnStartRace.style.display = 'block'; els.lobbyHint.textContent = ''; els.lenPicker.style.display = 'block'; }
    else { els.btnStartRace.style.display = 'none'; els.lobbyHint.textContent = I18n.t('lobby.hostcfg'); els.lenPicker.style.display = 'none'; }
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

  I18n.onChange(() => {
    els.lenHint.textContent = I18n.t('len.hint.' + trackLen);
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
    const v = inRaceDrawer.getNormalizedVertices(80); els.redrawModal.style.display = 'none'; myRedrawsLeft--;
    els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft });
    if (myRedrawsLeft <= 0) els.redrawUi.style.display = 'none';
    if (Net.isHost) { Sim.updateRacerWheel(Net.myId, v); raceMeta[Net.myId].vertices = v; Net.broadcast({ type: 'wheelUpdated', id: Net.myId, vertices: v }); }
    else { Net.send({ type: 'wheelUpdate', vertices: v }); }
  });

  Net.on('data', ({ from, data }) => {
    if (data.type === 'goToDraw') enterDrawPhase();
    if (data.type === 'wheel' && Net.isHost) receiveWheel(from, data.vertices);
    if (data.type === 'allReady') { wheels = data.wheels || wheels; currentLayout = data.trackLayout; Terrain.applyLayout(data.trackLayout); startCountdown(data.startTime); }
    if (data.type === 'snap') applySnapshot(data.racers);
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
      Terrain.applyLayout(track); Net.broadcast({ type: 'allReady', wheels, startTime: start, trackLayout: track }); startCountdown(start);
    }
  }

  // Durante il conto alla rovescia le bici stanno ferme in griglia (stesse posizioni di partenza
  // della fisica), così si vede già il mondo e chi c'è in gara; il primo snapshot le sostituisce.
  function placeGrid() {
    latestRacers = {}; snapBuf.length = 0;
    Object.keys(raceMeta).forEach((id, i) => {
      const x = 60 + i * 200, y = Sim.GROUND_Y - Terrain.height(x) - 70;
      latestRacers[id] = { id, x, y, angle: 0, fwX: x + 90, fwY: y, fwAngle: 0, rwX: x - 90, rwY: y, rwAngle: 0, vx: 0, finished: false, finishTime: null };
    });
  }

  // Più la gara è lunga, più cambi forma hai: corta 2, media 4, lunga 6 (le zone vere sono ZONES meno partenza e arrivo)
  function redrawsForTrack() { const n = Math.max(0, (Terrain.ZONES ? Terrain.ZONES.length : 0) - 2); return n <= 7 ? 2 : n <= 11 ? 4 : 6; }

  function startCountdown(startTime) {
    showScreen('race'); setupCanvas(); myRedrawsLeft = redrawsForTrack(); els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft }); els.redrawUi.style.display = 'block';
    raceMeta = {}; Object.values(Net.players).forEach(p => raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || preRaceDrawer.fallbackCircle() });
    // l'host tara in anticipo ogni ruota (a fette, durante l'intro): così su terreno normale vanno tutte alla pari
    if (Net.isHost) Object.values(raceMeta).forEach(m => Sim.calibrate(m.vertices, () => {}));
    hideLastCall(); lastCallSent = false;
    Scenery.setTrack(Terrain.ZONES, Terrain.FINISH_X); Flora.setTrack(); Scenery.setQuality(0); Flora.setQuality(0); qSlow = 0;
    Scenery.warmup();
    placeGrid();
    const me = latestRacers[Net.myId]; smoothCamX = me ? me.x - viewW * 0.34 : 0; particles = []; cam.dy = 0; cam.vx = 0; cam.lead = 0.34; lastCamTs = 0;
    startRenderLoop();
    Intro.init(); Intro.play(startTime);

    const tick = setInterval(() => {
      const left = startTime - Date.now();
      if (left <= 3000 && Intro.isRunning()) Intro.stop();   // il 3-2-1 non si sovrappone mai all'intro
      if (left > 3000) els.countdown.textContent = ''; else if (left > 2000) els.countdown.textContent = '3'; else if (left > 1000) els.countdown.textContent = '2'; else if (left > 0) els.countdown.textContent = '1';
      else { els.countdown.textContent = I18n.t('race.go'); clearInterval(tick); setTimeout(() => els.countdown.textContent = '', 700); Scenery.announce(performance.now());
             if (Net.isHost) beginRace(); }
    }, 50);
  }

  function startRenderLoop() { if (!raceLoopHandle) raceLoopHandle = requestAnimationFrame(renderRace); }

  function beginRace() {
    Sim.init(); let i = 0; Object.entries(raceMeta).forEach(([id, m]) => Sim.addRacer(id, m.vertices, m.color, m.name, i++));
    Sim.start(); let last = performance.now();
    let lastSend = 0;
    snapshotLoopHandle = setInterval(() => {
      const now = performance.now(), dt = Math.min(now - last, 100); last = now;
      Sim.tick(dt); const snap = Sim.snapshot(); applySnapshot(snap);
      if (now - lastSend >= 48) { lastSend = now; Net.broadcast({ type: 'snap', racers: snap }); }
      // primo traguardo: gli altri hanno un tempo limitato, e lo sanno
      const gl = Sim.graceLeft();
      if (gl !== null && !lastCallSent) { lastCallSent = true; Net.broadcast({ type: 'lastCall', ms: gl }); showLastCall(gl); }
      if (Sim.allFinished() || Sim.isTimedOut()) { clearInterval(snapshotLoopHandle); const s = Sim.standings(); Net.broadcast({ type: 'results', standings: s }); showResults(s); }
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
  function applySnapshot(racers) {
    const m = {}; racers.forEach(r => { m[r.id] = r; latestRacers[r.id] = r; });
    snapBuf.push({ t: performance.now(), m }); if (snapBuf.length > 16) snapBuf.shift();
  }
  const angLerp = (a, b, k) => { let d = b - a; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  function interpolateRacers(now) {
    const n = snapBuf.length; if (!n) return;
    const rt = now - (Net.isHost ? INTERP_HOST_MS : INTERP_CLIENT_MS);
    let a = snapBuf[0], b = snapBuf[0];
    if (rt >= snapBuf[n - 1].t) { a = b = snapBuf[n - 1]; }
    else if (rt > snapBuf[0].t) { for (let i = n - 1; i > 0; i--) if (snapBuf[i - 1].t <= rt) { a = snapBuf[i - 1]; b = snapBuf[i]; break; } }
    const k = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
    for (const id in b.m) {
      const rb = b.m[id], ra = a.m[id];
      if (!ra || ra === rb || Math.abs(rb.x - ra.x) > 250) { latestRacers[id] = rb; continue; }   // nuovo arrivato o salto (rimessa in pista): niente scivolata
      latestRacers[id] = {
        id, finished: rb.finished, finishTime: rb.finishTime,
        x: ra.x + (rb.x - ra.x) * k, y: ra.y + (rb.y - ra.y) * k, angle: angLerp(ra.angle, rb.angle, k), vx: ra.vx + (rb.vx - ra.vx) * k,
        fwX: ra.fwX + (rb.fwX - ra.fwX) * k, fwY: ra.fwY + (rb.fwY - ra.fwY) * k, fwAngle: angLerp(ra.fwAngle, rb.fwAngle, k),
        rwX: ra.rwX + (rb.rwX - ra.rwX) * k, rwY: ra.rwY + (rb.rwY - ra.rwY) * k, rwAngle: angLerp(ra.rwAngle, rb.rwAngle, k)
      };
    }
  }
  function setupCanvas() { ctx2d = els.raceCanvas.getContext('2d'); minimapCtx = els.minimap.getContext('2d'); resizeCanvas(); }

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
    const speed = Math.max(0, Math.min(1, cam.vx / 520));
    cam.lead += ((0.34 - 0.13 * speed) - cam.lead) * camK(2.5, dt);
    smoothCamX += ((t.x - w * cam.lead) - smoothCamX) * camK(5.5, dt);
    // verticale: dove finirebbe la bici sullo schermo con la linea di terra al 80% dell'altezza
    const y0 = (t.y - Sim.GROUND_Y) + h * 0.8, lo = h * 0.30, hi = h * 0.72;
    let want = 0;
    if (y0 < lo) want = lo - y0; else if (y0 > hi) want = hi - y0;
    want = Math.max(-h * 0.12, Math.min(h * 0.5, want));
    cam.dy += (want - cam.dy) * camK(3, dt);
  }

  function renderRace(ts) {
    const t0 = performance.now();
    interpolateRacers(t0);
    const w = viewW, h = viewH, me = latestRacers[Net.myId];
    updateCamera(Math.min(0.1, (ts - (lastCamTs || ts)) / 1000), w, h); lastCamTs = ts;
    const groundY = h * 0.8 + cam.dy, camX = smoothCamX;
    const SC = Scenery.state;

    Scenery.update(camX, w, h, groundY, t0);
    Flora.update(SC.dt, camX, w, latestRacers);
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

    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return;
      const cy = (y) => y - Sim.GROUND_Y + groundY, cx = r.x - camX;
      if (cx < -250 || cx > w + 250) return;
      drawBike(cx, cy(r.y), r.angle, meta.color);
      drawWheel(r.rwX - camX, cy(r.rwY), r.rwAngle, meta.vertices, meta.color, id === Net.myId);
      drawWheel(r.fwX - camX, cy(r.fwY), r.fwAngle, meta.vertices, meta.color, id === Net.myId);
      drawRider(cx, cy(r.y), r.angle, meta.color, meta.name, id === Net.myId);

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

    Scenery.drawWater(ctx2d, surfBuf, n, SURF_STEP);
    Scenery.drawFront(ctx2d);

    if (t0 - hudAt > 120) { hudAt = t0; updateHud(); updateLastCall(); }
    drawMinimap();
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

  function stopRaceLoops() { if (raceLoopHandle) cancelAnimationFrame(raceLoopHandle); if (snapshotLoopHandle) clearInterval(snapshotLoopHandle); raceLoopHandle = snapshotLoopHandle = null; latestRacers = {}; hideLastCall(); els.redrawUi.style.display = els.redrawModal.style.display = 'none'; }
  function showResults(st) { stopRaceLoops(); releaseWakeLock(); els.resultsList.innerHTML = ''; st.forEach((s, i) => { const li = document.createElement('li'); li.innerHTML = `<span class="results-rank">${rankLabel(i + 1)}</span><span class="color-dot" style="background:${s.color}"></span><span>${escapeHtml(s.name)}</span><span class="results-time">${s.finished ? `${(s.finishTime / 1000).toFixed(2)}s` : I18n.t('res.dnf')}</span>`; els.resultsList.appendChild(li); }); showScreen('results'); }
  els.btnRematch.addEventListener('click', () => { if (Net.isHost) { wheels = {}; keepTrack = true; Net.broadcast({ type: 'restartToDraw' }); enterDrawPhase(); } });
  els.btnBackMenu.addEventListener('click', () => location.reload()); function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } els.code.addEventListener('input', () => els.code.value = els.code.value.toUpperCase());
  I18n.init();
})();
