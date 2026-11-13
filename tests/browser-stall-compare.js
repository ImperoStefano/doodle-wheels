/* V25.9 reproducible head-to-head: TRUE Matter.js 0.19.0, no fake physics. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const epoch = 1000/60;
  let running = false, abort = false, report = null;
  const worlds = ['classic','paradise','inferno','atlantis','enchanted','neon'];
  const layouts = [
    ['hills','gravel','ramps','ice','water','lava','gravel'],
    ['ramps','water','hills','gravel','ice','lava','ramps']
  ];
  const ngon = (n,rot=0) => Array.from({length:n},(_,i)=>({x:80*Math.cos(rot+i*2*Math.PI/n),y:80*Math.sin(rot+i*2*Math.PI/n)}));
  const star = Array.from({length:10},(_,i)=> {const r=i%2?38:80, a=-Math.PI/2+i*Math.PI/5;return {x:r*Math.cos(a),y:r*Math.sin(a)};});
  const shapes = {tonda:ngon(24),quadrata:ngon(4,Math.PI/4),triangolo:ngon(3,-Math.PI/2),stella:star};
  function msg(t) { $('status').textContent=t; }
  function bar(f) { $('bar').style.width=Math.round(f*100)+'%'; }
  function escapeHTML(v) {return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function engineOK() {return typeof window.Matter!=='undefined' && String(Matter.version)==='0.19.0' && typeof window.decomp!=='undefined';}
  let parts;
  async function sources() {
    if (parts) return parts;
    const urls=['js/terrain.js','js/obstacles.js','js/interactive-obstacles.js','js/physics.js','tests/reference/physics-v25.8.js'];
    const text=await Promise.all(urls.map(async url=>{
      const rsp=await fetch(url+'?v=259');if(!rsp.ok)throw Error('Impossibile caricare '+url+': '+rsp.status);return rsp.text();
    }));
    parts={common:text.slice(0,3).join('\n;\n'),old:text[4],fresh:text[3]};return parts;
  }
  const yieldFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function simulate(version,world,layoutIndex) {
    const src=await sources();
    let clock=0;
    // This executes in the same JS realm as Matter, so its collisionFilter data
    // are not accidentally broken by a cross-realm Object.prototype.
    const make=new Function('Matter','decomp','performance',src.common+'\n;\n'+(version==='V25.8'?src.old:src.fresh)+'\n;return {Terrain,Sim};');
    Matter.Common.setDecomp(window.decomp);
    const {Terrain:T,Sim:S}=make(window.Matter,window.decomp,{now:()=>clock});
    T.applyLayout(layouts[layoutIndex],{world});
    S.init();
    Object.entries(shapes).forEach(([id,v],i)=>S.addRacer(id,v,'#527b92',id,i));
    S.start();
    let ticks=0, bad=null;
    for(;ticks<60*240;ticks++){
      if(abort) throw Error('Test interrotto');
      clock+=epoch;S.tick(epoch);
      if(ticks%120===0){
        const racers=S.snapshot();
        if(racers.some(r=>!Number.isFinite(r.x)||!Number.isFinite(r.y))) {bad='Coordinate non finite';break;}
        // Yield regularly so mobile users can scroll/cancel; virtual physics time
        // is independent of the speed of their device.
        await yieldFrame();
        msg(version+' · '+world+' · pista '+(layoutIndex+1)+' · '+Math.round(clock/1000)+' s simulati');
      }
      if(S.allFinished()||S.isTimedOut()) break;
    }
    const dg=S.diagnostics(),snap=S.snapshot();
    const results=snap.map(r=>{
      const d=dg.find(d=>d.id===r.id)||{};
      return {shape:r.id, finished:!!r.finished, sec:r.finished?Math.round(r.finishTime/100)/10:null,
        x:Math.round(r.x),teleports:d.hops||0,cornerReleases:d.cornerReleases||0,
        rampRescues:d.rampRescues||0,events:d.stallEvents||[]};
    });
    return {version,world,layout:layoutIndex+1,ticks,bad,results};
  }
  function render(rows) {
    const body=$('results');body.textContent='';
    for(const row of rows){
      const values=['world','layout','shape','oldHops','newHops','releases','oldTime','newTime','outcome'];
      const tr=document.createElement('tr');
      for(const k of values){const td=document.createElement('td');const value=row[k];td.textContent=value==null?'—':String(value);tr.appendChild(td);}
      body.appendChild(tr);
    }
  }
  function summarise(cases){
    const rows=[];let oldHops=0,newHops=0,releases=0,oldFinished=0,newFinished=0;
    for(let i=0;i<cases.length;i+=2){
      const a=cases[i],b=cases[i+1];if(!a||!b)continue;
      for(const old of a.results){
        const fresh=b.results.find(r=>r.shape===old.shape);if(!fresh)continue;
        oldHops+=old.teleports;newHops+=fresh.teleports;releases+=fresh.cornerReleases;
        oldFinished+=old.finished?1:0;newFinished+=fresh.finished?1:0;
        rows.push({world:a.world,layout:a.layout,shape:old.shape,oldHops:old.teleports,newHops:fresh.teleports,
          releases:fresh.cornerReleases,oldTime:old.sec,newTime:fresh.sec,
          outcome:(!fresh.finished?'Non arrivata':fresh.teleports<old.teleports?'Meno recuperi':fresh.teleports>old.teleports?'Più recuperi':'Pari')});
      }
    }
    return {rows,totals:{oldHops,newHops,releases,oldFinished,newFinished,bikeRaces:rows.length}};
  }
  $('start').addEventListener('click',async()=>{
    if(running)return;running=true;abort=false;$('start').disabled=true;$('stop').disabled=false;
    try {
      if(!engineOK())throw Error('Matter.js 0.19.0 o poly-decomp non caricati. Test non eseguito.');
      const worldsToTest=$('world').value==='all'?worlds:[$('world').value];
      const layoutCount=$('tracks').value==='2'?2:1;
      const cases=[];const total=worldsToTest.length*layoutCount*2;
      for(const world of worldsToTest){for(let n=0;n<layoutCount;n++){
        // Compare baseline and new physics on EXACTLY the same track.
        for(const ver of ['V25.8','V25.9']){
          cases.push(await simulate(ver,world,n));
          bar(cases.length/total);
          await yieldFrame();
        }
      }}
      const data=summarise(cases);render(data.rows);
      report={suite:'Doodle Wheels V25.9 paired Matter.js stall audit',engine:Matter.version,
        layoutKeys:layouts.slice(0,layoutCount),date:new Date().toISOString(),totals:data.totals,cases};
      $('report').textContent=JSON.stringify(report,null,2);
      msg(`Completato: V25.8 ${data.totals.oldHops} teleport, V25.9 ${data.totals.newHops} teleport + ${data.totals.releases} rilasci fisici. Arrivi: ${data.totals.oldFinished}/${data.totals.bikeRaces} e ${data.totals.newFinished}/${data.totals.bikeRaces}.`);
    }catch(e){msg('ERRORE: '+e.message);$('report').textContent=e.stack||String(e);}
    finally{running=false;$('start').disabled=false;$('stop').disabled=true;}
  });
  $('stop').addEventListener('click',()=>{abort=true;msg('Interruzione richiesta…');});
  $('copy').addEventListener('click',async()=>{
    if(!report){msg('Prima esegui il test.');return;}
    try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));msg('Rapporto copiato.');}
    catch(e){msg('Copia non disponibile: seleziona il testo nel riquadro.');}
  });
  $('engine').textContent=engineOK()?'Motore: Matter.js '+Matter.version+' · poly-decomp caricato':'Motore: libreria non disponibile';
})();
