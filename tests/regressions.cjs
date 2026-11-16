// V36 deterministic smoke/regression tests — run: node tests/regressions.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').join(__dirname,'..');
let applied=0;
const terrain = {takeoffAt: () => ({kind:'jump',lip:100,tier:0,th:.45}), zoneAt:()=>null,
  DYNAMIC_OBSTACLES:[],INTERACTIVE_OBSTACLES:[]};
const Body = {setVelocity(b,v){b.velocity={...v};}};
let source=fs.readFileSync(root+'/js/physics.js','utf8');
source=source.replace('  return {\n    init, addRacer,', '  globalThis.__rampQA = {jumpTry,rampStep,landingStep,assist,driveRacer,applyCalibration,ravineStep};\n  return {\n    init, addRacer,');
assert(source.includes('__rampQA'));
const ctx={Terrain:terrain,Matter:{Body},performance:{now:()=>0},console};
vm.createContext(ctx);vm.runInContext(source,ctx);
const {jumpTry,rampStep,landingStep}=ctx.__rampQA;
// Near the ground, only the wheel's outward velocity should be damped.
// A bike following a slope keeps its tangent speed in either direction.
{
  const {assist}=ctx.__rampQA;
  const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`expected ${a} ≈ ${b}`);
  for(const grade of [-Math.tan(Math.PI/6),0,Math.tan(Math.PI/6)]){
    const scale=Math.hypot(1,grade);
    const tx=1/scale, ty=-grade/scale, nx=-grade/scale, ny=-1/scale;
    for(const forward of [-6,6]) for(const outward of [-2,0,2]){
      const vx=forward*tx+outward*nx, vy=forward*ty+outward*ny;
      const wheel=()=>({position:{x:100},velocity:{x:vx,y:vy},gapNow:2});
      const r={fw:wheel(),rw:wheel()};
      r.rw.gapNow=0;
      assist(r,x=>x*grade);
      const v=r.fw.velocity;
      close(v.x*tx+v.y*ty,forward);
      close(v.x*nx+v.y*ny,outward>0 ? outward*.2 : outward);
    }
  }
  applied++;
}
// A mirror portal reverses travel. A rider stalled below a ravine lip gets
// the gentle recovery in the direction of the race, with fast riders left alone.
{
  const profile={...terrain,height:()=>0,ravineAt:()=>({D:80,a:0,u2:200,rr:150})};
  const pit={Terrain:profile,Matter:{Body},performance:{now:()=>0}};
  vm.createContext(pit);vm.runInContext(source,pit);
  for(const dir of [-1,1])for(const speed of [0,5]){
    const body=()=>({position:{x:150,y:550},velocity:{x:dir*speed,y:0},bounds:{max:{y:600}},gapNow:2});
    const r={fw:body(),rw:body(),chassis:body(),dir,pitAt:100,pitBoostAt:-1e9};
    pit.__rampQA.ravineStep(r,2300);
    const expected=speed===0?3.8:speed;
    assert.equal(r.chassis.velocity.x,dir*expected);
    assert.equal(r.chassis.velocity.y,speed===0?-7.3:0);
  }
  applied++;
}
// The real worker loads physics without a race or Terrain. Neither the trial
// motor nor its surface assist should need the active track.
{
  const body={...Body,getAngularVelocity(){return 0;},setAngularVelocity(w,v){w.spin=v;}};
  const worker={Matter:{Body:body},performance:{now:()=>0}};
  vm.createContext(worker);vm.runInContext(source,worker);
  const {assist,driveRacer}=worker.__rampQA;
  const wheel=()=>({position:{x:100},velocity:{x:6,y:0},gapNow:2});
  const r={fw:wheel(),rw:wheel(),chassis:wheel(),roll:1,cal:[1,1,1,1],secOf:()=>0};
  driveRacer(r,2000,false);assert(r.fw.spin>0);
  assist(r,x=>x*.2);
  applied++;
}
// Multiple riders may draw the same wheel while calibration is pending.
// A result arriving after a redraw belongs only to the matching wheel.
{
  let worker;
  class TestWorker {
    constructor(){worker=this;this.jobs=[];}
    postMessage(job){if(!job.init)this.jobs.push(job);}
  }
  const pool={Worker:TestWorker,URL,navigator:{hardwareConcurrency:2},setTimeout:()=>1,
    clearTimeout(){},document:{baseURI:'https://example.test/',querySelector:()=>({src:'https://example.test/script.js'})}};
  vm.createContext(pool);vm.runInContext(source,pool);
  const apply=pool.__rampQA.applyCalibration;
  const shape=[{x:0,y:8},{x:-8,y:-4},{x:8,y:-4}];
  const other=[{x:8,y:8},{x:8,y:-8},{x:-8,y:-8},{x:-8,y:8}];
  const a={},b={};
  apply(a,shape);apply(b,shape);apply(a,other);
  assert.deepEqual(Array.from(a.cal),[1,1,1,1]);
  assert.deepEqual(Array.from(b.cal),[1,1,1,1]);
  worker.onmessage({data:{ready:true}});
  assert.equal(worker.jobs.length,1);
  worker.onmessage({data:{id:worker.jobs[0].id,cal:[2,2,2,2]}});
  assert.equal(worker.jobs.length,2);
  assert.deepEqual(Array.from(a.cal),[1,1,1,1]);
  assert.deepEqual(Array.from(b.cal),[2,2,2,2]);
  worker.onmessage({data:{id:worker.jobs[1].id,cal:[3,3,3,3]}});
  assert.deepEqual(Array.from(a.cal),[3,3,3,3]);
  applied++;
}
function bike(){const fw={position:{x:96},velocity:{x:6,y:-3},gapNow:60},rw={position:{x:-70},velocity:{x:6,y:-3},gapNow:59};return {
 fw,rw,chassis:{position:{x:0},velocity:{x:6,y:-3}},airJ:1,rampLaunched:true,
 rampTakeoffAt:1000,rampInputUsed:false,rampFly:1,jumpAt:1000,dir:1,sc:1,
 jn:0,ln:0,ls:0,righting:false,
};}
// The tap within 155ms of natural lift-off must be a moderate correction, not
// an explosive full double jump, and it can only happen once.
{
 const r=bike();assert.equal(jumpTry(r,1080),1);assert.equal(r.airJ,2);
 assert.equal(r.rampInputUsed,true);assert(r.fw.velocity.y>=-12.5);assert(r.fw.velocity.y<=-9);
 assert.equal(jumpTry(r,1090),0);assert.equal(r.timedLaunches,1); applied++;
}
// Late ramp assistance is symmetric after a mirror portal reverses travel.
{
 const right=bike(), left=bike();left.dir=-1;
 for(const b of [left.chassis,left.fw,left.rw]) b.velocity.x=-Math.abs(b.velocity.x);
 assert.equal(jumpTry(right,1080),1);assert.equal(jumpTry(left,1080),1);
 for(const key of ['chassis','fw','rw']) {
   assert.equal(left[key].velocity.x,-right[key].velocity.x);
   assert.equal(left[key].velocity.y,right[key].velocity.y);
 }
 applied++;
}
// A genuine later double jump remains allowed if the player did not use the
// late ramp correction.
{
 const r=bike();r.rampLaunched=false;
 assert.equal(jumpTry(r,1250),1);assert.equal(r.airJ,2);
 assert(r.fw.velocity.y < -11 && r.fw.velocity.y > -15);applied++;
}
// V36: manual race-speed jumps must translate into forward travel, not
// near-vertical hops. The horizontal kick is earned by forward momentum.
{
  terrain.takeoffAt=()=>null;
  const slow=bike();slow.airJ=0;slow.rampLaunched=false;slow.rampFly=0;
  for (const b of [slow.fw,slow.rw,slow.chassis]) b.velocity.x=1;
  slow.fw.gapNow=3;slow.rw.gapNow=4;
  assert.equal(jumpTry(slow,2000),1);
  assert.equal(slow.chassis.velocity.x,1,'no speed created for nearly stationary bike');
  assert(slow.chassis.velocity.y < -11 && slow.chassis.velocity.y > -18);
  applied++;
}
{
  terrain.takeoffAt=()=>null;
  const running=bike();running.airJ=0;running.rampLaunched=false;running.rampFly=0;
  running.fw.gapNow=3;running.rw.gapNow=3;
  assert.equal(jumpTry(running,2000),1);
  assert(running.chassis.velocity.x >= 8.0,'forward velocity grows during a running jump');
  assert(running.chassis.velocity.x > Math.abs(running.chassis.velocity.y)*.5,
    'race-speed takeoff has a meaningful horizontal component');
  applied++;
}
// Input near the launch lip adds a longer, flatter trajectory while preserving
// the bounded upward component. It must be better than an ordinary flat jump.
{
  terrain.takeoffAt=()=>({kind:'kicker',lip:140,tier:0,th:.45});
  const timed=bike();timed.airJ=0;timed.rampLaunched=false;timed.rampFly=0;
  timed.fw.gapNow=4;timed.rw.gapNow=5;
  assert.equal(jumpTry(timed,2000),1);
  assert(timed.chassis.velocity.x > 8.8,'correctly timed ramp jump is more forward');
  assert(timed.chassis.velocity.y > -18.5,'vertical boost is bounded when already rising');
  assert.equal(timed.timedLaunches,1);
  timed.fw.gapNow=65;timed.rw.gapNow=63;
  assert.equal(jumpTry(timed,2180),1,'ordinary double jump remains available');
  assert.equal(timed.timedLaunches,1,'a second tap in the same flight adds no point');
  applied++;
}
// The automatic ramp impulse is vectorial (forward AND upward), larger for
// steeper lips and higher earned approach speeds, not scripted relocation.
{
  const launches=[];
  for(const speed of [4.3,7.0]){
    terrain.takeoffAt=()=>({kind:'gapland',lip:100,tier:1,th:.53});
    const r=bike();r.airJ=0;r.rampLaunched=false;r.rampFly=0;r.rfx=95;
    r.fw.position.x=102;r.fw.gapNow=8;r.rw.gapNow=8;
    for(const b of [r.chassis,r.fw,r.rw])b.velocity.x=speed;
    rampStep(r,2000);
    assert.equal(r.rampFly,1);
    assert(r.chassis.velocity.x>speed,'automatic ramp has horizontal thrust');
    launches.push({vx:r.chassis.velocity.x,vy:r.chassis.velocity.y});
  }
  assert(launches[1].vx>launches[0].vx+2);
  assert(launches[1].vy<launches[0].vy,'fast approach produces a longer flight');
  applied++;
}
// A post-lip tap improves the outgoing vector once, without refreshing the
// whole jump in midair and without slowing the shared simulation clock.
{
  terrain.takeoffAt=()=>({kind:'kicker',lip:100,tier:0,th:.4});
  const r=bike();
  const x=r.chassis.velocity.x;
  assert.equal(jumpTry(r,1080),1);
  assert(r.chassis.velocity.x>x,'post-lip tap must also move the bike forward');
  const once=r.chassis.velocity.x;
  assert.equal(jumpTry(r,1090),0);assert.equal(r.chassis.velocity.x,once);
  applied++;
}
// Other directions: manual reverse-mode jumps respect the current travel
// direction; no left/right speed sign errors.
{
  terrain.takeoffAt=()=>null;
  const r=bike();r.airJ=0;r.rampLaunched=false;r.rampFly=0;r.dir=-1;
  r.fw.gapNow=3;r.rw.gapNow=4;
  for(const b of [r.chassis,r.fw,r.rw])b.velocity.x=-5;
  assert.equal(jumpTry(r,2000),1);
  assert(r.chassis.velocity.x<-5);
  applied++;
}
// Reset the shared test stub for subsequent lip-geometry regressions.
terrain.takeoffAt=()=>({kind:'jump',lip:100,tier:0,th:.45});
// A near-stationary irregular wheel crossing a launch lip must not enter the
// 1.5s ramp-flight latch (which disables terrain stabilization).
{
 const r=bike();r.airJ=0;r.rampLaunched=false;r.rampFly=0;r.rfx=95;
 r.fw.position.x=102;r.chassis.velocity.x=1.6;
 r.fw.gapNow=4;r.rw.gapNow=8;
 rampStep(r,2000);assert.equal(r.rampFly,0);applied++;
}
// The ramp latch clears early after landing, so a close second launch is not
// ignored by the first ramp's lockout.
{
 const r=bike();r.rampFly=1;r.rampLaunched=true;r.rfT=8;r.rfx=95;
 r.fw.position.x=102;r.fw.gapNow=4;r.rw.gapNow=5;
 r.airJ=1;
 rampStep(r,2000);
 assert.equal(r.rampFly,1); // new lip re-armed on this same tick
 assert.equal(r.airJ,0); // auto-jump state was reset on real landing
 assert.equal(r.rampLaunched,false);applied++;
}
const ctx2={};vm.createContext(ctx2);vm.runInContext(fs.readFileSync(root+'/js/curse-fx.js','utf8')+'\nglobalThis.__fx=CurseFx;',ctx2);
{
 const fx=ctx2.__fx;
 let lines=0;const c={globalAlpha:1,save(){},restore(){},beginPath(){},moveTo(){},quadraticCurveTo(){},stroke(){lines++;}};
 const r={cu:1,rwX:230,rwY:300,rwAngle:.5,x:210,sc:1};
 fx.draw(c,'player',r,true,0,x=>x,1000);assert.equal(lines,0);
 fx.draw(c,'player',r,false,0,x=>x,1030);assert.equal(lines,12);
 fx.draw(c,'player',r,false,0,x=>x,1040);assert.equal(lines,24);
 fx.draw(c,'player',r,false,0,x=>x,2300);assert.equal(lines,24);
 fx.reset();fx.draw(c,'player',r,false,0,x=>x,2400);assert.equal(lines,24);applied++;
}
// Every supported launch kind must still be detected: no regression from
// simplifying the paired / nested ramps in the new code.
{
 for (const kind of ['kicker','jump','ravine','pipe','gapland','wave']) {
   terrain.takeoffAt=()=>({kind,lip:100,tier:0,th:.45});
   const r=bike();r.airJ=0;r.rampFly=0;r.rampLaunched=false;r.rfx=95;
   r.fw.position.x=102;r.fw.gapNow=8;r.rw.gapNow=8;
   rampStep(r,3000);assert.equal(r.rampFly,1,kind+' must launch');
   assert(r.chassis.velocity.y<0);
   applied++;
 }
}
// An aborted launch where BOTH tyres never leave the ground must re-arm
// quickly; previously it locked all subsequent ramps for up to 1.5 seconds.
{
 const r=bike();r.airJ=0;r.rampLaunched=false;r.rampFly=1;r.rfT=0;
 r.rfx=96;r.fw.gapNow=5;r.rw.gapNow=7;
 for(let i=0;i<6;i++)rampStep(r,3000+i*16.6667);
 assert.equal(r.rampFly,0);assert.equal(r.rampGroundTicks,0);applied++;
}
// One tyre can leave first as the other follows the lip: this is not an
// aborted jump and must not be mistaken for a landing or reset.
{
 const r=bike();r.airJ=0;r.rampLaunched=false;r.rampFly=1;r.rfT=0;
 r.rfx=96;r.fw.gapNow=35;r.rw.gapNow=5;
 for(let i=0;i<12;i++)rampStep(r,3000+i*16.6667);
 assert.equal(r.rampFly,1);assert.equal(r.rampGroundTicks,0);applied++;
}
// A real flight generates one landing event, never repeated events on rough
// ground; flight without sufficient vertical speed remains silent.
{
 const r=bike();r.finished=false;r.landHits=0;r.landPower=0;
 r.fw.gapNow=40;r.rw.gapNow=41;r.fw.velocity.y=7;
 r.rw.velocity.y=6;r.chassis.velocity.y=8;
 for(let i=0;i<5;i++)landingStep(r);
 assert.equal(r.flightArmed,true);
 r.fw.gapNow=4;r.rw.gapNow=17;landingStep(r);
 assert.equal(r.landHits,1);assert(r.landPower>=1&&r.landPower<=3);
 for(let i=0;i<10;i++)landingStep(r);
 assert.equal(r.landHits,1);applied++;
}
{
 const r=bike();r.finished=false;r.landHits=0;r.landPower=0;
 r.fw.gapNow=60;r.rw.gapNow=60;
 for(let i=0;i<5;i++)landingStep(r);
 r.fw.gapNow=3;r.rw.gapNow=5;
 r.fw.velocity.y=.5;r.rw.velocity.y=1;r.chassis.velocity.y=1;
 landingStep(r);assert.equal(r.landHits,0);applied++;
}
// Multiplayer landing counters remain present through snapshot interpolation
// and the corresponding effect must be called during normal rendering.
{
 const game=fs.readFileSync(root+'/js/game.js','utf8');
 assert.equal((game.match(/ld: rb\.ld\|\|0/g)||[]).length,2);
 assert(game.includes('landingFx(id, r);'));applied++;
}
// Ensure all locally referenced scripts are shipped in the zip. CDN dependencies
// are intentionally external, as they are in the original V33.
{
 const html=fs.readFileSync(root+'/index.html','utf8');
 for(const m of html.matchAll(/<script\s+src="([^"]+)"/g)) {
   if(/^https?:/.test(m[1]))continue;
   const rel=m[1].split('?')[0];
   assert(fs.existsSync(require('node:path').join(root,rel)),rel+' missing');
 }
 applied++;
}
// V37 visual boundary and blank-screen safeguards: the summary renderer must
// clip the entire world skin to the terrain, not paint a rectangle into the sky.
{
 const game=fs.readFileSync(root+'/js/game.js','utf8');
 const html=fs.readFileSync(root+'/index.html','utf8');
 const boot=fs.readFileSync(root+'/js/boot-guard.js','utf8');
 assert(game.includes('const isSpecialX = x => !!(spTrace'), 'special biome predicate missing');
 assert(game.includes('s.closePath(); s.clip();'), 'terrain profile clipping removed');
 assert(game.includes('if (isSpecialX(tx)) continue'), 'classic props still overlap special biome');
 assert(game.includes('if (f.x < x0 || f.x > x1 || isSpecialX(f.x)) return'), 'flowers overlap special biome');
 assert(game.includes('const spans = spTrace && a < sw.end && b > sw.start'), 'biome-strip overlap');
 assert(!game.includes('s.fillRect(spTrace.a, 15, spTrace.b - spTrace.a, gB - 15)'), 'legacy rectangular sky wash');
 assert(!game.includes('ctx2d && ctx2d.reset'), 'white-frame clear on draw error');
 assert(game.includes('drawErrorStreak >= 3'), 'race recovery threshold removed');
 assert(html.includes('id="render-failure"') && html.includes('id="boot-failure"'), 'recovery UI missing');
 assert(html.includes('js/boot-guard.js?v=20261114-v37-recovery'), 'boot guard not loaded');
 assert(boot.includes('window.__dwBootReady'), 'boot watchdog removed');
 applied++;
}
// A ramp impulse should preserve relative vertical motion between the axles.
{
  terrain.takeoffAt = () => ({kind:'kicker', lip:100, tier:0, th:.45});
  const r = bike();
  Object.assign(r, {airJ:0, rampFly:0, rampLaunched:false, rfx:95});
  Object.assign(r.fw.position, {x:102});
  r.fw.gapNow = r.rw.gapNow = 5;
  r.fw.velocity.y = -4; r.rw.velocity.y = 1;
  rampStep(r, 3000);
  assert.equal(r.rampFly, 1);
  assert.equal(r.fw.velocity.y - r.rw.velocity.y, -5);
  applied++;
}
// Deliver actual snapshot messages with a duplicate, an older packet and a long gap.
{
  const game = fs.readFileSync(root + '/js/game.js', 'utf8');
  const functions = game.slice(game.indexOf('  const snapBuf ='), game.indexOf('  function setupCanvas'));
  const receive = game.slice(game.indexOf("    if (data.type === 'snap' &&"), game.indexOf("    if (data.type === 'results')"));
  let clock = 100;
  const events = [];
  const client = {Net:{isHost:false,myId:'a'}, performance:{now:()=>clock},
    Terrain:{TRACK_END:10000}, Perf:{on:false}, MAX_PLAYERS:5, raceMeta:{a:{}}, latestRacers:{},
    updateSprintUi(){}, InteractiveObstacles:{receive:n=>events.push(n)},
    DynamicObstacles:{setRemoteStates:n=>events.push(n)}, syncUsed:n=>events.push(n), hazardHostOrigin:null};
  vm.createContext(client);
  vm.runInContext(functions + '\nfunction deliver(data){' + receive + '}', client);
  function send(t,x) {
    const pose = {id:'a',x,y:0,angle:0,fwX:x+10,fwY:0,fwAngle:0,rwX:x-10,rwY:0,rwAngle:0,vx:6};
    client.deliver({type:'snap',racers:[pose],ts:t,ht:t,io:t,obs:t,pu:t});
  }
  send(100,0); clock=150; send(150,10); send(100,0); send(150,10);
  assert.deepEqual(events,[100,100,100,150,150,150]);
  client.interpolateRacers(500); const held = client.latestRacers.a.x;
  client.interpolateRacers(900); assert.equal(client.latestRacers.a.x,held);
  assert(held>10);
  applied++;
}
// Route stamps are personal, use the final layout, and survive a repeat visit.
{
  const files = ['terrain', 'stamps'].map(name => fs.readFileSync(root + '/js/' + name + '.js', 'utf8'));
  const {Terrain, RouteStamps} = Function(files.join('\n') + ';return {Terrain, RouteStamps}')();
  const layout = ['hills','water','ramps','water','hills','water','ramps','hills','ice','hills','water'];
  for (const world of ['classic','neon','paradise','inferno','atlantis','egypt','enchanted']) {
    Terrain.applyLayout(layout,{ world });
    const stamps = RouteStamps.route();
    assert(stamps.length > 0 && stamps.length <= 3);
    let mask = 0;
    for (const item of stamps) {
      const front = {x:item.x+80, y:500-item.height}, rear = {x:item.x-80,y:front.y};
      assert.equal(RouteStamps.collect(0,{x:front.x,y:front.y-150},{x:rear.x,y:rear.y-150},500),0);
      mask = RouteStamps.collect(mask,front,rear,500);
      assert(mask & item.bit);
      assert.equal(RouteStamps.collect(mask,front,rear,500),mask);
    }
    assert.equal(RouteStamps.count(mask),stamps.length);
    Terrain.applyLayout(layout,{ world });
    assert.deepEqual(RouteStamps.route(),stamps);
  }
  applied++;
}
// All players get the same UTC course without consuming global randomness.
{
  const T = Function(fs.readFileSync(root + '/js/terrain.js','utf8') + ';return Terrain')();
  const seenWorlds = new Set(), courses = new Set();
  for (let day = 21000; day < 21028; day++) {
    const first = T.dailyCourse(day);
    T.generateRandomLayout(11);
    assert.deepEqual(T.dailyCourse(day), first);
    assert.equal(first.layout.length,T.LENGTHS.corta);
    T.applyLayout(first.layout,{world:first.world});
    if (first.world !== 'classic') assert.equal(T.WORLD_SEGMENT.world,first.world);
    seenWorlds.add(first.world); courses.add(first.layout.join(','));
  }
  assert.equal(seenWorlds.size,7); assert(courses.size >= 20); applied++;
}
// Air rings only reward a bike in flight, once per rider, including during sprint.
{
  const source = fs.readFileSync(root+'/js/physics.js','utf8').replace('  return {\n    init, addRacer,',
    '  return {airRingStep,sprintStep,\n    init, addRacer,');
  const sim = Function('Matter','Terrain',source+';return Sim')({}, {AIR_RINGS:[{bit:1,x:300,height:175}]});
  function rider() {
    return {chassis:{position:{x:300,y:sim.GROUND_Y-175}},ringMask:0,ringHits:0,
      spOn:false,spCharge:.3,ringCredit:0,fw:{gapNow:0},rw:{gapNow:50}};
  }
  const r=rider(); sim.airRingStep(r); assert.equal(r.ringHits,0);
  r.fw.gapNow=50; sim.airRingStep(r); sim.airRingStep(r);
  assert.equal(r.ringHits,1); assert.equal(r.spCharge,.5);
  const active=rider(); active.fw.gapNow=50; active.spOn=true; active.spT=8;
  sim.airRingStep(active); sim.sprintStep(active); assert.equal(active.spCharge,.2);
  applied++;
}
// Water must act on immersed wheels. The same channel can be crossed in flight,
// partly in the water or on a bridge, in either direction.
{
  const src=fs.readFileSync(root+'/js/physics.js','utf8').replace('  return {\n    init, addRacer,',
    '  return {wheelImmersion,worldEffectStep,\n    init, addRacer,');
  const channel={WORLD:'atlantis', AIR_RINGS:[], TIDAL_CURRENTS:[{x:10,width:100,phase:0,burst:1,period:2,push:1}],
    BUBBLE_VENTS:[], waterLevel:x=>x<100?0:-Infinity, isWater:x=>x<40};
  const sim=Function('Matter','Terrain',src+';return Sim')({Body},channel);
  const wheel=(x,depth)=>({position:{x},vertices:[{x,y:sim.GROUND_Y+depth}],velocity:{x:2,y:0}});
  assert.equal(sim.wheelImmersion(wheel(10,-40)),0);
  assert.equal(sim.wheelImmersion(wheel(50,30)),0); // bridge
  assert.equal(sim.wheelImmersion(wheel(200,30)),0); // dry land
  assert.equal(sim.wheelImmersion(wheel(10,12)),.5);
  assert.equal(sim.wheelImmersion(wheel(10,30)),1);
  const r={chassis:wheel(10,-40),fw:wheel(10,-40),rw:wheel(10,-40)};
  sim.worldEffectStep(r,0,0); assert.equal(r.chassis.velocity.x,2);
  sim.worldEffectStep(r,0,.5); assert.equal(r.chassis.velocity.x,2.5);
  r.chassis.velocity.x=11;
  sim.worldEffectStep(r,0,1); assert.equal(r.chassis.velocity.x,11);
  applied++;
}
console.log('OK '+applied+' regression tests: ramps, jumps, landings, water, assets, special-world summary, white-screen recovery');
