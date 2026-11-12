/* Tests REAL original pose math against the deterministic terrain geometry.
 * Does not stand in for Matter.js collision integration. */
'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('node:assert/strict');
const context=vm.createContext({console,Math});
const base=path.resolve(__dirname,'..');
for(const f of ['terrain.js','obstacles.js'])vm.runInContext(fs.readFileSync(path.join(base,'js',f),'utf8'),context,{filename:f});
const T=vm.runInContext('Terrain',context),D=vm.runInContext('DynamicObstacles',context);
let layouts=0,poses=0,maxAir=0,firstErrors=[];
for(const world of ['classic','paradise','inferno','atlantis','enchanted','neon'])for(let i=0;i<100;i++){
  const keys=T.generateRandomLayout(T.LENGTHS.lunga,false,null,world);
  T.applyLayout(keys,{world});layouts++;
  for(const o of T.DYNAMIC_OBSTACLES){
    if(!['ashdrum','hayroll','bigroller','sunwheel','waterwheel','roller'].includes(o.kind))continue;
    for(const t of [0,110,450,830,1270,2200,3150]){
      const p=D.pose(o,t),g=520-T.height(p.x),delta=p.y+p.radius-g;
      poses++;maxAir=Math.max(maxAir,Math.abs(delta));
      if(Math.abs(delta)>2)firstErrors.push({kind:o.kind,world,x:o.x,t,delta});
    }
  }
}
assert(firstErrors.length===0,`Grounded rollers not aligned: ${JSON.stringify(firstErrors.slice(0,5))}`);
// Body snapshots are in fixed simulation space (GROUND_Y=520); renderer must translate
// them by viewportGroundY-520. Otherwise a 300px mobile viewport appears to float.
const render=fs.readFileSync(path.join(base,'js/obstacles.js'),'utf8');
assert(render.includes('ctx.translate(-camX,gy-GROUND_Y)'),'Missing viewport ground transform');
assert(render.includes('pose(o,elapsedMs,GROUND_Y)'),'Draw must calculate physical pose at Matter ground 520');
const interactive=fs.readFileSync(path.join(base,'js/interactive-obstacles.js'),'utf8');
assert(interactive.includes('pedestal(ctx,o,groundYLocal,T,p)'),'Tilt pedestal disconnected from actual body');
assert(interactive.includes('ground(lx)-4') && interactive.includes('ground(rx)-4'),'Pedestal feet not grounded independently');
console.log(JSON.stringify({status:'PASS',layouts,rollerPoses:poses,maxAbsoluteGroundContactGap:maxAir,viewportTransform:true,seesawFeet:true,realMatterUsed:false},null,2));
