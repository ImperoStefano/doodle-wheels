/* Node-only deterministic generation audit; DOES NOT replace Matter integration. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const c=vm.createContext({console,Math});vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/terrain.js'),'utf8'),c);
const T=vm.runInContext('Terrain',c);const worlds=['classic','paradise','inferno','atlantis','enchanted','neon'];
const counts={};let checked=0,smoke=0,overlaps=0,segments=0;
for(const world of worlds){
 const h={};for(let i=0;i<180;i++){
  const keys=T.generateRandomLayout(T.LENGTHS.lunga,false,null,world);
  T.applyLayout(keys,{world});
  if(world!=='classic'){assert(T.WORLD_SEGMENT&&T.WORLD_SEGMENT.world===world);segments++;}
  const seen=[];
  for(const o of T.INTERACTIVE_OBSTACLES){
   checked++;h[o.kind]=(h[o.kind]||0)+1;
   if(o.kind==='mist')smoke++;
   if(o.x<1400||o.x>T.FINISH_X-650)overlaps++;
   for(const q of seen)if(Math.abs(q.x-o.x)<590)overlaps++;
   seen.push(o);
  }
 }
 counts[world]=h;
}
assert.equal(smoke,0,'Deprecated sacred smoke still generated');
assert.equal(overlaps,0,'Interactive obstacles in protected areas');
console.log(JSON.stringify({worlds:worlds.length,layouts:worlds.length*180,specialSegments:segments,obstaclesChecked:checked,smoke,overlaps,counts},null,2));
