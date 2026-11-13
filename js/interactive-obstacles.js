/* V24 – ostacoli reattivi / art direction per ciascun mondo.
 * In gara solo l'host crea e simula i corpi Matter. I client ricevono pose+fasi.
 * Il disegno usa sempre la sagoma fisica esatta di ogni oggetto.
 */
const InteractiveObstacles = (() => {
  'use strict';
  const TAU=Math.PI*2, GY=520;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    const SIZES={boulder:{r:30,rx:78},tilt:{w:282,h:22},spring:{w:170,h:20},shard:{w:114,h:54},clam:{w:148,h:40},bud:{w:114,h:54},servo:{w:125,h:52}};
  const THEMES={
    classic:{dark:'#514539',mid:'#9a7750',light:'#f4d7a0',edge:'#5d4036',metal:'#e2b15d',glow:'#fff1bb'},
    paradise:{dark:'#5e7999',mid:'#d4bb82',light:'#fff7db',edge:'#8d6e9b',metal:'#e5bc64',glow:'#fff6cf'},
    inferno:{dark:'#2e1b32',mid:'#713949',light:'#fb9d6e',edge:'#260f27',metal:'#dc7360',glow:'#ff5c49'},
    atlantis:{dark:'#1a5167',mid:'#4fa4ad',light:'#b6fff0',edge:'#185774',metal:'#e0cf8c',glow:'#72fff0'},
    enchanted:{dark:'#284d43',mid:'#628a61',light:'#c4e6a2',edge:'#39523e',metal:'#bde29b',glow:'#b4ff95'},
    neon:{dark:'#191736',mid:'#4749a5',light:'#77fff0',edge:'#fb63df',metal:'#8ca8ff',glow:'#36f2ed'}
  };
  let host=[], remote=new Map(), drawAt=0, activeRacers=[], pendingSprings=[],pendingVaults=[],pendingTilts=[],pendingRisers=[];
  const springVisual = new Map(); // phase-clock per obstacle, only for drawing
  const placements=()=>Terrain.INTERACTIVE_OBSTACLES||[];
  const ground=(x)=>GY-Terrain.height(x);
  const basePose=(o)=>({x:o.x,y:ground(o.x)-({boulder:30,tilt:13,spring:21,shard:28,clam:26,bud:29,servo:29}[o.kind]||25),a:0,s:0});
  const nearby=(rs,x,r=230)=>Boolean(rs&&rs.some(q=>q&&!q.finished&&q.chassis&&Math.abs(q.chassis.position.x-x)<r));
  function mount(world){
    host=[];activeRacers=[];pendingSprings=[];pendingVaults=[];pendingTilts=[];pendingRisers=[];remote=new Map();drawAt=0;springVisual.clear();
    for(const config of placements()){
      const p=basePose(config); let body;
      if(config.kind==='boulder'){
        body=Matter.Bodies.circle(p.x,p.y,SIZES.boulder.r,{label:'interactive-boulder',density:.00068,friction:.47,frictionStatic:.48,frictionAir:.020,restitution:.20,slop:.02},32);
        // Broad oval, 156x60, with rounded edges. Actual game tyres have radius 80.
        // Physics ellipse = art ellipse. No invisible cylinder with the wrong silhouette.
        Matter.Body.scale(body,SIZES.boulder.rx/SIZES.boulder.r,1);
      }else if(config.kind==='tilt'){
        // A flush, reactive plate. A raised, rigid deck and its lead-in ramps
        // trapped square wheels because traction was measured against the road.
        // The contact sensor follows Matter's exact 282x22 envelope: riders
        // keep road traction, while the plate tilts and gives a gentle push.
        body=Matter.Bodies.rectangle(p.x,p.y,SIZES.tilt.w,SIZES.tilt.h,{
          label:'interactive-tilt',isStatic:true,isSensor:true,friction:0,slop:.02
        });
      }else if(['shard','clam','bud','servo'].includes(config.kind)){
        // V24 replaces the disliked sinking 'drop' deck with compact, ground-rooted
        // obstacles. All have consistent collisions with their actual drawn envelope.
        const k=SIZES[config.kind];
        body=Matter.Bodies.rectangle(p.x,p.y,k.w,k.h,{
          label:'interactive-'+config.kind,isStatic:true,isSensor:true,
          friction:0,
          frictionStatic:.7,restitution:.07,slop:.02
        });
      }else if(config.kind==='spring'){
        // The spring is a contact sensor, not a vertical wall for square wheels.
        // The bounce is a REAL Matter velocity impulse applied to the bike.
        body=Matter.Bodies.rectangle(p.x,p.y,SIZES.spring.w,SIZES.spring.h,{
          label:'interactive-spring',isStatic:true,isSensor:true,friction:0,slop:.02
        });
      }else continue;
      body.interactiveId=config.id;
      // Cooldown PER PLAYER: one rider must not steal another player's bounce.
      const entry={config,body,original:p,phase:'idle',phaseAt:0,lastTriggerAt:-1e7,reactivations:new WeakMap(),resetAt:-1,springDisarmed:new WeakMap(), tiltDisarmed:new WeakMap(), tiltAngle:0};
      host.push(entry);
      Matter.World.add(world,body);
    }
  }
  function contact(a,b,timeMs){
    const kind=v=>v&&v.label||'';
    let obstacle=/^interactive-(spring|tilt|boulder|shard|clam|bud|servo)$/.test(kind(a))?a:null;
    let rider=obstacle?b:null;
    if(!obstacle && /^interactive-(spring|tilt|boulder|shard|clam|bud|servo)$/.test(kind(b))){obstacle=b;rider=a;}
    if(!obstacle || !rider || !['wheel','chassis'].includes(rider.label))return;
    const entry=host.find(q=>q.body===obstacle);if(!entry)return;
    const racer=activeRacers.find(r=>r&&(r.fw===rider||r.rw===rider));
    if(!racer)return;
    const obstacleKind=entry.config.kind;
    if(obstacleKind==='spring'){
      // A wheel meets the soft launch surface from ABOVE. Each racer triggers
      // exactly once while crossing, even if the solver emits many contacts.
      if(rider.position.y > obstacle.position.y-17)return;
      if(Math.abs(rider.position.x-obstacle.position.x)>SIZES.spring.w/2+25)return;
      if(rider.velocity.y < -4.5 || entry.springDisarmed.get(racer))return;
      if(timeMs-(entry.reactivations.get(racer)??-1e7)<900)return;
      if(!pendingSprings.some(q=>q.entry===entry&&q.racer===racer))
        pendingSprings.push({entry,racer,at:timeMs});
    }else if(obstacleKind==='tilt'){
      // The tilting board feels the wheel's load, without presenting a rigid
      // step that can wedge an irregular wheel against the asphalt.
      if(rider.label!=='wheel' || entry.tiltDisarmed.get(racer))return;
      if(Math.abs(rider.position.x-obstacle.position.x)>SIZES.tilt.w/2+15)return;
      if(!pendingTilts.some(q=>q.entry===entry&&q.racer===racer))
        pendingTilts.push({entry,racer,at:timeMs});
    }else if(obstacleKind==='boulder'){
      // Horizontal oval is jumpable; brisk side impact also gives a small,
      // legible ride-up assist (not an invisible wall). Slow touches do nothing.
      if(rider.label!=='wheel'||rider.position.x>obstacle.position.x+10)return;
      if(rider.velocity.x<3.2||rider.velocity.y < -3)return;
      if(timeMs-(entry.reactivations.get(racer)??-1e7)<1200)return;
      if(!pendingVaults.some(q=>q.entry===entry&&q.racer===racer))
        pendingVaults.push({entry,racer,at:timeMs});

    }else if(['shard','clam','bud','servo'].includes(obstacleKind) && rider.label==='wheel'){
      if(!pendingRisers.some(q=>q.entry===entry && q.racer===racer))
        pendingRisers.push({entry,racer,at:timeMs});
    }
  }
  function beforeStep(nowMs,racers){
    activeRacers=racers||[];
    for(const entry of host){
      const b=entry.body, home=entry.original;
      if(entry.config.kind==='tilt'){
        // Lean toward the rider's current load, then settle smoothly.
        // Static sensor angle controls both the displayed deck and contact area.
        let moment=0,weight=0;
        for(const r of activeRacers){
          if(!r || r.finished || !r.chassis)continue;
          const dx=r.chassis.position.x-home.x;
          if(Math.abs(dx)<SIZES.tilt.w/2+110){
            const proximity=clamp(1-Math.max(0,Math.abs(dx)-SIZES.tilt.w/2)/110,0,1);
            moment+=clamp(dx/(SIZES.tilt.w/2),-1,1)*proximity;weight+=proximity;
          }
        }
        const target=weight>0?clamp(moment/weight*.071,-.071,.071):0;
        entry.tiltAngle += (target-entry.tiltAngle)*.14;
        Matter.Body.setAngle(b,entry.tiltAngle);
      }else if(['shard','clam','bud','servo'].includes(entry.config.kind)){
        const type=entry.config.kind,t=nowMs/1000;
        // Slow, clearly telegraphed movement and conservative heights.
        // Every obstacle can be jumped with an ordinary wheel and has a flat approach.
        const cycle=(1+Math.sin(t*({shard:1.18,clam:1.1,bud:1.3,servo:1.0}[type])+entry.config.id*1.7))/2;
        const eased=cycle*cycle*(3-2*cycle);
        const yLift=({shard:22,clam:12,bud:18,servo:7}[type])*eased;
        const xMove=type==='servo'?Math.sin(t*.95+entry.config.id)*36:0;
        Matter.Body.setPosition(b,{x:home.x+xMove,y:home.y-yLift},true);
        if(entry.phase==='react' && nowMs-entry.phaseAt>380)entry.phase='idle';
      }else if(entry.config.kind==='spring'){
        if(entry.phase==='spring'&&nowMs-entry.phaseAt>330)entry.phase='idle';
      }
    }
  }
  function afterStep(nowMs,racers){
    // Re-arm only after the entire bicycle has left the obstacle corridor.
    // Prevents repeat launches when both wheels touch the same pad.
    for(const entry of host)if(entry.config.kind==='spring'||entry.config.kind==='tilt'){
      const limit=(entry.config.kind==='spring'?SIZES.spring.w:SIZES.tilt.w)/2+195;
      const map=entry.config.kind==='spring'?entry.springDisarmed:entry.tiltDisarmed;
      for(const r of racers||[])if(r&&r.chassis&&Math.abs(r.chassis.position.x-entry.config.x)>limit)map.delete(r);
    }
    for(const {entry,racer,at} of pendingTilts){
      if(entry.tiltDisarmed.get(racer))continue;
      entry.tiltDisarmed.set(racer,true);
      entry.phase='react';entry.phaseAt=nowMs;
      // Gentle mechanical release, not a teleport or a speed governor.
      for(const body of [racer.chassis,racer.fw,racer.rw])if(body){
        Matter.Body.setVelocity(body,{x:body.velocity.x+.18,y:Math.min(body.velocity.y,-1.7)});
      }
    }
    pendingTilts.length=0;
    // Rising obstacles react as non-braking soft kinetic pads. The animated
    // rectangle is a translucent reactive field, not an immovable wall.
    for(const {entry,racer,at} of pendingRisers){
      if(at-(entry.reactivations.get(racer)??-1e7)<1050)continue;
      entry.reactivations.set(racer,at);
      entry.phase='react';entry.phaseAt=nowMs;
      for(const body of [racer.chassis,racer.fw,racer.rw])if(body){
        Matter.Body.setVelocity(body,{x:body.velocity.x,y:Math.min(body.velocity.y,-7.8)});
      }
    }
    pendingRisers.length=0;
    // Rounded mobile volume: speed + deliberate approach offers a modest vault.
    // Never applies a boost on an arbitrary collision with its back or underside.
    for(const {entry,racer,at} of pendingVaults){
      if(at-(entry.reactivations.get(racer)??-1e7)<1200)continue;
      entry.reactivations.set(racer,at);
      entry.phase='react';entry.phaseAt=nowMs;
      const push=({paradise:9.4,inferno:6.6,atlantis:8.1,enchanted:9.0,neon:8.2,classic:7.5})[entry.config.biome]||6.6;
      for(const body of [racer.chassis,racer.fw,racer.rw])if(body){
        Matter.Body.setVelocity(body,{x:Math.max(body.velocity.x,3.7),y:Math.min(body.velocity.y,-push)});
      }
    }
    pendingVaults.length=0;
    // One jump event boosts the entire bike, preserving its axle constraints.
    // Separate cooldowns make multiplayer simultaneous landings deterministic.
    for(const {entry,racer,at} of pendingSprings){
      if(at-(entry.reactivations.get(racer)??-1e7)<850)continue;
      entry.reactivations.set(racer,at);
      entry.springDisarmed.set(racer,true);
      entry.phase='spring';entry.phaseAt=nowMs;
      racer.springHits=(racer.springHits||0)+1;
      racer.rampFly=0;
      racer.springGraceTicks=24;
      for(const body of [racer.chassis,racer.fw,racer.rw]){
        if(!body)continue;
        Matter.Body.setVelocity(body,{
          x:body.velocity.x+Math.min(.8,Math.max(.1,body.velocity.x*.055)),
          y:Math.min(body.velocity.y,-22.5)
        });
      }
    }
    pendingSprings.length=0;
    for(const entry of host)if(entry.config.kind==='boulder'){
      const b=entry.body, origin=entry.original;
      Matter.Body.setVelocity(b,{x:clamp(b.velocity.x,-5.5,5.5),y:clamp(b.velocity.y,-7.5,7.5)});
      Matter.Body.setAngularVelocity(b,clamp(b.angularVelocity,-.12,.12));
      const beyond=Math.abs(b.position.x-origin.x)>188||b.position.y>origin.y+135||b.position.y<origin.y-220;
      if(beyond&&entry.resetAt<0)entry.resetAt=nowMs;
      if(!beyond)entry.resetAt=-1;
      if(entry.resetAt>=0&&nowMs-entry.resetAt>1700&&!nearby(racers,b.position.x,250)&&!nearby(racers,origin.x,250)){
        Matter.Body.setPosition(b,{x:origin.x,y:origin.y-16});Matter.Body.setVelocity(b,{x:0,y:0});
        Matter.Body.setAngularVelocity(b,0);Matter.Body.setAngle(b,0);entry.resetAt=-1;
      }
    }
  }
  const phaseCode=e=>({react:1,spring:5})[e.phase]||0;
  function snapshot(){return host.map(e=>[e.config.id,Math.round(e.body.position.x*10)/10,Math.round(e.body.position.y*10)/10,Math.round(e.body.angle*1000)/1000,phaseCode(e)]);}
  function receive(rows){
    if(!Array.isArray(rows))return;
    const ids=new Set(placements().map(o=>o.id));
    for(const a of rows){if(!Array.isArray(a)||a.length!==5||!ids.has(a[0])||!a.slice(1).every(Number.isFinite))continue;
      const prev=remote.get(a[0]),p={x:a[1],y:a[2],a:a[3],s:a[4]};
      remote.set(a[0],{target:p,view:prev?prev.view:{...p}});
    }
  }
  function clearClient(){remote=new Map();drawAt=0;springVisual.clear();}
  function line(ctx,pts){ctx.beginPath();ctx.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);ctx.stroke();}
  function dot(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,TAU);if(color)c.fillStyle=color;c.fill();}
  function star(c,x,y,n,out,inn){c.beginPath();for(let i=0;i<n*2;i++){let a=-Math.PI/2+i*Math.PI/n,rr=i%2?inn:out;c.lineTo(x+rr*Math.cos(a),y+rr*Math.sin(a));}c.closePath();}
  function rounded(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
  function bridgeBase(c,o,g,theme){
    // Decorative support is always NON-collidable; only the visible thick deck
    // is physics. Side supports cannot trap a tyre.
    c.fillStyle=theme.dark;c.globalAlpha=.70;
    for(const dx of [-SIZES.drop.w*.42,SIZES.drop.w*.42]){
      rounded(c,o.x+dx-10,g-29,20,28,4);c.fill();
      c.strokeStyle=theme.metal;c.lineWidth=2;c.stroke();
      dot(c,o.x+dx,g-26,3,theme.light);
    }c.globalAlpha=1;
  }
  function pedestal(c,o,g,theme,deck){
    // The fulcrum is the REAL (host or remote) plate center. Each foot is
    // independently attached to terrain, even on a gentle slope. This is a
    // visible non-colliding support: the only platform collider is the deck.
    const sx=o.x, px=deck&&Number.isFinite(deck.x)?deck.x:sx;
    const pivot=deck&&Number.isFinite(deck.y)?deck.y:basePose(o).y;
    const lx=sx-76,rx=sx+76,ly=ground(lx)-4,ry=ground(rx)-4;
    c.save();c.lineJoin='round';c.lineCap='round';
    // Open A-frame (not a second fake platform). Broad distinct ground plates.
    c.fillStyle=theme.dark;c.globalAlpha=.30;
    c.beginPath();c.moveTo(lx,ly);c.lineTo(px,pivot+5);c.lineTo(rx,ry);c.closePath();c.fill();c.globalAlpha=1;
    for(const [x,y] of [[lx,ly],[rx,ry]]){
      c.fillStyle=theme.dark;rounded(c,x-26,y-7,52,12,4);c.fill();
      c.strokeStyle=theme.metal;c.lineWidth=2.5;c.stroke();
      dot(c,x-13,y-2,3,theme.light);dot(c,x+13,y-2,3,theme.light);
    }
    c.strokeStyle=theme.dark;c.lineWidth=19;
    line(c,[lx,ly-6,px,pivot+7,rx,ry-6]);
    c.strokeStyle=theme.metal;c.lineWidth=7;
    line(c,[lx,ly-6,px,pivot+7,rx,ry-6]);
    c.strokeStyle=theme.light;c.lineWidth=2.5;
    line(c,[lx+8,ly-7,px,pivot+7,rx-8,ry-7]);
    // The axle ring is drawn ON TOP of the braces, underneath the tilting deck.
    dot(c,px,pivot+6,16,theme.dark);
    dot(c,px,pivot+6,10,theme.metal);
    dot(c,px,pivot+6,5,theme.light);
    if(o.biome==='paradise'){
      c.strokeStyle=theme.light;c.lineWidth=3;
      line(c,[sx,ground(sx)-9,px,pivot+10]);
    }else if(o.biome==='neon'){
      c.strokeStyle=theme.glow;c.lineWidth=2.5;
      line(c,[lx+16,ly-11,px,pivot+11,rx-16,ry-11]);
    }
    c.restore();
  }

  function drawBoulder(c,o,p,T,ms){
    const R=SIZES.boulder.r;
    if(o.biome==='paradise'){
      // Holy cloud rather than a marble orb. The silhouette stays within ~2px
      // of the matching Matter ellipse after horizontal scale.
      const fill=c.createLinearGradient(0,-R,0,R);
      fill.addColorStop(0,'#fffef8');fill.addColorStop(.56,'#efeaf2');fill.addColorStop(1,'#cbbbd7');
      c.beginPath();const N=80;
      for(let i=0;i<=N;i++){
        const a=i*TAU/N,rr=R*(.92+.045*Math.cos(9*a)+.034*Math.sin(13*a+.8));
        const x=rr*Math.cos(a),y=rr*Math.sin(a);
        if(i===0)c.moveTo(x,y);else c.lineTo(x,y);
      }
      c.closePath();c.fillStyle=fill;c.strokeStyle='#ab95b6';c.lineWidth=2.3;c.fill();c.stroke();
      c.save();c.clip();
      for(const [x,y,rx,ry] of [[-15,-7,10,10],[-5,-13,11,9],[8,-9,12,11],[17,-1,8,9]]){
        c.fillStyle='#fffffa';c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();
      }
      c.strokeStyle='#bca9c7';c.lineWidth=2.1;
      for(const [x,y] of [[-19,4],[-5,9],[12,6]]){
        c.beginPath();c.moveTo(x-4,y);c.bezierCurveTo(x+1,y-5,x+10,y+5,x+3,y+7);c.stroke();
      }
      c.strokeStyle='#e4cc94';c.lineWidth=1.8;
      for(const [x,y] of [[-12,-15],[6,-18],[19,-9]]){
        c.beginPath();c.moveTo(x-2,y+3);c.quadraticCurveTo(x-6,y-4,x+2,y-7);c.stroke();
      }
      c.restore();return;
    }
    c.fillStyle=T.dark;c.strokeStyle=T.edge;c.lineWidth=5;
    c.beginPath();for(let i=0;i<16;i++){const a=i*TAU/16,rr=R-2+(i%3===0?2:0);if(i===0)c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);else c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}c.closePath();c.fill();c.stroke();
    c.lineWidth=3;c.strokeStyle=T.light;
    if(o.biome==='classic'&&o.zone==='hills'){
      // A rolled hay bale: straw bands and a real heavy centre.
      c.strokeStyle='#e3af56';for(let k=-2;k<=2;k++){c.beginPath();c.ellipse(0,0,R*.80-k*3,R*.77-k*2,k*.19,0,TAU);c.stroke();}
      c.strokeStyle='#fff0a4';for(let j=0;j<8;j++){const a=j*TAU/8;line(c,[0,0,Math.cos(a)*34,Math.sin(a)*34]);}
    }else if(o.biome==='inferno'){
      c.fillStyle='#3b202c';dot(c,-4,-2,33);c.strokeStyle='#ffb15c';c.lineWidth=4;
      line(c,[-34,-7,-15,-15,-5,4,13,10,29,-3]);line(c,[-6,-33,4,-11,20,-17]);line(c,[-18,19,-3,14,11,33]);
      for(const [x,y] of [[-23,-24],[22,18],[30,-19]])dot(c,x,y,4,'#ff6450');
    }else if(o.biome==='atlantis'){
      c.fillStyle='#2b7c89';dot(c,0,0,35);c.strokeStyle='#b0ffed';c.lineWidth=3;
      for(let k=0;k<7;k++){let a=k*TAU/7;line(c,[0,0,Math.cos(a)*37,Math.sin(a)*37]);}
      for(let k=0;k<4;k++){c.beginPath();c.arc(0,0,9+k*9,-2.4,.4);c.stroke();}
      dot(c,0,0,7,'#f7ecd0');
    }else if(o.biome==='enchanted'){
      // Giant seed pod: fibrous shell, longitudinal seam, luminous germ inside.
      c.fillStyle='#557f58';dot(c,0,0,R*.89);
      c.strokeStyle='#dbeca4';c.lineWidth=3;
      c.beginPath();c.ellipse(0,0,R*.79,R*.47,0,0,TAU);c.stroke();
      c.beginPath();c.ellipse(0,0,R*.55,R*.26,0,0,TAU);c.stroke();
      c.strokeStyle='#284f40';line(c,[-R*.8,0,0,R*.10,R*.8,0]);
      c.fillStyle='#f5e99a';dot(c,0,0,R*.16);
      for(let i=-2;i<=2;i++){c.fillStyle='#97c47a';
        c.beginPath();c.ellipse(i*R*.22,R*.63,4,2,i*.4,0,TAU);c.fill();}
    }else if(o.biome==='neon'){
      c.strokeStyle='#7cf9ff';c.lineWidth=4;for(let i=0;i<6;i++){let a=i*TAU/6;line(c,[Math.cos(a)*23,Math.sin(a)*23,Math.cos(a+.2)*41,Math.sin(a+.2)*41]);}
      c.fillStyle='#243e85';dot(c,0,0,24);c.strokeStyle='#fa70e3';c.beginPath();c.arc(0,0,17,-.2,Math.PI*1.35);c.stroke();dot(c,0,0,6,'#c2fffc');
    }else if(o.biome==='paradise'){
      // Legacy branch; the dedicated compact-cloud renderer above returns early.
      // The collision still follows the underlying smooth physical ellipse.
      c.fillStyle='#efebf1';dot(c,0,0,R*.88);
      c.fillStyle='#fffdf5';for(let i=-3;i<=3;i++){
        let x=i*R*.24;
        c.beginPath();c.ellipse(x,-R*.22,R*.24,R*.27,0,Math.PI,TAU);c.fill();
      }
      c.strokeStyle='#cfb58d';c.lineWidth=2.2;
      for(let i=-2;i<=2;i++){
        let x=i*R*.25;c.beginPath();c.moveTo(x,2);c.quadraticCurveTo(x+7,R*.40,x+14,R*.22);c.stroke();
      }
      dot(c,0,R*.17,3,'#bfa0bd');
    }else{
      c.strokeStyle='#d1ae7c';c.lineWidth=3;line(c,[-29,-13,-11,-7,6,10,28,2]);line(c,[-2,-31,9,-10,29,-23]);line(c,[-17,20,-8,12,11,25]);
      for(let i=0;i<5;i++){let a=i*TAU/5;dot(c,Math.cos(a)*24,Math.sin(a)*26,3,'#f1d7a7');}
    }
    c.fillStyle='rgba(255,255,255,.18)';c.beginPath();c.ellipse(-17,-24,13,6,-.5,0,TAU);c.fill();
  }
  function drawTilt(c,o,p,T,t){
    const W=SIZES.tilt.w,H=SIZES.tilt.h;
    c.fillStyle=T.dark;c.strokeStyle=T.edge;c.lineWidth=4.5;
    rounded(c,-W/2,-H/2,W,H,8);c.fill();c.stroke();
    const grad=c.createLinearGradient(0,-H/2,0,H/2);grad.addColorStop(0,T.light);grad.addColorStop(1,T.mid);c.fillStyle=grad;
    rounded(c,-W/2+4,-H/2+2,W-8,H-6,6);c.fill();
    c.lineWidth=2;c.strokeStyle=T.metal;
    if(o.biome==='paradise'){
      for(let i=-5;i<=5;i++){const dx=i*23;rounded(c,dx-9,-H/2+2,18,H-7,2);c.stroke();}
      c.strokeStyle='#a38eae';c.lineWidth=2.5;line(c,[-W*.36,0,-W*.22,0]);line(c,[W*.22,0,W*.36,0]);
      // Inlaid sanctuary emblem, not a gameplay boost ring.
      c.strokeStyle='#9475a6';line(c,[0,-8,0,8]);line(c,[-7,-2,7,-2]);
    }else if(o.biome==='inferno'){
      c.fillStyle='#4b2835';for(let i=-5;i<=5;i++){rounded(c,i*25-9,-7,17,13,1);c.fill();}
      c.strokeStyle='#ff9464';for(let i=-4;i<=4;i+=2){line(c,[i*26-9,-4,i*26+7,4]);}
    }else if(o.biome==='atlantis'){
      c.strokeStyle='#ecf6c2';c.lineWidth=2;
      for(let i=-5;i<=5;i++){c.beginPath();c.arc(i*24,0,8,Math.PI,TAU);c.stroke();}
      for(let dx of [-W*.32,W*.32]){dot(c,dx,0,5,'#87f4e5');dot(c,dx,0,2,'#fff5d7');}
    }else if(o.biome==='enchanted'){
      c.fillStyle='#5d4c34';for(let k=-5;k<=5;k++){rounded(c,k*24-8,-9,16,18,4);c.fill();}
      c.strokeStyle='#c1eda3';for(let i=-5;i<=5;i+=2){c.beginPath();c.ellipse(i*23,0,7,4,i*.18,0,TAU);c.stroke();}
    }else if(o.biome==='neon'){
      c.fillStyle='#1c1c49';rounded(c,-W/2+6,-8,W-12,15,3);c.fill();
      c.strokeStyle='#65fdf2';for(let i=-5;i<=5;i++){const x=i*24;line(c,[x-9,-4,x+7,-4,x+13,4]);}
      c.strokeStyle='#ff70e9';line(c,[-W/2+12,7,W/2-12,7]);
    }else{
      c.strokeStyle=T.edge;for(let i=-5;i<=5;i++)line(c,[i*24,-H/2+4,i*24,H/2-4]);
      for(let i of [-4,-2,0,2,4])dot(c,i*24,0,2.5,T.metal);
    }
  }
  function drawChallenge(c,o,p,T,phase,t){
    const k=SIZES[o.kind];const W=k.w,H=k.h;
    c.save();c.lineJoin='round';c.lineCap='round';c.lineWidth=4;
    c.globalAlpha=.76; // V27.3: kinetic field, not a rigid brake wall
    if(o.kind==='shard'){
      c.fillStyle='#342437';c.strokeStyle='#d2674f';
      rounded(c,-W/2,-H/2,W,H,9);c.fill();c.stroke();
      c.fillStyle='#60404c';c.beginPath();c.moveTo(-W*.42,-H*.3);c.lineTo(-W*.14,-H*.40);c.lineTo(W*.42,-H*.17);c.lineTo(W*.30,H*.2);c.lineTo(-W*.27,H*.13);c.closePath();c.fill();
      c.strokeStyle='#fa9b62';c.lineWidth=4;
      line(c,[-33,-9,-17,4,-3,-10,12,12,38,-3]);
    }else if(o.kind==='clam'){
      c.fillStyle='#1c7181';c.strokeStyle='#b9fff0';
      rounded(c,-W/2,-H/2,W,H,18);c.fill();c.stroke();
      c.fillStyle='#72c8bd';rounded(c,-W/2+5,-H/2+4,W-10,H*.45,15);c.fill();
      c.strokeStyle='#edfff6';c.lineWidth=2;
      for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(i*19,-H*.28);c.quadraticCurveTo(i*15,2,0,H*.35);c.stroke();}
      dot(c,0,3,6,'#fdf4df');
    }else if(o.kind==='bud'){
      c.fillStyle='#3b6d4c';c.strokeStyle='#c3ef99';
      rounded(c,-W/2,-H/2,W,H,16);c.fill();c.stroke();
      for(let i=-2;i<=2;i++){
        c.fillStyle=i%2?'#98c98f':'#a8df88';
        c.beginPath();c.ellipse(i*16,-3,20,19,i*.32,0,TAU);c.fill();
        c.strokeStyle='#4c7553';c.lineWidth=2;c.stroke();
      }
      c.fillStyle='#f0e5a7';dot(c,0,0,7);
    }else if(o.kind==='servo'){
      c.fillStyle='#1d244f';c.strokeStyle='#86fff8';
      rounded(c,-W/2,-H/2,W,H,8);c.fill();c.stroke();
      c.fillStyle='#565cb8';rounded(c,-W/2+9,-H/2+7,W-18,H-14,5);c.fill();
      c.strokeStyle='#ff78ec';c.lineWidth=4;
      for(let i=-2;i<=2;i++)line(c,[i*23-7,-7,i*23+7,6]);
      dot(c,0,0,6,'#bbfffa');
    }
    c.restore();
  }
  function drawSpring(c,o,p,T,phase,t,anticipation,compression){
    const W=SIZES.spring.w,H=SIZES.spring.h;
    // One obvious, collision-accurate jumping surface: themed topper stays
    // INSIDE the 170x20 physical rectangle. Coil mechanism is drawn underneath.
    // Previous mushroom/cloud artwork protruded 30-65px above the real collider.
    const flash=phase===5 ? .24 + .23 * (compression / 5) : 0;
    const preGlow=clamp(anticipation||0,0,1);
    c.lineWidth=4.5;c.strokeStyle=T.edge;c.fillStyle=T.dark;
    rounded(c,-W/2,-H/2,W,H,9);c.fill();c.stroke();
    const g=c.createLinearGradient(0,-H/2,0,H/2);
    if(o.biome==='paradise'){
      g.addColorStop(0,'#fffef5');g.addColorStop(.5,'#f9d9a1');g.addColorStop(1,'#bd99a0');
    }else if(o.biome==='inferno'){
      g.addColorStop(0,'#ffe19a');g.addColorStop(.5,'#e9694c');g.addColorStop(1,'#662c3e');
    }else if(o.biome==='atlantis'){
      g.addColorStop(0,'#d8fff5');g.addColorStop(.5,'#62dfd4');g.addColorStop(1,'#286b80');
    }else if(o.biome==='enchanted'){
      g.addColorStop(0,'#f7ebff');g.addColorStop(.5,'#c8a6df');g.addColorStop(1,'#6c507a');
    }else if(o.biome==='neon'){
      g.addColorStop(0,'#aefff7');g.addColorStop(.5,'#38d5ec');g.addColorStop(1,'#3c3c91');
    }else{
      g.addColorStop(0,'#f4e4b5');g.addColorStop(.5,'#cba77b');g.addColorStop(1,'#795b42');
    }
    rounded(c,-W/2+4,-H/2+2,W-8,H-4,6);c.fillStyle=g;c.fill();
    // Anticipation: a soft band of light tightens as a rider approaches.
    // The entire graphic stays inside the real 170×20 sensor footprint.
    if(preGlow>0.01){
      c.save();c.beginPath();rounded(c,-W/2+5,-H/2+3,W-10,H-6,5);c.clip();
      c.fillStyle='rgba(255,255,255,'+(0.06+preGlow*0.22)+')';
      const breathe=1.5*Math.sin(t/125);c.fillRect(-W/2+6,-H/2+3+breathe, W-12,3.5);
      c.restore();
    }
    c.save();rounded(c,-W/2+4,-H/2+2,W-8,H-4,6);c.clip();
    c.strokeStyle=o.biome==='inferno'?'#fff0bc':o.biome==='neon'?'#eaffff':o.biome==='enchanted'?'#5d3d6d':T.edge;
    c.lineWidth=3.5;c.lineJoin='round';
    // Large chevrons communicate upward launch without a detached attention icon.
    for(const center of [-49,0,49]){
      const shift=(preGlow*1.2) - (compression*.19);
      c.beginPath();c.moveTo(center-12,2+shift);c.lineTo(center,-6+shift);c.lineTo(center+12,2+shift);c.stroke();
      c.beginPath();c.moveTo(center-10,7+shift);c.lineTo(center,0+shift);c.lineTo(center+10,7+shift);c.stroke();
    }
    // Biome-specific inlay: texture within the true collider, no misleading
    // solid mushroom cap or clouds suspended above the hit surface.
    c.lineWidth=1.8;
    if(o.biome==='paradise'){
      c.strokeStyle='#fffdf1';for(const dx of [-70,-25,25,70]){
        c.beginPath();c.arc(dx,1,7,Math.PI,TAU);c.stroke();}
    }else if(o.biome==='inferno'){
      c.strokeStyle='#fffa9b';for(let i=-5;i<6;i++){
        let x=i*17;c.beginPath();c.moveTo(x-6,7);c.lineTo(x,-1);c.lineTo(x+6,5);c.stroke();}
    }else if(o.biome==='atlantis'){
      c.strokeStyle='#e5fff7';for(let i=-6;i<7;i++){
        c.beginPath();c.arc(i*13,-2,4,0,Math.PI);c.stroke();}
    }else if(o.biome==='enchanted'){
      c.strokeStyle='#f6ffe2';for(let i=-6;i<=6;i++){
        c.beginPath();c.ellipse(i*13,2,5,2,.3,0,TAU);c.stroke();}
    }else if(o.biome==='neon'){
      c.strokeStyle='#a7fff7';for(let i=-6;i<=6;i++){
        c.beginPath();c.moveTo(i*13,-8);c.lineTo(i*13,-3);c.stroke();}
    }else{
      c.strokeStyle='#f5d29a';for(let i=-6;i<=6;i++){
        c.beginPath();c.moveTo(i*13,-8);c.lineTo(i*13,-4);c.stroke();}
    }
    c.strokeStyle='rgba(255,255,255,.70)';c.lineWidth=2;
    c.beginPath();c.moveTo(-W*.46,-H*.35);c.lineTo(W*.46,-H*.35);c.stroke();
    c.restore();
    // The rising shine is explicitly decorative; the entire solid object remains
    // inside the platform slab, so wheels cannot pass through apparent solid caps.
    if(flash){c.fillStyle='rgba(255,255,255,'+flash+')';rounded(c,-W/2+6,-H/2+3,W-12,H-6,5);c.fill();}
    c.fillStyle=T.metal;for(const x of [-W*.43,W*.43]){c.beginPath();c.arc(x,H*.10,3,0,TAU);c.fill();}
  }
  function draw(ctx,camX,viewW,groundY,remoteMode,demoMs,overrideItems,visualRacers){
    const configs=overrideItems||placements();if(!configs.length)return;
    const byId=remoteMode?null:new Map(host.map(e=>[e.config.id,e]));
    const now=typeof performance!=='undefined'?performance.now():0;
    const dt=drawAt?clamp(now-drawAt,0,90):16;drawAt=now;
    const blend=1-Math.exp(-dt/78);
    ctx.save();ctx.translate(-camX,groundY-GY);
    for(const o of configs){
      if(o.x<camX-320||o.x>camX+viewW+320)continue;
      let p,phase=0;
      const entry=byId&&byId.get(o.id);
      if(entry){p={x:entry.body.position.x,y:entry.body.position.y,a:entry.body.angle};phase=phaseCode(entry);}
      else if(remoteMode){const v=remote.get(o.id);if(v){for(const k of ['x','y','a'])v.view[k]+=(v.target[k]-v.view[k])*blend;p=v.view;phase=v.target.s;}else p=basePose(o);}
      else p=basePose(o);
      if(Number.isFinite(demoMs)&&!entry){
        const a=demoMs*.0015+o.id*1.7;
        if(o.kind==='tilt')p.a=Math.sin(a)*.19;
        else if(o.kind==='boulder'){p.x+=Math.sin(a)*29;p.a=Math.sin(a)*.4;}
        else if(['shard','clam','bud','servo'].includes(o.kind)){p.y-=12*(.5+.5*Math.sin(a));if(o.kind==='servo')p.x+=25*Math.sin(a);phase=Math.sin(a)>.5?1:0;}
        else if(o.kind==='spring')phase=Math.sin(a)>0.68?5:0;
      }
      // Readable approach cue: react only when a bike is actually approaching
      // the spring from its travel direction. No alert icons or distracting HUD.
      let anticipation=0;
      if(o.kind==='spring' && Array.isArray(visualRacers)){
        for(const racer of visualRacers){
          if(!racer || racer.finished || !Number.isFinite(racer.x))continue;
          const sign=racer.dir===-1?-1:1;
          const ahead=(o.x-racer.x)*sign;
          if(ahead>75 && ahead<270 && (!Number.isFinite(racer.vx) || racer.vx*sign>=-0.1))
            anticipation=Math.max(anticipation,clamp((270-ahead)/195,0,1));
        }
      }
      // Snapshot phase=5 is the ONLY confirmation of spring compression.
      // Use a local phase clock, rather than an unrelated global now % 330.
      let compression=0;
      if(o.kind==='spring'){
        const prev=springVisual.get(o.id);
        const next=prev&&prev.phase===phase?prev:{phase,since:now};
        springVisual.set(o.id,next);
        if(phase===5)compression=5*Math.sin(clamp((now-next.since)/330,0,1)*Math.PI);
      }
      const groundYLocal=ground(o.x),T=THEMES[o.biome]||THEMES.classic;
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
      // Fixed shadow follows the *physical* envelope. No dotted warning/!.
      ctx.fillStyle=o.biome==='paradise'?'rgba(80,111,151,.17)':'rgba(20,25,41,.24)';
      ctx.beginPath();ctx.ellipse(p.x,groundYLocal+4,o.kind==='tilt'?136:o.kind==='spring'?76:o.kind==='boulder'?65:77,7,0,0,TAU);ctx.fill();
      if(o.kind==='tilt'){pedestal(ctx,o,groundYLocal,T,p);}
      if(['shard','clam','bud','servo'].includes(o.kind)){
        // Fixed in-world anchor: even when the obstacle moves it does not float.
        ctx.strokeStyle=T.dark;ctx.lineWidth=8;ctx.lineCap='round';
        line(ctx,[o.x,groundYLocal-3,p.x,p.y+SIZES[o.kind].h/2]);
        ctx.strokeStyle=T.metal;ctx.lineWidth=3;
        line(ctx,[o.x,groundYLocal-3,p.x,p.y+SIZES[o.kind].h/2]);
        if(o.kind==='servo'){
          ctx.fillStyle=T.dark;rounded(ctx,o.x-91,groundYLocal-6,182,10,4);ctx.fill();
          ctx.strokeStyle=T.glow;ctx.lineWidth=2;line(ctx,[o.x-80,groundYLocal-7,o.x+80,groundYLocal-7]);
        }else if(o.kind==='bud'){
          ctx.fillStyle='#46794f';rounded(ctx,o.x-11,groundYLocal-21,22,20,7);ctx.fill();
        }else if(o.kind==='clam'){
          ctx.fillStyle=T.dark;rounded(ctx,o.x-83,groundYLocal-7,166,10,5);ctx.fill();
        }
      }
      if(o.kind==='spring'){
        // The spring pad is a passable contact surface; no rigid ramp to trap wheels.
        // The pad lies flush with the road: there is NO fake solid lead-in ramp.
        // Exposed elastic mechanism beneath the physically collidable bed.
        // Draw the coils between y=ground and y=p.y+H/2: no fake extra collider.
        const bottom=p.y+SIZES.spring.h/2, gap=Math.max(0,groundYLocal-bottom);
        const squash=compression;
        ctx.lineWidth=5;ctx.strokeStyle=T.edge;ctx.lineCap='round';
        for(const dx of [-52,0,52]){
          const x=o.x+dx;ctx.beginPath();ctx.moveTo(x,bottom);
          for(let j=1;j<=7;j++)ctx.lineTo(x+(j%2?8:-8),bottom+gap*j/8+squash*.10);
          ctx.lineTo(x,groundYLocal);ctx.stroke();
        }
        ctx.fillStyle=T.dark;rounded(ctx,o.x-81,groundYLocal-5,162,10,4);ctx.fill();
      }
      ctx.translate(p.x,p.y);ctx.rotate(p.a);
      if(o.kind==='boulder')ctx.scale(SIZES.boulder.rx/SIZES.boulder.r,1);
      ctx.shadowColor=T.glow;ctx.shadowBlur=o.biome==='neon'||o.biome==='paradise'?14:6;
      if(o.kind==='boulder')drawBoulder(ctx,o,p,T,demoMs||now);
      else if(o.kind==='tilt')drawTilt(ctx,o,p,T,demoMs||now);
      else if(['shard','clam','bud','servo'].includes(o.kind))drawChallenge(ctx,o,p,T,phase,demoMs||now);
      else if(o.kind==='spring')drawSpring(ctx,o,p,T,phase,demoMs||now,anticipation,compression);
      ctx.restore();
    }
    ctx.restore();
  }
  return {mount,contact,beforeStep,afterStep,snapshot,receive,clearClient,draw,
    get hostBodies(){return host.map(e=>e.body);},get SIZES(){return SIZES;}};
})();
