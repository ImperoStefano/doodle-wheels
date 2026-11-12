/* Geometry audit for *full* approach ramps rather than deck centres.
 * This deliberately does not claim to validate Matter.js physical collision.
 */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
const scope=vm.createContext({Math,console});
vm.runInContext(fs.readFileSync(path.join(base,'js/terrain.js'),'utf8'),scope,{filename:'terrain.js'});
const T=vm.runInContext('Terrain',scope);
const kinds={tilt:286,spring:200};
let runs=0,surfaces=0,minDy=Infinity,maxGroundSpan=0,nearbyObjects=0;
for(const world of ['classic','paradise','inferno','atlantis','enchanted','neon'])for(let i=0;i<120;i++){
 const layout=T.generateRandomLayout(i%2?T.LENGTHS.lunga:T.LENGTHS.media,false,null,world);
 T.applyLayout(layout,{world});runs++;
 for(const o of T.INTERACTIVE_OBSTACLES){
  const half=kinds[o.kind];if(!half)continue;surfaces++;
  const groundSamples=[-half,-half*.6,0,half*.6,half].map(dx=>T.height(o.x+dx));
  const span=Math.max(...groundSamples)-Math.min(...groundSamples); maxGroundSpan=Math.max(maxGroundSpan,span);
  assert(span<=47,`Unstable approach slope ${world} ${o.kind} x=${o.x}: ${span}`);
  for(const other of T.DYNAMIC_OBSTACLES){
    const dx=Math.abs(o.x-other.x);minDy=Math.min(minDy,dx);
    if(dx<({tilt:460,spring:390})[o.kind]){nearbyObjects++;throw Error(`${world} ${o.kind} x=${o.x} too close to ${other.kind} x=${other.x}`);}
  }
 }
}
assert(surfaces>100,'Not enough real generated approach ramps to audit');
console.log(JSON.stringify({status:'PASS',realMatterUsed:false,runs,surfaces,maxGroundSpan,maxNominalCollisionFootprint:286,closestDynamicDistance:Number.isFinite(minDy)?minDy:null,violations:nearbyObjects},null,2));
