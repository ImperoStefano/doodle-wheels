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
      emit('error', { message: 'Impossibile contattare il server di gioco. Controlla la connessione e riprova.' });
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
          delete connections[conn.peer];
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
    peer = new Peer(undefined, { debug: 1, config: ICE_CONFIG });

    const signalTimer = setTimeout(() => {
      emit('error', { message: 'Impossibile contattare il server di gioco. Controlla la connessione e riprova.' });
      peer.destroy();
    }, SIGNAL_TIMEOUT_MS);

    peer.on('open', id => {
      clearTimeout(signalTimer);
      myId = id;
      hostConn = peer.connect(ROOM_PREFIX + code.trim().toUpperCase(), { reliable: true });

      // Qui è dove un problema di rete tra i due dispositivi si vede davvero: se ICE/TURN non
      // riescono a stabilire il canale, PeerJS non emette alcun evento — senza questo timeout
      // il giocatore resterebbe sulla schermata di attesa all'infinito, senza sapere perché.
      let everOpened = false;
      const joinTimer = setTimeout(() => {
        emit('error', { message: 'Impossibile raggiungere l\'host. Controlla che entrambi siate connessi a internet e riprova (reti molto diverse, es. WiFi e 4G, a volte richiedono qualche secondo in più).' });
        hostConn.close();
      }, JOIN_TIMEOUT_MS);

      hostConn.on('open', () => {
        everOpened = true;
        clearTimeout(joinTimer);
        hostConn.send({ type: 'join', name });
      });
      hostConn.on('data', data => handleData('host', data));
      // Se il canale non si era mai aperto, la chiusura l'ha già spiegata il timeout qui sopra:
      // evitiamo un secondo messaggio ("l'host ha chiuso") fuorviante sopra a quello giusto.
      hostConn.on('close', () => { clearTimeout(joinTimer); if (everOpened) emit('hostLeft'); });
    });

    peer.on('error', err => { clearTimeout(signalTimer); emit('error', err); });
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
  }

  function handleData(fromId, data) {
    if (isHost) {
      if (data.type === 'join') {
        players[fromId] = { id: fromId, name: (data.name || '???').slice(0, 14), color: nextColor(), isHost: false };
        emit('playersChanged', { ...players });
        broadcast({ type: 'players', players });
      } else {
        emit('data', { from: fromId, data });
      }
    } else {
      if (data.type === 'full') {
        emit('error', { message: 'La gara è già piena (5 giocatori).' });
      } else if (data.type === 'players') {
        players = data.players;
        emit('playersChanged', { ...players });
      } else {
        emit('data', { from: 'host', data });
      }
    }
  }

  function broadcast(msg) {
    Object.values(connections).forEach(c => { if (c.open) c.send(msg); });
  }

  function send(msg) {
    if (isHost) broadcast(msg);
    else if (hostConn && hostConn.open) hostConn.send(msg);
  }

  return {
    hostGame, joinGame, broadcast, send, on,
    get isHost() { return isHost; },
    get myId() { return myId; },
    get players() { return players; },
  };
})();
