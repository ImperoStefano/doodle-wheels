/*
 * game.js — ties Net, WheelDrawer and Sim together with the UI.
 * Flow: menu -> lobby -> draw -> countdown -> race -> results -> (rematch)
 */
(() => {
  const DRAW_TIME_S = 30;

  const els = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    draw: document.getElementById('screen-draw'),
    race: document.getElementById('screen-race'),
    results: document.getElementById('screen-results'),

    name: document.getElementById('input-name'),
    code: document.getElementById('input-code'),
    btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'),
    menuError: document.getElementById('menu-error'),

    roomCode: document.getElementById('room-code'),
    playerList: document.getElementById('player-list'),
    btnStartRace: document.getElementById('btn-start-race'),
    lobbyHint: document.getElementById('lobby-hint'),

    drawTimer: document.getElementById('draw-timer'),
    drawCanvas: document.getElementById('draw-canvas'),
    btnClear: document.getElementById('btn-clear'),
    btnSubmitWheel: document.getElementById('btn-submit-wheel'),
    drawWait: document.getElementById('draw-wait'),

    raceCanvas: document.getElementById('race-canvas'),
    countdown: document.getElementById('countdown-overlay'),
    hudFill: document.getElementById('hud-progress-fill'),
    hudBoard: document.getElementById('hud-leaderboard'),
    minimap: document.getElementById('minimap-canvas'),

    resultsList: document.getElementById('results-list'),
    btnRematch: document.getElementById('btn-rematch'),
    btnBackMenu: document.getElementById('btn-back-menu'),
  };

  let myVertices = null;
  let wheels = {};          // id -> vertices (host collects everyone's)
  let drawTimerHandle = null;
  let latestRacers = {};    // id -> {x,y,angle, fwX...} for rendering
  let raceMeta = {};        // id -> {color, name, vertices}
  let raceLoopHandle = null;
  let snapshotLoopHandle = null;
  let ctx2d = null;
  let minimapCtx = null;

  function showScreen(name) {
    ['menu', 'lobby', 'draw', 'race', 'results'].forEach(s => {
      els[s].classList.toggle('screen--active', s === name);
    });
  }

  // ---------- MENU ----------
  els.btnHost.addEventListener('click', () => {
    const name = els.name.value.trim();
    if (!name) return showMenuError('Scrivi il tuo nome prima di iniziare.');
    Net.hostGame(name);
  });

  els.btnJoin.addEventListener('click', () => {
    const name = els.name.value.trim();
    const code = els.code.value.trim();
    if (!name) return showMenuError('Scrivi il tuo nome prima di iniziare.');
    if (code.length !== 4) return showMenuError('Il codice ha 4 lettere.');
    Net.joinGame(code, name);
  });

  function showMenuError(msg) { els.menuError.textContent = msg; }

  Net.on('error', err => {
    showMenuError(err.message || 'Connessione non riuscita. Riprova.');
  });
  Net.on('hostLeft', () => {
    alert('L\'host ha lasciato la partita.');
    location.reload();
  });

  Net.on('roomReady', ({ code }) => {
    els.roomCode.textContent = code;
    renderPlayerList();
    showScreen('lobby');
  });

  Net.on('playersChanged', () => {
    renderPlayerList();
    if (els.lobby.classList.contains('screen--active')) {
      // already in lobby, just refresh
    } else if (!Net.isHost) {
      showScreen('lobby');
      els.roomCode.textContent = els.code.value.trim().toUpperCase();
    }
  });

  function renderPlayerList() {
    const players = Net.players;
    els.playerList.innerHTML = '';
    Object.values(players).forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="color-dot" style="background:${p.color}"></span>
        <span class="player-name">${escapeHtml(p.name)}</span>
        ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
      `;
      els.playerList.appendChild(li);
    });
    const count = Object.keys(players).length;
    if (Net.isHost) {
      els.btnStartRace.disabled = count < 1;
      els.btnStartRace.textContent = count < 2
        ? 'Avvia (puoi anche giocare da solo)'
        : `Avvia la gara (${count} giocatori)`;
      els.btnStartRace.style.display = 'block';
      els.lobbyHint.textContent = '';
    } else {
      els.btnStartRace.style.display = 'none';
      els.lobbyHint.textContent = 'In attesa che l\'host avvii la gara…';
    }
  }

  els.btnStartRace.addEventListener('click', () => {
    if (!Net.isHost) return;
    wheels = {};
    Net.broadcast({ type: 'goToDraw' });
    enterDrawPhase();
  });

  // ---------- DRAW ----------
  WheelDrawer.init(els.drawCanvas);

  els.btnClear.addEventListener('click', () => WheelDrawer.clear());

  els.drawCanvas.addEventListener('pointerup', () => {
    els.btnSubmitWheel.disabled = !WheelDrawer.isValid();
  });

  els.btnSubmitWheel.addEventListener('click', () => submitWheel());

  Net.on('data', ({ from, data }) => {
    if (data.type === 'goToDraw') enterDrawPhase();
    if (data.type === 'wheel' && Net.isHost) receiveWheel(from, data.vertices);
    if (data.type === 'allReady') { wheels = data.wheels || wheels; startCountdown(); }
    if (data.type === 'snap') applySnapshot(data.racers);
    if (data.type === 'results') showResults(data.standings);
    if (data.type === 'restartToDraw') enterDrawPhase();
  });

  function enterDrawPhase() {
    stopRaceLoops();
    WheelDrawer.clear();
    myVertices = null;
    els.btnSubmitWheel.disabled = true;
    els.drawWait.textContent = '';
    showScreen('draw');

    let timeLeft = DRAW_TIME_S;
    els.drawTimer.textContent = timeLeft;
    clearInterval(drawTimerHandle);
    drawTimerHandle = setInterval(() => {
      timeLeft--;
      els.drawTimer.textContent = Math.max(timeLeft, 0);
      if (timeLeft <= 0) {
        clearInterval(drawTimerHandle);
        if (!myVertices) submitWheel(true);
      }
    }, 1000);
  }

  function submitWheel(forced) {
    if (myVertices) return;
    if (!WheelDrawer.isValid() && !forced) return;
    myVertices = WheelDrawer.isValid()
      ? WheelDrawer.getNormalizedVertices(80)
      : WheelDrawer.fallbackCircle();
    clearInterval(drawTimerHandle);
    els.btnSubmitWheel.disabled = true;
    els.drawWait.textContent = 'Ruota inviata! In attesa degli altri giocatori…';

    if (Net.isHost) {
      receiveWheel(Net.myId, myVertices);
    } else {
      Net.send({ type: 'wheel', vertices: myVertices });
    }
  }

  function receiveWheel(id, vertices) {
    wheels[id] = vertices;
    const total = Object.keys(Net.players).length;
    const got = Object.keys(wheels).length;
    els.drawWait.textContent = `Ruote pronte: ${got}/${total}`;
    if (got >= total) {
      Net.broadcast({ type: 'allReady', wheels });
      startCountdown();
    }
  }

  // ---------- COUNTDOWN + RACE ----------
  function startCountdown() {
    showScreen('race');
    setupCanvas();
    let n = 3;
    els.countdown.textContent = n;
    const tickCountdown = setInterval(() => {
      n--;
      if (n > 0) {
        els.countdown.textContent = n;
      } else {
        els.countdown.textContent = 'VIA!';
        clearInterval(tickCountdown);
        setTimeout(() => { els.countdown.textContent = ''; }, 700);
        beginRace();
      }
    }, 800);
  }

  function beginRace() {
    raceMeta = {};
    const players = Net.players;
    Object.values(players).forEach(p => {
      raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || WheelDrawer.fallbackCircle() };
    });

    if (Net.isHost) {
      Sim.init();
      let i = 0;
      Object.entries(raceMeta).forEach(([id, m]) => {
        Sim.addRacer(id, m.vertices, m.color, m.name, i++);
      });
      Sim.start();
      let last = performance.now();
      snapshotLoopHandle = setInterval(() => {
        const now = performance.now();
        const dt = Math.min(now - last, 50);
        last = now;
        Sim.tick(dt);
        const snap = Sim.snapshot();
        applySnapshot(snap);
        Net.broadcast({ type: 'snap', racers: snap });
        if (Sim.allFinished() || Sim.isTimedOut()) {
          clearInterval(snapshotLoopHandle);
          const standings = Sim.standings();
          Net.broadcast({ type: 'results', standings });
          showResults(standings);
        }
      }, 50);
    }

    raceLoopHandle = requestAnimationFrame(renderRace);
  }

  function applySnapshot(racers) {
    racers.forEach(r => { latestRacers[r.id] = r; });
  }

  function setupCanvas() {
    ctx2d = els.raceCanvas.getContext('2d');
    minimapCtx = els.minimap.getContext('2d');
    resizeCanvas();
  }
  function resizeCanvas() {
    els.raceCanvas.width = window.innerWidth;
    els.raceCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);

  function renderRace() {
    const canvas = els.raceCanvas;
    const w = canvas.width, h = canvas.height;
    const me = latestRacers[Net.myId];
    const camX = me ? me.x - w * 0.32 : 0;

    // sky
    const grad = ctx2d.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#bcd8f7');
    grad.addColorStop(1, '#eaf3fd');
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, w, h);

    const groundY = h - 160;

    // terrain silhouette
    ctx2d.beginPath();
    ctx2d.moveTo(0, h);
    const sampleStep = 16;
    for (let sx = 0; sx <= w + sampleStep; sx += sampleStep) {
      const worldX = sx + camX;
      const y = groundY - Terrain.height(worldX);
      ctx2d.lineTo(sx, y);
    }
    ctx2d.lineTo(w, h);
    ctx2d.closePath();
    ctx2d.fillStyle = '#c9a06a';
    ctx2d.fill();

    // colored ribbon on top
    ctx2d.lineWidth = 6;
    ctx2d.beginPath();
    let started = false;
    for (let sx = 0; sx <= w + sampleStep; sx += sampleStep) {
      const worldX = sx + camX;
      const y = groundY - Terrain.height(worldX);
      if (!started) { ctx2d.moveTo(sx, y); started = true; } else { ctx2d.lineTo(sx, y); }
    }
    ctx2d.strokeStyle = Terrain.colorAt(camX + w / 2);
    ctx2d.stroke();
    ctx2d.strokeStyle = '#1a1a1a';
    ctx2d.lineWidth = 2;
    ctx2d.stroke();

    // finish line
    const finishScreenX = Sim.FINISH_X - camX;
    if (finishScreenX > -50 && finishScreenX < w + 50) {
      drawFinishFlag(finishScreenX, groundY - Terrain.height(Sim.FINISH_X));
    }

    // racers (modificato per telaio a due ruote AWD)
    const worldToScreenY = (y) => y - Sim.GROUND_Y + groundY;
    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id];
      if (!meta) return;
      
      // Coordinate di telaio e ruote inviate da Sim.snapshot()
      const csx = r.x - camX, csy = worldToScreenY(r.y);
      const fwsx = r.fwX - camX, fwsy = worldToScreenY(r.fwY);
      const rwsx = r.rwX - camX, rwsy = worldToScreenY(r.rwY);
      const isMe = (id === Net.myId);

      if (csx < -250 || csx > w + 250) return; // culling fuori schermo

      drawBike(csx, csy, r.angle, meta.color);
      drawWheel(rwsx, rwsy, r.rwAngle, meta.vertices, meta.color, isMe);
      drawWheel(fwsx, fwsy, r.fwAngle, meta.vertices, meta.color, isMe);
      drawRider(csx, csy, r.angle, meta.color, meta.name, isMe);
    });

    updateHud();
    drawMinimap();

    raceLoopHandle = requestAnimationFrame(renderRace);
  }

  function drawBike(x, y, angle, color) {
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.rotate(angle);
    ctx2d.lineWidth = 6;
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    ctx2d.strokeStyle = color;
    
    // Telaio tubolare
    ctx2d.beginPath();
    ctx2d.moveTo(-90, 0);          // forcellone posteriore
    ctx2d.lineTo(0, 0);            // movimento centrale
    ctx2d.lineTo(45, -45);         // tubo obliquo
    ctx2d.lineTo(90, 0);           // forcella anteriore
    ctx2d.moveTo(0, 0);            
    ctx2d.lineTo(-30, -60);        // tubo sella
    ctx2d.stroke();

    // Sella
    ctx2d.fillStyle = '#1a1a1a';
    ctx2d.fillRect(-45, -65, 25, 8); 
    
    // Manubrio
    ctx2d.lineWidth = 4;
    ctx2d.beginPath();
    ctx2d.moveTo(45, -45);
    ctx2d.lineTo(40, -60);
    ctx2d.lineTo(55, -70);
    ctx2d.stroke();
    
    ctx2d.restore();
  }

  function drawFinishFlag(x, groundY) {
    ctx2d.strokeStyle = '#1a1a1a';
    ctx2d.lineWidth = 4;
    ctx2d.beginPath();
    ctx2d.moveTo(x, groundY);
    ctx2d.lineTo(x, groundY - 140);
    ctx2d.stroke();
    ctx2d.fillStyle = '#e8462a';
    ctx2d.fillRect(x, groundY - 140, 34, 22);
    ctx2d.fillStyle = '#fff';
    ctx2d.fillRect(x + 6, groundY - 140, 8, 22);
    ctx2d.fillRect(x + 22, groundY - 140, 8, 22);
  }

  function drawWheel(x, y, angle, vertices, color, isMe) {
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.rotate(angle);
    ctx2d.beginPath();
    vertices.forEach((v, i) => {
      if (i === 0) ctx2d.moveTo(v.x, v.y); else ctx2d.lineTo(v.x, v.y);
    });
    ctx2d.closePath();
    ctx2d.fillStyle = color;
    ctx2d.globalAlpha = 0.85;
    ctx2d.fill();
    ctx2d.globalAlpha = 1;
    ctx2d.lineWidth = isMe ? 4 : 2.5;
    ctx2d.strokeStyle = '#1a1a1a';
    ctx2d.stroke();
    // hub
    ctx2d.beginPath();
    ctx2d.arc(0, 0, 6, 0, Math.PI * 2);
    ctx2d.fillStyle = '#1a1a1a';
    ctx2d.fill();
    ctx2d.restore();
  }

  function drawRider(x, y, angle, color, name, isMe) {
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.rotate(angle);
    // Casco posizionato in alto e leggermente arretrato rispetto al centro del telaio
    ctx2d.translate(-5, -100); 

    ctx2d.beginPath();
    ctx2d.arc(0, 0, 16, 0, Math.PI * 2);
    ctx2d.fillStyle = '#fff';
    ctx2d.fill();
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = color;
    ctx2d.stroke();
    ctx2d.fillStyle = '#1a1a1a';
    ctx2d.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(initials(name), 0, 4);
    
    if (isMe) {
      // Contro-rotazione per mantenere il badge "tu" dritto
      ctx2d.rotate(-angle);
      ctx2d.fillStyle = '#1a1a1a';
      ctx2d.font = 'bold 12px "Kalam", cursive';
      ctx2d.textAlign = 'center';
      ctx2d.fillText('tu', 0, -28);
    }
    ctx2d.restore();
  }

  function initials(name) {
    return (name || '?').trim().slice(0, 2).toUpperCase();
  }

  function updateHud() {
    const me = latestRacers[Net.myId];
    if (me) {
      const pct = Math.max(0, Math.min(100, (me.x / Sim.FINISH_X) * 100));
      els.hudFill.style.width = pct + '%';
    }
    const ranked = Object.entries(latestRacers)
      .map(([id, r]) => ({ id, x: r.x, meta: raceMeta[id] }))
      .filter(r => r.meta)
      .sort((a, b) => b.x - a.x);

    els.hudBoard.innerHTML = '';
    ranked.forEach((r, i) => {
      const li = document.createElement('li');
      if (r.id === Net.myId) li.classList.add('is-me');
      li.innerHTML = `
        <span class="rank-num">${i + 1}</span>
        <span class="color-dot" style="background:${r.meta.color}"></span>
        <span>${escapeHtml(r.meta.name)}</span>
      `;
      els.hudBoard.appendChild(li);
    });
  }

  function drawMinimap() {
    const c = els.minimap, w = c.width, h = c.height;
    minimapCtx.clearRect(0, 0, w, h);
    const trackLen = Sim.FINISH_X; // minimap covers 0 -> finish
    const toPx = (x) => (Math.max(0, Math.min(1, x / trackLen))) * (w - 10) + 5;

    // zone strip
    Terrain.ZONES.forEach(z => {
      const zStart = Math.max(0, z.start), zEnd = Math.min(trackLen, z.end);
      if (zEnd <= zStart) return;
      const x1 = toPx(zStart), x2 = toPx(zEnd);
      minimapCtx.fillStyle = z.color;
      minimapCtx.fillRect(x1, h / 2 - 4, Math.max(1, x2 - x1), 8);
    });
    minimapCtx.strokeStyle = '#1a1a1a';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.strokeRect(5, h / 2 - 4, w - 10, 8);

    // finish flag
    minimapCtx.fillStyle = '#1a1a1a';
    minimapCtx.fillRect(w - 6, h / 2 - 10, 2, 20);

    // racer dots
    Object.entries(latestRacers).forEach(([id, r]) => {
      const meta = raceMeta[id];
      if (!meta) return;
      const x = toPx(r.x);
      const isMe = id === Net.myId;
      minimapCtx.beginPath();
      minimapCtx.arc(x, h / 2, isMe ? 6 : 4.5, 0, Math.PI * 2);
      minimapCtx.fillStyle = meta.color;
      minimapCtx.fill();
      minimapCtx.lineWidth = isMe ? 2.5 : 1.5;
      minimapCtx.strokeStyle = '#1a1a1a';
      minimapCtx.stroke();
    });
  }

  function stopRaceLoops() {
    if (raceLoopHandle) cancelAnimationFrame(raceLoopHandle);
    if (snapshotLoopHandle) clearInterval(snapshotLoopHandle);
    raceLoopHandle = null;
    snapshotLoopHandle = null;
    latestRacers = {};
  }

  // ---------- RESULTS ----------
  function showResults(standings) {
    stopRaceLoops();
    els.resultsList.innerHTML = '';
    standings.forEach((s, i) => {
      const li = document.createElement('li');
      const timeText = s.finished ? `${(s.finishTime / 1000).toFixed(2)}s` : 'non arrivato';
      li.innerHTML = `
        <span class="results-rank">${i + 1}°</span>
        <span class="color-dot" style="background:${s.color}"></span>
        <span>${escapeHtml(s.name)}</span>
        <span class="results-time">${timeText}</span>
      `;
      els.resultsList.appendChild(li);
    });
    showScreen('results');
  }

  els.btnRematch.addEventListener('click', () => {
    if (!Net.isHost) return;
    wheels = {};
    Net.broadcast({ type: 'restartToDraw' });
    enterDrawPhase();
  });
  els.btnBackMenu.addEventListener('click', () => location.reload());

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // Auto-uppercase the room code field as it's typed
  els.code.addEventListener('input', () => {
    els.code.value = els.code.value.toUpperCase();
  });
})();
