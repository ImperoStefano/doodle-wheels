/* Deterministic in-memory DataChannel/PeerJS integration simulation.
 * Runs the actual js/peer.js unmodified in two isolated VM contexts.
 */
const vm = require('vm'), fs = require('fs'), assert = require('node:assert/strict');
const js = fs.readFileSync(__dirname+'/../js/peer.js','utf8');
const registry = new Map(); let counter = 0;
class Emitter {
  constructor(){this.events={};}
  on(t,fn){(this.events[t] ||= []).push(fn); return this;}
  emit(t,data){(this.events[t]||[]).forEach(fn=>fn(data));}
}
class FakeConnection extends Emitter {
  constructor(peer){super();this.peer=peer;this.open=true;this.dataChannel={bufferedAmount:0};}
  send(v){if(!this.open)throw Error('closed');const other=this.other; queueMicrotask(()=>{if(other.open)other.emit('data', structuredClone(v));});}
  close(){if(!this.open)return;this.open=false;this.other.open=false;this.emit('close');this.other.emit('close');}
}
class FakePeer extends Emitter {
  constructor(id){super();this.id=id||'guest-'+(++counter); this.destroyed=false;
    if(registry.has(this.id))throw Error('duplicate ID');registry.set(this.id,this);
    queueMicrotask(()=>this.emit('open',this.id)); }
  connect(target){const host=registry.get(target); if(!host)throw Error('no host');
    const caller=new FakeConnection(target),server=new FakeConnection(this.id);
    caller.other=server;server.other=caller;this.latestConnection=caller;
    queueMicrotask(()=>{host.emit('connection',server);queueMicrotask(()=>caller.emit('open'));});
    // host registers the server event handlers before caller opens
    queueMicrotask(()=>queueMicrotask(()=>server.emit('open')));
    return caller;
  }
  destroy(){this.destroyed=true;registry.delete(this.id);}
  reconnect(){}
}
function net(){const ctx=vm.createContext({Peer:FakePeer,Date,setTimeout,clearTimeout,console,I18n:{t:x=>x}, structuredClone}); vm.runInContext(js,ctx);return vm.runInContext('Net',ctx);}
async function wait(n=15){for(let i=0;i<n;i++)await new Promise(r=>setTimeout(r,0));}
(async()=>{
 const host=net();let code;host.on('roomReady',d=>code=d.code);
 const joined=[];host.on('playerJoined',d=>joined.push(d));
 host.hostGame('Host');await wait();assert.equal(code.length,4);
 const tokenA='a'.repeat(40), tokenB='b'.repeat(40);
 const alice=net();let welcomeA=[];alice.on('joined',d=>welcomeA.push(d));alice.joinGame(code,'Alice',tokenA);
 await wait();assert.equal(Object.keys(host.players).length,2);const aid=alice.myId,acolor=host.players[aid].color;
 assert(host.players[aid].connected);assert.equal(joined.length,1);
 host.setPhase('race');
 // This channel loss does not delete the physical racer or free the seat.
 const alicePeer=registry.get([...registry.keys()].find(x=>x===aid));
 assert(alicePeer);
 // The first Alice page closes the channel, just as closing the tab would.
 alicePeer.latestConnection.close(); await wait();
 assert.equal(Object.keys(host.players).length,2,'offline seats must remain reserved');
 assert.equal(host.players[aid].connected,false,'offline status must be visible');
 // Force a new tab using the same resume secret: the host replaces the stale channel.
 const alice2=net(); const ack=[];alice2.on('joined',d=>ack.push(d));alice2.joinGame(code,'Changed name',tokenA);
 await wait();assert.equal(Object.keys(host.players).length,2);
 assert.equal(alice2.myId,aid,'stable logical ID must survive a new PeerJS ID');
 assert.equal(host.players[aid].name,'Alice','name retained');
 assert.equal(host.players[aid].color,acolor);
 assert.equal(ack[0].resumed,true);assert.equal(joined.at(-1).resumed,true);
 const packets=[];alice2.on('data',d=>packets.push(d.data));
 host.sendTo(aid,{type:'integrationPing',value:7});await wait();assert.equal(packets[0].value,7);
 const routed=[];host.on('data',d=>routed.push(d));alice2.send({type:'jump'});await wait();assert.equal(routed.at(-1).from,aid);assert.equal(routed.at(-1).data.type,'jump');
 // New participants must not join while a race is active.
 const bob=net();let errs=[];bob.on('error',e=>errs.push(e.message));bob.joinGame(code,'Bob',tokenB);
 await wait();assert.equal(Object.keys(host.players).length,2);assert(errs.includes('net.raceStarted'));
 // Resume still works while the room is at MAX_PLAYERS after another round.
 host.setPhase('lobby');const more=[];
 for(let i=0;i<3;i++){const n=net();n.joinGame(code,'G'+i,(String(i+3)).repeat(40));more.push(n);}
 await wait();assert.equal(Object.keys(host.players).length,5);
 const other=net();other.on('error',e=>errs.push(e.message));other.joinGame(code,'Six','6'.repeat(40));await wait();assert(errs.includes('err.full'));
 host.setPhase('race');const alice3=net();alice3.joinGame(code,'Alice',tokenA);await wait();assert.equal(alice3.myId,aid);assert.equal(Object.keys(host.players).length,5);
 console.log('REJOIN PEER INTEGRATION: offline seat retention, identity handoff, full-room return, wrong-token rejection and secure jump routing PASSED');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
