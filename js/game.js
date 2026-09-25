(() => {
  const els = {
    menu: document.getElementById('screen-menu'), lobby: document.getElementById('screen-lobby'),
    draw: document.getElementById('screen-draw'), race: document.getElementById('screen-race'),
    results: document.getElementById('screen-results'), name: document.getElementById('input-name'),
    code: document.getElementById('input-code'), btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'), menuError: document.getElementById('menu-error'),
    roomCode: document.getElementById('room-code'), playerList: document.getElementById('player-list'),
    btnStartRace: document.getElementById('btn-start-race'), lobbyHint: document.getElementById('lobby-hint'),
    drawTimer: document.getElementById('draw-timer'), drawCanvas: document.getElementById('draw-canvas'), 
    btnClear: document.getElementById('btn-clear'), btnSubmitWheel: document.getElementById('btn-submit-wheel'), 
    drawWait: document.getElementById('draw-wait'), redrawUi: document.getElementById('redraw-ui'), 
    btnRedrawTrigger: document.getElementById('btn-redraw-trigger'), redrawModal: document.getElementById('redraw-modal'), 
    redrawCanvas: document.getElementById('redraw-canvas'), btnCancelRedraw: document.getElementById('btn-cancel-redraw'), 
    btnSubmitRedraw: document.getElementById('btn-submit-redraw'), raceCanvas: document.getElementById('race-canvas'), 
    countdown: document.getElementById('countdown-overlay'), hudFill: document.getElementById('hud-progress-fill'), 
    hudBoard: document.getElementById('hud-leaderboard'), minimap: document.getElementById('minimap-canvas'), 
    resultsList: document.getElementById('results-list'), btnRematch: document.getElementById('btn-rematch'), 
    btnBackMenu: document.getElementById('btn-back-menu'),
  };

  const preRaceDrawer = createWheelDrawer(els.drawCanvas); preRaceDrawer.init();
  const inRaceDrawer = createWheelDrawer(els.redrawCanvas); inRaceDrawer.init();

  let myVertices = null, wheels = {}, drawTimerHandle = null, latestRacers = {}, raceMeta = {}, raceLoopHandle = null, snapshotLoopHandle = null;
  let ctx2d = null, minimapCtx = null, smoothCamX = 0, particles = [], myRedrawsLeft = 2;

  function showScreen(name) { ['menu', 'lobby', 'draw', 'race', 'results'].forEach(s => els[s].classList.toggle('screen--active', s === name)); }

  els.btnHost.addEventListener('click', () => { const name = els.name.value.trim(); if (name) Net.hostGame(name); else showMenuError('Nome richiesto.'); });
  els.btnJoin.addEventListener('click', () => {
    const name = els.name.value.trim(), code = els.code.value.trim();
    if (!name || code.length !== 4) return showMenuError('Nome e codice (4 lettere) richiesti.'); Net.joinGame(code, name);
  });
  function showMenuError(msg) { els.menuError.textContent = msg; }
  
  Net.on('error', err => showMenuError(err.message || 'Errore di rete.'));
  Net.on('hostLeft', () => { alert('L\'host ha chiuso.'); location.reload(); });
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
    if (Net.isHost) { els.btnStartRace.disabled = c < 1; els.btnStartRace.style.display = 'block'; els.lobbyHint.textContent = ''; } 
    else { els.btnStartRace.style.display = 'none'; els.lobbyHint.textContent = 'L\'host sta configurando...'; }
  }

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
    els.btnRedrawTrigger.textContent = `Cambia Forma (${myRedrawsLeft})`;
    if (myRedrawsLeft <= 0) els.redrawUi.style.display = 'none';
    if (Net.isHost) { Sim.updateRacerWheel(Net.myId, v); raceMeta[Net.myId].vertices = v; Net.broadcast({ type: 'wheelUpdated', id: Net.myId, vertices: v }); } 
    else { Net.send({ type: 'wheelUpdate', vertices: v }); }
  });

  Net.on('data', ({ from, data }) => {
    if (data.type === 'goToDraw') enterDrawPhase();
    if (data.type === 'wheel' && Net.isHost) receiveWheel(from, data.vertices);
    if (data.type === 'allReady') { wheels = data.wheels || wheels; Terrain.applyLayout(data.trackLayout); startCountdown(data.startTime); }
    if (data.type === 'snap') applySnapshot(data.racers);
    if (data.type === 'results') showResults(data.standings);
    if (data.type === 'restartToDraw') enterDrawPhase();
    if (data.type === 'wheelUpdate' && Net.isHost && raceMeta[from]) { Sim.updateRacerWheel(from, data.vertices); raceMeta[from].vertices = data.vertices; Net.broadcast({ type: 'wheelUpdated', id: from, vertices: data.vertices }); }
    if (data.type === 'wheelUpdated') { if (raceMeta[data.id]) raceMeta[data.id].vertices = data.vertices; }
  });

  function enterDrawPhase() {
    stopRaceLoops(); raceStarting = false; preRaceDrawer.clear(); myVertices = null; els.btnSubmitWheel.disabled = true; els.drawWait.textContent = ''; showScreen('draw');
    let t = 30; els.drawTimer.textContent = t; clearInterval(drawTimerHandle);
    drawTimerHandle = setInterval(() => { t--; els.drawTimer.textContent = Math.max(t, 0); if (t <= 0) { clearInterval(drawTimerHandle); if (!myVertices) submitWheel(true); } }, 1000);
  }

  function submitWheel(forced) {
    if (myVertices || (!preRaceDrawer.isValid() && !forced)) return;
    myVertices = preRaceDrawer.isValid() ? preRaceDrawer.getNormalizedVertices(80) : preRaceDrawer.fallbackCircle();
    clearInterval(drawTimerHandle); els.btnSubmitWheel.disabled = true; els.drawWait.textContent = 'In attesa...';
    if (Net.isHost) receiveWheel(Net.myId, myVertices); else Net.send({ type: 'wheel', vertices: myVertices });
  }

  let raceStarting = false; // host: never start the countdown twice

  function receiveWheel(id, vertices) { wheels[id] = vertices; checkAllWheelsIn(); }

  // Counts only players still connected: a player who leaves while drawing can't hang the host
  // forever waiting for a wheel that will never arrive.
  function checkAllWheelsIn() {
    if (raceStarting) return;
    const ids = Object.keys(Net.players), got = ids.filter(id => wheels[id]).length;
    els.drawWait.textContent = `Ruote pronte: ${got}/${ids.length}`;
    if (ids.length > 0 && got >= ids.length) {
      raceStarting = true;
      const start = Date.now() + 3500, track = Terrain.generateRandomLayout();
      Terrain.applyLayout(track); Net.broadcast({ type: 'allReady', wheels, startTime: start, trackLayout: track }); startCountdown(start);
    }
  }

  function startCountdown(startTime) {
    showScreen('race'); setupCanvas(); myRedrawsLeft = 2; els.btnRedrawTrigger.textContent = `Cambia Forma (${myRedrawsLeft})`; els.redrawUi.style.display = 'block';
    raceMeta = {}; Object.values(Net.players).forEach(p => raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || preRaceDrawer.fallbackCircle() });
    
    const tick = setInterval(() => {
      const left = startTime - Date.now();
      if (left > 2000) els.countdown.textContent = '3'; else if (left > 1000) els.countdown.textContent = '2'; else if (left > 0) els.countdown.textContent = '1';
      else { els.countdown.textContent = 'VIA!'; clearInterval(tick); setTimeout(() => els.countdown.textContent = '', 700); 
             if (Net.isHost) beginRace(); else raceLoopHandle = requestAnimationFrame(renderRace); }
    }, 50);
  }

  function beginRace() {
    Sim.init(); let i = 0; Object.entries(raceMeta).forEach(([id, m]) => Sim.addRacer(id, m.vertices, m.color, m.name, i++));
    Sim.start(); let last = performance.now();
    snapshotLoopHandle = setInterval(() => {
      const now = performance.now(), dt = Math.min(now - last, 100); last = now;
      Sim.tick(dt); const snap = Sim.snapshot(); applySnapshot(snap); Net.broadcast({ type: 'snap', racers: snap });
      if (Sim.allFinished() || Sim.isTimedOut()) { clearInterval(snapshotLoopHandle); const s = Sim.standings(); Net.broadcast({ type: 'results', standings: s }); showResults(s); }
    }, 50);
    raceLoopHandle = requestAnimationFrame(renderRace);
  }

  function applySnapshot(racers) { racers.forEach(r => latestRacers[r.id] = r); }
  function setupCanvas() { ctx2d = els.raceCanvas.getContext('2d'); minimapCtx = els.minimap.getContext('2d'); resizeCanvas(); }
  function resizeCanvas() { els.raceCanvas.width = window.innerWidth; els.raceCanvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas);

  function renderRace() {
    const w = els.raceCanvas.width, h = els.raceCanvas.height, me = latestRacers[Net.myId];
    smoothCamX += ((me ? me.x - w * 0.32 : 0) - smoothCamX) * 0.08; 
    
    // Cielo
    const grad = ctx2d.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#e0f2fe'); grad.addColorStop(1, '#bae6fd');
    ctx2d.fillStyle = grad; ctx2d.fillRect(0, 0, w, h);
    const groundY = h - 160;

    // SOLE (in stile disegno di un bambino: cerchio con faccina + raggi dritti)
    drawChildSun(w);

    // NUVOLE IN MOVIMENTO (PARALLASSE SU PIÙ LIVELLI, forme più morbide e "gonfie")
    CLOUD_DEFS.forEach(c => {
      let cx = (c.x - smoothCamX * c.speed) % (w + 700);
      if (cx < -350) cx += w + 1050;
      drawCloud(cx, c.y, c.scale, c.alpha);
    });

    // COLLINE DI SFONDO MORBIDE (Niente più triangoli appuntiti)
    ctx2d.fillStyle = '#93c5fd'; 
    ctx2d.beginPath();
    ctx2d.moveTo(0, groundY);
    for (let sx = 0; sx <= w; sx += 10) {
      const worldX = sx + smoothCamX * 0.2;
      const hillY = groundY - 120 - (Math.sin(worldX / 300) * 80 + Math.cos(worldX / 150) * 40);
      ctx2d.lineTo(sx, hillY);
    }
    ctx2d.lineTo(w, groundY);
    ctx2d.closePath();
    ctx2d.fill();

    // Particelle
    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.03;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx2d.fillStyle = `${p.col}${p.life})`; ctx2d.beginPath(); ctx2d.arc(p.x - smoothCamX, p.y - Sim.GROUND_Y + groundY, p.size, 0, Math.PI*2); ctx2d.fill();
    }

    // Terreno Core (Gradiente Terriccio)
    ctx2d.beginPath(); ctx2d.moveTo(0, h);
    for (let sx = 0; sx <= w + 20; sx += 20) ctx2d.lineTo(sx, groundY - Terrain.height(sx + smoothCamX));
    ctx2d.lineTo(w, h); ctx2d.closePath();
    const gGrad = ctx2d.createLinearGradient(0, groundY-50, 0, h); gGrad.addColorStop(0, '#78350f'); gGrad.addColorStop(1, '#451a03');
    ctx2d.fillStyle = gGrad; ctx2d.fill();

    // Superficie Colorata
    ctx2d.lineWidth = 8; ctx2d.beginPath(); let started = false;
    for (let sx = 0; sx <= w + 20; sx += 20) {
      const y = groundY - Terrain.height(sx + smoothCamX); if (!started) { ctx2d.moveTo(sx, y); started = true; } else ctx2d.lineTo(sx, y);
    }
    ctx2d.strokeStyle = Terrain.colorAt(smoothCamX + w / 2); ctx2d.stroke();
    ctx2d.strokeStyle = '#1e293b'; ctx2d.lineWidth = 2; ctx2d.stroke();

    const fX = Terrain.FINISH_X - smoothCamX; if (fX > -50 && fX < w + 50) drawFinishFlag(fX, groundY - Terrain.height(Terrain.FINISH_X));

    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return;
      const cy = (y) => y - Sim.GROUND_Y + groundY, cx = r.x - smoothCamX;
      if (cx < -250 || cx > w + 250) return;
      drawBike(cx, cy(r.y), r.angle, meta.color);
      drawWheel(r.rwX - smoothCamX, cy(r.rwY), r.rwAngle, meta.vertices, meta.color, id === Net.myId);
      drawWheel(r.fwX - smoothCamX, cy(r.fwY), r.fwAngle, meta.vertices, meta.color, id === Net.myId);
      drawRider(cx, cy(r.y), r.angle, meta.color, meta.name, id === Net.myId);

      const zc = Terrain.colorAt(r.x);
      if (r.vx > 2 && ['#94a3b8', '#7dd3fc', '#3b82f6'].includes(zc) && Math.random() > 0.4) {
          let col = 'rgba(148,163,184,', sz = Math.random()*3+2, vy = -Math.random()*3;
          if (zc === '#7dd3fc') { col = 'rgba(255,255,255,'; sz = 2.5; } 
          else if (zc === '#3b82f6') { col = 'rgba(59,130,246,'; sz = Math.random()*5+3; vy = -Math.random()*6-2; }
          particles.push({ x: r.rwX, y: r.rwY + 20, vx: -Math.random()*(r.vx*0.5)-1, vy, life: 1, size: sz, col });
      }
    });

    updateHud(); drawMinimap(); raceLoopHandle = requestAnimationFrame(renderRace);
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
    if (isMe) { ctx2d.rotate(-a); ctx2d.fillStyle = '#0f172a'; ctx2d.font = 'bold 14px "Kalam"'; ctx2d.fillText('tu', 0, -32); }
    ctx2d.restore();
  }

  // Definizione delle nuvole: livelli di profondità diversi (speed) per una parallasse più viva,
  // dimensioni/trasparenze diverse così non sembrano tutte stampate dallo stesso timbro.
  const CLOUD_DEFS = [
    { x: 120,  y: 75,  scale: 1.1, speed: 0.10, alpha: 0.55 },
    { x: 520,  y: 150, scale: 0.6, speed: 0.16, alpha: 0.85 },
    { x: 980,  y: 55,  scale: 0.85,speed: 0.07, alpha: 0.45 },
    { x: 1420, y: 190, scale: 1.3, speed: 0.18, alpha: 0.9  },
    { x: 1900, y: 100, scale: 0.5, speed: 0.13, alpha: 0.6  },
    { x: 2380, y: 60,  scale: 1.0, speed: 0.09, alpha: 0.5  },
    { x: 2850, y: 170, scale: 0.7, speed: 0.20, alpha: 0.95 },
  ];

  // Una nuvola "gonfia": più lobi di raggio diverso, contorno morbido, leggera trasparenza
  // in base alla profondità così quelle lontane sembrano più tenui.
  function drawCloud(x, y, scale, alpha) {
    const lobes = [
      { dx: 0,   dy: 6,   r: 22 }, { dx: 20,  dy: -8,  r: 30 },
      { dx: 48,  dy: 2,   r: 26 }, { dx: 70,  dy: 12,  r: 18 },
      { dx: 38,  dy: 16,  r: 22 }, { dx: 12,  dy: 18,  r: 16 },
    ];
    ctx2d.save();
    ctx2d.globalAlpha = alpha;
    // Un'ombra morbida sull'intera sagoma (un solo fill, non lobo per lobo) dà un bordo
    // sfumato senza mostrare le linee di giunzione fra i cerchi che compongono la nuvola.
    ctx2d.shadowColor = 'rgba(100,130,160,0.35)';
    ctx2d.shadowBlur = 16 * scale;
    ctx2d.shadowOffsetY = 5 * scale;
    ctx2d.fillStyle = '#ffffff';
    ctx2d.beginPath();
    lobes.forEach(l => ctx2d.arc(x + l.dx * scale, y + l.dy * scale, l.r * scale, 0, Math.PI * 2));
    ctx2d.fill();
    ctx2d.restore();
  }

  // Il sole come lo disegnerebbe un bambino: cerchio giallo con contorno spesso, faccina
  // semplice e raggi dritti che alternano lunghi/corti. Resta ancorato in alto a destra dello
  // schermo (con un lieve respiro) invece di scorrere con il mondo, come nei disegni sul foglio.
  function drawChildSun(w) {
    const r = Math.max(34, Math.min(64, w * 0.09));
    const cx = w - r - 46, cy = r + 46;
    const breathe = 1 + Math.sin(performance.now() / 900) * 0.03;

    ctx2d.save();
    ctx2d.translate(cx, cy);

    // Raggi: linee dritte alternate lunghe/corte, come tratti di pennarello
    ctx2d.strokeStyle = '#f59e0b';
    ctx2d.lineWidth = Math.max(4, r * 0.09);
    ctx2d.lineCap = 'round';
    const rayCount = 10;
    for (let i = 0; i < rayCount; i++) {
      const a = (i / rayCount) * Math.PI * 2;
      const len = (i % 2 === 0 ? r * 0.85 : r * 0.5) * breathe;
      ctx2d.beginPath();
      ctx2d.moveTo(Math.cos(a) * (r + 5), Math.sin(a) * (r + 5));
      ctx2d.lineTo(Math.cos(a) * (r + 5 + len), Math.sin(a) * (r + 5 + len));
      ctx2d.stroke();
    }

    // Corpo del sole
    ctx2d.beginPath(); ctx2d.arc(0, 0, r, 0, Math.PI * 2);
    ctx2d.fillStyle = '#fde047'; ctx2d.fill();
    ctx2d.lineWidth = Math.max(4, r * 0.08); ctx2d.strokeStyle = '#f59e0b'; ctx2d.stroke();

    // Faccina: due occhi a pallino + sorriso ad arco, come nei disegni dei bambini
    ctx2d.fillStyle = '#92400e';
    ctx2d.beginPath(); ctx2d.arc(-r * 0.28, -r * 0.1, r * 0.09, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.beginPath(); ctx2d.arc(r * 0.28, -r * 0.1, r * 0.09, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.strokeStyle = '#92400e'; ctx2d.lineWidth = Math.max(3, r * 0.07); ctx2d.lineCap = 'round';
    ctx2d.beginPath(); ctx2d.arc(0, -r * 0.02, r * 0.34, 0.15 * Math.PI, 0.85 * Math.PI); ctx2d.stroke();

    ctx2d.restore();
  }

  function drawFinishFlag(x, gY) {
    ctx2d.strokeStyle = '#0f172a'; ctx2d.lineWidth = 6; ctx2d.beginPath(); ctx2d.moveTo(x, gY); ctx2d.lineTo(x, gY-160); ctx2d.stroke();
    ctx2d.fillStyle = '#e11d48'; ctx2d.fillRect(x, gY-160, 40, 26); ctx2d.fillStyle = '#fff'; ctx2d.fillRect(x+8, gY-160, 8, 26); ctx2d.fillRect(x+24, gY-160, 8, 26);
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
    const w = els.minimap.width, h = els.minimap.height, tL = Terrain.FINISH_X; minimapCtx.clearRect(0, 0, w, h);
    const toPx = (x) => (Math.max(0, Math.min(1, x / tL))) * (w - 10) + 5;
    Terrain.ZONES.forEach(z => {
      const zS = Math.max(0, z.start), zE = Math.min(tL, z.end); if (zE <= zS) return;
      minimapCtx.fillStyle = z.color; minimapCtx.fillRect(toPx(zS), h/2 - 4, Math.max(1, toPx(zE) - toPx(zS)), 8);
    });
    minimapCtx.strokeStyle = '#0f172a'; minimapCtx.lineWidth = 1.5; minimapCtx.strokeRect(5, h/2 - 4, w - 10, 8);
    minimapCtx.fillStyle = '#0f172a'; minimapCtx.fillRect(w - 6, h/2 - 10, 2, 20);
    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return; const isMe = id === Net.myId;
      minimapCtx.beginPath(); minimapCtx.arc(toPx(r.x), h/2, isMe ? 6 : 4, 0, Math.PI * 2);
      minimapCtx.fillStyle = meta.color; minimapCtx.fill(); minimapCtx.lineWidth = 1.5; minimapCtx.strokeStyle = '#0f172a'; minimapCtx.stroke();
    });
  }

  function stopRaceLoops() { if (raceLoopHandle) cancelAnimationFrame(raceLoopHandle); if (snapshotLoopHandle) clearInterval(snapshotLoopHandle); raceLoopHandle = snapshotLoopHandle = null; latestRacers = {}; els.redrawUi.style.display = els.redrawModal.style.display = 'none'; }
  function showResults(st) { stopRaceLoops(); els.resultsList.innerHTML = ''; st.forEach((s, i) => { const li = document.createElement('li'); li.innerHTML = `<span class="results-rank">${i + 1}°</span><span class="color-dot" style="background:${s.color}"></span><span>${escapeHtml(s.name)}</span><span class="results-time">${s.finished ? `${(s.finishTime / 1000).toFixed(2)}s` : 'DNF'}</span>`; els.resultsList.appendChild(li); }); showScreen('results'); }
  els.btnRematch.addEventListener('click', () => { if (Net.isHost) { wheels = {}; Net.broadcast({ type: 'restartToDraw' }); enterDrawPhase(); } });
  els.btnBackMenu.addEventListener('click', () => location.reload()); function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } els.code.addEventListener('input', () => els.code.value = els.code.value.toUpperCase());
})();
