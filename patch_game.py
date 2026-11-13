from pathlib import Path
p=Path('/mnt/data/dw_v260_rejoin/js/game.js');s=p.read_text()
def rep(a,b):
 global s
 if a not in s: raise RuntimeError('not found '+a[:100])
 s=s.replace(a,b,1)
rep("let lastCallSent = false, lastCallEnd = 0;", """let lastCallSent = false, lastCallEnd = 0;
  let currentRaceStart = 0, drawDeadline = 0;
  // A room invitation and an unguessable return token survive a closed tab.
  // The host owns the actual race state: nothing about the physics is trusted from storage.
  const REJOIN_STORAGE = 'dw_room_resume_v260';
  function readRejoin() {
    try { const s = JSON.parse(localStorage.getItem(REJOIN_STORAGE) || 'null');
      return s && /^[A-Z]{4}$/.test(s.code) && /^[A-Za-z0-9_-]{16,100}$/.test(s.token) &&
        typeof s.name === 'string' && Date.now() - s.at < 12 * 3600000 ? s : null;
    } catch (_) { return null; }
  }
  function makeRejoinToken() {
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  function saveRejoin(code, name, token) {
    try { localStorage.setItem(REJOIN_STORAGE, JSON.stringify({ code, name, token, at: Date.now() })); } catch (_) {}
  }
  const btnRejoin = document.getElementById('btn-rejoin');
  function updateRejoinButton() {
    if (!btnRejoin) return;
    const rec = readRejoin();
    btnRejoin.hidden = !rec;
    if (rec) btnRejoin.textContent = I18n.t('menu.rejoin') + ' · ' + rec.code;
  }
  function connectToRoom(code, name, resumeOnly = false) {
    const c = String(code || '').trim().toUpperCase();
    const previous = readRejoin();
    if (!name || !/^[A-Z]{4}$/.test(c)) { showMenuError(I18n.t('menu.err.namecode')); return; }
    if (resumeOnly && (!previous || previous.code !== c)) return;
    let token;
    try { token = previous && previous.code === c ? previous.token : makeRejoinToken(); }
    catch (_) { token = ''; }
    if (token) saveRejoin(c, name, token);
    els.name.value = name; els.code.value = c;
    showMenuError(I18n.t('net.reconnecting'));
    Net.joinGame(c, name, token);
    updateRejoinButton();
  }
  if (btnRejoin) btnRejoin.addEventListener('click', () => {
    const rec = readRejoin(); if (rec) connectToRoom(rec.code, rec.name, true);
  });""")
rep("els.btnHost.addEventListener('click', () => { const name = els.name.value.trim(); if (name) { Net.hostGame(name);", "els.btnHost.addEventListener('click', () => { const name = els.name.value.trim(); if (name) { try { localStorage.removeItem(REJOIN_STORAGE); } catch (_) {} updateRejoinButton(); Net.hostGame(name);")
rep("if (!name || code.length !== 4) return showMenuError(I18n.t('menu.err.namecode')); Net.joinGame(code, name);", "if (!name || code.length !== 4) return showMenuError(I18n.t('menu.err.namecode')); connectToRoom(code, name);")
rep("Net.on('roomReady', ({ code }) => { els.roomCode.textContent = code;", "Net.on('roomReady', ({ code }) => { Net.setPhase('lobby'); els.roomCode.textContent = code;")
rep("Net.on('reconnected', () => { if (connectionStatus) connectionStatus.hidden = true; });", """Net.on('reconnected', () => { if (connectionStatus) connectionStatus.hidden = true; });
  Net.on('joined', () => {
    if (connectionStatus) connectionStatus.hidden = true;
    showMenuError('');
    const rec = readRejoin(); if (rec) saveRejoin(rec.code, rec.name, rec.token);
  });""")
rep("${p.isHost ? '<span class=\"host-badge\">HOST</span>' : ''}", "${p.isHost ? '<span class=\"host-badge\">HOST</span>' : ''}${p.connected === false ? `<span class=\"host-badge\" title=\"${I18n.t('net.offline')}\">${I18n.t('net.offline')}</span>` : ''}")
rep("function enterDrawPhase() {", "function enterDrawPhase(deadline) {")
rep("requestWakeLock();\n    stopRaceLoops(); raceStarting = false;", "requestWakeLock();\n    if (Net.isHost) Net.setPhase('draw');\n    drawDeadline = Number.isFinite(deadline) ? deadline : Date.now() + 30000;\n    stopRaceLoops(); raceStarting = false;")
rep("let t = 30; els.drawTimer.textContent = t; clearInterval(drawTimerHandle);\n    drawTimerHandle = setInterval(() => { t--; els.drawTimer.textContent = Math.max(t, 0); if (t <= 0) { clearInterval(drawTimerHandle); if (!myVertices) submitWheel(true); } }, 1000);", """els.drawTimer.textContent = Math.max(0, Math.ceil((drawDeadline - Date.now()) / 1000)); clearInterval(drawTimerHandle);
    drawTimerHandle = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((drawDeadline - Date.now()) / 1000));
      els.drawTimer.textContent = remaining;
      if (remaining <= 0) { clearInterval(drawTimerHandle); if (!myVertices) submitWheel(true); }
    }, 250);""")
rep("const ids = Object.keys(Net.players), got = ids.filter(id => wheels[id]).length;", "const ids = Object.keys(Net.players), got = ids.filter(id => wheels[id]).length;")
rep("const start = Date.now() + 3500 + 1500;", "const start = Date.now() + 3500 + 1500; currentRaceStart = start;")
rep("function startCountdown(startTime) {\n    showScreen('race'); if (typeof Sfx !== 'undefined') Sfx.raceStart(startTime);", """function startCountdown(startTime, returning = false) {
    currentRaceStart = startTime;
    if (Net.isHost) Net.setPhase('race');
    showScreen('race'); if (!returning && typeof Sfx !== 'undefined') Sfx.raceStart(startTime);""")
# Skip countdown for returning client when race started already. Still enter renderLoop; no host race effects.
rep("const tick = setInterval(() => {\n      const left = startTime - Date.now();", """if (returning && Date.now() > startTime + 1500) {
      els.countdown.textContent = ''; raceT0 = performance.now(); hideSeasonTagNow();
      return;
    }
    const tick = setInterval(() => {
      const left = startTime - Date.now();""")
rep("lastStandings = st; lastCh = ch || null; stopRaceLoops();", "lastStandings = st; lastCh = ch || null; if (Net.isHost) Net.setPhase('results'); stopRaceLoops();")
rep("const HOST_EVENTS = new Set(['goToDraw','allReady','snap','results','lastCall','restartToDraw','wheelUpdated','melt']);", "const HOST_EVENTS = new Set(['goToDraw','allReady','snap','results','lastCall','restartToDraw','wheelUpdated','melt','resumeState']);")
rep("if (data.type === 'allReady') { wheels = data.wheels || wheels;", "if (data.type === 'allReady') { wheels = data.wheels || wheels; currentRaceStart = data.startTime;")
# Add sync functions after hostRedraw object before net event listener
needle="  Net.on('data', ({ from, data }) => {"
state_funcs=r'''  // Host-authoritative state resynchronization. A new browser tab can render the
  // current race without recreating its physical racer or starting a new room.
  function sendRoomState(id) {
    if (!Net.isHost) return;
    const stage = document.body.dataset.screen || 'lobby';
    const msg = { type: 'resumeState', stage, code: Net.roomCode, champ: champPublic(),
      wheel: wheels[id] || null, deadline: drawDeadline };
    if (stage === 'race' || stage === 'results') {
      msg.wheels = wheels;
      msg.layout = currentLayout;
      msg.world = currentWorld;
      msg.crazy = crazy;
      msg.np = Object.keys(raceMeta).length;
      msg.startTime = currentRaceStart;
      msg.season = Terrain.SEASON && Terrain.SEASON.key;
      msg.redraws = hostRedrawCount[id] ?? redrawsForTrack();
    }
    if (stage === 'results') { msg.standings = lastStandings; msg.champResult = lastCh; }
    Net.sendTo(id, msg);
    if (stage === 'race' && snapshotLoopHandle) {
      Net.sendTo(id, { type:'snap', racers: Sim.snapshot(), ts: performance.now(),
        ht: Sim.getObstacleTime(), io: Sim.getInteractiveState(),
        obs: Sim.obstacleSnapshot(), pu: Sim.usedPortals() });
    }
  }
  Net.on('playerJoined', ({ id }) => sendRoomState(id));
  Net.on('playerDisconnected', ({ id }) => {
    if (!Net.isHost || document.body.dataset.screen !== 'draw' || wheels[id]) return;
    // Give a drawing player ten seconds to return, then substitute a valid wheel.
    // Otherwise one closed tab prevents the whole group from ever starting.
    setTimeout(() => {
      if (Net.isHost && document.body.dataset.screen === 'draw' &&
          Net.players[id] && !Net.players[id].connected && !wheels[id]) {
        receiveWheel(id, preRaceDrawer.fallbackCircle());
      }
    }, 10000);
  });
  function applyResumeState(d) {
    if (Net.isHost || !d || !['lobby', 'draw', 'race', 'results'].includes(d.stage)) return;
    const code = String(d.code || '').replace(/[^A-Z]/g, '').slice(0,4);
    if (code) { els.code.value = code; els.roomCode.textContent = code; }
    if (d.stage === 'lobby') { if (document.body.dataset.screen !== 'lobby') showScreen('lobby'); renderPlayerList(); return; }
    champ = d.champ || null;
    if (d.stage === 'draw') {
      if (document.body.dataset.screen !== 'draw') enterDrawPhase(d.deadline);
      if (validWheelVertices(d.wheel)) {
        myVertices = d.wheel; clearInterval(drawTimerHandle);
        els.btnSubmitWheel.disabled = true; els.drawWait.textContent = I18n.t('draw.wait');
      }
      return;
    }
    if (!Array.isArray(d.layout) || !d.layout.length || !d.wheels) return;
    wheels = d.wheels; currentLayout = d.layout; crazy = !!d.crazy;
    currentWorld = ['classic','paradise','inferno','atlantis','enchanted','neon'].includes(d.world) ? d.world : 'classic';
    const opts = { world: currentWorld };
    if (crazy) { opts.crazy = true; opts.np = d.np || Object.keys(Net.players).length; }
    if (d.season && !crazy) opts.season = d.season;
    Terrain.applyLayout(currentLayout, opts);
    currentRaceStart = d.startTime;
    if (d.stage === 'race') {
      if (document.body.dataset.screen !== 'race') startCountdown(d.startTime, true);
      for (const [id, v] of Object.entries(d.wheels)) if (raceMeta[id] && validWheelVertices(v)) raceMeta[id].vertices = v;
      if (Number.isFinite(d.redraws)) {
        myRedrawsLeft = Math.max(0, d.redraws);
        els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft });
        els.redrawUi.style.display = myRedrawsLeft > 0 ? 'flex' : 'none';
      }
    } else if (Array.isArray(d.standings)) {
      raceMeta = {};
      Object.values(Net.players).forEach(p => {
        raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || preRaceDrawer.fallbackCircle() };
      });
      Scenery.setTrack(Terrain.ZONES, Terrain.FINISH_X, Terrain.WORLD, Terrain.WORLD_SEGMENT);
      Flora.setTrack();
      showResults(d.standings, d.champResult);
    }
  }
'''
rep(needle,state_funcs+needle)
rep("if (data.type === 'goToDraw')", "if (data.type === 'resumeState' && !Net.isHost && from === 'host') applyResumeState(data);\n    if (data.type === 'goToDraw')")
rep("document.body.dataset.screen = 'menu'; I18n.init(); applyInvite();", "document.body.dataset.screen = 'menu'; I18n.init(); applyInvite(); updateRejoinButton(); const lastRoom = readRejoin(); if (lastRoom && !els.code.value) els.code.value = lastRoom.code; if (lastRoom && !els.name.value) els.name.value = lastRoom.name;")
p.write_text(s)
print('patched game', len(s))
