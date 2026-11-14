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
source=source.replace('  return {\n    init, addRacer,', '  globalThis.__rampQA = {jumpTry,rampStep,landingStep};\n  return {\n    init, addRacer,');
assert(source.includes('__rampQA'));
const ctx={Terrain:terrain,Matter:{Body},performance:{now:()=>0},console};
vm.createContext(ctx);vm.runInContext(source,ctx);
const {jumpTry,rampStep,landingStep}=ctx.__rampQA;
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
 assert.equal(jumpTry(r,1090),0); applied++;
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
console.log('OK '+applied+' regression tests: ramps, jumps, landings, assets, special-world summary, white-screen recovery');
