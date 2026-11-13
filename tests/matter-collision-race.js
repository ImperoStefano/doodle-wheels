/* V25 - True Matter.js bicycle/obstacle integration checks.
 * Run locally: npm install --no-save matter-js@0.19.0
 *              node tests/matter-collision-race.js
 * This is NOT a mock of Matter. The file explicitly fails if the real engine is missing.
 */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const assert=require('node:assert/strict');
let Matter;
try { Matter=require('matter-js'); }
catch(e) {console.error('MISSING_REAL_MATTER: install matter-js@0.19.0 before running this test.');process.exit(2);}
const root=path.resolve(__dirname,'..');
const EPOCH=1000/60;
const shapes={
  tonda:Array.from({length:24},(_,i)=>({x:40*Math.cos(i*2*Math.PI/24),y:40*Math.sin(i*2*Math.PI/24)})),
  quadrata:[{x:-31,y:-31},{x:31,y:-31},{x:31,y:31},{x:-31,y:31}],
  irregolare:[{x:39,y:0},{x:28,y:31},{x:1,y:38},{x:-31,y:25},{x:-38,y:-2},{x:-20,y:-37},{x:16,y:-37}]
};
// Use the REAL 80px wheel radius of Draw.getNormalizedVertices(), not test-only 40px wheels.
for(const vertices of Object.values(shapes)){const r=Math.max(...vertices.map(p=>Math.hypot(p.x,p.y))); for(const p of vertices){p.x*=80/r;p.y*=80/r;}}

// IMPORTANTE: i sorgenti vanno eseguiti nello STESSO realm di Matter. Con vm.createContext()
// gli oggetti letterali del gioco hanno un Object.prototype diverso e Common.extend() di Matter
// (che controlla constructor===Object) copia collisionFilter per riferimento: category/mask spariscono,
// canCollide() torna false e le ruote attraversano il terreno (falsi FAIL "anti-stall" in tutti i test).
function loadGame(now){
  const src=['terrain.js','obstacles.js','interactive-obstacles.js','physics.js']
    .map(f=>fs.readFileSync(path.join(root,'js',f),'utf8')).join('\n;\n');
  return new Function('Matter','performance',src+'\n;return {Terrain,Sim};')(Matter,{now});
}
let pass=0,fail=0;const results=[];
function scenario(shape,kind,withJump){
  let clock=0;
  const {Terrain,Sim}=loadGame(()=>clock);
  // Short, identical neutral approach: no flowers, dynamic obstacles, bridges or patches
  // within the challenge. The full bicycle model and normal host physics tick are used.
  Terrain.applyLayout(['hills','ramps'],{world:'classic',season:'classica',nogap:true,nopatch:true});
  const x=840;
  Terrain.FLOWERS.length=0;
  Terrain.DYNAMIC_OBSTACLES.length=0;
  Terrain.INTERACTIVE_OBSTACLES.splice(0,Terrain.INTERACTIVE_OBSTACLES.length,
    ...(kind==='none'?[]:[{id:0,x,kind,biome:'classic',zone:'start'}]));
  Sim.init();
  Sim.addRacer('r',shapes[shape],'#004466','QA racer',0);
  Sim.start();
  let jumped=false,seenSpring=false,angleMax=0, maxX=-Infinity,stall=0,lastX=0,teleports=0;
  for(let k=0;k<2400;k++){
    clock+=EPOCH;
    const before=Sim.snapshot()[0];
    if(withJump&&!jumped&&clock>400&&before.fwX>=x-265){jumped=Sim.jump('r')===true;}
    Sim.tick(EPOCH);
    const racer=Sim.snapshot()[0];
    if(!racer)throw Error('racer disappeared');
    if(!Number.isFinite(racer.x)||!Number.isFinite(racer.fwY)||!Number.isFinite(racer.angle))throw Error('NaN position/angle');
    const obs=Sim.getInteractiveState()[0];
    if(obs && obs[4]===5)seenSpring=true;
    if(obs)angleMax=Math.max(angleMax,Math.abs(obs[3]));
    if(Math.abs(racer.x-lastX)>165 && lastX>100)teleports++;
    lastX=racer.x;
    if(racer.x>maxX+5){stall=0;maxX=racer.x;} else stall++;
    if(racer.x>x+330)break;
  }
  const diag=Sim.diagnostics?.()[0]||{};
  const result={shape,kind,jumped,seenSpring,angleMax:+angleMax.toFixed(3),x:+lastX.toFixed(1),teleports,antiStall:diag.hops||0,antiStallX:diag.lastUnstickX??null,advanced:lastX>x+330};
  assert(result.advanced,`Bike failed to pass ${kind}: ${JSON.stringify(result)}`);
  assert(result.antiStall===0,`Anti-stall rescue required: ${JSON.stringify(result)}`);
  assert(teleports===0,`Unexpected large displacement: ${JSON.stringify(result)}`);
  if(kind==='spring')assert(seenSpring,`No spring collision detected: ${JSON.stringify(result)}`);
  if(withJump)assert(jumped,`Manual jump did not register: ${JSON.stringify(result)}`);
  return result;
}
// Repeated contacts: two differently shaped bicycles must traverse the SAME
// physical spring without shared per-obstacle cooldown blocking the second.
function concurrentSpring(){
  let clock=0;
  const {Terrain:T,Sim:S}=loadGame(()=>clock);
  T.applyLayout(['hills','ramps'],{world:'classic',season:'classica',nogap:true,nopatch:true});
  T.FLOWERS.length=0;T.DYNAMIC_OBSTACLES.length=0;
  T.INTERACTIVE_OBSTACLES.splice(0,T.INTERACTIVE_OBSTACLES.length,{id:0,x:840,kind:'spring',biome:'classic',zone:'start'});
  S.init();S.addRacer('round',shapes.tonda,'#027a71','Round');
  S.addRacer('square',shapes.quadrata,'#a62b5a','Square');
  S.start();const peak={round:Infinity,square:Infinity};let hit=false;let sample=[];
  for(let k=0;k<1900;k++){
    clock+=EPOCH;S.tick(EPOCH);
    const all=S.snapshot(), obs=S.getInteractiveState()[0];
    if(obs&&obs[4]===5)hit=true;
    for(const r of all)if(r.x>700&&r.x<1070)peak[r.id]=Math.min(peak[r.id],r.fwY);
    sample=all;if(all.length===2&&all.every(r=>r.x>1150))break;
  }
  assert(hit,'Spring never triggered during two-bike simultaneous test');
  assert(S.diagnostics().every(d=>d.springHits>0),'Both bikes must receive their OWN spring impulse');
  assert(sample.length===2&&sample.every(r=>r.x>1150),'One of the two bikes was blocked by repeated contact');
  assert(S.diagnostics().every(d=>d.hops===0),'One or more bikes needed anti-stall on the spring');
  return {status:'PASS',case:'two bikes / same spring',observedPeak:peak};
}

for(const shape of Object.keys(shapes))for(const kind of ['none','boulder','tilt','spring']){
  try{const result=scenario(shape,kind,kind==='boulder');results.push({status:'PASS',...result});pass++;}
  catch(e){results.push({status:'FAIL',shape,kind,error:e.message});fail++;}
}
try{results.push(concurrentSpring());pass++;}catch(e){fail++;results.push({status:'FAIL',case:'two bikes / same spring',error:e.message});}
console.log(JSON.stringify({engine:'Matter.js '+Matter.version,passes:pass,failures:fail,results},null,2));
process.exitCode=fail?1:0;
