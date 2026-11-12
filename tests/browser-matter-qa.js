/* Real Matter.js integration diagnostics. Browser load only. No fabricated physics results. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const out = $('results'), stat = $('status'), bar = $('bar'), totals = $('totals'), report = $('report'), engineEl = $('engine');
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const startedAt = Date.now();
  const shapes = {
    tonda: Array.from({length:24},(_,i)=>({x:80*Math.cos(i*2*Math.PI/24),y:80*Math.sin(i*2*Math.PI/24)})),
    quadrata: [{x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],
    irregolare: [{x:39,y:0},{x:28,y:31},{x:1,y:38},{x:-31,y:25},{x:-38,y:-2},{x:-20,y:-37},{x:16,y:-37}]
  };
  for (const v of Object.values(shapes)) {const r=Math.max(...v.map(p=>Math.hypot(p.x,p.y)));for(const p of v){p.x*=80/r;p.y*=80/r;}}
  const cases = [];for(const name of Object.keys(shapes)){cases.push({name,kind:'none',manual:false});for(const kind of ['boulder','tilt','spring'])cases.push({name,kind,manual:kind==='boulder'});}
  cases.push({name:'tonda + quadrata',kind:'spring',concurrent:true});
  const results=[];let stopping=false,working=false,lastVis=null,loadFailure=null;
  // Frequent, real event-loop breaks prevent Matter.js QA from locking the UI,
  // especially on smartphones. The integration test keeps the exact same physics.
  const pause=()=>new Promise(resolve=>setTimeout(resolve,8));
  async function loadJs(src){
    return new Promise((resolve,reject)=>{
      const el=document.createElement('script');el.src=src;el.async=true;el.onload=()=>resolve();el.onerror=()=>{el.remove();reject(Error(src+' non raggiungibile'));};document.head.appendChild(el);
    });
  }
  async function loadEngine(){
    if(window.Matter&&window.Matter.version==='0.19.0')return window.Matter;
    const cdns=[
      'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js',
      'https://unpkg.com/matter-js@0.19.0/build/matter.min.js'
    ];
    const fails=[];
    for (const u of cdns){try{await loadJs(u);if(window.Matter&&window.Matter.version==='0.19.0')return window.Matter;}catch(e){fails.push(e.message);}}
    throw Error('Impossibile caricare Matter.js 0.19.0. '+fails.join(' • '));
  }
  async function loadSources(){
    const paths=['js/terrain.js','js/obstacles.js','js/interactive-obstacles.js','js/physics.js'];
    return Promise.all(paths.map(async p=>{const r=await fetch(p,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status+' '+p);return await r.text();}));
  }
  function worldFactory(source,Matter){
    // A new lexical scope gives each test a clean simulator, while the clock advances
    // at a fixed physics timestep even if the page runs slower than 60 fps.
    const holder={time:0};
    const scope=new Function('Matter','performance','decomp',source.join('\n;\n')+'\nreturn {Terrain,Sim,InteractiveObstacles,DynamicObstacles};');
    const game=scope(Matter,{now:()=>holder.time},window.decomp);
    return {holder,game};
  }
  const short = k=>({none:'Controllo senza ostacolo',boulder:'Massa da saltare',tilt:'Pedana basculante',spring:'Trampolino'})[k]||k;
  function paintFrame(world){
    const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
    const ground=world?.gy??520; const sx=x=>x-(world?.cx??0)+430,sy=y=>y-ground+204;
    ctx.fillStyle='#d8e8ef';ctx.fillRect(0,0,w,h);ctx.fillStyle='#b0d1ae';ctx.fillRect(0,204,w,h-204);
    ctx.strokeStyle='#647e69';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,204);ctx.lineTo(w,204);ctx.stroke();
    if(world&&world.kind!=='none'){
      const ox=sx(840),oy=sy(ground-30);ctx.save();ctx.translate(ox,oy);
      ctx.fillStyle=world.kind==='boulder'?'#85694d':world.kind==='spring'?'#d3a650':'#a48fae';ctx.strokeStyle='#493d4c';ctx.lineWidth=3;
      if(world.kind==='boulder'){ctx.beginPath();ctx.ellipse(0,0,78,30,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
      else{ctx.save();ctx.rotate(world.angle||0);ctx.fillRect(world.kind==='spring'?-85:-141,world.kind==='spring'?0:-10,world.kind==='spring'?170:282,20);ctx.restore();}
      ctx.restore();
    }
    if(world){for(const [i,r] of (world.bikes||[]).entries()){
        const color=i===0?'#d94358':'#3986b8';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=4;
        for(const key of ['fw','rw']){const xx=sx(r[key+'X']),yy=sy(r[key+'Y']);ctx.beginPath();ctx.arc(xx,yy,22,0,Math.PI*2);ctx.stroke();}
        ctx.beginPath();ctx.moveTo(sx(r.fwX),sy(r.fwY));ctx.lineTo(sx(r.x),sy(r.y));ctx.lineTo(sx(r.rwX),sy(r.rwY));ctx.stroke();
      }
    }
    ctx.fillStyle='#38515b';ctx.font='15px system-ui';ctx.fillText(world?`${world.name} · ${short(world.kind)} · x=${Math.round(world.cx||0)}`:'Visualizzazione schematica durante il test',18,28);
  }
  function render(){
    let pass=results.filter(v=>v.pass).length,fail=results.filter(v=>!v.pass).length;
    totals.textContent=`${pass} superati · ${fail} non superati · ${results.length}/${cases.length} verifiche`;
    out.replaceChildren();for(const o of results){const tr=document.createElement('tr');for(const value of [o.shape,short(o.kind),o.pass?'PASS':'FAIL',o.detail]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}tr.children[2].className=o.pass?'good':'bad';out.appendChild(tr);}
    const obj={suite:'Doodle Wheels QA V25.6',engine:window.Matter?.version||null,location:location.href,startedAt:new Date(startedAt).toISOString(),completed:results.length,expected:cases.length,pass,fail,loadFailure,results};
    report.textContent=JSON.stringify(obj,null,2);
  }
  function single(v,files,Matter){
    return (async()=>{
      const {game,holder}=worldFactory(files,Matter),T=game.Terrain,S=game.Sim;
      T.applyLayout(['hills','ramps'],{world:'classic',season:'classica',nogap:true,nopatch:true});
      T.FLOWERS.length=0;T.DYNAMIC_OBSTACLES.length=0;T.INTERACTIVE_OBSTACLES.splice(0,T.INTERACTIVE_OBSTACLES.length,...(v.kind==='none'?[]:[{id:0,x:840,kind:v.kind,biome:'classic',zone:'start'}]));
      S.init();S.addRacer('qa',shapes[v.name],'#cc4455','QA');S.start();
      let jumped=false,phase=false,angleMax=0,bigStep=0,last=null,maxX=-Infinity,lastX=0,ended=false;
      for(let step=0;step<960;step++){
        if(stopping)throw Error('Test interrotto');
        holder.time+=1000/60;
        const prev=S.snapshot()[0];if(v.manual&&!jumped&&holder.time>400&&prev.fwX>=575)jumped=Boolean(S.jump('qa'));
        S.tick(1000/60);
        const r=S.snapshot()[0];if(!r||![r.x,r.y,r.fwY,r.rwY,r.angle].every(Number.isFinite))throw Error('Posizione o angolo non finito');
        if(last!==null)bigStep=Math.max(bigStep,Math.abs(r.x-last));last=r.x;lastX=r.x;maxX=Math.max(maxX,r.x);
        const obs=S.getInteractiveState()?.[0];if(obs){phase ||=obs[4]===5;angleMax=Math.max(angleMax,Math.abs(obs[3]));}
        if(step%8===0){lastVis={name:v.name,kind:v.kind,cx:r.x,angle:obs?.[3]||0,bikes:[r]};paintFrame(lastVis);await pause();}
        if(r.x>1170){ended=true;break;}
      }
      const diag=S.diagnostics?.()[0]||{};const reasons=[];if(!ended)reasons.push('La bici non ha superato la zona dell’ostacolo');if((diag.hops||0)>0)reasons.push('Recupero anti-blocco '+diag.hops+' volte (ultima x='+Math.round(diag.lastUnstickX||0)+', t='+Math.round(diag.lastUnstickAt||0)+' ms)');else if(bigStep>55)reasons.push('Spostamento anomalo di '+bigStep.toFixed(1)+' px');
      if(v.manual&&!jumped)reasons.push('Il comando di salto non è stato accettato');
      if(v.kind==='spring'&&!(diag.springHits>0))reasons.push('Nessun impulso del trampolino applicato alla bici');
      if(v.kind==='tilt'&&angleMax<.012)reasons.push('La pedana non ha inclinato abbastanza ('+angleMax.toFixed(3)+' rad)');
      return {shape:v.name,kind:v.kind,pass:!reasons.length,detail:reasons.length?reasons.join(' · '):`superato senza recuperi a x=${Math.round(lastX)}${v.kind==='tilt'?`, inclinazione ${angleMax.toFixed(3)} rad`:''}${v.manual?', salto eseguito':''}`};
    })();
  }
  async function concurrency(files,Matter){
    const {game,holder}=worldFactory(files,Matter),T=game.Terrain,S=game.Sim;
    T.applyLayout(['hills','ramps'],{world:'classic',season:'classica',nogap:true,nopatch:true});
    T.FLOWERS.length=0;T.DYNAMIC_OBSTACLES.length=0;T.INTERACTIVE_OBSTACLES.splice(0,T.INTERACTIVE_OBSTACLES.length,{id:0,x:840,kind:'spring',biome:'classic',zone:'start'});
    S.init();S.addRacer('round',shapes.tonda,'#dc4759','Tonda');S.addRacer('square',shapes.quadrata,'#388bbc','Quadrata');S.start();
    let seen=false,all=[];for(let step=0;step<960;step++){
      if(stopping)throw Error('Test interrotto');holder.time+=1000/60;S.tick(1000/60);all=S.snapshot();
      const o=S.getInteractiveState()?.[0];seen ||= !!o&&o[4]===5;
      for(const r of all)if(![r.x,r.y,r.fwY,r.rwY].every(Number.isFinite))throw Error('Coordinate non finite per '+r.id);
      if(step%8===0){lastVis={name:'2 giocatori',kind:'spring',cx:(all[0].x+all[1].x)/2,bikes:all};paintFrame(lastVis);await pause();}
      if(all.length===2&&all.every(r=>r.x>1170))break;
    }
    const d=S.diagnostics?.()||[];const rescued=d.reduce((sum,r)=>sum+(r.hops||0),0);
    const pass=seen&&all.length===2&&all.every(r=>r.x>1170)&&rescued===0&&d.length===2&&d.every(q=>q.springHits>0);
    return {shape:'tonda + quadrata',kind:'spring',pass,detail:pass?'Entrambe oltre la zona e trampolino attivato':`Attivato=${seen}, impulsi=${d.map(q=>q.id+':'+q.springHits).join('/')}, recuperi=${rescued}, posizioni=${all.map(r=>r.id+':'+Math.round(r.x)).join(', ')}`};
  }
  async function start(){
    if(working)return;working=true;stopping=false;loadFailure=null;results.length=0;render();$('start').disabled=true;$('stop').disabled=false;engineEl.className='warn';stat.textContent='Caricamento del motore Matter.js...';bar.style.width='0%';paintFrame(null);
    try{
      const Matter=await loadEngine();engineEl.textContent='✓ Motore reale: Matter.js '+Matter.version;engineEl.className='good';
      stat.textContent='Caricamento degli stessi moduli del gioco...';const files=await loadSources();
      for(let i=0;i<cases.length&&!stopping;i++){
        const v=cases[i];stat.textContent=`Prova ${i+1}/${cases.length}: ${v.name} — ${short(v.kind)} · puoi scorrere e interrompere il test`;
        try{results.push(v.concurrent?await concurrency(files,Matter):await single(v,files,Matter));}
        catch(e){results.push({shape:v.name,kind:v.kind,pass:false,detail:String(e.stack||e.message||e)});}
        bar.style.width=((i+1)/cases.length*100).toFixed(2)+'%';render();await pause();
      }
      stat.textContent=stopping?'Test interrotto: i risultati sono parziali.':results.length===cases.length?(results.every(r=>r.pass)?'✅ Tutte le verifiche fisiche superate.':'⚠️ Uno o più scenari non hanno superato il collaudo.'): 'Collaudo parziale.';
    }catch(e){loadFailure=String(e.stack||e);engineEl.className='bad';engineEl.textContent='✗ Impossibile eseguire il collaudo reale';stat.textContent=String(e.message||e);}
    finally{working=false;$('start').disabled=false;$('stop').disabled=true;render();}
  }
  $('start').addEventListener('click',start);
  $('stop').addEventListener('click',()=>{stopping=true;stat.textContent='Interruzione richiesta...';});
  $('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(report.textContent);$('copy').textContent='Copiato ✓';}catch(e){const s=document.createElement('textarea');s.value=report.textContent;document.body.appendChild(s);s.select();document.execCommand('copy');s.remove();$('copy').textContent='Copiato ✓';}});
  paintFrame(null);
  // Load no engine until the user clicks: avoid waste on the normal game route.
})();
