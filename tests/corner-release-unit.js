/* Test the exact V25.9 corner-release functions with fake Bodies; physics engine
 * integration is NOT claimed here. True Matter.js test: test-incastri.html. */
'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../js/physics.js'),'utf8');
const start=code.indexOf('  function stallContext('),end=code.indexOf('  function unstick(r) {',start);
assert(start>0&&end>start,'Production functions not found');
const Terrain={
  WORLD_SEGMENT:null,INTERACTIVE_OBSTACLES:[],DYNAMIC_OBSTACLES:[],
  zoneAt:()=>({key:'hills'}),patchAt:()=>({kind:'rack'}),
  isWater:()=>false,isLava:()=>false,onRamp:()=>false,ravineAt:()=>null,bridgeAt:()=>null,
};
const Matter={Body:{setVelocity(b,v){b.velocity={...v};}}};
const compile=new Function('Matter','Terrain',`const CORNER_RELEASE_MS=1350, CORNER_RELEASE_COOLDOWN_MS=1350, CORNER_RELEASE_VX=3.6, CORNER_RELEASE_VY=-3.8;${code.slice(start,end)};return {releaseCorner,stallContext}`);
const {releaseCorner}=compile(Matter,Terrain);
function mkR(spike=.5){
  const b=(x)=>({position:{x,y:350},velocity:{x:.1,y:.3}});
  return {chassis:b(600),fw:b(690),rw:b(510),dir:1,spike,progressAt:400,
    releaseAt:-1e9,releaseTriedFor:-1,stallEvents:[],fw:{...b(690),gapNow:1},rw:{...b(510),gapNow:1},
    airJ:0,rampFly:0,righting:false,finished:false};
}
let r=mkR();const oldPositions=[r.chassis.position.x,r.fw.position.x,r.rw.position.x];
assert.equal(releaseCorner(r,1800),true,'Spike near ground should get continuous release');
assert.equal(r.cornerReleases,1);assert.equal(r.stallEvents.length,1);
assert.equal(r.stallEvents[0].patch,'rack');
assert.equal(r.chassis.velocity.x,3.6);assert.equal(r.chassis.velocity.y,-3.8);
assert.deepEqual([r.chassis.position.x,r.fw.position.x,r.rw.position.x],oldPositions,'No teleport');
assert.equal(releaseCorner(r,2000),false,'Same slowdown may only get one release');
r=mkR(0.03);assert.equal(releaseCorner(r,1800),false,'Round wheel unchanged');
r=mkR();Terrain.INTERACTIVE_OBSTACLES=[{x:710}];assert.equal(releaseCorner(r,1800),false,'Do not push through obstacles');Terrain.INTERACTIVE_OBSTACLES=[];
r=mkR();r.fw.gapNow=100;r.rw.gapNow=100;assert.equal(releaseCorner(r,1800),false,'No airborne release');
r=mkR();r.chassis.velocity.x=3;assert.equal(releaseCorner(r,1800),false,'Normal motion unchanged');
r=mkR();r.dir=-1;assert.equal(releaseCorner(r,1800),false,'Reverse portals unchanged');
r=mkR();r.airJ=1;assert.equal(releaseCorner(r,1800),false,'Player jumps unchanged');
r=mkR();r.chassis.position.x=600;Terrain.isLava=()=>true;assert.equal(releaseCorner(r,1800),false,'Lava unchanged');Terrain.isLava=()=>false;
console.log('9/9 unit checks passed. This is not a Matter.js full-race test.');
