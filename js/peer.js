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
    peer = new Peer(ROOM_PREFIX + code, { debug: 1 });

    peer.on('open', id => {
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
      if (err.type === 'unavailable-id' && attempt < 5) {
        hostGame(name, attempt + 1);
      } else {
        emit('error', err);
      }
    });
  }

  function joinGame(code, name) {
    isHost = false;
    myName = name;
    peer = new Peer(undefined, { debug: 1 });

    peer.on('open', id => {
      myId = id;
      hostConn = peer.connect(ROOM_PREFIX + code.trim().toUpperCase(), { reliable: true });

      hostConn.on('open', () => {
        hostConn.send({ type: 'join', name });
      });
      hostConn.on('data', data => handleData('host', data));
      hostConn.on('close', () => emit('hostLeft'));
    });

    peer.on('error', err => emit('error', err));
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
