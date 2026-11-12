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
  let peer = null;
  let hostConn = null;          // client -> host connection
  let connections = {};         // host only: peerId -> connection
  let isHost = false;
  let myId = null;
  let myName = '';
  let players = {};             // id -> {id, name, color, isHost}
  const recentlyLeft = new Map(); // preserve identity briefly for reconnecting racers
  const listeners = {};

  function on(type, cb) { (listeners[type] ||= []).push(cb); }
  function emit(type, data) { (listeners[type] || []).forEach(cb => cb(data)); }

  function makeCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[Math.floor(Math.random() * letters.length)];
    return c;
  }

  function nextColor() {
    const used = Object.values(players).map(p => p.color);
    return PLAYER_COLORS.find(c => !used.includes(c)) || PLAYER_COLORS[0];
  }

  function hostGame(name, attempt = 0) {
    isHost = true;
    myName = name;
    const code = makeCode();
    peer = new Peer(ROOM_PREFIX + code, { debug: 1, config: ICE_CONFIG });

    // Se il server di segnalazione non risponde entro il timeout, l'utente vedrebbe altrimenti
    // la schermata restare ferma senza alcun messaggio: meglio un errore esplicito e riprovabile.
    const signalTimer = setTimeout(() => {
      emit('error', { message: I18n.t('err.server') });
      peer.destroy();
    }, SIGNAL_TIMEOUT_MS);

    peer.on('open', id => {
      clearTimeout(signalTimer);
      myId = id;
      players = {};
      players[id] = { id, name: myName, color: nextColor(), isHost: true };
      emit('roomReady', { code, players: { ...players } });
    });

    peer.on('connection', conn => {
      conn.on('open', () => {
        if (Object.keys(players).length >= MAX_PLAYERS) {
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 200);
          return;
        }
        connections[conn.peer] = conn;
        conn.on('data', data => handleData(conn.peer, data));
        conn.on('close', () => {
          // An old channel may close after a fresh one was already opened.
          if (connections[conn.peer] !== conn) return;
          delete connections[conn.peer];
          if (players[conn.peer]) recentlyLeft.set(conn.peer, { player: players[conn.peer], at: Date.now() });
          delete players[conn.peer];
          emit('playersChanged', { ...players });
          broadcast({ type: 'players', players });
        });
      });
    });

    peer.on('error', err => {
      clearTimeout(signalTimer);
      if (err.type === 'unavailable-id' && attempt < 5) {
        hostGame(name, attempt + 1);
      } else {
        emit('error', err);
      }
    });

    // Se il server di segnalazione si scollega dopo l'avvio (es. passaggio WiFi -> 4G a metà
    // partita), riprova da solo invece di lasciare l'host irraggiungibile per tutti.
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  }

  function joinGame(code, name) {
    isHost = false;
    myName = name;
    const targetId = ROOM_PREFIX + code.trim().toUpperCase();
    peer = new Peer(undefined, { debug: 1, config: ICE_CONFIG });
    let retryTimer = null, attempts = 0, connectedOnce = false, stopped = false;
    const connect = () => {
      if (stopped || !peer || peer.destroyed) return;
      let conn;
      try { conn = peer.connect(targetId, { reliable: true }); }
      catch (_) { scheduleRetry(); return; }
      hostConn = conn;
      let opened = false;
      const timer = setTimeout(() => {
        if (opened || stopped || hostConn !== conn) return;
        try { conn.close(); } catch (_) {}
        scheduleRetry();
      }, JOIN_TIMEOUT_MS);
      conn.on('open', () => {
        if (stopped || hostConn !== conn) return;
        const resuming = connectedOnce;
        opened = true; connectedOnce = true; attempts = 0;
        clearTimeout(timer); clearTimeout(retryTimer);
        safeSend(conn, { type: 'join', name, resume: resuming });
        if (resuming) emit('reconnected');
      });
      conn.on('data', data => { if (!stopped && hostConn === conn) handleData('host', data); });
      conn.on('close', () => {
        clearTimeout(timer);
        if (stopped || hostConn !== conn) return;
        scheduleRetry();
      });
      conn.on('error', () => {
        clearTimeout(timer);
        if (stopped || hostConn !== conn) return;
        scheduleRetry();
      });
    };
    const scheduleRetry = () => {
      if (stopped || retryTimer) return;
      if (connectedOnce) emit('reconnecting');
      if (++attempts > 5) {
        stopped = true;
        if (connectedOnce) emit('hostLeft');
        else emit('error', { message: I18n.t('err.host') });
        return;
      }
      // Keep the same PeerJS ID: the host can associate the recovering player
      // with its existing bike instead of creating a duplicate racer.
      retryTimer = setTimeout(() => { retryTimer = null; connect(); }, Math.min(6500, 350 * Math.pow(1.7, attempts)));
    };
    const signalTimer = setTimeout(() => {
      if (!peer || peer.destroyed || connectedOnce || stopped) return;
      emit('error', { message: I18n.t('err.server') });
      stopped = true; try { peer.destroy(); } catch (_) {}
    }, SIGNAL_TIMEOUT_MS);
    peer.on('open', id => {
      clearTimeout(signalTimer);
      myId = id;
      connect();
    });
    peer.on('error', err => {
      clearTimeout(signalTimer);
      if (stopped) return;
      // A transient signalling disconnect does not invalidate an open DataChannel.
      if (connectedOnce && err && err.type === 'network') { scheduleRetry(); return; }
      emit('error', err);
    });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  }

  function handleData(fromId, data) {
    if (isHost) {
      if (data.type === 'join') {
        if (!players[fromId] && Object.keys(players).length >= MAX_PLAYERS) {   // due connessioni aperte insieme non possono superare il massimo
          const c = connections[fromId]; if (c) { try { c.send({ type: 'full' }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 200); delete connections[fromId]; }
          return;
        }
        const recent = recentlyLeft.get(fromId);
        const previous = players[fromId] || (recent && Date.now() - recent.at < 45000 ? recent.player : null);
        recentlyLeft.delete(fromId);
        players[fromId] = previous || { id: fromId, name: String(data.name || '???').slice(0, 14), color: nextColor(), isHost: false };
        emit('playersChanged', { ...players });
        broadcast({ type: 'players', players });
      } else {
        emit('data', { from: fromId, data });
      }
    } else {
      if (data.type === 'full') {
        emit('error', { message: I18n.t('err.full', { n: MAX_PLAYERS }) });
      } else if (data.type === 'players') {
        players = data.players;
        emit('playersChanged', { ...players });
      } else {
        emit('data', { from: 'host', data });
      }
    }
  }

  // Snapshots are replaceable: don't build a seconds-long reliable-DataChannel queue
  // for a player on a slow mobile connection. Events (results, wheel updates, jumps)
  // are never discarded. The next snapshot contains the authoritative full state.
  const SNAP_QUEUE_LIMIT = 96 * 1024;
  function safeSend(conn, msg) {
    if (!conn || !conn.open) return false;
    try {
      if (msg.type === 'snap' && conn.dataChannel &&
          conn.dataChannel.bufferedAmount > SNAP_QUEUE_LIMIT) return false;
      conn.send(msg); return true;
    } catch (err) { return false; }
  }
  function broadcast(msg) {
    for (const c of Object.values(connections)) safeSend(c, msg);
  }

  function send(msg) {
    if (isHost) broadcast(msg);
    else safeSend(hostConn, msg);
  }

  return {
    hostGame, joinGame, broadcast, send, on,
    get isHost() { return isHost; },
    get myId() { return myId; },
    get players() { return players; },
  };
})();
