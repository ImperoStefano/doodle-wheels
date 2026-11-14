(() => {
  const els = {
    menu: document.getElementById('screen-menu'), lobby: document.getElementById('screen-lobby'),
    draw: document.getElementById('screen-draw'), race: document.getElementById('screen-race'),
    results: document.getElementById('screen-results'), name: document.getElementById('input-name'),
    code: document.getElementById('input-code'), btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'), menuError: document.getElementById('menu-error'),
    roomCode: document.getElementById('room-code'), playerList: document.getElementById('player-list'),
    btnStartRace: document.getElementById('btn-start-race'), lobbyHint: document.getElementById('lobby-hint'),
    lenPicker: document.getElementById('len-picker'), lenHint: document.getElementById('len-hint'), worldInfo: document.getElementById('world-info'), modePicker: document.getElementById('mode-picker'), modeHint: document.getElementById('mode-hint'),
    raceWrap: document.querySelector('.race-wrap'), resultsTrace: document.getElementById('results-trace'), portalFlash: document.getElementById('portal-flash'), portalNote: document.getElementById('portal-note'),
    drawTimer: document.getElementById('draw-timer'), drawCanvas: document.getElementById('draw-canvas'),
    btnClear: document.getElementById('btn-clear'), btnSubmitWheel: document.getElementById('btn-submit-wheel'),
    drawWait: document.getElementById('draw-wait'), redrawUi: document.getElementById('redraw-ui'),
    btnRedrawTrigger: document.getElementById('btn-redraw-trigger'), redrawModal: document.getElementById('redraw-modal'),
    redrawCanvas: document.getElementById('redraw-canvas'), btnCancelRedraw: document.getElementById('btn-cancel-redraw'),
    btnSubmitRedraw: document.getElementById('btn-submit-redraw'), raceCanvas: document.getElementById('race-canvas'),
    countdown: document.getElementById('countdown-overlay'), hudFill: document.getElementById('hud-progress-fill'),
    hudBoard: document.getElementById('hud-leaderboard'), minimap: document.getElementById('minimap-canvas'),
    lastCall: document.getElementById('lastcall'),
    btnJump: document.getElementById('btn-jump'), btnSprint: document.getElementById('btn-sprint'), slowHint: document.getElementById('slow-hint'), ctrlHint: document.getElementById('ctrl-hint'),
    resultsList: document.getElementById('results-list'), btnRematch: document.getElementById('btn-rematch'),
    btnBackMenu: document.getElementById('btn-back-menu'),
    emoteDock: document.getElementById('emote-dock'), emotePicker: document.getElementById('emote-picker'),
    btnEmote: document.getElementById('btn-emote'),
  };

  const preRaceDrawer = createWheelDrawer(els.drawCanvas); preRaceDrawer.init();
  const inRaceDrawer = createWheelDrawer(els.redrawCanvas); inRaceDrawer.init();
  const wheelProfile = document.getElementById('wheel-profile'), pitProfile = document.getElementById('pit-profile');
  function showWheelProfile(el, valid, p) {
    if (!el) return;
    const en = I18n.lang === 'en';
    if (!valid || !p) { el.textContent = en ? 'Draw a closed wheel to inspect its shape.' : 'Disegna una ruota chiusa per vedere la sua forma.'; return; }
    // Indici geometrici, non velocità inventate. I valori derivano dal poligono effettivo.
    const label = p.roundness > 77 ? (en ? 'regular' : 'regolare') :
      p.roundness > 49 ? (en ? 'mixed' : 'mista') : (en ? 'irregular' : 'irregolare');
    el.textContent = (en ? `Shape: ${label} · Roundness ${p.roundness}% · Balance ${p.balance}%` :
      `Forma ${label} · Rotondità ${p.roundness}% · Equilibrio ${p.balance}%`);
  }
  preRaceDrawer.setOnChange((valid, p) => { els.btnSubmitWheel.disabled = !valid; showWheelProfile(wheelProfile, valid, p); });
  inRaceDrawer.setOnChange((valid, p) => { els.btnSubmitRedraw.disabled = !valid; showWheelProfile(pitProfile, valid, p); });

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
  let baseVS = 1, gzoom = 1, cssWv = 0, cssHv = 0, dprV = 1, shake = 0, shX = 0, shY = 0;   // zoom dinamico (ruote giganti) e tremolio della telecamera
  // lunghezza della pista scelta dall'host in lobby, e ultima pista giocata (per "Rigioca stessa pista")
  let trackLen = 'corta', currentLayout = null, keepTrack = false, crazy = false, currentWorld = 'classic';
  let lastCallSent = false, lastCallEnd = 0;
  let currentRaceStart = 0, drawDeadline = 0;
  // A room invitation and an unguessable return token survive a closed tab.
  // The host owns the actual race state: nothing about the physics is trusted from storage.
  const REJOIN_STORAGE = 'dw_room_resume_v260';
  function readRejoin() {
    try { const s = JSON.parse(localStorage.getItem(REJOIN_STORAGE) || 'null');
      return s && /^[A-Z]{4}$/.test(s.code) && /^[A-Za-z0-9_-]{16,100}$/.test(s.token) &&
        typeof s.name === 'string' && Date.now() - s.at < 5 * 60000 ? s : null;
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
  });

  function showScreen(name) { ['menu', 'lobby', 'draw', 'race', 'results'].forEach(s => els[s].classList.toggle('screen--active', s === name)); document.body.dataset.screen = name; if (typeof Sfx !== 'undefined') Sfx.mood(name === 'race' ? 'drive' : name === 'results' ? 'finale' : 'calm'); if (name === 'lobby' || name === 'menu') refreshInvite(); }

  els.btnHost.addEventListener('click', () => { const name = els.name.value.trim(); if (name) { try { localStorage.removeItem(REJOIN_STORAGE); } catch (_) {} updateRejoinButton(); Net.hostGame(name); try { Sim.warmCalibration && Sim.warmCalibration(); } catch (e) {} } else showMenuError(I18n.t('menu.err.name')); });
  els.btnJoin.addEventListener('click', () => {
    const name = els.name.value.trim(), code = els.code.value.trim();
    if (!name || code.length !== 4) return showMenuError(I18n.t('menu.err.namecode')); connectToRoom(code, name);
  });
  function showMenuError(msg) { els.menuError.style.color = ''; els.menuError.textContent = msg; }

  // ---- invio del link: condivisione nativa (telefono) o copia negli appunti ----
  function gameUrl(code) { const u = new URL(location.href); u.search = ''; u.hash = ''; if (code) u.searchParams.set('c', code); return u.toString(); }
  let toastT = 0;
  function shareToast(key) { const t = document.getElementById('share-toast'); if (!t) return; t.textContent = I18n.t(key); t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
  async function shareLink(code) {
    const url = gameUrl(code), text = I18n.t(code ? 'share.codeText' : 'share.text') + (code ? ' ' + code : ''), key = code ? 'share.toastRoom' : 'share.toastGame';
    try { if (navigator.share) { await navigator.share({ title: 'Doodle Wheels', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + '\n' + url); shareToast(key); return; } catch (e) {}
    try { const ta = document.createElement('textarea'); ta.value = text + '\n' + url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); if (ok) { shareToast(key); return; } } catch (e) {}
    window.prompt('Link', url);
  }
  window.addEventListener('dw-sound-mode', e => shareToast('sound.' + e.detail));
  els.btnShare = document.getElementById('btn-share');
  // dal menu: link del gioco; in lobby: invito con il codice della gara
  if (els.btnShare) els.btnShare.addEventListener('click', () => shareLink(els.lobby.classList.contains('screen--active') ? els.roomCode.textContent.trim() : ''));
  // riga "link da copiare" (desktop): mostra il link vero e lo copia con un clic
  function refreshInvite() {
    const m = document.getElementById('invite-url-menu'), l = document.getElementById('invite-url-lobby');
    if (m) m.value = gameUrl('');
    if (l) { const c = els.roomCode.textContent.trim(); l.value = /^[A-Z0-9]{4}$/.test(c) ? gameUrl(c) : ''; }
  }
  async function copyInvite(inputId, btnId) {
    const inp = document.getElementById(inputId), btn = document.getElementById(btnId); if (!inp || !btn) return;
    refreshInvite(); inp.focus(); inp.select();
    let ok = false;
    try { await navigator.clipboard.writeText(inp.value); ok = true; } catch (e) { try { ok = document.execCommand('copy'); } catch (e2) {} }
    if (ok) { btn.textContent = I18n.t('share.copied'); btn.classList.add('done'); setTimeout(() => { btn.textContent = I18n.t('share.copy'); btn.classList.remove('done'); }, 1800); }
  }
  [['invite-url-menu', 'btn-copy-menu'], ['invite-url-lobby', 'btn-copy-lobby']].forEach(([i, b]) => {
    const bi = document.getElementById(b), ii = document.getElementById(i);
    if (bi) bi.addEventListener('click', () => copyInvite(i, b)); if (ii) ii.addEventListener('focus', () => ii.select());
  });
  refreshInvite();
  // ---- schermo intero (Android/iPad: dove il browser lo permette; su iPhone Safari non lo consente a una pagina) ----
  (function () {
    const root = document.documentElement, fsOn = () => document.fullscreenElement || document.webkitFullscreenElement;
    const canFs = !!((document.fullscreenEnabled || document.webkitFullscreenEnabled) && (root.requestFullscreen || root.webkitRequestFullscreen));
    const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone === true;
    const btn = document.getElementById('btn-full');
    if (btn && canFs && coarse && !standalone) {
      document.body.classList.add('has-fs'); btn.title = I18n.t('full.title');
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        try {
          if (fsOn()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
          await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: 'hide' }) : root.webkitRequestFullscreen());
          try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (er) {}
        } catch (er) {}
      });
    }
  })();
  // aperto da un invito (?c=CODICE): il codice è già compilato
  function applyInvite() {
    try { const c = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); if (c.length === 4) { els.code.value = c; els.menuError.textContent = I18n.t('share.fromLink'); els.menuError.style.color = '#627d98'; setTimeout(() => els.name.focus(), 50); } } catch (e) {}
  }

  Net.on('error', err => showMenuError(err.message || I18n.t('menu.err.net')));
  const connectionStatus = document.getElementById('connection-status');
  Net.on('reconnecting', () => {
    if (connectionStatus) {
      connectionStatus.textContent = I18n.t('net.reconnecting');
      connectionStatus.hidden = false;
    }
  });
  Net.on('reconnected', () => { if (connectionStatus) connectionStatus.hidden = true; });
  Net.on('sessionMoved', () => {
    stopRaceLoops(); showScreen('menu'); updateRejoinButton();
    showMenuError(I18n.t('net.sessionMoved'));
  });
  Net.on('joined', () => {
    if (connectionStatus) connectionStatus.hidden = true;
    showMenuError('');
    const rec = readRejoin(); if (rec) saveRejoin(rec.code, rec.name, rec.token);
  });
  function keepReturnPassFresh() {
    if (Net.isHost || !Net.myId || document.body.dataset.screen === 'menu') return;
    // Refresh while connected so a five-minute recovery pass stays valid even
    // if friends spend an hour playing together before closing the tab.
    try {
      const rec = JSON.parse(localStorage.getItem(REJOIN_STORAGE) || 'null');
      if (rec && rec.code === Net.roomCode && rec.token) saveRejoin(rec.code, rec.name, rec.token);
    } catch (_) {}
  }
  setInterval(keepReturnPassFresh, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keepReturnPassFresh(); });
  window.addEventListener('pagehide', keepReturnPassFresh);
  Net.on('hostLeft', () => { if (connectionStatus) connectionStatus.hidden = true; alert(I18n.t('race.hostleft')); location.reload(); });
  Net.on('roomReady', ({ code }) => { Net.setPhase('lobby'); els.roomCode.textContent = code; renderPlayerList(); showScreen('lobby'); refreshInvite(); });
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
      li.innerHTML = `<span class="color-dot" style="background:${p.color}"></span><span class="player-name">${escapeHtml(p.name)}</span>${p.isHost ? '<span class="host-badge">HOST</span>' : ''}${p.connected === false ? `<span class="host-badge" title="${I18n.t('net.offline')}">${I18n.t('net.offline')}</span>` : ''}`;
      els.playerList.appendChild(li);
    });
    const c = Object.keys(Net.players).length;
    els.lobby.classList.toggle('lobby--guest', !Net.isHost); if (Net.isHost) { els.btnStartRace.disabled = c < 1; els.btnStartRace.style.display = 'block'; updateStartBtn(c); els.lobbyHint.textContent = I18n.t('lobby.hostHint'); els.lenPicker.style.display = els.modePicker.style.display = els.worldInfo.style.display = 'block'; const fp = document.getElementById('fmt-picker'); if (fp) fp.style.display = 'block'; }
    else { els.btnStartRace.style.display = 'none'; els.lobbyHint.textContent = I18n.t('lobby.hostcfg'); els.lenPicker.style.display = els.modePicker.style.display = els.worldInfo.style.display = 'none'; const fp = document.getElementById('fmt-picker'); if (fp) fp.style.display = 'none'; }
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
  // I mondi speciali sono eventi a comparsa frequente ma non garantita: il sorteggio avviene una volta per ogni nuova pista,
  // soltanto sull'host. La scelta viene poi inviata con allReady, così tutti vedono lo stesso mondo.
  // Il replay conserva la pista e il mondo appena giocati. Classico 35%, Antico Egitto 15%, altri cinque mondi 10% ciascuno.
  const WORLD_CHANCES = { paradise: 0.10, inferno: 0.10, atlantis: 0.10, enchanted: 0.10, neon: 0.10, egypt: 0.15 };
  function drawWorld() {
    // Modalità collaudo facoltativa (solo per l'host): ?testWorld=atlantis.
    // Nelle partite normali si applicano le probabilità configurate in WORLD_CHANCES.
    const previewWorld = new URLSearchParams(location.search).get('testWorld');
    if (Object.prototype.hasOwnProperty.call(WORLD_CHANCES, previewWorld)) return previewWorld;
    const r = Math.random(); let edge = 0;
    for (const [world, chance] of Object.entries(WORLD_CHANCES)) { edge = Math.round((edge + chance) * 1e6) / 1e6; if (r < edge) return world; }
    return 'classic';
  }
  els.modePicker.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => {
    crazy = btn.dataset.mode === 'crazy';
    els.modePicker.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('seg-btn--on', b === btn));
    els.modeHint.textContent = I18n.t('mode.hint.' + (crazy ? 'crazy' : 'normal'));
  }));
  els.modeHint.textContent = I18n.t('mode.hint.normal');
  // ---- campionato: serie di 3 o 5 gare, una stagione diversa ciascuna, punti a ogni arrivo (l'ultima vale doppio) ----
  //   champ (host) = { n, i, seasons[], totals{id:{id,name,color,pts}} } · (client) = { n, i, seasons[] } ricevuto da goToDraw / restartToDraw
  const CHAMP_PTS = [10, 7, 5, 3, 2], fmtPicker = document.getElementById('fmt-picker'), fmtHint = document.getElementById('fmt-hint'), btnRes = els.btnRematch, resWait = document.getElementById('res-wait');
  let champN = 1, champ = null, lastCh = null;
  const fmtHintTxt = () => { if (fmtHint) fmtHint.textContent = I18n.t('fmt.hint.' + champN); };
  if (fmtPicker) fmtPicker.querySelectorAll('[data-fmt]').forEach(btn => btn.addEventListener('click', () => {
    champN = +btn.dataset.fmt; fmtPicker.querySelectorAll('[data-fmt]').forEach(b => b.classList.toggle('seg-btn--on', b === btn)); fmtHintTxt(); updateStartBtn();
  }));
  fmtHintTxt();
  // il pulsante dice cosa succede premendolo: "Inizia la gara · 3 giocatori" / "Inizia il campionato · da solo"
  function updateStartBtn(c) {
    const n = c || Object.keys(Net.players).length;
    els.btnStartRace.textContent = I18n.t(champN > 1 ? 'lobby.goChamp' : 'lobby.goRace') + ' · ' + (n <= 1 ? I18n.t('lobby.alone') : I18n.t('lobby.nPlayers', { n }));
  }
  function pickSeasons(n) {   // la prima è sempre la classica (partenza tranquilla), le altre sono a tema e tutte diverse
    const themed = Terrain.SEASONS.map(q => q.key).filter(k => k !== 'classica'); for (let i = themed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [themed[i], themed[j]] = [themed[j], themed[i]]; }
    return ['classica'].concat(themed.slice(0, n - 1));
  }
  function champPublic() { return champ ? { n: champ.n, i: champ.i, seasons: champ.seasons } : null; }
  function startChamp() { champ = champN > 1 ? { n: champN, i: 0, seasons: pickSeasons(champN), totals: {} } : null; }
  function updateChampBanner() {
    const el = document.getElementById('champ-banner'); if (!el) return;
    if (!champ) { el.style.display = 'none'; return; }
    el.textContent = I18n.t('champ.banner', { i: champ.i + 1, n: champ.n }) + (crazy ? '' : ' · ' + I18n.t('season.' + champ.seasons[champ.i])) + (champ.i === champ.n - 1 && champ.n >= 3 ? ' · ' + I18n.t('champ.double') : '');
    el.style.display = 'block';
  }
  // l'host assegna i punti a fine gara e ne manda la classifica insieme ai risultati
  function champAward(st) {
    const last = champ.i >= champ.n - 1, mul = last ? 2 : 1, gains = {};
    st.forEach((r, k) => { const g = r.finished ? (CHAMP_PTS[k] || 1) * mul : 0; gains[r.id] = g; const t = champ.totals[r.id] = champ.totals[r.id] || { id: r.id, name: r.name, color: r.color, pts: 0 }; t.name = r.name; t.color = r.color; t.pts += g; });
    const table = Object.values(champ.totals).map(t => ({ id: t.id, name: t.name, color: t.color, pts: t.pts, gain: gains[t.id] || 0 })).sort((a, b) => b.pts - a.pts || b.gain - a.gain);
    return { n: champ.n, i: champ.i, season: crazy ? null : Terrain.SEASON.key, final: last, gains, table };
  }

  I18n.onChange(() => {
    // Labels for touch controls follow the player's own language.
    if (els.btnJump) els.btnJump.setAttribute('aria-label', I18n.t('race.jump'));
    if (els.btnSprint) els.btnSprint.setAttribute('aria-label', I18n.t('race.sprintTip'));
    fmtHintTxt(); if (document.body.dataset.screen === 'results' && lastCh) { try { renderChamp(lastCh); } catch (e) {} }
    els.lenHint.textContent = I18n.t('len.hint.' + trackLen); els.modeHint.textContent = I18n.t('mode.hint.' + (crazy ? 'crazy' : 'normal'));
    if (els.btnRedrawTrigger && els.btnRedrawTrigger.textContent) els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft });
    showWheelProfile(wheelProfile, preRaceDrawer.isValid(), preRaceDrawer.getProfile());
    showWheelProfile(pitProfile, inRaceDrawer.isValid(), inRaceDrawer.getProfile());
    if (lastCallEnd) updateLastCall();
    try { if (els.lobby.classList.contains('screen--active')) renderPlayerList(); } catch (e) {}
  });

  els.btnStartRace.addEventListener('click', () => { if (Net.isHost) { wheels = {}; startChamp(); Net.broadcast({ type: 'goToDraw', champ: champPublic() }); enterDrawPhase(); } });
  els.btnClear.addEventListener('click', () => preRaceDrawer.clear());
  els.btnSubmitWheel.addEventListener('click', () => submitWheel());

  els.btnRedrawTrigger.addEventListener('click', () => {
    if (myRedrawsLeft > 0) { inRaceDrawer.clear(); els.btnSubmitRedraw.disabled = true; els.redrawModal.style.display = 'flex'; }
  });
  els.btnCancelRedraw.addEventListener('click', () => els.redrawModal.style.display = 'none');
  els.btnSubmitRedraw.addEventListener('click', () => {
    if (!inRaceDrawer.isValid()) return;
    const v = inRaceDrawer.getNormalizedVertices(80); els.redrawModal.style.display = 'none'; myRedrawsLeft--; if (typeof Sfx !== 'undefined') Sfx.redraw();
    els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft });
    if (myRedrawsLeft <= 0) els.redrawUi.style.display = 'none';
    if (Net.isHost) { Sim.updateRacerWheel(Net.myId, v); raceMeta[Net.myId].vertices = v; clearMelt(raceMeta[Net.myId]); Net.broadcast({ type: 'wheelUpdated', id: Net.myId, vertices: v }); }
    else { Net.send({ type: 'wheelUpdate', vertices: v }); }
  });

  // ---- Emote illustrate ORIGINALI: 1-5 / selettore touch. Senza dipendenze da sticker esterni. ----
  const EMOTE_IDS = ['clap', 'laugh', 'shock', 'fire', 'thumb'];
  const EMOTES = Object.freeze({ clap:'Sorpresa', laugh:'Amore', shock:'Rabbia', fire:'Cool', thumb:'Vittoria' });
  const emoteArt = Object.create(null);
  EMOTE_IDS.forEach(code => {
    const pic = new Image(); pic.decoding = 'async'; pic.src = `img/emotes/${code}.png?v=16`;
    emoteArt[code] = pic;
  });
  const EMOTE_COOLDOWN = 2400, EMOTE_DURATION = 2250;
  const activeEmotes = Object.create(null), lastEmoteById = Object.create(null);
  let lastMyEmote = -1e9;
  function closeEmotePicker() {
    if (els.emotePicker) els.emotePicker.hidden = true;
    if (els.btnEmote) els.btnEmote.setAttribute('aria-expanded', 'false');
  }
  function showEmote(id, code) {
    if (!Object.hasOwn(EMOTES, code) || !raceMeta[id]) return;
    activeEmotes[id] = { code, at: performance.now() };
  }
  function tryEmote(code) {
    if (!Object.hasOwn(EMOTES, code) || document.body.dataset.screen !== 'race' || !raceLoopHandle || els.redrawModal.style.display === 'flex') return;
    const now = performance.now();
    if (now - lastMyEmote < EMOTE_COOLDOWN) return;
    lastMyEmote = now;
    closeEmotePicker();
    showEmote(Net.myId, code);
    if (Net.isHost) Net.broadcast({ type: 'emote', id: Net.myId, code });
    else Net.send({ type: 'emote', code });
  }
  if (els.btnEmote) {
    els.btnEmote.addEventListener('pointerdown', e => e.stopPropagation());
    els.btnEmote.addEventListener('click', e => {
      e.stopPropagation();
      const open = !!els.emotePicker.hidden;
      els.emotePicker.hidden = !open;
      els.btnEmote.setAttribute('aria-expanded', String(open));
    });
    for (const b of els.emotePicker.querySelectorAll('[data-emote]')) {
      b.addEventListener('pointerdown', e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); tryEmote(b.dataset.emote); });
    }
  }
  window.addEventListener('keydown', e => {
    if (e.repeat || document.body.dataset.screen !== 'race') return;
    const tg=e.target;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    const k=/^(?:Digit|Numpad)([1-5])$/.exec(e.code);
    if (k) { e.preventDefault(); tryEmote(EMOTE_IDS[Number(k[1])-1]); }
    else if (e.code === 'Escape') closeEmotePicker();
  });
  // V17: emote grandi, sempre in pixel SCHERMO, con layout anticollisione.
  // In questo gioco lo zoom della camera è circa 0.42–1 sui telefoni: prima le emote
  // si riducevano insieme alle ruote e diventavano minuscole proprio sul mobile.
  function drawEmoteBubble(id, centerX, centerY, color, ts, indicator = null) {
    const e = activeEmotes[id]; if (!e) return;
    const age = ts - e.at;
    if (age >= EMOTE_DURATION || age < 0) { delete activeEmotes[id]; return; }
    const compact = Math.min(cssWv, cssHv) < 520;
    const u = 1 / Math.max(0.28, viewScale); // un pixel CSS nel sistema di coordinate canvas
    const offscreen = !!(indicator && indicator.offscreen);
    const icon = (indicator && indicator.icon || (compact ? 72 : 84)) * u;
    const hw = icon / 2 + (offscreen ? 8 : 10) * u, hh = icon / 2 + (offscreen ? 7 : 8) * u;
    const tail = (offscreen ? 7 : 12) * u;
    // Il layout è calcolato dopo tutte le bici, in coordinate di schermo.
    // centerX/centerY sono già limitati alla viewport e distanziati tra loro.
    const dx = centerX, dy = centerY;
    const fadeOut = Math.max(0, Math.min(1, (EMOTE_DURATION - age) / 440));
    const fadeIn = Math.min(1, age / 110);
    const pop = 0.88 + 0.12 * Math.min(1, age / 180);
    ctx2d.save();
    ctx2d.globalAlpha = fadeIn * fadeOut;
    ctx2d.translate(dx, dy);
    ctx2d.scale(pop, pop);
    // Ombra morbida per aumentare il contrasto del fumetto sullo sfondo.
    ctx2d.shadowColor = 'rgba(20,41,53,.16)';
    ctx2d.shadowBlur = 8 * u;
    ctx2d.shadowOffsetY = 3 * u;
    ctx2d.fillStyle = 'rgba(255,252,243,.97)';
    ctx2d.strokeStyle = color || '#24505e';
    ctx2d.lineWidth = 2.4 * u;
    const radius = 12 * u;
    ctx2d.beginPath();
    ctx2d.moveTo(-hw + radius, -hh);
    ctx2d.lineTo(hw - radius, -hh);
    ctx2d.quadraticCurveTo(hw, -hh, hw, -hh + radius);
    ctx2d.lineTo(hw, hh - radius);
    ctx2d.quadraticCurveTo(hw, hh, hw - radius, hh);
    ctx2d.lineTo(5 * u, hh);
    ctx2d.lineTo(0, hh + tail);
    ctx2d.lineTo(-5 * u, hh);
    ctx2d.lineTo(-hw + radius, hh);
    ctx2d.quadraticCurveTo(-hw, hh, -hw, hh - radius);
    ctx2d.lineTo(-hw, -hh + radius);
    ctx2d.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
    ctx2d.closePath();
    ctx2d.fill(); ctx2d.stroke();
    ctx2d.shadowColor = 'transparent'; ctx2d.shadowBlur = 0; ctx2d.shadowOffsetY = 0;
    const pic = emoteArt[e.code];
    if (pic && pic.complete && pic.naturalWidth > 0) {
      ctx2d.drawImage(pic, -icon / 2, -icon / 2, icon, icon);
    } else {
      ctx2d.fillStyle = '#264756';
      ctx2d.font = `bold ${13 * u}px system-ui,sans-serif`;
      ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
      ctx2d.fillText(EMOTES[e.code], 0, 0);
    }
    if (offscreen) {
      // Indicatore persistente durante l'emote: freccia verso l'avversario e suo nome.
      // Il badge resta leggibile anche quando la sua bici non è nella telecamera.
      const side = indicator.side || 'right', left = side === 'left';
      const name = String(indicator.displayName || indicator.name || 'Giocatore').slice(0, 13);
      const tagW = Math.min(108, 22 + name.length * 6.3) * u;
      const tagH = 27 * u;
      const tagX = left ? hw + 7 * u : -hw - 7 * u - tagW;
      ctx2d.fillStyle = 'rgba(24,37,55,.91)';
      ctx2d.strokeStyle = 'rgba(255,255,255,.85)';
      ctx2d.lineWidth = 1.3 * u;
      ctx2d.beginPath();
      ctx2d.roundRect(tagX, -tagH / 2, tagW, tagH, 9 * u);
      ctx2d.fill(); ctx2d.stroke();
      ctx2d.font = `bold ${12 * u}px system-ui,sans-serif`;
      ctx2d.textAlign = 'center'; ctx2d.textBaseline = 'middle';
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillText(name, tagX + tagW / 2, 0, tagW - 12 * u);
      const ax = side === 'left' ? -hw + 1 * u : side === 'right' ? hw - 1 * u : 0;
      const ay = side === 'up' ? -hh + 2 * u : side === 'down' ? hh - 2 * u : -hh + 10 * u;
      ctx2d.fillStyle = color || '#24505e';
      ctx2d.strokeStyle = 'white'; ctx2d.lineWidth = 2 * u;
      ctx2d.beginPath(); ctx2d.arc(ax, ay, 13 * u, 0, Math.PI * 2); ctx2d.fill(); ctx2d.stroke();
      ctx2d.save();ctx2d.translate(ax, ay);
      ctx2d.rotate(side === 'left' ? Math.PI : side === 'up' ? -Math.PI / 2 : side === 'down' ? Math.PI / 2 : 0);
      ctx2d.strokeStyle = '#fff';ctx2d.lineWidth = 2.8 * u;ctx2d.lineCap='round';ctx2d.lineJoin='round';
      ctx2d.beginPath();ctx2d.moveTo(-5*u,-5*u);ctx2d.lineTo(2*u,0);ctx2d.lineTo(-5*u,5*u);ctx2d.stroke();ctx2d.restore();
    }
    ctx2d.restore();
  }

  // ---- Salto: Spazio / ↑ / W, tocco o clic sulla pista, pulsante a schermo (ottimizzato per desktop e telefono) ----
  // L'host decide (a terra, con una pausa fra un salto e l'altro): qui si manda subito la richiesta (anti-rimbalzo 45 ms).
  let lastJumpTry = 0;
  function tryJump() {
    if (document.body.dataset.screen !== 'race' || !raceLoopHandle || els.redrawModal.style.display === 'flex') return;
    const t = performance.now(); if (t - lastJumpTry < 45) return; lastJumpTry = t;   // solo anti-rimbalzo: l'host decide pause e doppio salto (un doppio tocco veloce deve passare)
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (_) {}
    if (Net.isHost) Sim.jump(Net.myId); else Net.send({ type: 'jump' });
  }
  // ---- Sprint: Maiusc / E / → o pulsante col contatore. Dura poco e si ricarica a lungo (decide l'host, come il salto) ----
  let lastSprintTry = 0;
  function trySprint() {
    if (document.body.dataset.screen !== 'race' || !raceLoopHandle || els.redrawModal.style.display === 'flex') return;
    const t = performance.now(); if (t - lastSprintTry < 120) return; lastSprintTry = t;
    try { if (navigator.vibrate) navigator.vibrate(14); } catch (_) {}
    { const tip = document.getElementById('sprint-tip'); if (tip) tip.style.display = 'none'; }
    if (Net.isHost) Sim.sprint(Net.myId); else Net.send({ type: 'sprint' });
  }
  window.addEventListener('keydown', e => {
    if (e.repeat || (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight' && e.code !== 'KeyE' && e.code !== 'ArrowRight') || document.body.dataset.screen !== 'race') return;
    const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    e.preventDefault(); if (tg && tg.tagName === 'BUTTON' && tg.blur) tg.blur(); trySprint();
  });
  if (els.btnSprint) els.btnSprint.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); trySprint(); });
  function updateSprintUi(me) {
    const b = els.btnSprint; if (!b || !me) return;
    const p = me.sp === undefined ? 1 : me.sp, on = !!me.so;
    b.style.setProperty('--p', p); b.classList.toggle('ready', !on && p >= 1); b.classList.toggle('on', on); b.classList.toggle('cool', !on && p < 1);
    const cd = document.getElementById('sprint-cd');   // secondi che mancano al prossimo scatto, in trasparenza sopra il fulmine
    if (cd) { const recharging = !on && p < 1 && Number.isFinite(p); const sec = recharging ? Math.max(1, Math.ceil((1 - p) * SPRINT_RECHARGE_S - 0.001)) : 0; if (cd.dataset.s !== String(sec) || (!recharging && cd.textContent !== '')) { cd.dataset.s = String(sec); cd.textContent = sec ? String(sec) : ''; } }
  }
  const SPRINT_RECHARGE_S = 22;   // = SPRINT_RECHARGE_MS della fisica
  window.addEventListener('keydown', e => {
    if (e.repeat || (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'KeyW') || document.body.dataset.screen !== 'race') return;
    const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    e.preventDefault(); if (tg && tg.tagName === 'BUTTON' && tg.blur) tg.blur(); tryJump();
  });
  els.raceCanvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; tryJump(); });
  if (els.btnJump) els.btnJump.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); els.btnJump.classList.add('press'); tryJump(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => { if (els.btnJump) els.btnJump.addEventListener(ev, () => els.btnJump.classList.remove('press')); });

  // Messaggi host-only: i client non possono imporre gara, classifica o snapshot.
  const HOST_EVENTS = new Set(['goToDraw','allReady','snap','results','lastCall','restartToDraw','wheelUpdated','melt','resumeState']);
  function validWheelVertices(v) {
    return Array.isArray(v) && v.length >= 3 && v.length <= 256 && v.every(pt => pt &&
      Number.isFinite(pt.x) && Number.isFinite(pt.y) && Math.abs(pt.x) <= 250 && Math.abs(pt.y) <= 250);
  }
  const hostRedrawCount = Object.create(null), hostRedrawAt = Object.create(null);
  // Host-authoritative state resynchronization. A new browser tab can render the
  // current race without recreating its physical racer or starting a new room.
  function sendRoomState(id) {
    if (!Net.isHost) return;
    const stage = document.body.dataset.screen || 'lobby';
    const msg = { type: 'resumeState', stage, code: Net.roomCode, champ: champPublic(),
      wheel: wheels[id] || null, deadline: drawDeadline };
    if (stage === 'race' || stage === 'results') {
      msg.wheels = Object.fromEntries(Object.entries(raceMeta).map(([rid, meta]) => [rid, meta.vertices]));
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
      if (Sim.getAllMeltStates) Net.sendTo(id, { type:'meltSync', melts: Sim.getAllMeltStates() });
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
    currentWorld = ['classic','paradise','inferno','atlantis','enchanted','neon','egypt'].includes(d.world) ? d.world : 'classic';
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
  Net.on('data', ({ from, data }) => {
    if (!data || typeof data.type !== 'string') return;
    if (Net.isHost && HOST_EVENTS.has(data.type)) return;
    if (data.type === 'resumeState' && !Net.isHost && from === 'host') applyResumeState(data);
    if (data.type === 'meltSync' && !Net.isHost && from === 'host' && Array.isArray(data.melts)) {
      data.melts.forEach(m => { if (m && raceMeta[m.id] && Array.isArray(m.f) && Array.isArray(m.r)) applyMelt(m.id,m.f,m.r); });
    }
    if (data.type === 'goToDraw') { champ = data.champ || null; enterDrawPhase(); }
    if (data.type === 'wheel' && Net.isHost && Net.players[from] && validWheelVertices(data.vertices)) receiveWheel(from, data.vertices);
    if (data.type === 'allReady') { wheels = data.wheels || wheels; currentRaceStart = data.startTime; currentLayout = data.trackLayout; crazy = !!data.crazy; currentWorld = ['classic', 'paradise', 'inferno', 'atlantis', 'enchanted', 'neon', 'egypt'].includes(data.world) ? data.world : 'classic'; const opts = { world: currentWorld }; if (crazy) { opts.crazy = true; opts.np = data.np; } if (champ && !crazy && champ.seasons && champ.seasons[champ.i]) opts.season = champ.seasons[champ.i]; Terrain.applyLayout(data.trackLayout, opts); startCountdown(data.startTime); }
    if (data.type === 'snap') { if (!Net.isHost) { InteractiveObstacles.receive(data.io); if (data.obs) DynamicObstacles.setRemoteStates(data.obs); } if (data.pu) syncUsed(data.pu); applySnapshot(data.racers, data.ts); if (!Net.isHost && Number.isFinite(data.ht) && Number.isFinite(data.ts) && snapOff !== null) { const origin = data.ts + snapOff - data.ht; hazardHostOrigin = hazardHostOrigin === null ? origin : hazardHostOrigin * 0.94 + origin * 0.06; } }
    if (data.type === 'results') showResults(data.standings, data.champ);
    if (data.type === 'lastCall') showLastCall(data.ms);
    if (data.type === 'restartToDraw') { champ = data.champ || null; enterDrawPhase(); }
    if (data.type === 'wheelUpdate' && Net.isHost && raceMeta[from] && validWheelVertices(data.vertices)) {
      const now = performance.now();
      if (raceT0 && now - raceT0 > 2500 && (hostRedrawCount[from] || 0) > 0 && now - (hostRedrawAt[from] || -1e9) >= 1500) {
        hostRedrawAt[from] = now; hostRedrawCount[from]--;
        Sim.updateRacerWheel(from, data.vertices); raceMeta[from].vertices = data.vertices; clearMelt(raceMeta[from]);
        Net.broadcast({ type: 'wheelUpdated', id: from, vertices: data.vertices });
      }
    }
    if (data.type === 'jump' && Net.isHost) Sim.jump(from);
    if (data.type === 'sprint' && Net.isHost) Sim.sprint(from);
    if (data.type === 'emote') {
      if (Net.isHost) {
        // L'host attribuisce il messaggio al mittente autentico, mai a un ID fornito dal client.
        const now = performance.now();
        if (Net.players[from] && raceLoopHandle && Object.hasOwn(EMOTES, data.code) &&
            now - (lastEmoteById[from] ?? -1e9) >= EMOTE_COOLDOWN) {
          lastEmoteById[from] = now;
          showEmote(from, data.code);
          Net.broadcast({ type: 'emote', id: from, code: data.code });
        }
      } else if (from === 'host' && Net.players[data.id] && Object.hasOwn(EMOTES, data.code)) {
        if (data.id !== Net.myId) showEmote(data.id, data.code);
      }
    }
    if (data.type === 'wheelUpdated') { if (raceMeta[data.id]) { raceMeta[data.id].vertices = data.vertices; clearMelt(raceMeta[data.id]); } }
    if (data.type === 'melt' && !Net.isHost) applyMelt(data.id, data.f, data.r);
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

  const firstTip = document.getElementById('draw-first-tip');
  if (document.getElementById('draw-first-tip-close')) document.getElementById('draw-first-tip-close').addEventListener('click', () => {
    if (firstTip) firstTip.hidden = true;
    try { localStorage.setItem('dw_draw_tip_seen', '1'); } catch (_) {}
  });
  function enterDrawPhase(deadline) {
    if (firstTip) { try { firstTip.hidden = localStorage.getItem('dw_draw_tip_seen') === '1'; }
      catch (_) { firstTip.hidden = false; } }
    requestWakeLock();
    if (Net.isHost) Net.setPhase('draw');
    drawDeadline = Number.isFinite(deadline) ? deadline : Date.now() + 30000;
    stopRaceLoops(); raceStarting = false; preRaceDrawer.clear(); myVertices = null; els.btnSubmitWheel.disabled = true; els.drawWait.textContent = ''; updateChampBanner(); showScreen('draw');
    if (Net.isHost) {
      // Offline seats are reserved for a returning friend; a permanently absent
      // participant must never strand everybody at the drawing countdown.
      for (const [id, player] of Object.entries(Net.players)) if (!player.connected && !wheels[id]) {
        setTimeout(() => {
          if (document.body.dataset.screen === 'draw' && Net.players[id] &&
              !Net.players[id].connected && !wheels[id]) receiveWheel(id, preRaceDrawer.fallbackCircle());
        }, 10000);
      }
    }
    els.drawTimer.textContent = Math.max(0, Math.ceil((drawDeadline - Date.now()) / 1000)); clearInterval(drawTimerHandle);
    drawTimerHandle = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((drawDeadline - Date.now()) / 1000));
      els.drawTimer.textContent = remaining;
      if (remaining <= 0) { clearInterval(drawTimerHandle); if (!myVertices) submitWheel(true); }
    }, 250);
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
      const start = Date.now() + 3500 + 1500; currentRaceStart = start;  // breve attesa (la fisica finisce di prepararsi), poi 3-2-1
      // "Rigioca stessa pista" riusa il percorso appena giocato; altrimenti ne nasce uno nuovo della lunghezza scelta
      const season = champ && !crazy ? champ.seasons[champ.i] : null;
      const replaying = keepTrack && currentLayout;
      if (!replaying) currentWorld = drawWorld();
      const track = replaying ? currentLayout : Terrain.generateRandomLayout(Terrain.LENGTHS[trackLen] || Terrain.LENGTHS.lunga, crazy, season, currentWorld);
      currentLayout = track; keepTrack = false;
      const np = ids.length, opts = { world: currentWorld }; if (crazy) { opts.crazy = true; opts.np = np; } if (season) opts.season = season;
      Terrain.applyLayout(track, opts); Net.broadcast({ type: 'allReady', wheels, startTime: start, trackLayout: track, crazy, np, world: currentWorld }); startCountdown(start);
    }
  }

  // Durante il conto alla rovescia le bici stanno ferme in griglia (stesse posizioni di partenza
  // della fisica), così si vede già il mondo e chi c'è in gara; il primo snapshot le sostituisce.
  function placeGrid() {
    InteractiveObstacles.clearClient();
    latestRacers = {}; snapBuf.length = 0; snapOff = null; lastRemoteSnapTs = -Infinity; hazardHostOrigin = null;
    snapPrevArrival = 0; snapIntervalMean = 50; snapJitter = 0; interpClientMs = INTERP_CLIENT_MS;
    Object.keys(raceMeta).forEach((id, i) => {
      const x = 60, y = Sim.GROUND_Y - Terrain.height(x) - 70;   // stesso punto di partenza per tutti (come nella fisica)
      latestRacers[id] = { id, x, y, angle: 0, fwX: x + 90, fwY: y, fwAngle: 0, rwX: x - 90, rwY: y, rwAngle: 0, vx: 0, finished: false, finishTime: null };
    });
  }

  // Più la gara è lunga, più cambi forma hai: corta 2, media 4, lunga 6 (le zone vere sono ZONES meno partenza e arrivo)
  function redrawsForTrack() { const n = Math.max(0, (Terrain.ZONES ? Terrain.ZONES.length : 0) - 2); return n <= 7 ? 2 : n <= 11 ? 4 : 6; }

  function startCountdown(startTime, returning = false) {
    currentRaceStart = startTime;
    if (Net.isHost) Net.setPhase('race');
    showScreen('race'); if (!returning && typeof Sfx !== 'undefined') Sfx.raceStart(startTime); setupCanvas(); myRedrawsLeft = redrawsForTrack(); els.btnRedrawTrigger.textContent = I18n.t('race.change', { n: myRedrawsLeft }); els.redrawUi.style.display = 'flex';
    CurseFx.reset();
    if (els.btnJump) els.btnJump.style.display = 'flex'; if (els.btnSprint) { els.btnSprint.style.display = 'flex'; els.btnSprint.style.setProperty('--p', 1); els.btnSprint.classList.add('ready'); els.btnSprint.classList.remove('on', 'cool'); const cd = document.getElementById('sprint-cd'); if (cd) { cd.textContent = ''; cd.dataset.s = '0'; } } resetSlow(); for (const k in jnSeen) delete jnSeen[k]; for (const k in jaSeen) delete jaSeen[k]; for (const k in lnSeen) delete lnSeen[k]; for (const k in ldSeen) delete ldSeen[k];
    for (const id in activeEmotes) delete activeEmotes[id];
    for (const id in lastEmoteById) delete lastEmoteById[id];
    lastMyEmote = -1e9;
    closeEmotePicker();
    raceMeta = {}; Object.values(Net.players).forEach(p => raceMeta[p.id] = { color: p.color, name: p.name, vertices: wheels[p.id] || preRaceDrawer.fallbackCircle() });
    // Per ogni giocatore l'host verifica anche il budget dei pit-stop.
    for (const key in hostRedrawCount) delete hostRedrawCount[key];
    for (const key in hostRedrawAt) delete hostRedrawAt[key];
    Object.keys(raceMeta).forEach(id => { hostRedrawCount[id] = myRedrawsLeft; hostRedrawAt[id] = -1e9; });
    // l'host tara in anticipo ogni ruota (a fette, durante l'intro): così su terreno normale vanno tutte alla pari
    if (Net.isHost) { Object.values(raceMeta).forEach(m => Sim.calibrate(m.vertices, () => {})); Sim.prepareAsync(); }   // mondo fisico costruito a fette durante l'intro
    hideLastCall(); lastCallSent = false;
    Scenery.setTrack(Terrain.ZONES, Terrain.FINISH_X, Terrain.WORLD, Terrain.WORLD_SEGMENT); Flora.setTrack(); Scenery.setQuality(0); Flora.setQuality(0); qSlow = 0;
    minimapBaseDirty = true; lastHudOrder = '';
    Scenery.warmup();
    placeGrid();
    const me = latestRacers[Net.myId]; smoothCamX = me ? me.x - viewW * 0.34 : 0; particles = []; cam.dy = 0; cam.vx = 0; cam.lead = 0.34; lastCamTs = 0;
    startRenderLoop();

    showSeasonTag(); resetPortals(); resetTrails(); let lastCd = -2; aud.fin = false; aud.y = null; aud.air = false; aud.wet = false; aud.ang = undefined; aud.world = 'classic';
    if (returning && Date.now() > startTime + 1500) {
      els.countdown.textContent = ''; raceT0 = performance.now(); hideSeasonTagNow();
      return;
    }
    const tick = setInterval(() => {
      const left = startTime - Date.now();
      const cd = left > 3000 ? -1 : left > 2000 ? 3 : left > 1000 ? 2 : left > 0 ? 1 : 0;
      if (cd !== lastCd) { lastCd = cd; if (cd >= 0 && typeof Sfx !== 'undefined') Sfx.beep(cd === 0 ? 0 : cd); }
      if (left > 3000) els.countdown.textContent = ''; else if (left > 2000) els.countdown.textContent = '3'; else if (left > 1000) els.countdown.textContent = '2'; else if (left > 0) els.countdown.textContent = '1';
      else { els.countdown.textContent = I18n.t('race.go'); clearInterval(tick); setTimeout(() => els.countdown.textContent = '', 700); Scenery.announce(performance.now()); raceT0 = performance.now(); hideSeasonTagNow(); showCtrlHint();
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
      if (now - lastSend >= 48) { lastSend = now; Net.broadcast({ type: 'snap', racers: snap, ts: now, ht: Sim.getObstacleTime(), io: Sim.getInteractiveState(), obs:Sim.obstacleSnapshot(), pu }); }
      Sim.drainMelts().forEach(m => { applyMelt(m.id, m.f, m.r); Net.broadcast({ type: 'melt', id: m.id, f: m.f, r: m.r }); });
      // primo traguardo: gli altri hanno un tempo limitato, e lo sanno
      const gl = Sim.graceLeft();
      if (gl !== null && !lastCallSent) { lastCallSent = true; Net.broadcast({ type: 'lastCall', ms: gl }); showLastCall(gl); }
      if (Sim.allFinished() || Sim.isTimedOut()) { Ticker.stop(snapshotLoopHandle); snapshotLoopHandle = null; const s = Sim.standings(), ch = champ ? champAward(s) : null; Net.broadcast({ type: 'results', standings: s, champ: ch }); showResults(s, ch); }
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
  let snapOff = null, lastRemoteSnapTs = -Infinity;
  let snapPrevArrival = 0, snapIntervalMean = 50, snapJitter = 0, interpClientMs = 130;
  function applySnapshot(racers, ts) {
    if (!Array.isArray(racers) || racers.length > MAX_PLAYERS || racers.length < 1) return;
    if (!Net.isHost) {
      if (!Number.isFinite(ts) || ts <= lastRemoteSnapTs) return; // pacchetto vecchio: non riavvolgere i veicoli
      if (racers.some(r => !r || !raceMeta[r.id] || !Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(r.angle) ||
        !Number.isFinite(r.fwX) || !Number.isFinite(r.fwY) || !Number.isFinite(r.rwX) || !Number.isFinite(r.rwY) ||
        !Number.isFinite(r.fwAngle) || !Number.isFinite(r.rwAngle) || Math.abs(r.x) > Terrain.TRACK_END + 800)) return;
      lastRemoteSnapTs = ts;
    }
    const m = {}; racers.forEach(r => { m[r.id] = r; latestRacers[r.id] = r; }); updateSprintUi(m[Net.myId]);
    const arr = performance.now(); let t = arr;
    if (!Net.isHost && typeof ts === 'number') {
      const off = arr - ts;
      snapOff = snapOff === null ? off : Math.min(off, snapOff + 0.4);
      t = ts + snapOff;
      const last = snapBuf.length ? snapBuf[snapBuf.length - 1].t : -1e9;
      if (t <= last) t = last + 1;                      // ordine garantito
    }
    if (!Net.isHost) {
      if (snapPrevArrival) {
        const gap = arr - snapPrevArrival;
        if (gap > 0 && gap < 600) {
          // A delayed packet should not abruptly shift the interpolation time line.
          snapIntervalMean += (gap - snapIntervalMean) * 0.08;
          snapJitter += (Math.abs(gap - snapIntervalMean) - snapJitter) * 0.1;
          const target = Math.max(100, Math.min(205, 105 + snapJitter * 1.8));
          interpClientMs += (target - interpClientMs) * (target > interpClientMs ? 0.18 : 0.025);
        }
      }
      snapPrevArrival = arr;
    }
    if (Perf.on && !Net.isHost) Perf.snap(arr);
    snapBuf.push({ t, m }); if (snapBuf.length > 16) snapBuf.shift();
  }
  const angLerp = (a, b, k) => { let d = b - a; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
  function interpolateRacers(now) {
    const n = snapBuf.length; if (!n) return;
    const rt = now - (Net.isHost ? INTERP_HOST_MS : interpClientMs);
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
            latestRacers[id] = { id, finished: rb.finished, finishTime: rb.finishTime, x: ex(ra.x, rb.x), y: ex(ra.y, rb.y), angle: ea(ra.angle, rb.angle), vx: rb.vx, dir: rb.dir, pe: rb.pe, ge: rb.ge, gt: rb.gt, gi: rb.gi, jn: rb.jn, ja: rb.ja, ln: rb.ln, ls: rb.ls, ld: rb.ld||0, lp: rb.lp||0, sp: rb.sp, so: rb.so, pt: rb.pt, pd: rb.pd, pi: rb.pi, im: rb.im, sc: rb.sc, cu: rb.cu||0,
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
        x: ra.x + (rb.x - ra.x) * k, y: ra.y + (rb.y - ra.y) * k, angle: angLerp(ra.angle, rb.angle, k), vx: ra.vx + (rb.vx - ra.vx) * k, dir: rb.dir, pe: rb.pe, ge: rb.ge, gt: rb.gt, gi: rb.gi, jn: rb.jn, ja: rb.ja, ln: rb.ln, ls: rb.ls, ld: rb.ld||0, lp: rb.lp||0, sp: rb.sp, so: rb.so, pt: rb.pt, pd: rb.pd, pi: rb.pi, im: rb.im, sc: rb.sc, cu: rb.cu||0,
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
  // Solo le posizioni giocatori e il loro progresso cambiano ogni frame.
  // La mappa dei biomi rimane in una texture offscreen finché non cambia la pista o la dimensione.
  let minimapBase = null, minimapBaseDirty = true, lastHudOrder = '';

  // Risoluzione adattiva: il costo del disegno cresce coi pixel (un telefono a DPR 3 riempie ~9 volte i pixel di uno a DPR 1).
  // Densità massima 2 (oltre non si distingue) e, se i fotogrammi si allungano, il canvas scende a gradini (min 0.55) — gli sprite restano a piena risoluzione.
  // Dopo ogni riduzione si verifica che serva davvero: se i fps non migliorano (es. risparmio energetico che limita a 30 fps) si torna indietro e si smette di provare.
  const DPR_CAP = 2, RS_MIN = 0.55;
  let rScale = 1, rAvg = 16.7, rLast = 0, rHold = 0, rLock = false, rCheckAt = 0, rFails = 0, rBefore = 0, rPrev = 1, rUpAt = 0;
  function adaptRes(ts) {
    if (Perf.on) { Perf.D.rs = rScale; Perf.D.rl = rLock; }
    if (rLock) return;
    const d = ts - rLast; rLast = ts;
    if (!rHold) { rHold = ts + 3500; return; }
    if (d <= 0 || d > 250) { rHold = Math.max(rHold, ts + 1500); return; }   // scheda in secondo piano o blocco: non conta
    rAvg += (d - rAvg) * Math.min(0.3, d / 700);   // costante di tempo ~0,7 s qualunque sia il frame rate
    if (ts < rHold) return;
    if (rCheckAt) {   // verifica dell'ultima riduzione
      if (ts < rCheckAt) return;
      rCheckAt = 0;
      if (rAvg > rBefore * 0.95) { rScale = rPrev; resizeCanvas(); if (++rFails >= 2) rLock = true; else rHold = ts + 10000; return; }   // non è servito: indietro, un solo altro tentativo
      rUpAt = ts + 20000;
    }
    if (rAvg > 26 && rScale > RS_MIN + 0.01) { rBefore = rAvg; rPrev = rScale; rScale = Math.max(RS_MIN, rScale * 0.72); rHold = ts + 1200; rCheckAt = ts + 4200; resizeCanvas(); }
    else if (rAvg < 17.5 && rScale < 1 && ts > rUpAt) { rScale = Math.min(1, rScale * 1.15); rHold = ts + 5000; resizeCanvas(); }
  }

  function resizeCanvas() {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    // Su Retina 3x il Canvas richiederebbe 9 volte i pixel di uno schermo 1x.
    // Limitiamo solo la risoluzione interna; CSS, fisica e area visibile non cambiano.
    const dprFull = Math.min(window.devicePixelRatio || 1, Math.min(cssW, cssH) < 650 ? 1.5 : 2), dpr = Math.max(0.6, dprFull * rScale);

    baseVS = viewScale = Math.min(1, Math.max(MIN_VIEW_SCALE, Math.min(cssW / REF_W, cssH / REF_H)));
    cssWv = cssW; cssHv = cssH; dprV = dpr; viewScale = baseVS * gzoom;
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
    Scenery.setView(dprFull, baseVS);

    resizeMinimap();
  }
  let resizePending = false;
  window.addEventListener('resize', () => {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(() => { resizePending = false; resizeCanvas(); });
  });

  // Stessa correzione DPR per la minimappa: legge la sua dimensione CSS reale (qualunque essa
  // sia) e adatta la risoluzione interna, invece di restare sfocata sugli schermi retina.
  function resizeMinimap() {
    if (!minimapCtx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = els.minimap.getBoundingClientRect();
    if (!rect.width || !rect.height) return; // non ancora visibile/layoutato
    els.minimap.width = Math.round(rect.width * dpr);
    els.minimap.height = Math.round(rect.height * dpr);
    minimapMetrics = { w: rect.width, h: rect.height };
    minimapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    minimapBaseDirty = true;
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
  const aud = { air: false, vy: 0, y: null, t: 0, fin: false, wet: false, world: 'classic' };
  function wheelR(meta) { if (!meta) return 20; if (meta.R) return meta.R; let m = 20; try { m = Math.max(...meta.vertices.map(v => Array.isArray(v) ? Math.hypot(v[0], v[1]) : Math.hypot(v.x, v.y))); } catch (e) {} return meta.R = Math.max(14, Math.min(60, m)); }
  function raceAudio(r, meta, now) {
    if (r.finished) { if (!aud.fin) { aud.fin = true; Sfx.silence(); let pl = 1; for (const id in latestRacers) { const o = latestRacers[id]; if (id !== r.id && o.finished && o.finishTime <= r.finishTime) pl++; } Sfx.finish(pl); } return; }
    const seg = Terrain.WORLD_SEGMENT;
    const activeWorld = seg && r.x >= seg.start && r.x < seg.end ? seg.world : 'classic';
    if (activeWorld !== aud.world) {
      aud.world = activeWorld;
      if (activeWorld !== 'classic') {
        if (typeof Sfx.biome === 'function') Sfx.biome(activeWorld);
        // V18: un'indicazione breve spiega la nuova meccanica senza tutorial invasivi.
        showNote('world.hint.' + activeWorld, 2900);
      }
    }
    const dt = aud.t ? Math.max(1, now - aud.t) : 16; aud.t = now;
    const R = wheelR(meta) * (r.sc || 1), gr = Sim.GROUND_Y - Terrain.height(r.rwX) - r.rwY, gf = Sim.GROUND_Y - Terrain.height(r.fwX) - r.fwY;
    const air = Math.min(gr, gf) - R > 12, vy = aud.y === null ? 0 : (r.y - aud.y) / (dt / 16.67);
    aud.y = r.y;
    if (aud.air && !air) {
      const impact = Math.max(0, aud.vy, vy);
      Sfx.land(impact);
      if ((r.sc || 1) > 1.4) giantLand(r, impact);
      // A small controlled impact puff; no particle storm or camera motion on tiny hops.
      if (impact > 3.5 && particles.length < 88) {
        const zone = Terrain.zoneKeyAt(r.rwX);
        const col = zone === 'ice' ? 'rgba(228,246,255,' : zone === 'lava' ? 'rgba(234,95,163,' :
          zone === 'water' ? 'rgba(104,204,238,' : zone === 'gravel' ? 'rgba(170,155,161,' : 'rgba(207,182,128,';
        const amount = Math.min(9, Math.floor(impact * 0.8));
        for (let i = 0; i < amount; i++) particles.push({
          x: r.rwX + (Math.random() - .5) * 46, y: r.rwY + 35,
          vx: (Math.random() - .5) * Math.min(5, impact * .5),
          vy: -1.0 - Math.random() * Math.min(3.6, impact * .4),
          life: 0.68, size: 2 + Math.random() * 3, col
        });
        shake = Math.max(shake, Math.min(1.65, (impact - 3.5) * .18));
      }
    }
    if (Sfx.giant) Sfx.giant((r.sc || 1) > 1.15 ? Math.min(1, ((r.sc || 1) - 1) / 1.2) : 0, Math.min(1, Math.abs(r.vx) / 8), air);
    aud.air = air; aud.vy = vy;
    const zk = Terrain.zoneKeyAt(r.rwX), wet = zk === 'water' && Terrain.isWater(r.rwX);
    if (wet && !aud.wet) Sfx.splash(Math.min(1, Math.abs(r.vx) / 8));
    aud.wet = wet;
    const hot = zk === 'lava' && Terrain.isLava(r.rwX) && r.rwY + 62 > Sim.GROUND_Y - Terrain.lavaLevel(r.rwX);
    if (hot && !aud.hot) Sfx.sizzle();
    aud.hot = hot;
    const gk = Terrain.gripAt(r.rwX), p = Terrain.patchAt(r.rwX);
    let surf = gk || (zk === 'gravel' ? 'gravel' : zk === 'water' ? 'water' : 'grass');
    if (hot) surf = 'lava'; else if (wet) surf = 'water'; else if (p && (p.kind === 'boulders' || p.kind === 'logs' || p.kind === 'stairs' || p.kind === 'holes' || p.kind === 'whoops')) surf = 'rough';
    // colpi dei vertici: giri al secondo della ruota posteriore × numero di vertici (solo forme con pochi spigoli; le tonde rotolano lisce)
    let ticks = 0; const nv = meta && meta.vertices ? meta.vertices.length : 0;
    if (aud.ang !== undefined && nv >= 3 && nv <= 14) { let d = r.rwAngle - aud.ang; if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; ticks = Math.abs(d) / (2 * Math.PI) / (dt / 1000) * nv; }
    aud.ang = r.rwAngle;
    Sfx.update(Math.abs(r.vx), surf, air && !wet, gk === 'rack' && p ? p.per : gk === 'rough' && p && p.S ? p.S : 0, ticks);
  }

  // ---- scia a pennello e tracciato finale ----------------------------------------------------------------
  // Ogni bici lascia una pennellata a setole secche (come il pennello dell'intro): densa vicino alla ruota, sempre più rada e
  // puntinata verso la coda. È solo disegno: parte dagli snapshot già ricevuti (nessun dato in più in rete).
  // TRAIL_CLASSIC = false per averla solo nella "gara meno classica".
  const TRAIL_CLASSIC = true, TRAIL_PTS = 84, TRAIL_STEP = 11, BRISTLES = 7;
  const trails = {};
  const hsh = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  function trailOn() { return TRAIL_CLASSIC || crazy; }
  function resetTrails() { for (const k in trails) delete trails[k]; }
  function trailSample(r) {
    if (!trailOn()) return;
    let T = trails[r.id]; if (!T) T = trails[r.id] = { p: [], last: null, full: [], lastFull: null, n: 0, pe: r.pe || 0 };
    const x = r.rwX, y = r.rwY, jump = (r.pe || 0) !== T.pe && r.pt === 's'; T.pe = r.pe || 0;
    const push = (px, py, br) => {
      T.p.push([px, py, br ? 1 : 0, T.n++]); if (T.p.length > TRAIL_PTS) T.p.shift();
      const lf = T.lastFull;
      if (!lf || br || Math.hypot(px - lf[0], py - lf[1]) >= 34) { T.full.push([Math.round(px), Math.round(py), br || !lf ? 1 : 0]); T.lastFull = [px, py]; }
    };
    if (!T.last || jump) push(x, y, true);
    else {
      const dx = x - T.last[0], dy = y - T.last[1], d = Math.hypot(dx, dy);
      if (d < TRAIL_STEP) return;
      const m = Math.min(40, Math.floor(d / TRAIL_STEP));   // con pochi fotogrammi al secondo si riempie il tratto: densità uniforme
      for (let i = 1; i <= m; i++) push(T.last[0] + dx * i / m, T.last[1] + dy * i / m, false);
    }
    T.last = [x, y];
  }
  const mixRgb = (rgb, k) => rgb.split(',').map(v => Math.round(+v * k)).join(',');
  // scia piatta (stile illustrazione): un nastro pieno nel colore del giocatore, più largo vicino alla bici e sottile in coda, spezzato ai salti,
  // con un filo crema al centro. Niente sfumature, schizzi o setole: si legge subito e non copre la pista.
  function drawTrail(ctx, camX, groundY, id, color) {
    const T = trails[id]; if (!T || T.p.length < 4) return;
    const P = T.p, n = P.length, rgb = hexRgb(color), off = groundY - Sim.GROUND_Y;
    const S = []; for (let i = 0; i < n; i++) { let sx = 0, sy = 0, c = 0; for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { if (P[j][2] && j > i) break; sx += P[j][0]; sy += P[j][1]; c++; } S.push([sx / c - camX, sy / c + off - 2]); }
    const W = i => { const age = (n - 1 - i) / (n - 1); return 22 * Math.min(1, (1 - age) * 3.2 + 0.08) * (1 - 0.6 * age); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const i0 = Math.max(0, n - 1 - Math.floor(n * 0.7)); let seg = [];
    const flush = () => {
      if (seg.length > 2) {
        ctx.beginPath(); for (let k = 0; k < seg.length; k++) { const i = seg[k]; ctx.lineTo(S[i][0], S[i][1] - W(i) / 2); }
        for (let k = seg.length - 1; k >= 0; k--) { const i = seg[k]; ctx.lineTo(S[i][0], S[i][1] + W(i) / 2); }
        ctx.closePath(); ctx.fillStyle = `rgba(${rgb},0.82)`; ctx.fill();
        ctx.beginPath(); for (let k = 0; k < seg.length; k++) { const i = seg[k]; if (k) ctx.lineTo(S[i][0], S[i][1]); else ctx.moveTo(S[i][0], S[i][1]); }
        ctx.strokeStyle = 'rgba(248,244,220,0.55)'; ctx.lineWidth = 2.4; ctx.stroke();
      }
      seg = [];
    };
    for (let i = i0; i < n; i++) { if (P[i][2] && seg.length) flush(); seg.push(i); }
    flush();
    ctx.restore();
  }
  // ---- tracciato finale: una piccola illustrazione ad acquerello della pista ----------------------------------------------------------------
  // Cielo con sole e nuvole, colline lontane, terreno colorato per bioma con i suoi "abitanti" (prato fiorito con i fiori veri della pista, pini innevati, cactus,
  // alberi d'autunno, rocce di basalto), laghi lucenti, ponti con le assi, bandierina con i festoni. Sopra, la corsa di ognuno a pennellate: a fine gara si dipingono
  // da sinistra a destra, poi i numeri d'arrivo compaiono e dal traguardo esplodono i coriandoli. Le linee sono quelle vere della gara, solo ammorbidite (media su
  // ~100 px di pista); con più giocatori ognuno ha la sua corsia, l'ultimo è sotto e il primo sopra. Tutto lo sfondo si disegna una volta sola in una tela nascosta.
  let ftRaf = 0;
  const FT_PAL = { start: '#78ba8e', hills: '#438c67', ice: '#bfe3ea', gravel: '#ecbd6f', water: '#9fd3c2', ramps: '#e3937a', lava: '#6b3a2a', finish: '#78ba8e' };
  const FT_BAND = { start: '#78ba8e', hills: '#438c67', ice: '#bfe3ea', gravel: '#ecbd6f', water: '#5bb5b0', ramps: '#e3937a', lava: '#fb5f35', finish: '#78ba8e' };
  // V27.2: colors sampled from the actual scenery/world FX palettes.  A special
  // segment REPLACES the normal biome color in the final map; never purple heaven.
  const FT_SPECIAL = {
    paradise: { band: '#ecd189', wash: '#fff7df' },   // heaven: ivory + sacred gold
    inferno: { band: '#e85d56', wash: '#f5a498' },    // inferno: ember + hot coral
    atlantis: { band: '#2d9eae', wash: '#cdfff0' },   // Atlantis: deep turquoise
    enchanted: { band: '#8dbb83', wash: '#ecffd0' },  // forest: luminous foliage
    neon: { band: '#46f5ee', wash: '#8ffcff' },       // neon: electric cyan
    egypt: { band: '#bf784d', wash: '#efd09a' }       // Egypt: warm terracotta/sand, not lapis-blue
  };
  const FT_FLOWERS = ['#fb5f35', '#f5e594', '#e3937a', '#ecbd6f', '#f8f4dc'];
  // Tooltip della pista finale: zona sotto il puntatore (mouse o dito), pastiglia evidenziata e nome con il colore della zona
  let ftHoverState = null, ftHoverBound = false, ftHideT = 0;
  function ftHover(cv, st) {
    ftHoverState = st;
    const tip = document.getElementById('ft-tip'), hl = document.getElementById('ft-hl'); if (!tip || !hl) return;
    const hide = () => { tip.hidden = true; hl.hidden = true; clearTimeout(ftHideT); };
    hide();
    if (ftHoverBound) return; ftHoverBound = true;
    const show = ev => {
      const S = ftHoverState; if (!S) return;
      const r = cv.getBoundingClientRect(), k = r.width / S.W, px = (ev.clientX - r.left) / k;
      const z = S.zones.find(q => px >= q.a && px < q.b); if (!z) { hide(); return; }
      const sp = S.special && px >= S.special.a && px < S.special.b ? S.special : null;
      // For special worlds only show the world name, not its underlying
      // generated terrain ("Paradiso · Colline", "Atlantide · Laguna", etc.).
      const nm = sp ? I18n.t('world.tag.' + sp.key) : I18n.t('sign.' + z.key);
      tip.innerHTML = ''; const dot = document.createElement('i'); dot.style.background = sp ? sp.col : z.col; const tx = document.createElement('span'); tx.textContent = nm; tip.append(dot, tx);
      tip.hidden = false; hl.hidden = false;
      const ox = cv.offsetLeft, oy = cv.offsetTop, sc = cv.offsetWidth / S.W;
      const a = sp ? sp.a : z.a, b = sp ? sp.b : z.b;
      hl.style.left = (ox + (a + 0.8) * sc) + 'px'; hl.style.top = (oy + S.bY * sc) + 'px'; hl.style.width = (Math.max(1,b - a - 1.6) * sc) + 'px'; hl.style.height = (S.bH * sc) + 'px'; hl.style.borderRadius = (S.bH * sc / 2) + 'px';
      const tw = tip.offsetWidth, cx = Math.max(tw / 2 + 4, Math.min(cv.offsetWidth - tw / 2 - 4, ox + ((a + b) / 2) * sc));
      tip.style.left = cx + 'px'; tip.style.top = (oy + S.bY * sc - 8) + 'px';
      clearTimeout(ftHideT); if (ev.pointerType && ev.pointerType !== 'mouse') ftHideT = setTimeout(hide, 2800);   // col dito non c'è "uscita": sparisce da solo
    };
    cv.addEventListener('pointermove', show); cv.addEventListener('pointerdown', show);
    cv.addEventListener('pointerleave', ev => { if (!ev.pointerType || ev.pointerType === 'mouse') hide(); });
  }
  function drawFinalTrace(standings, animate) {
    const cv = els.resultsTrace; if (!cv) return;
    if (ftRaf) { cancelAnimationFrame(ftRaf); ftRaf = 0; }
    const ids = Object.keys(trails).filter(id => trails[id].full.length > 1);
    if (!trailOn() || !ids.length) { cv.style.display = 'none'; return; }
    cv.style.display = 'block';
    const K = 2, CW = 660, CH = 330; if (cv.width !== CW * K) { cv.width = CW * K; cv.height = CH * K; }
    const g = cv.getContext('2d'), W = CW, H = CH, x0 = Terrain.TRACK_START + 200, x1 = Terrain.FINISH_X + 120, sx = (W - 56) / (x1 - x0);
    const gB = H - 34;                                   // fondo del terreno; sotto, la fascia con i nomi dei biomi
    const X = x => 28 + (x - x0) * sx, sm = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }, TX = cx => x0 + (cx - 28) / sx;
    const INK = '#2d3e48', TAU = Math.PI * 2, A = (hex, a) => `rgba(${hexRgb(hex)},${a})`;
    // la scheda dei risultati arriva al massimo a 640 px (500 sui telefoni in orizzontale): dalla larghezza prevista si sceglie il corpo dei testi, così restano leggibili
    const short = (window.innerHeight || 800) <= 480, dispW = Math.min(short ? 500 : 640, (window.innerWidth || 640) - 24) - (short ? 36 : 64), fz = Math.max(10.5, Math.min(17, 9.5 / Math.max(0.3, Math.min(1, dispW / CW))));
    // profilo: la riva (levigata su ~60 px di pista, così dossi e fango non sporcano il disegno) meno la profondità esatta di laghi e canyon; passo di 14 px
    const STEP = 14, raw = []; for (let x = x0 - 160; x <= x1 + 160; x += STEP) { const b = Terrain.baseHeight(x); raw.push([x, b, Math.max(0, b - Terrain.naturalHeight(x))]); }
    const P = raw.map((q, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 9); j <= Math.min(raw.length - 1, i + 9); j++) { const w = Math.exp(-Math.pow((j - i) / 3.5, 2)); s += raw[j][1] * w; c += w; } const B = s / c; return [q[0], B - q[2], B]; }).filter(q => q[0] >= x0 && q[0] <= x1);
    const pAt = x => P[Math.max(0, Math.min(P.length - 1, Math.round((x - P[0][0]) / STEP)))], hAt = x => pAt(x)[1];
    // tratti giganti (dal portale gigante al portale grande), solo se la pista li ha
    const GR = []; (Terrain.PORTALS || []).forEach(p => { if (p.kind !== 'grow') return; const b = Terrain.PORTALS.find(e => e.kind === 'big' && e.grow === p.id); if (b) GR.push([p.x, b.x]); });
    const gk = x => { let k = 0; for (const [ga, gb] of GR) k = Math.max(k, sm((x - (ga - 45)) / 90) * (1 - sm((x - (gb - 110)) / 220))); return k; };
    // quote delle corse (levigate sui punti vicini dello stesso tratto: non attraversano i salti dei portali), prima della scala così i salti non escono dal foglio
    const rank = id => { const i = (standings || []).findIndex(s => s.id === id); return i < 0 ? 99 : i; };
    const order = ids.slice().sort((a, b) => rank(a) - rank(b));
    const runs = {}; let altMax = -1e9;
    ids.forEach(id => {
      const F = trails[id].full;
      // scarto tipico fra il centro ruota e la riva sotto di lei (≈ raggio della ruota): lo togliamo così la corsa poggia sulla collina, salti compresi
      const offs = F.map(q => (Sim.GROUND_Y - q[1]) - Terrain.baseHeight(q[0])).sort((u, v) => u - v), med = offs[offs.length >> 1] || 0, alt = q => (Sim.GROUND_Y - q[1]) - med;
      const H2 = F.map((q, i) => { let s = 0, c = 0; for (let d = -9; d <= 9; d++) { const j = i + d; if (j < 0 || j >= F.length) continue; let ok = true; if (d > 0) { for (let m = i + 1; m <= j; m++) if (F[m][2]) { ok = false; break; } } else if (d < 0) { for (let m = j + 1; m <= i; m++) if (F[m][2]) { ok = false; break; } } if (!ok) continue; const w = Math.exp(-d * d / 24); s += alt(F[j]) * w; c += w; } return s / c; });
      H2.forEach(v => { if (v > altMax) altMax = v; }); runs[id] = { F, H2 };
    });
    const lift = 13, laneGap = ids.length > 1 ? Math.min(6.5, 22 / (ids.length - 1)) : 0, bw0 = ids.length > 3 ? 5.5 : ids.length > 1 ? 6.5 : 8;
    let lo = 1e9, hi = -1e9; P.forEach(q => { lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]); }); hi = Math.max(hi, altMax);
    const topPad = 34 + lift + laneGap * (ids.length - 1) + bw0 * (GR.length ? 1.9 : 1) / 2, sy = (gB - 12 - topPad) / Math.max(150, hi - lo), baseY = gB - 12 + lo * sy, Yh = h => baseY - h * sy;
    const zs = Terrain.ZONES.filter(z => z.end > x0 && z.start < x1), ZC = z => FT_PAL[z.key] || '#94a3b8';
    const sw = Terrain.WORLD_SEGMENT;
    const scfg = sw && FT_SPECIAL[sw.world];
    const spTrace = scfg && sw.end > x0 && sw.start < x1 ? { key:sw.world, a:X(Math.max(x0,sw.start)), b:X(Math.min(x1,sw.end)), col:scfg.band, wash:scfg.wash } : null;
    for (const id of ids) { const R = runs[id], lane = order.indexOf(id), dy = -lift - lane * laneGap; R.Y = R.H2.map(h => Yh(h) + dy); R.kk = R.F.map(q => GR.length ? gk(q[0]) : 0); }
    const winner = order[0];

    // ======= sfondo piatto, stile illustrazione (si disegna una volta sola in una tela nascosta) =======
    const cache = document.createElement('canvas'); cache.width = CW * K; cache.height = CH * K; const s = cache.getContext('2d'); s.setTransform(K, 0, 0, K, 0, 0);
    s.lineCap = 'round'; s.lineJoin = 'round';
    const CRM = '#f8f4dc', TEAL = '#027a71', TEALD = '#015a53', MINT = '#78ba8e', GRN = '#438c67', BRN = '#6a3a22';
    const edge = (c, dy, wob) => { c.beginPath(); P.forEach(([x, h], i) => { const yy = Yh(h) + dy + (wob ? (hsh(i, 9.1) - 0.5) * wob : 0); if (i) c.lineTo(X(x), yy); else c.moveTo(X(x), yy); }); };
    const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
    const star = (c, x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill(); };
    // cielo crema, sole pieno, nuvole piatte, tre gabbiani
    const skyG = s.createLinearGradient(0, 0, 0, H); skyG.addColorStop(0, '#f0836b'); skyG.addColorStop(0.6, '#f8c4a0'); skyG.addColorStop(1, '#fbe3bd');
    s.fillStyle = skyG; s.fillRect(0, 0, W, H);
    s.fillStyle = 'rgba(251,230,190,0.9)'; s.beginPath(); s.arc(W - 70, 58, 46, 0, TAU); s.fill();
    for (let i = 0; i < 4; i++) { const cx = 60 + i * (W - 150) / 3 + (hsh(i, 3.3) - 0.5) * 60, cy = 26 + hsh(i, 5.5) * 36, k = 0.8 + hsh(i, 7.1) * 0.5;
      s.fillStyle = CRM; [[-18, 2, 9], [-7, -6, 11], [7, -4, 10], [19, 2, 8], [0, 3, 10]].forEach(([dx, dyy, r]) => { s.beginPath(); s.arc(cx + dx * k, cy + dyy * k, r * k, 0, TAU); s.fill(); }); }
    s.strokeStyle = '#2d3e48'; s.lineWidth = 1.8; [[W * 0.3, 40], [W * 0.3 + 16, 48], [W * 0.3 - 14, 50]].forEach(([bx, by]) => { s.beginPath(); s.moveTo(bx - 6, by - 2); s.quadraticCurveTo(bx - 3, by - 5, bx, by); s.quadraticCurveTo(bx + 3, by - 5, bx + 6, by - 2); s.stroke(); });
    // fasce di colline lontane (giallo, ocra, salmone) come nell'illustrazione
    [[0.52, 22, 1.3, '#f8eeb0'], [0.34, 18, 3.1, '#f3d79a'], [0.18, 14, 5.2, '#eeb9a6']].forEach(([lv, am, ph, col]) => {
      const yb = Yh(lo + (hi - lo) * lv); s.fillStyle = col; s.beginPath(); s.moveTo(0, gB);
      for (let x = 0; x <= W; x += 6) s.lineTo(x, yb - am * (0.5 + 0.5 * Math.sin(x / 80 + ph)));
      s.lineTo(W, gB); s.closePath(); s.fill(); });
    // terreno: un colore pieno per bioma e una fascia più scura più sotto
    zs.forEach(z => {
      const xa = Math.max(x0, z.start), xb = Math.min(x1, z.end), pts = P.filter(q => q[0] >= xa - STEP && q[0] <= xb + STEP); if (pts.length < 2) return;
      let top = 1e9; pts.forEach(q => { top = Math.min(top, Yh(q[1])); });
      s.save(); s.beginPath(); s.rect(X(xa), 0, X(xb) - X(xa) + 0.6, H); s.clip();
      s.beginPath(); s.moveTo(X(pts[0][0]), gB); pts.forEach(([x, h]) => s.lineTo(X(x), Yh(h))); s.lineTo(X(pts[pts.length - 1][0]), gB); s.closePath(); s.fillStyle = ZC(z); s.fill();
      s.clip(); s.fillStyle = 'rgba(45,62,72,0.10)'; s.fillRect(X(xa), top + (gB - top) * 0.55, X(xb) - X(xa) + 1, gB);
      s.restore();
    });
    // laghi: acqua e lava piene, con un filo chiaro sul pelo
    const lakes = [];
    zs.forEach(z => {
      if ((z.key !== 'water' && z.key !== 'lava') || !z.gap) return;
      const off = z.key === 'lava' ? 26 : 28, pts = P.filter(q => q[0] >= z.start && q[0] <= z.end), lvAt = new Map(pts.map(q => [q[0], q[2] - off])), lv = x => lvAt.get(x);
      let run = []; const flush = () => {
        if (run.length > 1) {
          const yT = Yh(lv(run[Math.floor(run.length / 2)][0])), yB = Math.max(...run.map(q => Yh(q[1])));
          s.beginPath(); run.forEach(([x], i) => { const yy = Yh(lv(x)); if (i) s.lineTo(X(x), yy); else s.moveTo(X(x), yy); }); for (let i = run.length - 1; i >= 0; i--) s.lineTo(X(run[i][0]), Yh(run[i][1])); s.closePath();
          s.fillStyle = z.key === 'lava' ? '#fb5f35' : '#5bb5b0'; s.fill();
          s.save(); s.clip(); s.fillStyle = z.key === 'lava' ? '#c7411f' : '#027a71'; s.fillRect(X(run[0][0]) - 2, yT + (yB - yT) * 0.6, X(run[run.length - 1][0]) - X(run[0][0]) + 4, yB); s.restore();
          s.strokeStyle = z.key === 'lava' ? '#f5e594' : CRM; s.lineWidth = 2.2; s.beginPath(); run.forEach(([x], i) => { const yy = Yh(lv(x)); if (i) s.lineTo(X(x), yy); else s.moveTo(X(x), yy); }); s.stroke();
          lakes.push({ kind: z.key, xa: X(run[0][0]), xb: X(run[run.length - 1][0]), yT, yB });
        }
        run = [];
      };
      pts.forEach(q => { if (q[1] < lv(q[0])) run.push(q); else flush(); }); flush();
    });
    // filo chiaro sul bordo del terreno (come il labbro dei prati dell'illustrazione)
    s.strokeStyle = 'rgba(248,244,220,0.7)'; s.lineWidth = 2.2; edge(s, 0, 0); s.stroke();
    // gli "abitanti" di ogni bioma: forme piatte, rade
    const tree = (cx, y, h, col, round) => { s.strokeStyle = BRN; s.lineWidth = 1.5; s.beginPath(); s.moveTo(cx, y + 0.5); s.lineTo(cx, y - h * 0.5); s.stroke(); s.fillStyle = col; s.beginPath(); if (round) s.arc(cx, y - h * 0.72, h * 0.34, 0, TAU); else s.ellipse(cx, y - h * 0.68, h * 0.2, h * 0.36, 0, 0, TAU); s.fill(); };
    zs.forEach(z => {
      const xa = Math.max(x0, z.start), xb = Math.min(x1, z.end);
      for (let cx = X(xa) + 6, i = 0; cx < X(xb) - 6; i++, cx += 12 + hsh(i, z.index + 1.3) * 18) {
        const tx = TX(cx); if (z.gap && tx > z.gap.g0 - 25 && tx < z.gap.g1 + 25) continue;
        const y = Yh(hAt(tx)), r1 = hsh(i, z.index * 2.1 + 0.7), r2 = hsh(i, z.index * 3.7 + 1.9);
        if (z.key === 'hills' || z.key === 'start' || z.key === 'finish') {
          if (r1 < 0.34) tree(cx, y, 14 + r2 * 7, r2 > 0.5 ? TEAL : '#a3d4ad', r2 <= 0.5);
        } else if (z.key === 'ice') {
          if (r1 < 0.5) { const h = 10 + r2 * 7; s.fillStyle = TEAL; s.beginPath(); s.moveTo(cx - 3.6, y + 0.5); s.lineTo(cx, y - h); s.lineTo(cx + 3.6, y + 0.5); s.closePath(); s.fill(); s.fillStyle = CRM; s.beginPath(); s.moveTo(cx - 1.6, y - h * 0.62); s.lineTo(cx, y - h); s.lineTo(cx + 1.6, y - h * 0.62); s.closePath(); s.fill(); }
        } else if (z.key === 'gravel') {
          if (r1 < 0.28) { s.strokeStyle = GRN; s.lineWidth = 2.6; s.beginPath(); s.moveTo(cx, y + 0.5); s.lineTo(cx, y - 10); s.stroke(); s.lineWidth = 1.8; s.beginPath(); s.moveTo(cx, y - 3.4); s.lineTo(cx - 3.2, y - 3.4); s.lineTo(cx - 3.2, y - 7); s.moveTo(cx, y - 5.2); s.lineTo(cx + 3.2, y - 5.2); s.lineTo(cx + 3.2, y - 8); s.stroke(); }
          else if (r1 > 0.82) { s.fillStyle = '#c9633f'; s.beginPath(); s.ellipse(cx, y - 0.6, 2.4 + r2 * 1.6, 1.6, 0, Math.PI, TAU); s.fill(); }
        } else if (z.key === 'water') {
          if (r1 < 0.3) { s.strokeStyle = TEAL; s.lineWidth = 1.4; s.beginPath(); s.moveTo(cx, y + 0.5); s.lineTo(cx + (r2 - 0.5) * 2, y - 8 - r2 * 5); s.stroke(); s.fillStyle = '#c9633f'; s.beginPath(); s.ellipse(cx + (r2 - 0.5) * 2, y - 9 - r2 * 5, 1.2, 2.5, 0, 0, TAU); s.fill(); }
        } else if (z.key === 'ramps') {
          if (r1 < 0.34) tree(cx, y, 13 + r2 * 7, ['#fb5f35', '#ecbd6f', '#f5e594'][Math.floor(hsh(i, 6.6 + z.index) * 3)], true);
        } else if (z.key === 'lava') {
          if (r1 < 0.4) { const hh = 7 + r2 * 9, ww = 3.6 + r2 * 3; s.fillStyle = '#2d3e48'; s.beginPath(); s.moveTo(cx - ww, y + 0.5); s.lineTo(cx - ww * 0.15, y - hh); s.lineTo(cx + ww, y + 0.5); s.closePath(); s.fill(); }
        }
      }
    });
    // i fiori veri della pista, radi
    { let lastFx = -99; (Terrain.FLOWERS || []).forEach(f => { if (f.x < x0 || f.x > x1) return; const cx = X(f.x); if (cx - lastFx < 9) return; lastFx = cx; const y = Yh(hAt(f.x)), col = FT_FLOWERS[f.hue % 5], h = 3 + Math.min(5, f.stemScale * 2.4);
      s.strokeStyle = GRN; s.lineWidth = 1.1; s.beginPath(); s.moveTo(cx, y + 0.5); s.lineTo(cx, y - h); s.stroke();
      s.fillStyle = col; s.beginPath(); s.arc(cx, y - h, 2, 0, TAU); s.fill(); s.fillStyle = '#f5e594'; s.beginPath(); s.arc(cx, y - h, 0.8, 0, TAU); s.fill(); }); }
    // ninfee sul pelo dell'acqua
    (Terrain.LILIES || []).forEach(l => { if (l.x < x0 || l.x > x1) return; const q = pAt(l.x), y = Yh(q[2] - 28), cx = X(l.x); if (q[1] >= q[2] - 28) return; s.fillStyle = MINT; s.beginPath(); s.ellipse(cx, y + 0.6, 3.4 * l.size, 1.4 * l.size, 0, 0, TAU); s.fill(); if (l.bloom) { s.fillStyle = '#e3937a'; s.beginPath(); s.arc(cx, y - 0.6, 1.3, 0, TAU); s.fill(); } });
    // ponti: impalcato marrone piatto con un filo crema sopra e i due pali
    (Terrain.BRIDGES || []).forEach(b => {
      if (b.end < x0 || b.start > x1) return; const arch = Math.min(1, 6 / (Math.max(1, Math.abs(b.peak)) * sy)), pts = [];
      for (let x = Math.max(x0, b.start); x <= Math.min(x1, b.end); x += 8) { const q = pAt(x); pts.push([x, q[2] + (Terrain.height(x) - Terrain.baseHeight(x)) * arch]); }
      if (pts.length < 2) return; const dk = () => { s.beginPath(); pts.forEach(([x, h], i) => { if (i) s.lineTo(X(x), Yh(h)); else s.moveTo(X(x), Yh(h)); }); };
      s.strokeStyle = CRM; s.lineWidth = 6; dk(); s.stroke(); s.strokeStyle = BRN; s.lineWidth = 3.4; dk(); s.stroke();
      s.strokeStyle = BRN; s.lineWidth = 2; [pts[0], pts[pts.length - 1]].forEach(([x, h]) => { s.beginPath(); s.moveTo(X(x), Yh(h) - 2); s.lineTo(X(x), Yh(h) + 8); s.stroke(); });
    });
    // tratto gigante: fascia gialla piena e trasparente con un'etichetta crema
    GR.forEach(([ga, gb]) => {
      const xa = Math.max(x0, ga), xb = Math.min(x1, gb); if (xb <= xa) return;
      s.fillStyle = 'rgba(245,229,148,0.5)'; s.fillRect(X(xa), 18, X(xb) - X(xa), gB - 18);
      s.font = `700 ${fz.toFixed(1)}px Kalam, cursive`; const nm = I18n.t('crazy.grow'), tw = s.measureText(nm).width + 16, cx = (X(xa) + X(xb)) / 2;
      rr(s, cx - tw / 2, 3, tw, fz + 8, (fz + 8) / 2); s.fillStyle = CRM; s.fill();
      s.fillStyle = TEALD; s.textAlign = 'center'; s.textBaseline = 'middle'; s.fillText(nm, cx, 3 + (fz + 8) / 2 + 0.5);
    });
    // traguardo: palo, bandiera a scacchi, festoni
    const fx = X(Terrain.FINISH_X), fy = Yh(hAt(Terrain.FINISH_X)), fh = 36;
    { s.strokeStyle = INK; s.lineWidth = 2.2; s.beginPath(); s.moveTo(fx, fy + 1); s.lineTo(fx, fy - fh); s.stroke();
      const fw = 22, fhh = 14, cols = 4, rows = 3; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const wv = Math.sin(c * 0.9) * 1.3; s.fillStyle = (r + c) % 2 ? INK : CRM; s.fillRect(fx + 1 + c * fw / cols, fy - fh + 1 + r * fhh / rows + wv, fw / cols + 0.4, fhh / rows + 0.4); }
      const bun = ['#fb5f35', '#f5e594', '#5bb5b0', '#78ba8e', '#e3937a', '#ecbd6f'], bx0 = fx, by0 = fy - fh + 1, bx1 = fx - 62, by1 = fy - 8;
      s.strokeStyle = 'rgba(45,62,72,0.55)'; s.lineWidth = 1; s.beginPath(); s.moveTo(bx0, by0); s.quadraticCurveTo((bx0 + bx1) / 2, Math.max(by0, by1) + 6, bx1, by1); s.stroke();
      for (let k = 1; k <= 6; k++) { const t = k / 7, px = (1 - t) * (1 - t) * bx0 + 2 * (1 - t) * t * ((bx0 + bx1) / 2) + t * t * bx1, py = (1 - t) * (1 - t) * by0 + 2 * (1 - t) * t * (Math.max(by0, by1) + 6) + t * t * by1; s.fillStyle = bun[k - 1]; s.beginPath(); s.moveTo(px - 3.4, py); s.lineTo(px + 3.4, py); s.lineTo(px, py + 7); s.closePath(); s.fill(); } }
    // A subtle scene-tinted wash keeps the watercolor terrain and rider traces.
    // There is no label or artificial purple rectangle across the special world.
    if (spTrace && spTrace.b - spTrace.a > 3) {
      s.save();
      s.globalAlpha = 0.16; s.fillStyle = spTrace.wash;
      s.fillRect(spTrace.a, 15, spTrace.b - spTrace.a, gB - 15);
      s.restore();
    }
    // fascia dei biomi: pastiglie piene senza scritte (nome al tocco/hover)
    const bY = gB + 7, bH = H - 5 - bY;
    s.font = `700 ${fz.toFixed(1)}px Kalam, cursive`; s.textAlign = 'center'; s.textBaseline = 'middle';
    zs.forEach(z => {
      const xa = X(Math.max(x0, z.start)), xb = X(Math.min(x1, z.end)); if (xb - xa < 4) return;
      rr(s, xa + 0.8, bY, xb - xa - 1.6, bH, bH / 2); s.fillStyle = FT_BAND[z.key] || '#94a3b8'; s.fill();
    });
    // Each special world is one solid, elegantly colored pill, exactly like all
    // the other biome pills. No "PARADISO"/"ATLANTIDE" painted inside the band.
    if (spTrace && spTrace.b - spTrace.a > 3) {
      const bw = spTrace.b - spTrace.a;
      rr(s, spTrace.a + 0.8, bY, bw - 1.6, bH, bH / 2);
      s.fillStyle = spTrace.col; s.fill();
    }
    // The tooltip displays ONLY the special-world name, never the underlying zone.
    ftHover(cv, { W, bY, bH, special: spTrace, zones: zs.map(z => ({ key: z.key, a: X(Math.max(x0, z.start)), b: X(Math.min(x1, z.end)), col: FT_BAND[z.key] || '#94a3b8' })) });

    // ======= le corse (si ridisegnano a ogni fotogramma, tagliate al punto in cui è arrivato il pennello) =======
    const sparks = [], conf = []; let confMade = false, lastT = 0;
    const headAt = (R, xp) => { const F = R.F; if (xp < F[0][0]) return null; let i = 0; while (i < F.length - 1 && F[i + 1][0] <= xp) i++; if (i >= F.length - 1 || F[i + 1][2]) return [X(F[i][0]), R.Y[i], i, i >= F.length - 1]; const t = (xp - F[i][0]) / Math.max(1, F[i + 1][0] - F[i][0]); return [X(xp), R.Y[i] + (R.Y[i + 1] - R.Y[i]) * t, i, false]; };
    const drawRun = id => {
      const meta = raceMeta[id]; if (!meta) return; const { F, Y, kk } = runs[id], rgb = hexRgb(meta.color), ink = mixRgb(rgb, 0.4), bw = bw0;
      g.lineJoin = 'round';
      // un tratto di pennellata: largo bw (più largo nel tratto gigante). Tutto il percorso in un colpo solo se non ci sono giganti; altrimenti segmento per segmento
      const stroke = (col, w, off, cap) => {
        g.strokeStyle = col; g.lineCap = cap || 'round';
        if (!GR.length) { g.lineWidth = w; g.beginPath(); let pen = false; for (let i = 0; i < F.length; i++) { const xx = X(F[i][0]), yy = Y[i] + off; if (F[i][2]) pen = false; if (!pen) { g.moveTo(xx, yy); pen = true; } else g.lineTo(xx, yy); } g.stroke(); return; }
        for (let i = 1; i < F.length; i++) { if (F[i][2]) continue; const f = 1 + 0.85 * (kk[i - 1] + kk[i]) / 2; g.lineWidth = w * f; g.beginPath(); g.moveTo(X(F[i - 1][0]), Y[i - 1] + off * f); g.lineTo(X(F[i][0]), Y[i] + off * f); g.stroke(); }
      };
      stroke('#f8f4dc', bw + 3.6, 0);                             // bordino crema: separa dalle altre corsie
      stroke(`rgba(${rgb},1)`, bw, 0);                            // nastro pieno nel colore del giocatore
      g.lineCap = 'round';
      // salti: arco tratteggiato fra la fine di un tratto e l'inizio del successivo
      g.setLineDash([2, 4.5]); g.strokeStyle = `rgba(${rgb},0.95)`; g.lineWidth = 2;
      for (let i = 1; i < F.length; i++) if (F[i][2]) { const ax = X(F[i - 1][0]), ay = Y[i - 1], bx = X(F[i][0]), by = Y[i]; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 16, bx, by); g.stroke(); }
      g.setLineDash([]);
      // macchia scura di partenza e schizzi radi
      { const x = X(F[0][0]), y = Y[0]; g.fillStyle = '#f8f4dc'; g.beginPath(); g.arc(x, y, bw * 0.95 + 1.8, 0, TAU); g.fill(); g.fillStyle = `rgb(${rgb})`; g.beginPath(); g.arc(x, y, bw * 0.95, 0, TAU); g.fill(); }
    };
    const portalMarks = xp => { (Terrain.PORTALS || []).forEach(p => { if (p.kind === 'grow' || p.kind === 'big' || p.x < x0 || p.x > xp) return; const gx = X(p.x), gy = Yh(hAt(p.x)) - 12; g.strokeStyle = p.kind === 'shift' ? '#027a71' : INK; g.lineWidth = p.kind === 'mirror' ? 3 : 2.2; g.setLineDash(p.kind === 'exit' ? [3, 3] : []); g.beginPath(); g.ellipse(gx, gy, 4.4, 12, 0, 0, TAU); g.save(); g.strokeStyle = '#f8f4dc'; g.lineWidth += 3; g.setLineDash([]); g.stroke(); g.restore(); g.stroke(); }); g.setLineDash([]); };
    const frame = (p, tAfter, dt) => {
      g.setTransform(K, 0, 0, K, 0, 0); g.drawImage(cache, 0, 0, W, H);
      const xp = x0 + sm(p) * (x1 - x0);
      g.save(); g.beginPath(); g.rect(0, 0, p >= 1 ? W : X(xp) + 1, H); g.clip();
      order.slice().reverse().forEach(drawRun); g.restore();
      portalMarks(p >= 1 ? x1 + 1 : xp);
      // la testa del pennello mentre dipinge, con scintille
      if (p < 1) order.slice().reverse().forEach(id => { const h = headAt(runs[id], xp); if (!h || h[3]) return; const meta = raceMeta[id]; if (!meta) return;
        g.fillStyle = '#f8f4dc'; g.beginPath(); g.arc(h[0], h[1], bw0 * 0.9 + 3, 0, TAU); g.fill(); g.fillStyle = meta.color; g.beginPath(); g.arc(h[0], h[1], bw0 * 0.75 + 1, 0, TAU); g.fill();
        if (Math.random() < 0.5) sparks.push({ x: h[0], y: h[1], vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 24, life: 0, max: 0.45 + Math.random() * 0.3, r: 1.6 + Math.random() * 2, col: id === winner ? '#f5e594' : '#f8f4dc' }); });
      sparks.forEach(q => { q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 40 * dt; }); for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life > sparks[i].max) sparks.splice(i, 1);
      sparks.forEach(q => { const a = 1 - q.life / q.max; g.globalAlpha = Math.max(0, a); star(g, q.x, q.y, q.r * (0.6 + 0.6 * a), q.col); }); g.globalAlpha = 1;
      // arrivo: pallini, numeri e medaglia d'oro per chi vince
      if (p >= 1) order.slice().reverse().forEach(id => { const meta = raceMeta[id]; if (!meta) return; const { F, Y } = runs[id], e = F.length - 1, k = sm(tAfter / 0.45), ex = X(F[e][0]), ey = Y[e];
        if (id === winner && ids.length > 1 || (id === winner && tAfter < 9)) { g.strokeStyle = `rgba(251,95,53,${(0.95 * k).toFixed(2)})`; g.lineWidth = 2.6; g.beginPath(); g.arc(ex, ey, 5 + 5.5 * k, 0, TAU); g.stroke(); star(g, ex + 9 * k, ey - 9 * k, 3.4 * k, '#f5e594'); star(g, ex - 8 * k, ey - 10 * k, 2.4 * k, '#ecbd6f'); }
        g.fillStyle = '#f8f4dc'; g.beginPath(); g.arc(ex, ey, 7.4 + 0.8 * k, 0, TAU); g.fill(); g.fillStyle = meta.color; g.beginPath(); g.arc(ex, ey, 5.6 + 0.8 * k, 0, TAU); g.fill();
        if (ids.length > 1) { const rk = rank(id); if (rk < 9) { g.fillStyle = '#f8f4dc'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(rk + 1), ex, ey + 0.5); } } });
      // coriandoli dal traguardo
      if (animate && p >= 1) {
        if (!confMade) { confMade = true; const cols = order.map(id => raceMeta[id] && raceMeta[id].color).filter(Boolean).concat(['#f5e594', '#fb5f35', '#5bb5b0', '#f8f4dc', '#ecbd6f']); for (let i = 0; i < 90; i++) conf.push({ x: fx + (Math.random() - 0.5) * 16, y: fy - fh, vx: (Math.random() - 0.5) * 150, vy: -90 - Math.random() * 150, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, w: 3 + Math.random() * 3, h: 1.6 + Math.random() * 1.6, col: cols[i % cols.length] }); }
        conf.forEach(c => { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 150 * dt; c.vx *= 0.992; c.rot += c.vr * dt; const a = Math.max(0, Math.min(1, (3.2 - tAfter) / 1.2)); if (a <= 0) return; g.globalAlpha = a; g.save(); g.translate(c.x, c.y); g.rotate(c.rot); g.fillStyle = c.col; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * Math.abs(Math.cos(c.rot * 1.3)) + 0.6); g.restore(); }); g.globalAlpha = 1;
      }
    };
    const still = !animate || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (still) { frame(1, 99, 0); return; }
    const T0 = performance.now() + 450, TDRAW = 2400, TEND = TDRAW + 3400;
    frame(0, 0, 0); lastT = performance.now();
    const loop = now => {
      const el = now - T0, dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
      if (el < 0) { ftRaf = requestAnimationFrame(loop); return; }
      if (el >= TEND) { frame(1, 99, 0); ftRaf = 0; return; }
      frame(Math.min(1, el / TDRAW), Math.max(0, (el - TDRAW) / 1000), dt); ftRaf = requestAnimationFrame(loop);
    };
    ftRaf = requestAnimationFrame(loop);
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
  function resetPortals() { if (gzoom !== 1) applyZoom(1); shake = shX = shY = 0; for (const k in arrAt) delete arrAt[k]; for (const k in peSeen) delete peSeen[k]; pst.gone = {}; pst.mirrored = false; pst.big = false; pst.myExit = -1; pst.pe = 0; pst.ge = undefined; mirrorF = 1; mirT = 0; clearTimeout(noteTimer); els.portalNote.style.display = 'none'; setMirrorView(false); }
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
  // ---- ruote giganti: telecamera che si allontana, tremolio, polvere ----
  const gfx = { t: 0 };
  function applyZoom(g) {
    gzoom = g; viewScale = baseVS * g; viewW = cssWv / viewScale; viewH = cssHv / viewScale;
    if (ctx2d) ctx2d.setTransform(dprV * viewScale, 0, 0, dprV * viewScale, 0, 0);
  }
  function zoomFor(me, now) {
    const dt = Math.min(0.1, gfx.t ? (now - gfx.t) / 1000 : 0.016); gfx.t = now;
    const S = me && !me.finished ? (me.sc || 1) : 1, T = S > 1.02 ? 1 / (1 + 0.4 * (S - 1)) : 1;
    const g = gzoom + (T - gzoom) * Math.min(1, dt * 3.2);
    if (Math.abs(g - gzoom) > 0.002 || (T === 1 && gzoom !== 1 && Math.abs(g - 1) < 0.004)) applyZoom(Math.abs(g - 1) < 0.004 && T === 1 ? 1 : g);
    // tremolio: decade in fretta; mentre sei gigante e veloce la terra trema appena
    shake *= Math.pow(0.004, dt);
    if (S > 1.3) shake = Math.max(shake, 0.9 * Math.min(1, (S - 1) / 1.2) * Math.min(1, Math.abs(me.vx || 0) / 6));
    if (shake > 0.12) { shX = (Math.random() - 0.5) * shake * 2; shY = (Math.random() - 0.5) * shake * 2; } else { shX = shY = 0; shake = 0; }
  }
  const DUST = 'rgba(198,176,146,';
  function giantDust(r, gs) {
    if (Math.abs(r.vx) < 2 || particles.length > 170 || Math.random() > 0.85) return;
    const rad = 80 * gs;
    for (const wx of [r.fwX, r.rwX]) {
      const gap = Sim.GROUND_Y - Terrain.height(wx) - ((wx === r.fwX ? r.fwY : r.rwY) + rad);   // distanza della ruota dal terreno (≈0 se tocca)
      if (gap > 40) continue;
      for (let q = 0; q < 2; q++) particles.push({ x: wx + (Math.random() - 0.5) * 90, y: (wx === r.fwX ? r.fwY : r.rwY) + rad * 0.92, vx: -r.vx * 0.3 * Math.random() - 0.3, vy: -Math.random() * 2.6 - 0.5, g: -0.02, dl: 0.012, life: 0.7, size: 7 + Math.random() * 13, col: DUST });
    }
  }
  function giantLand(r, v) {
    shake = Math.max(shake, Math.min(15, 2 + v * 1.1));
    if (typeof Sfx !== 'undefined' && Sfx.thud) Sfx.thud(v);
    const rad = 80 * (r.sc || 1);
    for (const [wx, wy] of [[r.fwX, r.fwY], [r.rwX, r.rwY]]) for (let i = 0; i < 12; i++) {
      const d = i < 6 ? -1 : 1, sp = 1.5 + Math.random() * 4.5;
      if (particles.length < 190) particles.push({ x: wx + d * Math.random() * rad * 0.5, y: wy + rad * 0.9, vx: d * sp, vy: -Math.random() * 3.5, g: 0.02, dl: 0.011, life: 0.65, size: 7 + Math.random() * 13, col: DUST });
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
    if (me.ge !== pst.ge) {   // portale gigante: evento a parte, non si perde se arriva insieme a un teletrasporto
      const first = pst.ge === undefined; pst.ge = me.ge;
      if (!first && me.gi >= 0) pst.gone[me.gi] = now;
      if (me.gt === 'g') { pst.big = true; if (!first) { showNote('crazy.grow', 1600); if (typeof Sfx !== 'undefined') Sfx.portal('g', 0); } }
      else if (me.gt === 'n') { pst.big = false; if (!first && typeof Sfx !== 'undefined') Sfx.portal('n', 0); }
    }
    const mir = me.dir === -1; if (mir !== pst.mirrored) { pst.mirrored = mir; setMirrorView(mir); }
  }

  window.__dw = { racers: () => latestRacers, portals: () => pst, trails, meta: () => raceMeta, drawFinalTrace };   // solo per i test
  // ---- Lentezza: la propria bici va piano per un po' → lampeggia e il pulsante suggerisce di cambiare forma ----
  // px/tick (60 Hz): con il motore al massimo si sta sopra 5; sotto 2.4 si arranca (fango, salita, forma sbagliata). Isteresi per non sfarfallare.
  const SLOW_ON = 2.4, SLOW_OFF = 3.6, SLOW_HOLD_MS = 1500, SLOW_FREE_MS = 12000;   // nei primi 12 s dal VIA mai: all inizio si parte da fermi e non ha senso consigliare un'altra ruota
  let hazardHostOrigin = null;
  let raceT0 = 0, slowOn = false, slowSince = 0, fastSince = 0, ctrlHintT = 0;
  const jnSeen = {}, jaSeen = {}, lnSeen = {}, ldSeen = {};
  function setSlow(on) {
    if (on === slowOn) return; slowOn = on;
    els.btnRedrawTrigger.classList.toggle('blink', on);
    els.slowHint.style.display = on ? 'block' : 'none';
    if (on && typeof Sfx !== 'undefined' && Sfx.click) { try { Sfx.click(); } catch (e) {} }
  }
  function resetSlow() { slowSince = fastSince = 0; setSlow(false); }
  function updateSlow(me, now) {
    const can = me && !me.finished && myRedrawsLeft > 0 && raceT0 && now - raceT0 > SLOW_FREE_MS && els.redrawModal.style.display !== 'flex' && !(me.im > 0) && (me.sc || 1) < 1.2;
    if (!can) { slowSince = fastSince = 0; setSlow(false); return; }
    const v = Math.abs(me.vx || 0), plain = Terrain.plainAt(me.x);   // lento in un fossato, su una rampa o in salita ripida non è colpa della forma
    if (!plain) { slowSince = fastSince = 0; if (slowOn) setSlow(false); return; }
    if (!slowOn) { if (v < SLOW_ON) { if (!slowSince) slowSince = now; else if (now - slowSince > SLOW_HOLD_MS) setSlow(true); } else slowSince = 0; }
    else { if (v > SLOW_OFF) { if (!fastSince) fastSince = now; else if (now - fastSince > 500) { fastSince = 0; slowSince = 0; setSlow(false); } } else fastSince = 0; }
  }
  // Impila i cartelli centrali sotto il titolo della zona (disegnato sul canvas, che lo sposta sotto il pannello in verticale): titolo → ritmo → comandi. Mai sovrapposti.
  let bannerBot = 0;
  function layoutOverlays(bb) {
    if (typeof bb === 'number') bannerBot = bb;
    let y = (bannerBot || 128) + 10;
    const tag = document.getElementById('season-tag'), hint = els.ctrlHint;
    if (tag && tag.style.display !== 'none') { const v = Math.round(y) + 'px'; if (tag.style.top !== v) tag.style.top = v; y += tag.offsetHeight + 8; }
    if (hint && hint.style.display !== 'none') { const v = Math.round(y) + 'px'; if (hint.style.top !== v) { hint.style.top = v; hint.style.bottom = 'auto'; } }
  }
  window.__layoutOverlays = layoutOverlays;
  // etichetta di stagione e ritmo: appare nel conto alla rovescia, sfuma poco dopo il VIA (non nella modalità pazza, che ha già i suoi portali)
  let seasonTagT = 0;
  function showSeasonTag() {
    const el = document.getElementById('season-tag'); if (!el) return; clearTimeout(seasonTagT);
    const S = Terrain.SEASON; if (!S || crazy) { el.style.display = 'none'; return; }
    el.textContent = ''; const a = document.createElement('b'), b = document.createElement('span');
    a.dataset.i18n = 'season.' + S.key; a.textContent = (champ ? (champ.i + 1) + '/' + champ.n + ' · ' : '') + I18n.t(a.dataset.i18n); b.dataset.i18n = 'pace.' + Terrain.PACE; b.textContent = ' · ' + I18n.t(b.dataset.i18n);
    el.append(a, b); el.classList.remove('fade'); el.style.display = 'block'; layoutOverlays();
  }
  // il ritmo si legge durante il 3-2-1; al VIA lascia il posto al titolo della zona e ai comandi (mai tutto insieme)
  function hideSeasonTagNow() { const el = document.getElementById('season-tag'); if (!el) return; clearTimeout(seasonTagT); el.style.display = 'none'; }
  function hideSeasonTagSoon() { const el = document.getElementById('season-tag'); if (!el) return; clearTimeout(seasonTagT); seasonTagT = setTimeout(() => { el.classList.add('fade'); seasonTagT = setTimeout(() => { el.style.display = 'none'; }, 900); }, 5500); }
  // suggerimento sui comandi: compare al "VIA" per qualche secondo, poi sfuma
  function showCtrlHint() {
    if (!els.ctrlHint) return; clearTimeout(ctrlHintT);
    const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches, j = document.getElementById('ctrl-hint-jump'), sp = document.getElementById('ctrl-hint-sprint'), tip = document.getElementById('sprint-tip');
    if (j) { j.dataset.i18n = touch ? 'race.hintTouch' : 'race.hint'; j.textContent = I18n.t(j.dataset.i18n); }
    if (sp) { sp.dataset.i18n = touch ? 'race.hintSprintTouch' : 'race.hintSprint'; sp.textContent = I18n.t(sp.dataset.i18n); }
    if (tip && els.btnSprint) { tip.textContent = ''; const sp2 = document.createElement('span'); sp2.textContent = I18n.t('race.sprintTip'); sp2.dataset.i18n = 'race.sprintTip'; tip.appendChild(sp2); }
    els.ctrlHint.style.display = 'block'; layoutOverlays(); els.ctrlHint.classList.remove('fade'); void els.ctrlHint.offsetWidth;
    ctrlHintT = setTimeout(() => { els.ctrlHint.classList.add('fade'); ctrlHintT = setTimeout(hideCtrlHint, 900); }, 7000);   // un po' più a lungo: ora spiega anche lo scatto
  }
  function hideCtrlHint() { clearTimeout(ctrlHintT); if (els.ctrlHint) els.ctrlHint.style.display = 'none'; const tip = document.getElementById('sprint-tip'); if (tip) tip.style.display = 'none'; }
  // salto di qualcuno (contatore dall'host): nuvoletta di polvere dalle ruote; per la propria bici anche il suono
  function jumpFx(id, r) {
    const seen = jnSeen[id], aSeen = jaSeen[id]; jnSeen[id] = r.jn || 0; jaSeen[id] = r.ja || 0;
    if (seen === undefined || !r.jn || r.jn === seen) return;
    if ((r.ja || 0) !== (aSeen || 0)) {   // secondo salto in aria: un anello di sbuffi crema sotto la bici
      const cx = (r.fwX + r.rwX) / 2, cy = (r.fwY + r.rwY) / 2 + 26;
      for (let q = 0; q < 10 && particles.length < 190; q++) { const a = Math.PI * (0.1 + 0.8 * q / 9); particles.push({ x: cx + Math.cos(a) * 30, y: cy + Math.sin(a) * 10, vx: Math.cos(a) * 3.4, vy: 0.4 + Math.random() * 0.8, g: -0.01, dl: 0.04, life: 0.8, size: 6 + Math.random() * 7, col: DUST }); }
    } else
    for (const wx of [r.fwX, r.rwX]) {
      const wy = wx === r.fwX ? r.fwY : r.rwY;
      for (let q = 0; q < 5 && particles.length < 190; q++) particles.push({ x: wx + (Math.random() - 0.5) * 50, y: wy + 46, vx: (Math.random() - 0.5) * 3.2, vy: -Math.random() * 1.6, g: -0.01, dl: 0.03, life: 0.9, size: 7 + Math.random() * 11, col: DUST });
    }
    if (id === Net.myId) {
      // UX V27: confirmation ONLY after the host's jump counter changes.
      // Tapping the button is not proof the input was accepted.
      if (els.btnJump) {
        els.btnJump.classList.remove('jump-confirmed');
        void els.btnJump.offsetWidth;
        els.btnJump.classList.add('jump-confirmed');
        clearTimeout(els.btnJump._jumpConfirmTimer);
        els.btnJump._jumpConfirmTimer = setTimeout(() => els.btnJump.classList.remove('jump-confirmed'), 210);
      }
      if (typeof Sfx !== 'undefined' && Sfx.jump) { try { Sfx.jump(); } catch (e) {} }
    }
  }

  // V33: un solo segnale di salto, illustrato a mano, vicino al labbro
  // davanti al giocatore. Leggibile sul telefono, senza tre frecce ripetute,
  // senza animazioni che rallentino il multiplayer o coprano la pista.
  function drawRampTakeoffCues(c,camX,w,groundY,timeMs){
    if(!Terrain.rampLipsIn)return;
    const me=latestRacers[Net.myId];
    if(!me||me.finished||(me.dir||1)<0)return;
    const frontX=me.fwX;
    if(!Number.isFinite(frontX))return;
    // Front wheel: the exact position used by the host timing check.
    const near=Terrain.rampLipsIn(frontX-8,frontX+280)
      .filter(q=>q.x-frontX>-18&&q.x-frontX<255)
      .sort((a,b)=>a.x-b.x);
    if(!near.length)return;
    const lip=near[0],distance=lip.x-frontX;
    const xx=lip.x-46-camX;
    if(xx<-28||xx>w+28)return;
    // Hover just over the ramp's surface. The bike is rendered AFTER this
    // layer, so even a giant wheel will never be covered by the marker.
    const yy=groundY-Terrain.height(lip.x-46)-94;
    const incoming=Math.min(1,(255-distance)/75);
    const outgoing=Math.min(1,(distance+18)/35);
    const alpha=Math.max(0,Math.min(1,incoming,outgoing));
    if(alpha<.04)return;
    const sweet=distance>=-12&&distance<=72;
    const pulse=0.5+0.5*Math.sin((timeMs||0)/140);
    c.save();c.translate(xx,yy-1.5*pulse);
    c.globalAlpha*=alpha;
    // Gentle halo + a compact ivory-gold medallion: one distinct cue.
    c.fillStyle=`rgba(255,230,147,${sweet?(.14+.08*pulse):.12})`;
    c.beginPath();c.ellipse(0,3,23,21,0,0,Math.PI*2);c.fill();
    c.shadowColor='rgba(95,58,35,.40)';c.shadowBlur=4;c.shadowOffsetY=3;
    c.beginPath();c.arc(0,0,15,0,Math.PI*2);
    c.fillStyle='#ffedbd';c.fill();c.shadowColor='transparent';c.shadowBlur=0;c.shadowOffsetY=0;
    c.lineWidth=2.5;c.strokeStyle=sweet?'#ad793f':'#bb8f56';c.stroke();
    // Arrow angled up and forward. A bright carved highlight gives depth.
    c.lineJoin='round';c.lineCap='round';
    c.beginPath();c.moveTo(-7,6);c.lineTo(4,-5);c.lineTo(-1,-6);
    c.moveTo(4,-5);c.lineTo(4,2);
    c.strokeStyle='#8e603c';c.lineWidth=4.5;c.stroke();
    c.strokeStyle=sweet?'#fffdf0':'#f7cf75';c.lineWidth=2.1;c.stroke();
    // Small gold sparkle, not an additional arrow.
    c.strokeStyle='#fff6cb';c.lineWidth=1.5;
    c.beginPath();c.moveTo(11,-14);c.lineTo(11,-8);c.moveTo(8,-11);c.lineTo(14,-11);c.stroke();
    c.restore();
  }
  // Ogni rampa, inclusi i kicker piccoli, manda un evento all'animazione della gara.
  // Piccolo = sbuffo leggero e rotazione libera; grande = scia più ampia. Tutto locale e a costo limitato.
  function rampLaunchFx(id, r) {
    const n = r.ln || 0, old = lnSeen[id]; lnSeen[id] = n;
    if (old === undefined || !n || n === old) return;
    const perfect=(r.ls||0)===3, big=(r.ls||1)>1, count=perfect?18:(big?12:6);
    for (let i = 0; i < count && particles.length < 190; i++) {
      const wx = i % 2 ? r.fwX : r.rwX, wy = i % 2 ? r.fwY : r.rwY;
      particles.push({ x: wx + (Math.random() - 0.5) * 22, y: wy + 37,
        vx: -0.5 - Math.random() * (big ? 4.2 : 2.0), vy: -1.0 - Math.random() * (big ? 3.2 : 1.5),
        g: 0.04, dl: big ? 0.027 : 0.045, life: 0.85, size: big ? 5 + Math.random() * 7 : 3 + Math.random() * 4, col: perfect?'rgba(255,205,98,':DUST });
    }
  }

  // V35: local landing feedback after an authoritative host contact event.
  // Tiny dust/droplet bursts on the rideable ground; no shake, impulse,
  // slowdown or extra networking messages. All clients see the same landing.
  function landingFx(id,r){
    const n=r.ld||0,old=ldSeen[id];ldSeen[id]=n;
    if(old===undefined||!n||n===old)return;
    const power=Math.max(1,Math.min(3,r.lp||1));
    const x=Number.isFinite(r.fwX)?r.fwX:r.x;
    const y=Sim.GROUND_Y-Terrain.height(x);
    const z=Terrain.zoneAt(x);
    const kind=z&&z.key||'';
    const color=kind==='water'?'rgba(143,218,246,':kind==='lava'?'rgba(255,166,94,':kind==='ice'?'rgba(232,249,255,':DUST;
    const count=5+power*3;
    for(let i=0;i<count&&particles.length<190;i++){
      const angle=(i/(count-1))*Math.PI;
      const speed=(1.2+power*.60)*(.7+Math.random()*.6);
      particles.push({x:x+(Math.random()-.5)*42,y:y-2,
        vx:Math.cos(angle)*speed,vy:-Math.sin(angle)*speed-.5,
        g:.08,dl:.065,life:.72,size:1.7+Math.random()*2.1+power*.45,col:color});
    }
  }

  // Un errore di disegno in un singolo fotogramma non deve MAI fermare la gara: il ciclo si riprende da solo al fotogramma dopo
  // (prima, un'eccezione qui impediva di richiedere il fotogramma successivo e lo schermo restava congelato).
  let drawErrs = 0;
  function renderRace(ts) {
    adaptRes(ts);
    try { renderRaceFrame(ts); }
    catch (e) {
      if (drawErrs++ < 5) { try { console.error('draw', e); } catch (_) {} }
      try { if (ctx2d && ctx2d.reset) ctx2d.reset(); applyZoom(gzoom); } catch (_) {}
    }
    raceLoopHandle = requestAnimationFrame(renderRace);
  }
  function renderRaceFrame(ts) {
    const t0 = performance.now();
    interpolateRacers(t0);
    const me = latestRacers[Net.myId];
    updateSlow(me, t0);
    zoomFor(me, t0);   // ruote giganti: la telecamera si allontana (cambia viewW/viewH)
    const w = viewW, h = viewH;
    updateCamera(Math.min(0.1, (ts - (lastCamTs || ts)) / 1000), w, h); lastCamTs = ts;
    const groundY = h * 0.8 + cam.dy + shY, camX = smoothCamX + shX;
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
      const p = particles[i]; p.x += p.vx; p.y += p.vy; if (p.g) p.vy += p.g; p.life -= p.dl || 0.03;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx2d.fillStyle = `${p.col}${p.life})`; ctx2d.beginPath(); ctx2d.arc(p.x - camX, p.y - Sim.GROUND_Y + groundY, p.size, 0, Math.PI * 2); ctx2d.fill();
    }

    // Terreno: altezza "naturale" (compreso il vuoto sotto i ponti, dove si vede l'acqua o il crepaccio)
    const n = Math.min(256, Math.floor((w + SURF_STEP) / SURF_STEP) + 1);
    for (let i = 0; i < n; i++) surfBuf[i] = Terrain.naturalHeight(camX + i * SURF_STEP);
    Scenery.drawGround(ctx2d, surfBuf, n, SURF_STEP);
    Scenery.drawWorldEffects(ctx2d, camX, w, groundY, Math.max(0, t0 - raceT0));
    WorldFX.drawGround(ctx2d, camX, w, groundY, t0);
    if (Terrain.WORLD_SEGMENT && Terrain.WORLD_SEGMENT.world==='egypt') EgyptWorld.drawGround(ctx2d,camX,w,groundY);
    drawRampTakeoffCues(ctx2d,camX,w,groundY,t0);

    Props.drawPatches(ctx2d, camX, w, groundY, SC);
    Props.drawRamps(ctx2d, camX, w, groundY);
    const localWorld = Terrain.WORLD_SEGMENT;
    const inLocalWorld = localWorld && camX + w * 0.40 >= localWorld.start - 80 && camX + w * 0.40 <= localWorld.end + 80;
    if (!inLocalWorld && Terrain.WORLD === 'classic') Props.drawSigns(ctx2d, camX, w, groundY);
    Props.drawFinish(ctx2d, camX, w, groundY, SC);
    Props.drawBridges(ctx2d, camX, w, groundY, SC);
    // Rendering delle sagome SOLIDE V20, prima dei giocatori (collider host Matter).
    const obstacleElapsed = Net.isHost ? Sim.getObstacleTime() :
      Math.max(0, hazardHostOrigin === null ? t0 - raceT0 : t0 - hazardHostOrigin - interpClientMs);
    DynamicObstacles.draw(ctx2d, camX, w, groundY, obstacleElapsed);
    if (Terrain.WORLD_SEGMENT && Terrain.WORLD_SEGMENT.world==='egypt') EgyptWorld.drawHazards(ctx2d,camX,w,groundY,obstacleElapsed,Object.values(latestRacers));
    // Pass already synchronized bike poses for a subtle, local anticipation cue.
    // This is drawing-only; clients do not alter obstacles or collision bodies.
    InteractiveObstacles.draw(ctx2d, camX, w, groundY, !Net.isHost, undefined, undefined, Object.values(latestRacers));
    if (!inLocalWorld && Terrain.WORLD === 'classic') {
      Flora.drawLilies(ctx2d, camX, w, groundY, SC);
      Flora.draw(ctx2d, camX, w, groundY, SC);
    }

    portalFx(me, t0);
    if (trailOn()) { for (const id in latestRacers) trailSample(latestRacers[id]); for (const id in latestRacers) if (raceMeta[id]) drawTrail(ctx2d, camX, groundY, id, raceMeta[id].color); }
    if (Terrain.PORTALS.length) { Props.drawPortals(ctx2d, camX, w, groundY, t0 / 1000, pst, 'back'); drawArrivals(ctx2d, camX, w, groundY, t0, 'back'); }
    // la propria bici per ultima: alla partenza (stesso punto per tutti) resta sopra le altre
    // In V16 ogni fumetto veniva disegnato durante la propria bici: con cinque
    // giocatori vicini i fumetti si coprivano. V17 li disegna in un passaggio finale.
    const emoteAnchors = [];
    Object.entries(latestRacers).sort((a, b) => (a[0] === Net.myId) - (b[0] === Net.myId)).forEach(([id, r]) => {
      const meta = raceMeta[id]; if (!meta) return;
      const cy = (y) => y - Sim.GROUND_Y + groundY, cx = r.x - camX;
      jumpFx(id, r);
      rampLaunchFx(id, r);
      landingFx(id, r);
      const active = activeEmotes[id];
      if (active) {
        const age = t0 - active.at;
        if (age >= 0 && age < EMOTE_DURATION) {
          // Ogni emote ha un'ancora anche se la bici e' molto lontana dal campo visivo.
          // Specchio: convertiamo le coordinate PRIMA del layout, senza ribaltare PNG e nome.
          const screenX = (w * 0.5 + mirrorF * (cx - w * 0.5)) * viewScale;
          const screenY = cy(r.y) * viewScale;
          const outside = screenX < -85 * viewScale || screenX > cssWv + 85 * viewScale ||
                          screenY < -90 * viewScale || screenY > cssHv + 90 * viewScale;
          const side = screenX < 0 ? 'left' : screenX > cssWv ? 'right' :
                       screenY < 0 ? 'up' : screenY > cssHv ? 'down' : null;
          emoteAnchors.push({id, x: screenX, y: screenY,
            drift: Math.min(age / 90, 18), color: meta.color,
            offscreen: outside, side: outside ? side || (screenX < cssWv / 2 ? 'left' : 'right') : null,
            name: meta.name});
        } else delete activeEmotes[id];
      }
      if (cx < -250 || cx > w + 250) return;
      const blink = slowOn && id === Net.myId; if (blink) { ctx2d.save(); ctx2d.globalAlpha = 0.38 + 0.62 * (0.5 + 0.5 * Math.sin(t0 / 85)); }
      let sc = 1; const ar = arrAt[id];
      if (ar) { const tt = t0 - ar.t0; sc = tt < 130 ? 0.001 : Math.max(0.001, Math.min(1.15, easeOutBack(Math.min(1, (tt - 130) / 420)))); }
      if (sc !== 1) { ctx2d.save(); ctx2d.translate(cx, cy(r.y)); ctx2d.scale(sc, sc); ctx2d.translate(-cx, -cy(r.y)); }
      if (r.so) sprintFx(cx, cy(r.y), r.dir || 1, t0);
      if (r.im > 0) drawGlow(ctx2d, cx, cy(r.y), meta.color, r.im, t0);
      const gs = r.sc || 1, bigB = gs > 1.01;   // la bici cresce insieme alle ruote
      if (bigB) { ctx2d.save(); ctx2d.translate(cx, cy(r.y)); ctx2d.scale(gs, gs); ctx2d.translate(-cx, -cy(r.y)); }
      if (bigB) ctx2d.restore();
      const hR = wheelHeat(id, 'r', r.rwX, r.rwY), hF = wheelHeat(id, 'f', r.fwX, r.fwY);
      const egyptSeg=Terrain.WORLD_SEGMENT;
      const bandagesVisible=!!(egyptSeg&&egyptSeg.world==='egypt'&&r.x>=egyptSeg.start&&r.x<egyptSeg.end);
      // The bandages visibly fall away on exit. The rear-wheel triangle remains
      // unchanged on every client because the host continues to send r.cu.
      CurseFx.draw(ctx2d,id,r,bandagesVisible,camX,cy,t0);
      drawWheel(r.rwX - camX, cy(r.rwY), r.rwAngle, meta.vr || meta.vertices, meta.color, id === Net.myId, hR, meta.vr ? meta.mr : null, id, r.sc, r.cu||0,bandagesVisible);
      drawWheel(r.fwX - camX, cy(r.fwY), r.fwAngle, meta.vf || meta.vertices, meta.color, id === Net.myId, hF, meta.vf ? meta.mf : null, id, r.sc);
      lavaDrips(id, r, meta, hR, hF);
      if (bigB) { ctx2d.save(); ctx2d.translate(cx, cy(r.y)); ctx2d.scale(gs, gs); ctx2d.translate(-cx, -cy(r.y)); }
      drawBike(cx, cy(r.y), r.angle, meta.color);   // il telaio sta sopra le ruote, come in una bici vista di lato
      drawRider(cx, cy(r.y), r.angle, meta.color, meta.name, id === Net.myId);
      if (bigB) ctx2d.restore();
      if (bigB && gs > 1.3) giantDust(r, gs);
      if (r.im > 0) drawGlow(ctx2d, cx, cy(r.y), meta.color, r.im, t0, true);
      if (sc !== 1) ctx2d.restore();
      if (blink) ctx2d.restore();
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
    WorldFX.drawFore(ctx2d, camX, w, groundY, t0, h);

    // Ripristina la matrice PRIMA di disegnare emote: anche con pista specchiata,
    // le PNG, le frecce e i nomi devono restare orientati correttamente.
    if (mirrored) ctx2d.restore();
    // L'emote propria resta sopra la bici; quelle degli avversari fuori campo
    // diventano indicatori ancorati al bordo e mantengono nome e direzione.
    if (emoteAnchors.length) {
      emoteAnchors.sort((a, b) =>
        Number(b.id === Net.myId) - Number(a.id === Net.myId) ||
        Number(a.offscreen) - Number(b.offscreen));
      // Reserve the current DOM controls, including the picker while it is open.
      // A small indicator must be visible to the receiver, not hidden behind a button.
      const canvasRect = els.raceCanvas.getBoundingClientRect();
      const avoid = [els.raceWrap.querySelector('.hud'), els.emoteDock,
        els.btnJump, els.btnSprint, els.redrawUi].filter(node => node &&
          getComputedStyle(node).display !== 'none' && node.getClientRects().length)
        .map(node => { const r = node.getBoundingClientRect(); return {
          x1:r.left - canvasRect.left - 5, x2:r.right - canvasRect.left + 5,
          y1:r.top - canvasRect.top - 5, y2:r.bottom - canvasRect.top + 5
        }; });
      const placed = EmoteLayout.layout(emoteAnchors, {
        width: cssWv, height: cssHv, compact: Math.min(cssWv, cssHv) < 520, avoid
      });
      for (const a of placed) drawEmoteBubble(a.id, a.x / viewScale, a.y / viewScale, a.color, t0, a);
    }
    if (t0 - hudAt > 120) { hudAt = t0; updateHud(); updateLastCall(); }
    drawMinimap();
    if (Perf.on) Perf.frame(ts, performance.now() - t0);
    qualityGuard(ts, performance.now() - t0);
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

  // ---- stile illustrazione: forme piatte, colori pieni, un bordino crema al posto del contorno scuro ----------------------------------
  const CREAM = '#f8f4dc', SLATE = '#2d3e48', SUN = '#fb5f35', TAU2 = Math.PI * 2;
  const rrect = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  // sprint: righe di velocità dietro la bici
  function sprintFx(x, y, dir, t) {
    ctx2d.save(); ctx2d.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const ph = ((t / 260 + k * 0.173) % 1), len = 34 + 46 * ((k * 37) % 5) / 4, yy = y - 46 + ((k * 53) % 9) * 11, xx = x - dir * (96 + ph * 120);
      ctx2d.globalAlpha = (1 - ph) * 0.8; ctx2d.strokeStyle = k % 2 ? '#fff' : '#fbbf24'; ctx2d.lineWidth = 3.2;
      ctx2d.beginPath(); ctx2d.moveTo(xx, yy); ctx2d.lineTo(xx - dir * len, yy); ctx2d.stroke();
    }
    ctx2d.restore();
  }
  function drawBike(x, y, a, c) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(a); ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round';
    const dk = `rgb(${mixRgb(hexRgb(c), 0.72)})`;
    const frame = () => { ctx2d.beginPath(); ctx2d.moveTo(-90, 0); ctx2d.lineTo(0, 0); ctx2d.lineTo(-20, -55); ctx2d.lineTo(-90, 0); ctx2d.moveTo(0, 0); ctx2d.lineTo(55, -45); ctx2d.lineTo(-20, -55); };
    const fork = () => { ctx2d.beginPath(); ctx2d.moveTo(90, 0); ctx2d.lineTo(55, -45); };
    const bars = () => { ctx2d.beginPath(); ctx2d.moveTo(55, -45); ctx2d.lineTo(45, -70); ctx2d.lineTo(60, -80); };
    // bordino crema sotto, poi il telaio nel colore del giocatore (un tono più scuro), forcella e manubrio in ardesia
    ctx2d.strokeStyle = CREAM; ctx2d.lineWidth = 15; frame(); ctx2d.stroke(); fork(); ctx2d.stroke(); bars(); ctx2d.stroke();
    ctx2d.strokeStyle = dk; ctx2d.lineWidth = 8; frame(); ctx2d.stroke();
    ctx2d.strokeStyle = SLATE; ctx2d.lineWidth = 7; fork(); ctx2d.stroke(); ctx2d.lineWidth = 6; bars(); ctx2d.stroke();
    ctx2d.fillStyle = c; ctx2d.beginPath(); ctx2d.arc(60, -80, 8, 0, TAU2); ctx2d.fill();
    ctx2d.strokeStyle = SLATE; ctx2d.lineWidth = 6; ctx2d.beginPath(); ctx2d.moveTo(-20, -55); ctx2d.lineTo(-25, -75); ctx2d.stroke();
    ctx2d.fillStyle = SLATE; ctx2d.beginPath(); ctx2d.ellipse(-30, -78, 17, 6, Math.PI / 12, 0, TAU2); ctx2d.fill();
    ctx2d.fillStyle = CREAM; ctx2d.beginPath(); ctx2d.arc(0, 0, 11, 0, TAU2); ctx2d.fill(); ctx2d.fillStyle = SLATE; ctx2d.beginPath(); ctx2d.arc(0, 0, 5, 0, TAU2); ctx2d.fill();
    ctx2d.restore();
  }

  // ---- vulcano: ruote che si sciolgono -------------------------------------------------------------------------------
  // l'host manda, per ogni ruota, quanto si è sciolto ogni punto (interi 0..100); la forma si ricostruisce qui con le stesse funzioni della fisica.
  // meta.vf / meta.vr = contorno sciolto della ruota davanti / dietro, meta.mf / meta.mr = quanto (0..1) per punto, usati per far brillare il bordo.
  function applyMelt(id, f, r) {
    const meta = raceMeta[id]; if (!meta || !meta.vertices) return;
    if (!meta.base) meta.base = Sim.meltBase(meta.vertices);
    meta.mf = f.map(v => v / 100); meta.mr = r.map(v => v / 100);
    meta.vf = Sim.meltVertices(meta.base, meta.mf); meta.vr = Sim.meltVertices(meta.base, meta.mr);
  }
  function clearMelt(meta) { if (!meta) return; meta.base = meta.vf = meta.vr = meta.mf = meta.mr = null; }
  const heatOf = {};   // id -> {f, r}: calore della ruota (0..1): sale quando è nella lava, scende piano dopo
  function wheelHeat(id, which, x, y) {
    const H = heatOf[id] || (heatOf[id] = { f: 0, r: 0 });
    let hot = 0;
    if (Terrain.nearLava && Terrain.nearLava(x, 120)) { const ls = Sim.GROUND_Y - Terrain.lavaLevel(x); hot = Math.max(0, Math.min(1, (y + 62 - ls) / 26)); }
    H[which] = Math.max(hot, H[which] * 0.985);
    return H[which];
  }
  // gocce di materiale fuso che cadono dai punti sciolti, e schizzi/scintille quando la ruota è dentro la lava
  function lavaDrips(id, r, meta, hR, hF) {
    if (particles.length > 100) return;
    const go = (x, y, ang, h, v, m) => {
      if (h < 0.18 || !v) return;
      if (Math.random() < 0.55 * h) {
        const i = (Math.random() * v.length) | 0, p = v[i], ca = Math.cos(ang), sa = Math.sin(ang), wx = x + (ca * p.x - sa * p.y) * (r.sc || 1), wy = y + (sa * p.x + ca * p.y) * (r.sc || 1);
        const mm = m ? m[i] || 0 : 0;
        if (mm > 0.04 || h > 0.7) particles.push({ x: wx, y: wy, vx: (Math.random() - 0.5) * 0.8 - r.vx * 0.12, vy: Math.random() * 0.8, g: 0.2, dl: 0.022, life: 1, size: 1.8 + Math.random() * 2.6, col: Math.random() < 0.5 ? 'rgba(255,140,30,' : 'rgba(255,200,70,' });
      }
      if (h > 0.75 && Math.random() < 0.5) particles.push({ x: x + (Math.random() - 0.5) * 100, y: y + 60, vx: (Math.random() - 0.5) * 2.2, vy: -2 - Math.random() * 4, g: 0.17, dl: 0.026, life: 1, size: 1.4 + Math.random() * 2.2, col: 'rgba(255,190,60,' });
    };
    go(r.rwX, r.rwY, r.rwAngle, hR, meta.vr || meta.vertices, meta.vr ? meta.mr : null);
    go(r.fwX, r.fwY, r.fwAngle, hF, meta.vf || meta.vertices, meta.vf ? meta.mf : null);
  }
  // contorno morbido: curva che passa per i punti medi dei lati (la ruota sciolta ha un profilo continuo, non una poligonale)
  function smoothPath(v) {
    const n = v.length; ctx2d.beginPath();
    let mx = (v[n - 1].x + v[0].x) / 2, my = (v[n - 1].y + v[0].y) / 2; ctx2d.moveTo(mx, my);
    for (let i = 0; i < n; i++) { const p = v[i], q = v[(i + 1) % n]; ctx2d.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
    ctx2d.closePath();
  }
  function drawWheel(x, y, a, v, c, isMe, heat, mArr, id, sc, curse = 0, showBandages = true) {
    if(curse>0) v=EgyptWorld.morph(v,curse);
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(a);
    if (sc && sc !== 1) ctx2d.scale(sc, sc);   // portale gigante: stessa forma, più grande (i tratti restano della stessa grossezza)
    const ls = sc && sc !== 1 ? 1 / sc : 1, dark = `rgb(${mixRgb(hexRgb(c), 0.7)})`, melted = !!mArr;
    const trace = () => { if (melted) smoothPath(v); else { ctx2d.beginPath(); v.forEach((p, i) => i === 0 ? ctx2d.moveTo(p.x, p.y) : ctx2d.lineTo(p.x, p.y)); ctx2d.closePath(); } };
    ctx2d.lineJoin = 'round'; ctx2d.lineCap = 'round';
    // 1) bordino crema (come un adesivo): stacca la ruota da qualunque sfondo, al posto del vecchio contorno scuro
    trace(); ctx2d.lineWidth = (isMe ? 11 : 8) * ls; ctx2d.strokeStyle = CREAM; ctx2d.stroke();
    // 2) corpo pieno, opaco, nel colore del giocatore
    ctx2d.fillStyle = c; ctx2d.fill();
    // 3) la stessa forma ridotta, un tono più scuro: dà volume senza sfumature
    ctx2d.save(); ctx2d.scale(0.64, 0.64); trace(); ctx2d.fillStyle = dark; ctx2d.fill(); ctx2d.restore();
    // 4) raggi crema che mostrano la rotazione
    if (v && v.length > 0) {
      ctx2d.lineWidth = 3.2 * ls; ctx2d.strokeStyle = 'rgba(248,244,220,0.62)';
      const step = Math.max(1, Math.floor(v.length / 6));
      for (let i = 0; i < v.length; i += step) { const p = v[i]; ctx2d.beginPath(); ctx2d.moveTo(0, 0); ctx2d.lineTo(p.x * 0.64, p.y * 0.64); ctx2d.stroke(); }
    }
    if (melted || heat > 0.02) {
      // bordo incandescente: dove il materiale è più sciolto (e mentre è nella lava) brilla d'arancio, con un alone; poi si raffredda
      const n = v.length, hh = Math.max(0.0, heat);
      ctx2d.save(); ctx2d.globalCompositeOperation = 'lighter'; ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round';
      if (hh > 0.03) { smoothPath(v); ctx2d.strokeStyle = `rgba(255,120,20,${(0.5 * hh).toFixed(3)})`; ctx2d.lineWidth = 9; ctx2d.stroke(); ctx2d.strokeStyle = `rgba(255,210,90,${(0.55 * hh).toFixed(3)})`; ctx2d.lineWidth = 3; ctx2d.stroke(); }
      if (melted) {
        // la parte sciolta: tratto più spesso e caldo lungo i punti con fusione alta, che sfuma col calore
        for (let i = 0; i < n; i++) {
          const m = mArr[i] || 0, k = Math.min(1, m / 0.25) * (0.25 + 0.75 * hh); if (k < 0.04) continue;
          const p = v[i], q = v[(i + 1) % n];
          ctx2d.strokeStyle = `rgba(255,${100 + 90 * k | 0},20,${(0.8 * k).toFixed(3)})`; ctx2d.lineWidth = 3 + 5 * k; ctx2d.beginPath(); ctx2d.moveTo(p.x, p.y); ctx2d.lineTo(q.x, q.y); ctx2d.stroke();
        }
      }
      ctx2d.restore();
    }
    if(curse>0 && showBandages) EgyptWorld.drawBandages(ctx2d,v,curse);
    // 5) mozzo: disco crema con un punto d'ardesia
    ctx2d.beginPath(); ctx2d.arc(0, 0, 10, 0, TAU2); ctx2d.fillStyle = CREAM; ctx2d.fill(); ctx2d.beginPath(); ctx2d.arc(0, 0, 4.6, 0, TAU2); ctx2d.fillStyle = SLATE; ctx2d.fill(); ctx2d.restore();
  }

  function drawRider(x, y, a, c, n, isMe) {
    ctx2d.save(); ctx2d.translate(x, y); ctx2d.rotate(a); ctx2d.translate(-15, -105);
    ctx2d.beginPath(); ctx2d.arc(0, 0, 19, 0, TAU2); ctx2d.fillStyle = CREAM; ctx2d.fill();
    ctx2d.lineWidth = 5; ctx2d.strokeStyle = c; ctx2d.stroke();
    ctx2d.fillStyle = SLATE; ctx2d.font = 'bold 12px "Space Grotesk"'; ctx2d.textAlign = 'center'; ctx2d.fillText((n || '?').trim().slice(0, 2).toUpperCase(), 0, 5);
    if (isMe) {
      // "tu": pastiglia arancio con codina, la stessa dell'elenco in alto a sinistra
      ctx2d.rotate(-a); const t = I18n.t('race.you'); ctx2d.font = 'bold 15px "Kalam"'; ctx2d.textAlign = 'center';
      const w = ctx2d.measureText(t).width + 18; rrect(ctx2d, -w / 2, -56, w, 24, 12); ctx2d.fillStyle = SUN; ctx2d.fill();
      ctx2d.beginPath(); ctx2d.moveTo(-6, -33); ctx2d.lineTo(6, -33); ctx2d.lineTo(0, -25); ctx2d.closePath(); ctx2d.fill();
      ctx2d.fillStyle = CREAM; ctx2d.fillText(t, 0, -39);
    }
    ctx2d.restore();
  }

  function updateHud() {
    const me = latestRacers[Net.myId];
    if (me) els.hudFill.style.width = Math.max(0, Math.min(100, (me.x / Terrain.FINISH_X) * 100)) + '%';
    const rkd = Object.entries(latestRacers).map(([id, r]) => ({ id, x: r.x, meta: raceMeta[id] })).filter(r => r.meta).sort((a, b) => b.x - a.x);
    const order = rkd.map(r => r.id).join('|');
    if (order === lastHudOrder) return; // niente DOM churn 8 volte/s se la classifica è invariata
    lastHudOrder = order;
    const frag = document.createDocumentFragment();
    rkd.forEach((r, i) => {
      const li = document.createElement('li'); if (r.id === Net.myId) li.classList.add('is-me');
      li.innerHTML = `<span class="rank-num">${i + 1}</span><span class="color-dot" style="background:${r.meta.color}"></span><span>${escapeHtml(r.meta.name)}</span>`;
      frag.appendChild(li);
    });
    els.hudBoard.replaceChildren(frag);
  }

  // minimappa a illustrazione: barra piatta a pastiglia con i biomi in colori pieni, laghi, ponti ad arco, bandierina e i giocatori come pallini col bordino crema
  const MM_PAL = { start: '#78ba8e', hills: '#438c67', ice: '#bfe3ea', gravel: '#ecbd6f', water: '#5bb5b0', ramps: '#e3937a', lava: '#fb5f35', finish: '#78ba8e' };
  function drawMinimap() {
    const w = minimapMetrics.w, h = minimapMetrics.h, tL = Terrain.FINISH_X, m = minimapCtx; m.clearRect(0, 0, w, h);
    const pad = 10, bh = Math.max(9, Math.min(15, h * 0.34)), by = h * 0.64 - bh / 2, toPx = x => pad + Math.max(0, Math.min(1, x / tL)) * (w - pad * 2);
    const me = latestRacers[Net.myId];
    // Parte statica cache: la geometria della pista non cambia durante la gara.
    if (!minimapBase || minimapBaseDirty) {
      const raster = Math.min(window.devicePixelRatio || 1, 1.5);
      minimapBase = document.createElement('canvas');
      minimapBase.width = Math.max(1, Math.round(w * raster));
      minimapBase.height = Math.max(1, Math.round(h * raster));
      const b = minimapBase.getContext('2d');
      b.setTransform(raster, 0, 0, raster, 0, 0);
      rrect(b, pad - 3, by - 3, w - pad * 2 + 6, bh + 6, (bh + 6) / 2); b.fillStyle = '#e4deb6'; b.fill();
      b.save(); rrect(b, pad, by, w - pad * 2, bh, bh / 2); b.clip();
      Terrain.ZONES.forEach(z => {
        const zS = Math.max(0, z.start), zE = Math.min(tL, z.end); if (zE <= zS) return;
        b.fillStyle = MM_PAL[z.key] || '#94a3b8'; b.fillRect(toPx(zS), by, Math.max(1, toPx(zE) - toPx(zS)), bh);
        if (z.gap && (z.key === 'water' || z.key === 'lava')) {
          b.fillStyle = z.key === 'lava' ? '#fb5f35' : '#5bb5b0'; b.fillRect(toPx(z.gap.g0), by, toPx(z.gap.g1) - toPx(z.gap.g0), bh);
          b.fillStyle = z.key === 'lava' ? '#f5e594' : '#bfe3ea'; b.fillRect(toPx(z.gap.g0), by, toPx(z.gap.g1) - toPx(z.gap.g0), 2.4);
        }
      });
      b.restore(); minimapBaseDirty = false;
    }
    m.drawImage(minimapBase, 0, 0, w, h);
    // barra del progresso: stessi colori e coordinate originali.
    if (me) { m.save(); rrect(m, pad, by, w - pad * 2, bh, bh / 2); m.clip();
      m.fillStyle = 'rgba(45,62,72,0.2)'; m.fillRect(pad, by, toPx(me.x) - pad, bh); m.restore(); }
    // ponti: piccoli archi d'ardesia sopra la barra
    m.strokeStyle = SLATE; m.lineWidth = 2.4; m.lineCap = 'round';
    Terrain.BRIDGES.forEach(b => { const a = toPx(b.start), c = toPx(b.end); m.beginPath(); m.moveTo(a, by + 1); m.quadraticCurveTo((a + c) / 2, by - bh * 0.9, c, by + 1); m.stroke(); });
    // traguardo: palo e bandierina
    const fx = w - pad; m.strokeStyle = SLATE; m.lineWidth = 2.4; m.beginPath(); m.moveTo(fx, by + bh + 3); m.lineTo(fx, by - bh - 2); m.stroke(); m.fillStyle = SUN; m.beginPath(); m.moveTo(fx, by - bh - 2); m.lineTo(fx - 9, by - bh + 2); m.lineTo(fx, by - bh + 6); m.closePath(); m.fill();
    // giocatori: tu per ultimo, sopra gli altri
    const list = Object.entries(latestRacers).filter(([id]) => raceMeta[id]).sort((a, b) => (a[0] === Net.myId) - (b[0] === Net.myId));
    list.forEach(([id, r]) => {
      const isMe = id === Net.myId, cx = toPx(r.x), cy = by + bh / 2, rad = isMe ? 7.5 : 5.5;
      m.fillStyle = CREAM; m.beginPath(); m.arc(cx, cy, rad + 3, 0, TAU2); m.fill();
      m.fillStyle = raceMeta[id].color; m.beginPath(); m.arc(cx, cy, rad, 0, TAU2); m.fill();
      if (isMe) { m.fillStyle = SUN; m.beginPath(); m.moveTo(cx - 5, cy - rad - 8); m.lineTo(cx + 5, cy - rad - 8); m.lineTo(cx, cy - rad - 2); m.closePath(); m.fill(); }
    });
  }

  function stopRaceLoops() { CurseFx.reset(); if (connectionStatus) connectionStatus.hidden = true; closeEmotePicker(); if (typeof Sfx !== 'undefined') Sfx.silence(); resetPortals(); if (raceLoopHandle) cancelAnimationFrame(raceLoopHandle); if (snapshotLoopHandle) Ticker.stop(snapshotLoopHandle); raceLoopHandle = snapshotLoopHandle = null; latestRacers = {}; hideLastCall(); els.redrawUi.style.display = els.redrawModal.style.display = 'none'; if (els.btnJump) els.btnJump.style.display = 'none'; resetSlow(); hideCtrlHint(); }
  let lastStandings = null;
  I18n.onChange(() => { if (document.body.dataset.screen === 'results' && lastStandings) { try { drawFinalTrace(lastStandings); } catch (e) { console.warn(e); } } });   // cambio lingua nei risultati: ridisegna la mappa coi nomi nuovi
  function showResults(st, ch) {
    lastStandings = st; lastCh = ch || null; if (Net.isHost) Net.setPhase('results'); stopRaceLoops(); releaseWakeLock();
    if (typeof Sfx !== 'undefined' && !aud.fin) Sfx.finish(0);
    try { drawFinalTrace(st, true); } catch (e) { console.warn(e); }
    els.resultsList.innerHTML = '';
    st.forEach((s, i) => { const li = document.createElement('li'); li.innerHTML = `<span class="results-rank">${rankLabel(i + 1)}</span><span class="color-dot" style="background:${s.color}"></span><span>${escapeHtml(s.name)}</span><span class="results-time">${s.finished ? `${(s.finishTime / 1000).toFixed(2)}s` : I18n.t('res.dnf')}</span>${ch ? `<span class="results-gain">+${ch.gains[s.id] || 0}</span>` : ''}`; els.resultsList.appendChild(li); });
    // Personal best for the *same track* only. No account, no scoreboard manipulation.
    const best = document.getElementById('personal-best'), mine = st.find(s => s.id === Net.myId);
    if (best) {
      best.hidden = true;
      if (mine && mine.finished && Number.isFinite(mine.finishTime)) {
        const key = 'dw_best_' + (currentWorld || 'classic') + '_' + (currentLayout || []).join('-');
        const ms = mine.finishTime;
        try {
          const prev = Number(localStorage.getItem(key));
          if (!prev || ms < prev) { localStorage.setItem(key, String(ms)); best.textContent = I18n.t('res.newBest') + ' · ' + (ms / 1000).toFixed(2) + ' s'; }
          else best.textContent = I18n.t('res.best') + ' · ' + (prev / 1000).toFixed(2) + ' s';
          best.hidden = false;
        } catch (_) { /* private mode: skip persistence */ }
      }
    }
    renderChamp(ch); showScreen('results');
  }
  // classifica del campionato sotto i risultati della gara + pulsanti coerenti (solo l'host lancia la prossima)
  function renderChamp(ch) {
    const box = document.getElementById('champ-box'), tb = document.getElementById('champ-table'), tt = document.getElementById('champ-title');
    if (!box) return;
    if (!ch) { box.style.display = 'none'; btnRes.style.display = ''; btnRes.textContent = I18n.t('res.rematch'); if (resWait) resWait.textContent = ''; return; }
    tb.innerHTML = ''; ch.table.forEach((t, i) => { const li = document.createElement('li'); if (i === 0) li.className = 'champ-lead'; li.innerHTML = `<span class="results-rank">${rankLabel(i + 1)}</span><span class="color-dot" style="background:${t.color}"></span><span>${escapeHtml(t.name)}</span><span class="results-time">${t.pts} ${I18n.t('champ.pts')}</span><span class="results-gain">${t.gain ? '+' + t.gain : ''}</span>`; tb.appendChild(li); });
    tt.textContent = ch.final ? I18n.t('champ.winner', { name: ch.table[0] ? ch.table[0].name : '' }) : I18n.t('champ.table') + ' · ' + (ch.i + 1) + '/' + ch.n;
    box.style.display = 'block';
    if (Net.isHost) { btnRes.style.display = ''; btnRes.textContent = ch.final ? I18n.t('champ.again') : I18n.t('champ.next', { i: ch.i + 2, n: ch.n }); if (resWait) resWait.textContent = ''; }
    else { btnRes.style.display = 'none'; if (resWait) resWait.textContent = I18n.t(ch.final ? 'champ.waitEnd' : 'champ.wait'); }
  }

  els.btnRematch.addEventListener('click', () => {
    if (!Net.isHost) return;
    wheels = {};
    if (champ && lastCh) { if (lastCh.final) startChamp(); else champ.i++; keepTrack = false; }   // campionato: prossima gara (o nuovo campionato dopo l'ultima), con pista nuova
    else keepTrack = true;
    Net.broadcast({ type: 'restartToDraw', champ: champPublic() }); enterDrawPhase();
  });
  els.btnBackMenu.addEventListener('click', () => {
    if (Net.isHost && document.body.dataset.screen === 'results') {
      // Party game: 'Nuova Pista' should not destroy everyone's room.
      // Start a fresh track in the SAME room, with all friends still connected.
      wheels = {}; keepTrack = false;
      if (champ) startChamp();
      Net.broadcast({ type: 'restartToDraw', champ: champPublic() });
      enterDrawPhase();
    } else location.reload();
  }); function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); } els.code.addEventListener('input', () => els.code.value = els.code.value.toUpperCase());
  document.body.dataset.screen = 'menu'; I18n.init(); applyInvite(); updateRejoinButton(); const lastRoom = readRejoin(); if (lastRoom && !els.code.value) els.code.value = lastRoom.code; if (lastRoom && !els.name.value) els.name.value = lastRoom.name; if (typeof Sfx !== 'undefined') Sfx.init();
})();
