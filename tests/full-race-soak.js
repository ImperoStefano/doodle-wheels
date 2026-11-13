/* V25.8 - Gara completa con Matter.js REALE: piste generate come in gioco, 4 forme di ruota insieme,
 * tutti i mondi. FAIL se una bici non finisce; gli anti-stall (hops) sono riportati come metrica per forma, non come errore.
 * Uso: npm install --no-save matter-js@0.19.0 poly-decomp@0.3.0 && node tests/full-race-soak.js [piste_per_mondo=3] [corta|media|lunga]
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
let Matter;try{Matter=require('matter-js');}catch(e){console.error('MISSING_REAL_MATTER');process.exit(2);}
try{Matter.Common.setDecomp(require('poly-decomp'));}catch(e){}
const root=path.resolve(__dirname,'..'),EPOCH=1000/60;
const perWorld=+process.argv[2]||3,len=process.argv[3]||'corta';
function loadGame(now){
  const src=['terrain.js','obstacles.js','interactive-obstacles.js','physics.js'].map(f=>fs.readFileSync(path.join(root,'js',f),'utf8')).join('\n;\n');
  return new Function('Matter','performance',src+'\n;return {Terrain,Sim};')(Matter,{now});
}
const ngon=(n,rot=0)=>Array.from({length:n},(_,i)=>({x:80*Math.cos(rot+i*2*Math.PI/n),y:80*Math.sin(rot+i*2*Math.PI/n)}));
const star=Array.from({length:10},(_,i)=>{const r=i%2?38:80,a=-Math.PI/2+i*Math.PI/5;return{x:r*Math.cos(a),y:r*Math.sin(a)};});
const shapes={tonda:ngon(24),quadrata:ngon(4,Math.PI/4),triangolo:ngon(3,-Math.PI/2),stella:star};
const worlds=['classic','paradise','inferno','atlantis','enchanted','neon'];
const rows=[];let bad=0;
for(const world of worlds)for(let n=0;n<perWorld;n++){
  let clock=0;const {Terrain:T,Sim:S}=loadGame(()=>clock);
  const layout=T.generateRandomLayout(T.LENGTHS[len]||T.LENGTHS.corta,false,null,world);
  T.applyLayout(layout,{world});
  S.init();Object.entries(shapes).forEach(([id,v],i)=>S.addRacer(id,v,'#036',id,i));S.start();
  let ticks=0,lastX={},jumps=0;
  for(;ticks<60*240;ticks++){
    clock+=EPOCH;S.tick(EPOCH);
    for(const r of S.snapshot()){if(!Number.isFinite(r.x)||!Number.isFinite(r.y))throw Error('NaN '+r.id);
      if(lastX[r.id]!==undefined&&Math.abs(r.x-lastX[r.id])>200)jumps++;lastX[r.id]=r.x;}
    if(S.allFinished()||S.isTimedOut())break;
  }
  const snap=S.snapshot(),dg=S.diagnostics();
  for(const r of snap){const d=dg.find(x=>x.id===r.id);
    const row={world,run:n,shape:r.id,finished:!!r.finished,t:r.finished?Math.round(r.finishTime/1000):null,x:Math.round(r.x),hops:d.hops,rampRescues:d.rampRescues};
    row.flag=!row.finished?'NON FINISCE':'';if(row.flag)bad++;rows.push(row);}
}
console.table(rows.filter(r=>r.flag));
const byShape={};for(const r of rows){const s=byShape[r.shape]??={n:0,fin:0,hops:0,t:0};s.n++;s.fin+=r.finished;s.hops+=r.hops;s.t+=r.t||0;}
for(const s of Object.values(byShape))s.avgT=+(s.t/Math.max(1,s.fin)).toFixed(1);
console.log('Per forma:');console.table(byShape);
console.log(`${rows.length} bici-gare, ${bad} con problemi`);
process.exitCode=bad?1:0;
