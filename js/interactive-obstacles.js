/* V22 – ostacoli reattivi / art direction per ciascun mondo.
 * In gara solo l'host crea e simula i corpi Matter. I client ricevono pose+fasi.
 * Il disegno usa sempre la sagoma fisica esatta di ogni oggetto.
 */
const InteractiveObstacles = (() => {
  'use strict';
  const TAU=Math.PI*2, GY=520;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const SIZES={boulder:{r:49},tilt:{w:282,h:22},drop:{w:272,h:20},spring:{w:152,h:22}};
  const THEMES={
    classic:{dark:'#514539',mid:'#9a7750',light:'#f4d7a0',edge:'#5d4036',metal:'#e2b15d',glow:'#fff1bb'},
    paradise:{dark:'#5e7999',mid:'#d4bb82',light:'#fff7db',edge:'#8d6e9b',metal:'#e5bc64',glow:'#fff6cf'},
    inferno:{dark:'#2e1b32',mid:'#713949',light:'#fb9d6e',edge:'#260f27',metal:'#dc7360',glow:'#ff5c49'},
    atlantis:{dark:'#1a5167',mid:'#4fa4ad',light:'#b6fff0',edge:'#185774',metal:'#e0cf8c',glow:'#72fff0'},
    enchanted:{dark:'#284d43',mid:'#628a61',light:'#c4e6a2',edge:'#39523e',metal:'#bde29b',glow:'#b4ff95'},
    neon:{dark:'#191736',mid:'#4749a5',light:'#77fff0',edge:'#fb63df',metal:'#8ca8ff',glow:'#36f2ed'}
  };
  let host=[], remote=new Map(), drawAt=0, activeRacers=[];
  const placements=()=>Terrain.INTERACTIVE_OBSTACLES||[];
  const ground=(x)=>GY-Terrain.height(x);
  const basePose=(o)=>({x:o.x,y:ground(o.x)-({boulder:49,tilt:39,drop:34,spring:21}[o.kind]||25),a:0,s:0});
  const nearby=(rs,x,r=230)=>Boolean(rs&&rs.some(q=>q&&!q.finished&&q.chassis&&Math.abs(q.chassis.position.x-x)<r));
  function mount(world){
    host=[];activeRacers=[];remote=new Map();drawAt=0;
    for(const config of placements()){
      const p=basePose(config); let body, joint=null;
      if(config.kind==='boulder'){
        body=Matter.Bodies.circle(p.x,p.y,SIZES.boulder.r,{label:'interactive-boulder',density:.0008,friction:.7,frictionStatic:.76,frictionAir:.018,restitution:.08,slop:.02},30);
      }else if(config.kind==='tilt'){
        body=Matter.Bodies.rectangle(p.x,p.y,SIZES.tilt.w,SIZES.tilt.h,{label:'interactive-tilt',density:.0014,friction:.83,frictionStatic:.86,frictionAir:.12,restitution:.06,slop:.02});
        joint=Matter.Constraint.create({pointA:{x:p.x,y:p.y},bodyB:body,pointB:{x:0,y:0},length:0,stiffness:.96,damping:.31,render:{visible:false}});
      }else if(config.kind==='drop'){
        body=Matter.Bodies.rectangle(p.x,p.y,SIZES.drop.w,SIZES.drop.h,{label:'interactive-drop',isStatic:true,friction:.79,frictionStatic:.85,restitution:.08,slop:.02});
        body.friction=.79;body.frictionStatic=.85;body.restitution=.08;
      }else if(config.kind==='spring'){
        body=Matter.Bodies.rectangle(p.x,p.y,SIZES.spring.w,SIZES.spring.h,{label:'interactive-spring',isStatic:true,friction:.68,frictionStatic:.79,restitution:.22,slop:.02});
        body.friction=.68;body.frictionStatic=.79;body.restitution=.22;
      }else continue;
      body.interactiveId=config.id;
      host.push({config,body,joint,original:p,phase:'idle',phaseAt:0,lastTriggerAt:-1e7,resetAt:-1,dropY:0});
      Matter.World.add(world,joint?[body,joint]:[body]);
    }
  }
  function contact(a,b,timeMs){
    const kind=(b)=>b&&b.label||'';
    let obstacle=/^interactive-(drop|spring)$/.test(kind(a))?a:null;
    let rider=obstacle?b:null;
    if(!obstacle && /^interactive-(drop|spring)$/.test(kind(b))){obstacle=b;rider=a;}
    if(!obstacle || !rider || !['wheel','chassis'].includes(rider.label))return;
    const entry=host.find(q=>q.body===obstacle);if(!entry)return;
    if(obstacle.label==='interactive-spring'){
      if(timeMs-entry.lastTriggerAt<850)return;
      entry.lastTriggerAt=timeMs;entry.phase='spring';entry.phaseAt=timeMs;
      // The entire bicycle bounces together. The contact wheel is not a
      // disconnected magic kicker; all 3 bodies share a single event.
      const racer=activeRacers.find(r=>r&&(r.fw===rider||r.rw===rider||r.chassis===rider));
      const bs=racer?[racer.chassis,racer.fw,racer.rw]:[rider];
      for(const v of bs) Matter.Body.setVelocity(v,{x:v.velocity.x+Math.min(1.1,Math.max(.2,v.velocity.x*.08)),y:Math.min(v.velocity.y,-11.1)});
    }else if(entry.phase==='idle'){
      entry.phase='loaded';entry.phaseAt=timeMs;
    }
  }
  function beforeStep(nowMs,racers){
    activeRacers=racers||[];
    for(const entry of host){
      const b=entry.body, home=entry.original;
      if(entry.config.kind==='tilt'){
        const a=clamp(b.angle,-.22,.22);
        if(a!==b.angle){Matter.Body.setAngle(b,a);Matter.Body.setAngularVelocity(b,0);}
        Matter.Body.setAngularVelocity(b,clamp((b.angularVelocity-a*.013)*.953,-.038,.038));
      }else if(entry.config.kind==='drop'){
        const age=nowMs-entry.phaseAt;
        if(entry.phase==='loaded' && age>=220){entry.phase='sag';entry.phaseAt=nowMs;}
        else if(entry.phase==='sag' && age>=420){entry.phase='down';entry.phaseAt=nowMs;}
        else if(entry.phase==='down' && age>=1100 && !nearby(racers,entry.config.x,180)){
          entry.phase='recover';entry.phaseAt=nowMs;
        } else if(entry.phase==='recover' && age>=650){entry.phase='idle';entry.phaseAt=nowMs;}
        const duration=nowMs-entry.phaseAt;
        const down=entry.phase==='sag'?49*clamp(duration/420,0,1):entry.phase==='down'?49:
          entry.phase==='recover'?49*(1-clamp(duration/650,0,1)):0;
        entry.dropY=down;
        Matter.Body.setPosition(b,{x:home.x,y:home.y+down},true);
      }else if(entry.config.kind==='spring'){
        if(entry.phase==='spring'&&nowMs-entry.phaseAt>330)entry.phase='idle';
      }
    }
  }
  function afterStep(nowMs,racers){
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
  const phaseCode=e=>({loaded:1,sag:2,down:3,recover:4,spring:5})[e.phase]||0;
  function snapshot(){return host.map(e=>[e.config.id,Math.round(e.body.position.x*10)/10,Math.round(e.body.position.y*10)/10,Math.round(e.body.angle*1000)/1000,phaseCode(e)]);}
  function receive(rows){
    if(!Array.isArray(rows))return;
    const ids=new Set(placements().map(o=>o.id));
    for(const a of rows){if(!Array.isArray(a)||a.length!==5||!ids.has(a[0])||!a.slice(1).every(Number.isFinite))continue;
      const prev=remote.get(a[0]),p={x:a[1],y:a[2],a:a[3],s:a[4]};
      remote.set(a[0],{target:p,view:prev?prev.view:{...p}});
    }
  }
  function clearClient(){remote=new Map();drawAt=0;}
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
  function pedestal(c,o,g,theme){
    c.fillStyle=theme.dark;c.strokeStyle=theme.metal;c.lineWidth=3;
    c.beginPath();c.moveTo(o.x-23,g-4);c.lineTo(o.x+23,g-4);c.lineTo(o.x+12,g-36);c.lineTo(o.x-12,g-36);c.closePath();c.fill();c.stroke();
    dot(c,o.x,g-39,8,theme.metal);dot(c,o.x,g-39,3,theme.dark);
    if(o.biome==='paradise'){
      c.strokeStyle=theme.light;c.lineWidth=2;line(c,[o.x-4,g-28,o.x+4,g-28]);line(c,[o.x,g-32,o.x,g-23]);
    }else if(o.biome==='neon'){
      c.strokeStyle=theme.glow;c.lineWidth=2;line(c,[o.x-8,g-15,o.x,g-24,o.x+8,g-15]);
    }
  }
  function drawBoulder(c,o,p,T,ms){
    const R=SIZES.boulder.r;
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
      c.fillStyle='#47755b';dot(c,0,0,36);c.strokeStyle='#d0ffab';c.lineWidth=3;
      for(let i=0;i<5;i++){let a=i*TAU/5;line(c,[Math.cos(a)*12,Math.sin(a)*12,Math.cos(a+.3)*37,Math.sin(a+.3)*37]);}
      c.fillStyle='#85ae62';for(let i=0;i<6;i++){c.beginPath();c.ellipse(Math.sin(i*3.2)*30,Math.cos(i*2.3)*28,8,4,i,0,TAU);c.fill();}
      star(c,0,0,6,15,7);c.strokeStyle='#f3ffce';c.stroke();
    }else if(o.biome==='neon'){
      c.strokeStyle='#7cf9ff';c.lineWidth=4;for(let i=0;i<6;i++){let a=i*TAU/6;line(c,[Math.cos(a)*23,Math.sin(a)*23,Math.cos(a+.2)*41,Math.sin(a+.2)*41]);}
      c.fillStyle='#243e85';dot(c,0,0,24);c.strokeStyle='#fa70e3';c.beginPath();c.arc(0,0,17,-.2,Math.PI*1.35);c.stroke();dot(c,0,0,6,'#c2fffc');
    }else if(o.biome==='paradise'){
      c.fillStyle='#fcf1d7';dot(c,0,0,35);c.strokeStyle='#d8b56b';c.lineWidth=3;
      c.beginPath();c.arc(0,0,24,0,TAU);c.stroke();star(c,0,0,8,18,12);c.stroke();dot(c,0,0,4,'#be965c');
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
  function drawDrop(c,o,p,T,s,t){
    const W=SIZES.drop.w,H=SIZES.drop.h;
    c.fillStyle=T.dark;c.strokeStyle=T.edge;c.lineWidth=4;
    rounded(c,-W/2,-H/2,W,H,5);c.fill();c.stroke();
    const grad=c.createLinearGradient(0,-H/2,0,H/2);grad.addColorStop(0,T.light);grad.addColorStop(1,T.mid);c.fillStyle=grad;
    rounded(c,-W/2+4,-H/2+3,W-8,H-7,4);c.fill();
    c.lineWidth=2;c.strokeStyle=T.edge;
    for(let i=-4;i<=4;i++){line(c,[i*29,-H/2+3,i*29,H/2-3]);}
    if(o.biome==='paradise'){
      c.strokeStyle='#dfb967';c.lineWidth=2.5;
      for(let i=-4;i<=4;i++){c.beginPath();c.arc(i*29,-3,5,Math.PI,0);c.stroke();}
      c.fillStyle='#fffdfa';for(let i=-4;i<=4;i+=2)dot(c,i*29,0,3);
    }else if(o.biome==='inferno'){
      c.fillStyle='#432739';for(let i=-4;i<=4;i+=2){rounded(c,i*29-8,-6,15,10,1);c.fill();}
      c.strokeStyle='#ff8b5e';line(c,[-W*.38,4,-W*.14,-1,0,5,W*.15,-2,W*.38,4]);
    }else if(o.biome==='atlantis'){
      c.strokeStyle='#b8fff2';for(let i=-4;i<=4;i+=2){c.beginPath();c.arc(i*29,4,8,Math.PI,TAU);c.stroke();}
      c.fillStyle='#fff3d9';dot(c,0,-2,4);
    }else if(o.biome==='enchanted'){
      c.strokeStyle='#e9ffb9';for(let i=-4;i<=4;i++){c.beginPath();c.ellipse(i*29,-1,8,4,.3,0,TAU);c.stroke();}
      c.strokeStyle='#73583c';line(c,[-W*.4,5,-W*.2,-2,0,5,W*.2,-2,W*.4,5]);
    }else if(o.biome==='neon'){
      c.fillStyle='#162447';for(let i=-4;i<=4;i+=2){rounded(c,i*29-10,-6,18,11,2);c.fill();}
      c.strokeStyle='#86fff9';for(let i=-4;i<=4;i++)line(c,[i*29-4,-2,i*29+4,-2]);
      if(s>=1&&s<=3){c.strokeStyle='#ff72de';c.lineWidth=3;line(c,[-W*.35,7,W*.35,7]);}
    }else{
      for(let i=-4;i<=4;i++){dot(c,i*29,2,2.4,T.edge);}
    }
    // Native fracture/sag cues, rather than an attention icon.
    if(s>=1&&s<=3){c.strokeStyle=o.biome==='neon'?'#fb84ef':T.edge;c.lineWidth=2.8;
      line(c,[-24,-8,-8,1,2,-5,17,7,29,0]);line(c,[52,-5,66,4,81,-2]);}
  }
  function drawSpring(c,o,p,T,s,t){
    const W=SIZES.spring.w,H=SIZES.spring.h;
    // Springs and bouncing surfaces remain a physically 152x22 capsule.
    c.fillStyle=T.dark;c.strokeStyle=T.edge;c.lineWidth=4;
    rounded(c,-W/2,-H/2,W,H,10);c.fill();c.stroke();
    c.fillStyle=T.mid;rounded(c,-W/2+4,-H/2+3,W-8,H-6,7);c.fill();
    const phase=Math.sin(t*.003)*1.5;
    if(o.biome==='paradise'){
      c.fillStyle='#fffdf5';for(let i=-3;i<=3;i++){c.beginPath();c.ellipse(i*19,-11+phase,20,11,0,0,TAU);c.fill();}
      c.strokeStyle='#d7b56e';c.lineWidth=3;line(c,[-60,3,60,3]);
      for(let i=-2;i<=2;i++)dot(c,i*25,-14+phase,3,'#f7d484');
    }else if(o.biome==='enchanted'){
      c.fillStyle='#e5d4e9';c.beginPath();c.moveTo(-68,-2);c.quadraticCurveTo(-43,-37,0,-36);c.quadraticCurveTo(49,-37,69,-2);c.closePath();c.fill();
      c.strokeStyle='#ba8cd3';c.lineWidth=3;c.beginPath();c.moveTo(-66,-4);c.quadraticCurveTo(0,-68,66,-4);c.stroke();
      c.fillStyle='#f4efb7';for(let dx of [-34,0,34])dot(c,dx,-16+phase,6);
    }else if(o.biome==='inferno'){
      c.fillStyle='#f77450';for(let i=-3;i<=3;i++){
        c.beginPath();c.moveTo(i*21-8,-7);c.quadraticCurveTo(i*21-12,-17-phase,i*21,-24-phase);c.quadraticCurveTo(i*21+13,-10,i*21+8,-7);c.closePath();c.fill();}
      c.strokeStyle='#ffd08b';line(c,[-55,1,55,1]);
    }else if(o.biome==='atlantis'){
      c.fillStyle='#81e5d6';c.beginPath();c.ellipse(0,-10,63,14,0,0,TAU);c.fill();
      for(let i=-3;i<=3;i++){c.strokeStyle='#b9fff6';c.lineWidth=2;c.beginPath();c.arc(i*18,-24+phase,5+(i%2+2)%2,0,TAU);c.stroke();}
      c.strokeStyle='#fbe7ae';line(c,[-52,0,52,0]);
    }else if(o.biome==='neon'){
      c.fillStyle='#1e2a54';rounded(c,-65,-10,130,16,4);c.fill();c.strokeStyle='#3ffbec';c.lineWidth=4;
      for(let i=-3;i<=3;i++)line(c,[i*19-8,-4,i*19,-11-phase,i*19+8,-4]);
      c.strokeStyle='#ff71e6';line(c,[-55,6,55,6]);
    }else{
      c.strokeStyle=T.light;c.lineWidth=4;for(let i=-3;i<=3;i++){line(c,[i*18-6,-6,i*18,-12,i*18+6,-6]);}
      c.strokeStyle=T.metal;line(c,[-60,5,60,5]);
    }
  }
  function draw(ctx,camX,viewW,groundY,remoteMode,demoMs,overrideItems){
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
        else if(o.kind==='drop'){p.y+=22*(.5-.5*Math.cos(a));phase=Math.sin(a)>.25?2:0;}
        else if(o.kind==='spring')phase=Math.sin(a)>0.68?5:0;
      }
      const groundYLocal=ground(o.x),T=THEMES[o.biome]||THEMES.classic;
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
      // Fixed shadow follows the *physical* envelope. No dotted warning/!.
      ctx.fillStyle=o.biome==='paradise'?'rgba(80,111,151,.17)':'rgba(20,25,41,.24)';
      ctx.beginPath();ctx.ellipse(p.x,groundYLocal+4,o.kind==='tilt'||o.kind==='drop'?136:o.kind==='spring'?76:54,7,0,0,TAU);ctx.fill();
      if(o.kind==='tilt')pedestal(ctx,o,groundYLocal,T);
      if(o.kind==='drop')bridgeBase(ctx,o,groundYLocal,T);
      if(o.kind==='spring'){
        ctx.strokeStyle=T.edge;ctx.lineWidth=4;for(const dx of [-52,52])line(ctx,[o.x+dx,groundYLocal,o.x+dx,groundYLocal-12]);
      }
      ctx.translate(p.x,p.y);ctx.rotate(p.a);
      ctx.shadowColor=T.glow;ctx.shadowBlur=o.biome==='neon'||o.biome==='paradise'?14:6;
      if(o.kind==='boulder')drawBoulder(ctx,o,p,T,demoMs||now);
      else if(o.kind==='tilt')drawTilt(ctx,o,p,T,demoMs||now);
      else if(o.kind==='drop')drawDrop(ctx,o,p,T,phase,demoMs||now);
      else if(o.kind==='spring')drawSpring(ctx,o,p,T,phase,demoMs||now);
      ctx.restore();
    }
    ctx.restore();
  }
  return {mount,contact,beforeStep,afterStep,snapshot,receive,clearClient,draw,
    get hostBodies(){return host.map(e=>e.body);},get SIZES(){return SIZES;}};
})();
