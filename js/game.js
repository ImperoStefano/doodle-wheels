(() => {
  const DRAW_TIME_S = 30;
  const els = {
    menu: document.getElementById('screen-menu'), lobby: document.getElementById('screen-lobby'),
    draw: document.getElementById('screen-draw'), race: document.getElementById('screen-race'),
    results: document.getElementById('screen-results'), name: document.getElementById('input-name'),
    code: document.getElementById('input-code'), btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'), menuError: document.getElementById('menu-error'),
    roomCode: document.getElementById('room-code'), playerList: document.getElementById('player-list'),
    btnStartRace: document.getElementById('btn-start-race'), lobbyHint: document.getElementById('lobby-hint'),
    drawTimer: document.getElementById('draw-timer'), 
    
    drawCanvas: document.getElementById('draw-canvas'), btnClear: document.getElementById('btn-clear'), 
    btnSubmitWheel: document.getElementById('btn-submit-wheel'), drawWait: document.getElementById('draw-wait'), 
    
    redrawUi: document.getElementById('redraw-ui'), btnRedrawTrigger: document.getElementById('btn-redraw-trigger'),
    redrawModal: document.getElementById('redraw-modal'), redrawCanvas: document.getElementById('redraw-canvas'),
    btnCancelRedraw: document.getElementById('btn-cancel-redraw'), btnSubmitRedraw: document.getElementById('btn-submit-redraw'),

    raceCanvas: document.getElementById('race-canvas'), countdown: document.getElementById('countdown-overlay'), 
    hudFill: document.getElementById('hud-progress-fill'), hudBoard: document.getElementById('hud-leaderboard'), 
    minimap: document.getElementById('minimap-canvas'), resultsList: document.getElementById('results-list'), 
    btnRematch: document.getElementById('btn-rematch'), btnBackMenu: document.getElementById('btn-back-menu'),
  };

  const preRaceDrawer = createWheelDrawer(els.drawCanvas); preRaceDrawer.init();
  const inRaceDrawer = createWheelDrawer(els.redrawCanvas); inRaceDrawer.init();

  let myVertices = null; let wheels = {}; let drawTimerHandle = null;
  let latestRacers = {}; let raceMeta = {}; let raceLoopHandle = null; let snapshotLoopHandle = null;
  let ctx2d = null; let minimapCtx = null;
  let smoothCamX = 0; let particles = []; let myRedrawsLeft = 2;

  function showScreen(name) { ['menu', 'lobby', 'draw', 'race', 'results'].forEach(s => { els[s].classList.toggle('screen--active', s === name); }); }

  els.btnHost.addEventListener('click', () => {
    const name = els.name.value.trim();
    if (!name) return showMenuError('Scrivi il tuo nome prima di iniziare.'); Net.hostGame(name);
  });
  
  els.btnJoin.addEventListener('click', () => {
    const name = els.name.value.trim(); const code = els.code.value.trim();
    if (!name) return showMenuError('Scrivi il tuo nome prima di iniziare.');
    if (code.length !== 4) return showMenuError('Il codice ha 4 lettere.'); Net.joinGame(code, name);
  });
  
  function showMenuError(msg) { els.menuError.textContent = msg; }
  Net.on('error', err => showMenuError(err.message || 'Connessione non riuscita. Riprova.'));
  Net.on('hostLeft', () => { alert('L\'host ha lasciato la partita.'); location.reload(); });
  
  Net.on('roomReady', ({ code }) => { els.roomCode.textContent = code; renderPlayerList(); showScreen('lobby'); });
  Net.on('playersChanged', () => {
    renderPlayerList();
    if (!els.lobby.classList.contains('screen--active') && !Net.isHost) {
      showScreen('lobby'); els.roomCode.textContent = els.code.value.trim().toUpperCase();
    }
  });

  function renderPlayerList() {
    const players = Net.players; els.playerList.innerHTML = '';
    Object.values(players).forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="color-dot" style="background:${p.color}"></span><span class="player-name">${escapeHtml(p.name)}</span>${p.isHost ? '<span class="host-badge">HOST</span>' : ''}`;
      els.playerList.appendChild(li);
    });
    const count = Object.keys(players).length;
    if (Net.isHost) {
      els.btnStartRace.disabled = count < 1;
      els.btnStartRace.textContent = count < 2 ? 'Avvia (gioca da solo)' : `Avvia la gara (${count} giocatori)`;
      els.btnStartRace.style.display = 'block'; els.lobbyHint.textContent = '';
    } else { els.btnStartRace.style.display = 'none'; els.lobbyHint.textContent = 'In attesa che l\'host avvii la gara…'; }
  }

  els.btnStartRace.addEventListener('click', () => { if (!Net.isHost) return; wheels = {}; Net.broadcast({ type: 'goToDraw' }); enterDrawPhase(); });

  els.btnClear.addEventListener('click', () => preRaceDrawer.clear());
  els.drawCanvas.addEventListener('pointerup', () => els.btnSubmitWheel.disabled = !preRaceDrawer.isValid());
  els.btnSubmitWheel.addEventListener('click', () => submitWheel());

  els.btnRedrawTrigger.addEventListener('click', () => {
    if (myRedrawsLeft <= 0) return;
    inRaceDrawer.clear(); els.btnSubmitRedraw.disabled = true; els.redrawModal.style.display = 'flex';
  });
  els.redrawCanvas.addEventListener('pointerup', () => els.btnSubmitRedraw.disabled = !inRaceDrawer.isValid());
  els.btnCancelRedraw.addEventListener('click', () => els.redrawModal.style.display = 'none');
  
  els.btnSubmitRedraw.addEventListener('click', () => {
    if (!inRaceDrawer.isValid()) return;
    const newVertices = inRaceDrawer.getNormalizedVertices(80);
    els.redrawModal.style.display = 'none';
    myRedrawsLeft--; els.btnRedrawTrigger.textContent = `Cambia Forma (${myRedrawsLeft})`;
    if (myRedrawsLeft <= 0) els.redrawUi.style.display = 'none';

    if (Net.isHost) {
      Sim.updateRacerWheel(Net.myId, newVertices);
      raceMeta[Net.myId].vertices = newVertices;
      Net.broadcast({ type: 'wheelUpdated', id: Net.myId, vertices: newVertices });
    } else { Net.send({ type: 'wheelUpdate', vertices: newVertices }); }
  });

  Net.on('data', ({ from, data }) => {
    if (data.type === 'goToDraw') enterDrawPhase();
    if (data.type === 'wheel' && Net.isHost) receiveWheel(from, data.vertices);
    if (data.type === 'allReady') { 
      wheels = data.wheels || wheels; 
      Terrain.applyLayout(data.trackLayout);
      startCountdown(data.startTime); 
    }
    if (data.type === 'snap') applySnapshot(data.racers);
    if (data.type === 'results') showResults(data.standings);
    if (data.type === 'restartToDraw') enterDrawPhase();
    
    if (data.type === 'wheelUpdate' && Net.isHost) {
      Sim.updateRacerWheel(from, data.vertices);
      raceMeta[from].vertices = data.vertices;
      Net.broadcast({ type: 'wheelUpdated', id: from, vertices: data.vertices });
    }
    if (data.type === 'wheelUpdated') { if (raceMeta[data.id]) raceMeta[data.id].vertices = data.vertices; }
  });

  function enterDrawPhase() {
    stopRaceLoops(); preRaceDrawer.clear(); myVertices = null;
    els.btnSubmitWheel.disabled = true; els.drawWait.textContent = ''; showScreen('draw');
    let timeLeft = DRAW_TIME_S; els.drawTimer.textContent = timeLeft;
    clearInterval(drawTimerHandle);
    drawTimerHandle = setInterval(() => {
      timeLeft--; els.drawTimer.textContent = Math.max(timeLeft, 0);
      if (timeLeft <= 0) { clearInterval(drawTimerHandle); if (!myVertices) submitWheel(true); }
    }, 1000);
  }

  function submitWheel(forced) {
    if (myVertices) return; if (!preRaceDrawer.isValid() && !forced) return;
    myVertices = preRaceDrawer.isValid() ? preRaceDrawer.getNormalizedVertices(80) : preRaceDrawer.fallbackCircle();
    clearInterval(drawTimerHandle); els.btnSubmitWheel.disabled = true;
    els.drawWait.textContent = 'Ruota inviata! In attesa degli altri giocatori…';
    if (Net.isHost) receiveWheel(Net.myId, myVertices); else Net.send({ type: 'wheel', vertices: myVertices });
  }

  function receiveWheel(id, vertices) {
    wheels[id] = vertices;
    const total = Object.keys(Net.players).length, got = Object.keys(wheels).length;
    els.drawWait.textContent = `Ruote pronte: ${got}/${total}`;
    if (got >= total) { 
      const startTime = Date.now() + 3500; 
      const trackLayout = Terrain.generateRandomLayout();
      Terrain.applyLayout(trackLayout);
      Net.broadcast({ type: 'allReady', wheels, startTime, trackLayout }); 
      startCountdown(startTime); 
    }
  }

  function startCountdown(startTime) {
    showScreen('race'); setupCanvas(); 
    myRedrawsLeft = 2;
    els.btnRedrawTrigger.textContent = `Cambia Forma (${myRedrawsLeft})`;
    els.redrawUi.style.display = 'block';

    raceMeta = {};
    Object.values(Net.players).forEach(p => raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || preRaceDrawer.fallbackCircle() });
    
    const tickCountdown = setInterval(() => {
      const left = startTime - Date.now();
      if (left > 2000) els.countdown.textContent = '3';
      else if (left > 1000) els.countdown.textContent = '2';
      else if (left > 0) els.countdown.textContent = '1';
      else {
        els.countdown.textContent = 'VIA!'; clearInterval(tickCountdown);
        setTimeout(() => { els.countdown.textContent = ''; }, 700); 
        if (Net.isHost) beginRace(); else raceLoopHandle = requestAnimationFrame(renderRace);
      }
    }, 50);
  }

  function beginRace() {
    Sim.init(); let i = 0;
    Object.entries(raceMeta).forEach(([id, m]) => Sim.addRacer(id, m.vertices, m.color, m.name, i++));
    Sim.start();
    let last = performance.now();
    snapshotLoopHandle = setInterval(() => {
      const now = performance.now(); const dt = Math.min(now - last, 50); last = now;
      Sim.tick(dt); const snap = Sim.snapshot(); applySnapshot(snap); Net.broadcast({ type: 'snap', racers: snap });
      if (Sim.allFinished() || Sim.isTimedOut()) {
        clearInterval(snapshotLoopHandle); const standings = Sim.standings();
        Net.broadcast({ type: 'results', standings }); showResults(standings);
      }
    }, 50);
    raceLoopHandle = requestAnimationFrame(renderRace);
  }

  function applySnapshot(racers) { racers.forEach(r => { latestRacers[r.id] = r; }); }
  function setupCanvas() { ctx2d = els.raceCanvas.getContext('2d'); minimapCtx = els.minimap.getContext('2d'); resizeCanvas(); }
  function resizeCanvas() { els.raceCanvas.width = window.innerWidth; els.raceCanvas.height = window.innerHeight; }
  window.addEventListener('resize', resizeCanvas);

  function renderRace() {
    const w = els.raceCanvas.width, h = els.raceCanvas.height, me = latestRacers[Net.myId];
    const targetCamX = me ? me.x - w * 0.32 : 0;
    smoothCamX += (targetCamX - smoothCamX) * 0.08; 

    const grad = ctx2d.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#bcd8f7'); grad.addColorStop(1, '#eaf3fd');
    ctx2d.fillStyle = grad; ctx2d.fillRect(0, 0, w, h);
    const groundY = h - 160;

    ctx2d.fillStyle = '#a8c0df'; ctx2d.beginPath();
    for (let sx = -w; sx <= w + 400; sx += 300) {
      const worldPos = sx + smoothCamX * 0.2; const mX = sx - (worldPos % 300);
      ctx2d.moveTo(mX, groundY); ctx2d.lineTo(mX + 150, groundY - 180 - Math.sin(mX) * 40); ctx2d.lineTo(mX + 300, groundY);
    }
    ctx2d.fill();

    for (let i = particles.length - 1; i >= 0; i--) {
      let p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.04;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx2d.fillStyle = `${p.colorPrefix}${p.life})`;
      ctx2d.fillRect(p.x - smoothCamX, p.y - Sim.GROUND_Y + groundY, p.size, p.size);
    }

    ctx2d.beginPath(); ctx2d.moveTo(0, h);
    const sampleStep = 16;
    for (let sx = 0; sx <= w + sampleStep; sx += sampleStep) ctx2d.lineTo(sx, groundY - Terrain.height(sx + smoothCamX));
    ctx2d.lineTo(w, h); ctx2d.closePath();
    ctx2d.fillStyle = '#c9a06a'; ctx2d.fill();

    ctx2d.lineWidth = 6; ctx2d.beginPath(); let started = false;
    for (let sx = 0; sx <= w + sampleStep; sx += sampleStep) {
      const y = groundY - Terrain.height(sx + smoothCamX);
      if (!started) { ctx2d.moveTo(sx, y); started = true; } else ctx2d.lineTo(sx, y);
    }
    ctx2d.strokeStyle = Terrain.colorAt(smoothCamX + w / 2); ctx2d.stroke();
    ctx2d.strokeStyle = '#1a1a1a'; ctx2d.lineWidth = 2; ctx2d.stroke();

    const finishScreenX = Terrain.FINISH_X - smoothCamX;
    if (finishScreenX > -50 && finishScreenX < w + 50) drawFinishFlag(finishScreenX, groundY - Terrain.height(Terrain.FINISH_X));

    const worldToScreenY = (y) => y - Sim.GROUND_Y + groundY;
    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return;
      const csx = r.x - smoothCamX, csy = worldToScreenY(r.y);
      const fwsx = r.fwX - smoothCamX, fwsy = worldToScreenY(r.fwY);
      const rwsx = r.rwX - smoothCamX, rwsy = worldToScreenY(r.rwY);
      const isMe = (id === Net.myId);

      if (csx < -250 || csx > w + 250) return;
      drawBike(csx, csy, r.angle, meta.color);
      drawWheel(rwsx, rwsy, r.rwAngle, meta.vertices, meta.color, isMe);
      drawWheel(fwsx, fwsy, r.fwAngle, meta.vertices, meta.color, isMe);
      drawRider(csx, csy, r.angle, meta.color, meta.name, isMe);

      const zoneColor = Terrain.colorAt(r.x);
      if (r.vx > 2 && (zoneColor === '#9a978c' || zoneColor === '#a0e6ff' || zoneColor === '#3498db')) { 
        if (Math.random() > 0.4) {
          let pColor = 'rgba(154, 151, 140,', pSize = Math.random() * 4 + 2, pVy = -Math.random() * 3;
          if (zoneColor === '#a0e6ff') { pColor = 'rgba(255, 255, 255,'; pSize = 2; } 
          if (zoneColor === '#3498db') { pColor = 'rgba(52, 152, 219,'; pSize = Math.random() * 6 + 3; pVy = -Math.random() * 5 - 2; }
          particles.push({ x: r.rwX, y: r.rwY + 20, vx: -Math.random() * (r.vx * 0.4) - 1, vy: pVy, life: 1, size: pSize, colorPrefix: pColor });
        }
      }
    });

    updateHud(); drawMinimap();
    raceLoopHandle = requestAnimationFrame(renderRace);
  }

  function drawBike(x, y, angle, color) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(angle);
    ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round';
    ctx2d.shadowColor = 'rgba(0,0,0,0.35)'; ctx2d.shadowBlur = 8; ctx2d.shadowOffsetY = 6;
    ctx2d.lineWidth = 7; ctx2d.strokeStyle = color; ctx2d.beginPath();
    ctx2d.moveTo(-90, 0); ctx2d.lineTo(0, 0); ctx2d.lineTo(-20, -55); ctx2d.lineTo(-90, 0);
    ctx2d.moveTo(0, 0); ctx2d.lineTo(55, -45); ctx2d.lineTo(-20, -55); ctx2d.stroke();
    ctx2d.shadowColor = 'transparent';
    ctx2d.strokeStyle = '#bdc3c7'; ctx2d.lineWidth = 6; ctx2d.beginPath(); ctx2d.moveTo(90, 0); ctx2d.lineTo(55, -45); ctx2d.stroke();
    ctx2d.strokeStyle = '#2c3e50'; ctx2d.lineWidth = 5; ctx2d.beginPath(); ctx2d.moveTo(55, -45); ctx2d.lineTo(45, -70); ctx2d.lineTo(60, -80); ctx2d.stroke();
    ctx2d.fillStyle = color; ctx2d.beginPath(); ctx2d.arc(60, -80, 7, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.strokeStyle = '#2c3e50'; ctx2d.lineWidth = 5; ctx2d.beginPath(); ctx2d.moveTo(-20, -55); ctx2d.lineTo(-25, -75); ctx2d.stroke();
    ctx2d.fillStyle = '#1a1a1a'; ctx2d.beginPath(); ctx2d.ellipse(-30, -78, 16, 5, Math.PI/12, 0, 2 * Math.PI); ctx2d.fill();
    ctx2d.fillStyle = '#34495e'; ctx2d.beginPath(); ctx2d.arc(0, 0, 10, 0, Math.PI * 2); ctx2d.fill();
    ctx2d.restore();
  }

  function drawFinishFlag(x, groundY) {
    ctx2d.strokeStyle = '#1a1a1a'; ctx2d.lineWidth = 4; ctx2d.beginPath(); ctx2d.moveTo(x, groundY); ctx2d.lineTo(x, groundY - 140); ctx2d.stroke();
    ctx2d.fillStyle = '#e8462a'; ctx2d.fillRect(x, groundY - 140, 34, 22);
    ctx2d.fillStyle = '#fff'; ctx2d.fillRect(x + 6, groundY - 140, 8, 22); ctx2d.fillRect(x + 22, groundY - 140, 8, 22);
  }

  function drawWheel(x, y, angle, vertices, color, isMe) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(angle); ctx2d.beginPath();
    vertices.forEach((v, i) => { if (i === 0) ctx2d.moveTo(v.x, v.y); else ctx2d.lineTo(v.x, v.y); });
    ctx2d.closePath(); ctx2d.fillStyle = color; ctx2d.globalAlpha = 0.85; ctx2d.fill();
    ctx2d.globalAlpha = 1; ctx2d.lineWidth = isMe ? 4 : 2.5; ctx2d.strokeStyle = '#1a1a1a'; ctx2d.stroke();
    ctx2d.beginPath(); ctx2d.arc(0, 0, 6, 0, Math.PI * 2); ctx2d.fillStyle = '#1a1a1a'; ctx2d.fill(); ctx2d.restore();
  }

  function drawRider(x, y, angle, color, name, isMe) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(angle); ctx2d.translate(-15, -105); 
    ctx2d.beginPath(); ctx2d.arc(0, 0, 16, 0, Math.PI * 2); ctx2d.fillStyle = '#fff'; ctx2d.fill();
    ctx2d.lineWidth = 3; ctx2d.strokeStyle = color; ctx2d.stroke();
    ctx2d.fillStyle = '#1a1a1a'; ctx2d.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx2d.textAlign = 'center'; ctx2d.fillText((name || '?').trim().slice(0, 2).toUpperCase(), 0, 4);
    if (isMe) { ctx2d.rotate(-angle); ctx2d.fillStyle = '#1a1a1a'; ctx2d.font = 'bold 12px "Kalam", cursive'; ctx2d.textAlign = 'center'; ctx2d.fillText('tu', 0, -28); }
    ctx2d.restore();
  }

  function updateHud() {
    const me = latestRacers[Net.myId];
    if (me) els.hudFill.style.width = Math.max(0, Math.min(100, (me.x / Terrain.FINISH_X) * 100)) + '%';
    const ranked = Object.entries(latestRacers).map(([id, r]) => ({ id, x: r.x, meta: raceMeta[id] })).filter(r => r.meta).sort((a, b) => b.x - a.x);
    els.hudBoard.innerHTML = '';
    ranked.forEach((r, i) => {
      const li = document.createElement('li'); if (r.id === Net.myId) li.classList.add('is-me');
      li.innerHTML = `<span class="rank-num">${i + 1}</span><span class="color-dot" style="background:${r.meta.color}"></span><span>${escapeHtml(r.meta.name)}</span>`;
      els.hudBoard.appendChild(li);
    });
  }

  function drawMinimap() {
    const c = els.minimap, w = c.width, h = c.height, trackLen = Terrain.FINISH_X; minimapCtx.clearRect(0, 0, w, h);
    const toPx = (x) => (Math.max(0, Math.min(1, x / trackLen))) * (w - 10) + 5;
    Terrain.ZONES.forEach(z => {
      const zStart = Math.max(0, z.start), zEnd = Math.min(trackLen, z.end); if (zEnd <= zStart) return;
      const x1 = toPx(zStart), x2 = toPx(zEnd);
      minimapCtx.fillStyle = z.color; minimapCtx.fillRect(x1, h / 2 - 4, Math.max(1, x2 - x1), 8);
    });
    minimapCtx.strokeStyle = '#1a1a1a'; minimapCtx.lineWidth = 1.5; minimapCtx.strokeRect(5, h / 2 - 4, w - 10, 8);
    minimapCtx.fillStyle = '#1a1a1a'; minimapCtx.fillRect(w - 6, h / 2 - 10, 2, 20);
    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return;
      const x = toPx(r.x), isMe = id === Net.myId;
      minimapCtx.beginPath(); minimapCtx.arc(x, h / 2, isMe ? 5 : 3.5, 0, Math.PI * 2);
      minimapCtx.fillStyle = meta.color; minimapCtx.fill();
      minimapCtx.lineWidth = isMe ? 2 : 1; minimapCtx.strokeStyle = '#1a1a1a'; minimapCtx.stroke();
    });
  }

  function stopRaceLoops() {
    if (raceLoopHandle) cancelAnimationFrame(raceLoopHandle); if (snapshotLoopHandle) clearInterval(snapshotLoopHandle);
    raceLoopHandle = null; snapshotLoopHandle = null; latestRacers = {}; els.redrawUi.style.display = 'none'; els.redrawModal.style.display = 'none';
  }

  function showResults(standings) {
    stopRaceLoops(); els.resultsList.innerHTML = '';
    standings.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="results-rank">${i + 1}°</span><span class="color-dot" style="background:${s.color}"></span><span>${escapeHtml(s.name)}</span><span class="results-time">${s.finished ? `${(s.finishTime / 1000).toFixed(2)}s` : 'non arrivato'}</span>`;
      els.resultsList.appendChild(li);
    });
    showScreen('results');
  }

  els.btnRematch.addEventListener('click', () => { if (!Net.isHost) return; wheels = {}; Net.broadcast({ type: 'restartToDraw' }); enterDrawPhase(); });
  els.btnBackMenu.addEventListener('click', () => location.reload());
  function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  els.code.addEventListener('input', () => els.code.value = els.code.value.toUpperCase());
})();
