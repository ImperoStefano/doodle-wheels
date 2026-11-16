const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/peer.js'), 'utf8');

function session() {
  let peer, next = 0;
  const timers = new Map();
  class Peer extends EventEmitter {
    constructor() { super(); peer = this; this.calls = []; }
    connect(id) {
      const channel = Object.assign(new EventEmitter(), {peer:id, open:false, send() {}, close() {}});
      this.calls.push(channel);
      return channel;
    }
    reconnect() {}
  }
  const net = vm.runInNewContext(source + '\nNet', {
    Peer, I18n:{t:key=>key},
    setTimeout(fn, ms) { timers.set(++next, {fn, ms}); return next; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {net, get peer() { return peer; }, timers};
}

test('host keeps the race and its guest when signalling reopens', () => {
  const s = session();
  let rooms = 0;
  s.net.on('roomReady', () => rooms++);
  s.net.hostGame('Anna');
  s.peer.emit('open', 'host');
  const channel = Object.assign(new EventEmitter(), {peer:'guest', open:true, send() {}});
  s.peer.emit('connection', channel);
  channel.emit('data', {type:'join', name:'Luca', token:'abcdef0123456789'});
  s.net.setPhase('race');
  s.peer.emit('disconnected');
  s.peer.emit('open', 'host');
  assert.equal(rooms, 1);
  assert.deepEqual(Object.keys(s.net.players), ['host','guest']);
  assert.ok(s.net.players.guest.connected);
});

test('guest keeps its stable seat and live channel when only signalling drops', () => {
  const s = session();
  s.net.joinGame('ABCD', 'Luca', 'abcdef0123456789');
  s.peer.emit('open','new-transport-id');
  const channel = s.peer.calls[0]; channel.open = true; channel.emit('open');
  channel.emit('data',{type:'welcome', id:'reserved-seat', resumed:true});
  s.peer.emit('error',{type:'network'});
  s.peer.emit('disconnected');
  s.peer.emit('open','new-transport-id');
  assert.equal(s.net.myId,'reserved-seat');
  assert.equal(s.peer.calls.length,1);
  assert.equal(s.timers.size,0);
});

test('a lost data channel reconnects once even if signalling returns during its backoff', () => {
  const s = session();
  s.net.joinGame('ABCD','Luca','abcdef0123456789');
  s.peer.emit('open','transport');
  const conn = s.peer.calls[0]; conn.open = true; conn.emit('open');
  conn.emit('data',{type:'welcome', id:'seat'});
  conn.open = false; conn.emit('close');
  assert.equal(s.timers.size,1);
  s.peer.emit('open','transport');
  const replacement = s.peer.calls[1];
  assert.ok(replacement);
  replacement.open = true; replacement.emit('open');
  replacement.emit('data',{type:'welcome', id:'seat', resumed:true});
  conn.emit('error',new Error('late event from old channel'));
  assert.equal(s.timers.size,0);
  assert.equal(s.net.myId,'seat');
  replacement.open = false; replacement.emit('close');
  assert.equal(s.timers.size,1);
});

test('host and guest exchange race updates before and after rejoining with a new transport ID', async () => {
  const host = session();
  host.net.hostGame('Anna');
  host.peer.emit('open','host');
  function connectGuest(transportId) {
    const guest = session();
    guest.net.joinGame('ABCD','Luca','abcdef0123456789');
    guest.peer.emit('open',transportId);
    const outgoing = guest.peer.calls[0];
    const incoming = Object.assign(new EventEmitter(), {peer:transportId, open:true});
    outgoing.open = true;
    incoming.send = msg => queueMicrotask(() => outgoing.emit('data', structuredClone(msg)));
    outgoing.send = msg => queueMicrotask(() => incoming.emit('data', structuredClone(msg)));
    incoming.close = outgoing.close = () => {
      if (!incoming.open) return;
      incoming.open = outgoing.open = false;
      incoming.emit('close'); outgoing.emit('close');
    };
    host.peer.emit('connection', incoming);
    outgoing.emit('open');
    return {guest, incoming};
  }

  const tick = () => new Promise(resolve => setImmediate(resolve));
  const first = connectGuest('guest-original');
  await tick();
  host.net.setPhase('race');
  assert.equal(first.guest.net.myId,'guest-original');
  let input;
  host.net.on('data', message => { input = message; });
  first.guest.net.send({type:'jump'});
  await tick();
  assert.equal(input.from,'guest-original');
  assert.equal(input.data.type,'jump');
  host.peer.emit('disconnected'); host.peer.emit('open','host');
  first.incoming.close();
  assert.equal(host.net.players['guest-original'].connected,false);

  const {guest} = connectGuest('guest-after-reload');
  await tick();
  assert.equal(guest.net.myId,'guest-original');
  assert.equal(host.net.players['guest-original'].connected,true);
  assert.deepEqual(Object.keys(host.net.players),['host','guest-original']);
  let snapshot;
  guest.net.on('data', event => { snapshot = event.data; });
  host.net.broadcast({type:'snap',elapsed:3000,racers:[{id:'guest-original',x:280}]});
  await tick();
  assert.equal(snapshot.elapsed,3000);
  assert.equal(snapshot.racers[0].id,guest.net.myId);
  assert.equal(snapshot.racers[0].x,280);
});
