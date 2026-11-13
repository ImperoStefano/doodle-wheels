/*
 * Net — thin wrapper around PeerJS.
 * The HOST is authoritative: it runs the physics simulation and relays
 * state to everyone else. Clients only ever talk to the host (star
 * topology), never to each other directly. This keeps a 5-player race
 * simple and avoids peer-to-peer mesh headaches.
 */
const PLAYER_COLORS = ['#e8462a', '#2b5fde', '#ffd23f', '#39a845', '#8e44c7'];
const MAX_PLAYERS = 5;
const ROOM_PREFIX = 'doodlewheels-';

// Config ICE esplicita: senza questa, PeerJS usa comunque un suo TURN gratuito di default,
// ma è condiviso da chiunque usi la libreria nel mondo ed è spesso lento o non disponibile.
// Averlo qui esplicito + un secondo TURN indipendente come riserva rende affidabile la
// connessione tra reti diverse (es. un giocatore in WiFi e uno in 4G/5G), dove il solo STUN
// spesso non basta a superare il NAT delle reti cellulari.
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
    // Secondo TURN pubblico indipendente (Open Relay Project), come ulteriore tentativo se il
    // primo è occupato o irraggiungibile. Non posso verificare da qui se sia ancora attivo in
    // questo momento (in passato ha richiesto una chiave gratuita su metered.ca) — non costa
    // nulla tenerlo: ICE lo scarta da solo se non risponde e usa gli altri.
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    // Per una riserva sicuramente funzionante e tua, registrati gratis (20GB/mese) su
    // https://www.metered.ca/tools/openrelay/ e aggiungi qui le tue credenziali dinamiche.
  ],
};

const SIGNAL_TIMEOUT_MS = 12000;  // connessione al server di segnalazione di PeerJS
const JOIN_TIMEOUT_MS = 18000;    // trattativa P2P (ICE/TURN) verso l'host

const Net = (() => {
  let peer = null, hostConn = null, isHost = false, myId = null, myName = '';
  let players = {}, phase = 'lobby', roomCode = '';
  const connections = Object.create(null);  // transport PeerJS ID -> DataConnection
  const playerConnections = Object.create(null); // stable game player ID -> DataConnection
  const peerToPlayer = Object.create(null);  // transport ID -> stable game ID
  const tokenToPlayer = new Map();            // never broadcast authentication tokens
  const playerTokens = new Map();
  const listeners = Object.create(null);
  const REJOIN_GRACE_MS = 5 * 60 * 1000;
  const SNAP_QUEUE_LIMIT = 96 * 1024;

  function on(type, cb) { (listeners[type] ||= []).push(cb); }
  function emit(type, data) { (listeners[type] || []).forEach(cb => cb(data)); }
  function setPhase(v) { if (['lobby','draw','race','results'].includes(v)) phase = v; }
  function makeCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c = ''; for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    return c;
  }
  function nextColor() {
    const used = Object.values(players).map(p => p.color);
    return PLAYER_COLORS.find(c => !used.includes(c)) || PLAYER_COLORS[0];
  }
  function safeSend(conn, msg) {
    if (!conn || !conn.open) return false;
    try {
      if (msg.type === 'snap' && conn.dataChannel && conn.dataChannel.bufferedAmount > SNAP_QUEUE_LIMIT) return false;
      conn.send(msg); return true;
    } catch (_) { return false; }
  }
  function broadcast(msg) { for (const c of Object.values(playerConnections)) safeSend(c, msg); }
  function sendTo(id, msg) { return safeSend(playerConnections[id], msg); }
  function send(msg) { if (isHost) broadcast(msg); else safeSend(hostConn, msg); }
  function broadcastPlayers() { emit('playersChanged', { ...players }); broadcast({ type: 'players', players }); }

  function removeExpired(id) {
    const p = players[id];
    if (!p || p.connected || p.isHost) return;
    if (phase === 'race') { setTimeout(() => removeExpired(id), 60000); return; }
    if (Date.now() - p.offlineAt < REJOIN_GRACE_MS) {
      setTimeout(() => removeExpired(id), REJOIN_GRACE_MS - (Date.now() - p.offlineAt) + 1000); return;
    }
    delete players[id];
    const token = playerTokens.get(id);
    if (token) tokenToPlayer.delete(token);
    playerTokens.delete(id);
    broadcastPlayers();
    emit('playerExpired', { id });
  }

  function hostGame(name, attempt = 0) {
    isHost = true; myName = name;
    const code = makeCode(); roomCode = code;
    peer = new Peer(ROOM_PREFIX + code, { debug: 1, config: ICE_CONFIG });
    const currentPeer = peer;
    const timer = setTimeout(() => {
      if (peer !== currentPeer) return;
      emit('error', { message: I18n.t('err.server') }); currentPeer.destroy();
    }, SIGNAL_TIMEOUT_MS);
    peer.on('open', id => {
      clearTimeout(timer); if (peer !== currentPeer) return;
      myId = id; players = {};
      players[id] = { id, name: myName, color: nextColor(), isHost: true, connected: true };
      emit('roomReady', { code, players: { ...players } });
    });
    peer.on('connection', conn => {
      // Do not reject a full room until we read the rejoin token: a returning player
      // must be able to occupy their reserved slot even when there are five racers.
      connections[conn.peer] = conn;
      conn.on('data', data => {
        if (connections[conn.peer] !== conn) return;
        if (data && data.type === 'join') {
          const existing = peerToPlayer[conn.peer];
          if (existing && playerConnections[existing] === conn) {
            safeSend(conn, { type: 'welcome', id: existing, code, resumed: true });
            safeSend(conn, { type: 'players', players });
            emit('playerJoined', { id: existing, resumed: true });
            return;
          }
          const token = typeof data.token === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(data.token) ? data.token : '';
          let id = token && tokenToPlayer.get(token);
          if (id && !players[id]) { tokenToPlayer.delete(token); id = null; }
          if (!id && players[conn.peer] && !playerTokens.has(conn.peer)) id = conn.peer;
          if (!id) {
            if (['draw','race'].includes(phase) || Object.keys(players).length >= MAX_PLAYERS) {
              safeSend(conn, { type: ['draw','race'].includes(phase) ? 'raceStarted' : 'full' });
              setTimeout(() => { try { conn.close(); } catch (_) {} }, 250);
              return;
            }
            id = conn.peer;
            players[id] = { id, name: String(data.name || '???').slice(0, 14), color: nextColor(), isHost: false, connected: true };
            if (token) { tokenToPlayer.set(token, id); playerTokens.set(id, token); }
          }
          // A second tab using the same device token takes over the existing seat.
          // Never delete the racer or change its stable ID in the physics simulation.
          const former = playerConnections[id];
          if (former && former !== conn) {
            safeSend(former, { type: 'superseded' });
            delete peerToPlayer[former.peer];
            if (connections[former.peer] === former) delete connections[former.peer];
            setTimeout(() => { try { former.close(); } catch (_) {} }, 200);
          }
          peerToPlayer[conn.peer] = id;
          playerConnections[id] = conn;
          players[id].connected = true;
          delete players[id].offlineAt;
          const resumed = id !== conn.peer || !!data.resume;
          safeSend(conn, { type: 'welcome', id, code, resumed });
          safeSend(conn, { type: 'players', players });
          broadcastPlayers();
          emit('playerJoined', { id, resumed });
        } else {
          const id = peerToPlayer[conn.peer];
          if (id && playerConnections[id] === conn && data && typeof data.type === 'string') emit('data', { from: id, data });
        }
      });
      const closed = () => {
        if (connections[conn.peer] !== conn) return;
        delete connections[conn.peer];
        const id = peerToPlayer[conn.peer]; delete peerToPlayer[conn.peer];
        if (!id || playerConnections[id] !== conn) return;
        delete playerConnections[id];
        if (players[id]) {
          players[id].connected = false; players[id].offlineAt = Date.now();
          broadcastPlayers(); emit('playerDisconnected', { id });
          setTimeout(() => removeExpired(id), REJOIN_GRACE_MS + 1000);
        }
      };
      conn.on('close', closed);
      conn.on('error', closed);
    });
    peer.on('error', err => {
      clearTimeout(timer);
      if (err.type === 'unavailable-id' && attempt < 5) {
        try { currentPeer.destroy(); } catch (_) {}
        hostGame(name, attempt + 1);
      } else emit('error', err);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) { try { peer.reconnect(); } catch (_) {} } });
  }

  function joinGame(code, name, resumeToken = '') {
    isHost = false; myName = name; roomCode = code.trim().toUpperCase();
    const targetId = ROOM_PREFIX + roomCode;
    peer = new Peer(undefined, { debug: 1, config: ICE_CONFIG });
    let retryTimer = null, attempts = 0, connectedOnce = false, stopped = false;
    function scheduleRetry() {
      if (stopped || retryTimer) return;
      if (connectedOnce) emit('reconnecting');
      if (++attempts > (connectedOnce ? 60 : 8)) {
        stopped = true;
        try { peer.destroy(); } catch (_) {}
        if (connectedOnce) emit('hostLeft');
        else emit('error', { message: I18n.t('err.host') });
        return;
      }
      retryTimer = setTimeout(() => { retryTimer = null; connect(); }, Math.min(5000, 500 * Math.pow(1.35, Math.min(attempts, 10))));
    }
    function connect() {
      if (stopped || !peer || peer.destroyed) return;
      let conn;
      try { conn = peer.connect(targetId, { reliable: true }); } catch (_) { scheduleRetry(); return; }
      hostConn = conn;
      let opened = false;
      const timeout = setTimeout(() => {
        if (stopped || hostConn !== conn || opened) return;
        try { conn.close(); } catch (_) {}
        scheduleRetry();
      }, JOIN_TIMEOUT_MS);
      conn.on('open', () => {
        if (stopped || hostConn !== conn) return;
        opened = true; clearTimeout(timeout); clearTimeout(retryTimer);
        attempts = 0;
        safeSend(conn, { type: 'join', name, token: resumeToken, resume: connectedOnce });
      });
      conn.on('data', data => {
        if (stopped || hostConn !== conn || !data) return;
        if (data.type === 'welcome') {
          const wasConnected = connectedOnce;
          myId = data.id; connectedOnce = true;
          if (wasConnected || data.resumed) emit('reconnected');
          emit('joined', { resumed: !!data.resumed, code: data.code, id: myId });
        } else if (data.type === 'superseded') {
          stopped = true; clearTimeout(timeout); clearTimeout(retryTimer);
          emit('sessionMoved');
          try { conn.close(); } catch (_) {}
        } else if (data.type === 'full' || data.type === 'raceStarted') {
          stopped = true; clearTimeout(timeout); clearTimeout(retryTimer);
          emit('error', { message: data.type === 'full' ? I18n.t('err.full', { n: MAX_PLAYERS }) : I18n.t('net.raceStarted') });
          try { conn.close(); } catch (_) {}
        } else if (data.type === 'players') {
          players = data.players;
          emit('playersChanged', { ...players });
        } else emit('data', { from: 'host', data });
      });
      const lost = () => {
        clearTimeout(timeout);
        if (stopped || hostConn !== conn) return;
        scheduleRetry();
      };
      conn.on('close', lost); conn.on('error', lost);
    }
    const signalTimer = setTimeout(() => {
      if (!peer || peer.destroyed || connectedOnce || stopped) return;
      emit('error', { message: I18n.t('err.server') });
      stopped = true; try { peer.destroy(); } catch (_) {}
    }, SIGNAL_TIMEOUT_MS);
    peer.on('open', id => { clearTimeout(signalTimer); myId = id; connect(); });
    peer.on('error', err => {
      clearTimeout(signalTimer);
      if (stopped) return;
      if (connectedOnce && err && err.type === 'network') { scheduleRetry(); return; }
      emit('error', err);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) { try { peer.reconnect(); } catch (_) {} } });
  }

  return {
    hostGame, joinGame, broadcast, send, sendTo, on, setPhase,
    get isHost() { return isHost; },
    get myId() { return myId; },
    get players() { return players; },
    get roomCode() { return roomCode; },
  };
})();
