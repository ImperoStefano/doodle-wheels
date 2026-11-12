/* Doodle Wheels V21 — ostacoli realmente solidi e animati.
 * Il percorso è deterministico (Terrain.DYNAMIC_OBSTACLES); Matter.js risolve
 * le collisioni SOLTANTO sull'host. I client ridisegnano le stesse traiettorie.
 */
const DynamicObstacles = (() => {
  const TAU = Math.PI * 2, clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
  let instances = [];
  let remoteStates = null;
  const smoothstep = v => {v=clamp(v,0,1);return v*v*(3-2*v);};
  function pose(o, elapsedMs, baseY = 520) {
    const g = baseY - Terrain.height(o.x), t = Math.max(0, elapsedMs) / 1000;
    const a = TAU * t / o.period + o.phase;
    const s = Math.sin(a), c = Math.cos(a);
    switch (o.kind) {
      case 'bell': case 'meteor': {
        const anchorY = g - 171, angle = 0.38 * s;
        return { x: o.x + Math.sin(angle) * 112, y: anchorY + Math.cos(angle) * 112, angle, anchorY, anchorX: o.x, radius: 29 };
      }
      case 'piston': {
        // Rientra completamente sotto il terreno tra una chiusura e l'altra.
        const raised = smoothstep((1 - Math.cos(a)) * 0.5);
        return { x:o.x, y:g + 61 - 94 * raised, angle:0, raised, width:24, height:66 };
      }
      case 'balance': return {x:o.x,y:g-21,angle:0,width:290,height:23};
      case 'crumble': return {x:o.x,y:g-18,angle:0,width:280,height:22};
      case 'gate': {const lift=smoothstep((1+Math.sin(a))/2);return {x:o.x,y:g-100-145*lift,angle:0,width:28,height:175};}
      case 'spring': return {x:o.x,y:g-20+3*s,angle:0,width:144,height:30};
      case 'boulder': return {x:o.x,y:g-64,angle:0,radius:64};
      case 'bigroller': return {x:o.x+20*s,y:g-60,angle:a*.7,radius:60};
      case 'log': case 'seesaw':
        return { x:o.x, y:g-27, angle:0.17*s, width:o.kind==='log'?170:220, height:28 };
      case 'iceblock':
        return { x:o.x+18*s, y:g-36, angle:0, width:92, height:74 };
      case 'shell':
        return { x:o.x, y:g-42-7*(0.5+0.5*s), angle:0.09*s, radius:40 };
      default:
        return { x:o.x+14*s, y:g-48, angle:a*0.7, radius:48 };
    }
  }
  function makeBody(o) {
    const p = pose(o,0);
    // Material differences matter: ice is slippery, forest timber grips, Atlantis bounces.
    const profile = ({iceblock:[0.045,0.08,0.04],log:[0.8,0.8,0.12],
      balance:[0.85,0.8,0.12],crumble:[0.68,0.75,0.08],gate:[0.6,0.6,0.1],spring:[0.6,0.7,0.7],boulder:[0.9,0.9,0.1],bigroller:[0.7,0.75,0.15],shell:[0.48,0.58,0.32],seesaw:[0.66,0.68,0.14],
      bell:[0.52,0.56,0.2],meteor:[0.64,0.66,0.15],
      piston:[0.5,0.6,0.09],roller:[0.62,0.68,0.2]})[o.kind] || [0.6,0.68,0.16];
    const options={isStatic:o.kind!=='boulder', label:'obstacle-v22-'+o.kind,
      friction:profile[0], frictionStatic:profile[1], restitution:profile[2], slop:0.025};
    let b;
    if (p.radius) b = Matter.Bodies.circle(p.x,p.y,p.radius,options,20);
    else b = Matter.Bodies.rectangle(p.x,p.y,p.width,p.height,options);
    // Matter può azzerare la restitution nelle isStatic durante la creazione.
    b.friction=profile[0]; b.frictionStatic=profile[1]; b.restitution=profile[2];
    Matter.Body.setAngle(b,p.angle || 0);
    return b;
  }
  function mount(world) {
    remoteStates=null;instances = (Terrain.DYNAMIC_OBSTACLES || []).map(o=>({config:o, body:makeBody(o), tilt:0, tiltVelocity:0, drop:0, dropVelocity:0, cooldown:0, initialX:o.x}));
    if (instances.length) Matter.World.add(world, instances.map(q=>q.body));
    // A rolling boulder is a genuinely dynamic Matter body; a soft tether prevents
    // it from escaping the section and obstructing later players indefinitely.
    for(const q of instances) if(q.config.kind==='boulder') {
      const g=520-Terrain.height(q.config.x);
      Matter.World.add(world,Matter.Constraint.create({pointA:{x:q.config.x,y:g-64},bodyB:q.body,stiffness:0.0012,damping:0.09,length:0}));
    }
  }
  function update(elapsedMs, racers) {
    const dt=1/120;
    for (const q of instances) {
      const {config:o,body}=q;
      if(o.kind==='boulder') continue; // Matter simulates mass, impulse and rotation.
      const p=pose(o,elapsedMs);
      if(o.kind==='balance'||o.kind==='crumble'){
        let load=0, weight=0;
        for(const r of racers||[]){
          if(r.finished) continue;
          for(const wheel of [r.fw,r.rw]){
            if(!wheel)continue;
            const dx=wheel.position.x-o.x,dy=wheel.position.y-p.y;
            if(Math.abs(dx)<145 && dy>-95 && dy<26){
              const strength=Math.max(0,1-Math.abs(dx)/155);
              load+=strength;weight+=strength*clamp(dx/145,-1,1);
            }
          }
        }
        if(o.kind==='balance'){
          // Damped spring: landing on either side changes the angle.
          q.tiltVelocity+=(clamp(weight*.24,-.23,.23)-q.tilt)*.075;
          q.tiltVelocity*=.88;q.tilt=clamp(q.tilt+q.tiltVelocity,-.24,.24);
          p.angle=q.tilt;
        } else {
          // A bridge visibly sags while loaded and gradually rebuilds.
          const target=load>.35?25:0;
          q.dropVelocity+=(target-q.drop)*.07;
          q.dropVelocity*=.86;q.drop=clamp(q.drop+q.dropVelocity,0,28);
          p.y+=q.drop;
        }
      }
      Matter.Body.setPosition(body,{x:p.x,y:p.y},true);
      Matter.Body.setAngle(body,p.angle || 0,true);
    }
  }
  function snapshot(){return instances.map(q=>{
    const b=q.body;return [Math.round(b.position.x*10)/10,Math.round(b.position.y*10)/10,Math.round(b.angle*1000)/1000];
  });}
  function setRemoteStates(states){remoteStates=Array.isArray(states)?states:null;}
  // Used for visual warnings. The warning never changes collision or racer velocity.
  function active(o, t) {
    if (o.kind === 'gate') return pose(o,t).y > 520 - Terrain.height(o.x) - 190;
    if (o.kind === 'piston') return pose(o,t).raised > 0.42;
    if (o.kind === 'meteor' || o.kind === 'bell') return Math.abs(Math.cos(TAU*Math.max(0,t)/1000/o.period + o.phase)) > 0.65;
    return true;
  }
  // Natural shadows only, no generic floating warning badges or road markings.
  function groundMarker(ctx, x, gy) {
    const y=gy-Terrain.height(x);ctx.save();ctx.fillStyle='rgba(25,31,49,.14)';
    ctx.beginPath();ctx.ellipse(x,y+3,62,5,0,0,TAU);ctx.fill();ctx.restore();
  }
  const COLORS={
    classic:{a:'#eab56c',b:'#78604b',c:'#443848',l:'#ffe6a5'},
    paradise:{a:'#ecc46f',b:'#fff5d9',c:'#807597',l:'#fff9e7'},
    inferno:{a:'#ff906c',b:'#6c3445',c:'#281b30',l:'#ffd090'},
    atlantis:{a:'#73ffeb',b:'#438f9c',c:'#21576e',l:'#d4fff9'},
    enchanted:{a:'#b8eaa2',b:'#61826a',c:'#395044',l:'#f1ffc4'},
    neon:{a:'#5ffdf2',b:'#4547a0',c:'#1d244f',l:'#ff75e6'}
  };
  function ln(c,pts){c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.stroke();}
  function circ(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
  function rect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
  function circleBody(c,o,p,T,ms){
    const R=p.radius;
    c.lineWidth=4;c.strokeStyle=T.c;
    c.fillStyle=o.kind==='meteor'?T.b:o.kind==='bell'?'#f5dfab':o.kind==='shell'?'#5aafaf':o.kind==='boulder'?'#947a67':T.b;
    c.beginPath();c.arc(0,0,R,0,TAU);c.fill();c.stroke();
    c.lineWidth=3;c.strokeStyle=T.a;
    if(o.kind==='bell'){
      // Readable heavenly pendulum: a large brass censer, not a tiny circle.
      c.fillStyle='#fff0be';c.beginPath();c.arc(0,0,R*.77,0,TAU);c.fill();
      c.strokeStyle='#bd946a';c.beginPath();c.arc(0,0,R*.70,Math.PI*.08,Math.PI*.92);c.stroke();
      for(let i=-2;i<=2;i++){c.beginPath();c.moveTo(i*12,-R*.42);c.quadraticCurveTo(i*5,0,i*11,R*.47);c.stroke();}
      c.strokeStyle='#a783a4';ln(c,[0,-21,0,20]);ln(c,[-10,-7,10,-7]);
      circ(c,0,R*.70,7,'#b78b48');
    } else if(o.kind==='meteor'){
      circ(c,0,0,R*.83,'#3d1e2d');c.strokeStyle='#ff9957';c.lineWidth=4;
      ln(c,[-R*.72,-13,-19,-7,-7,14,21,20,R*.65,-7]);ln(c,[-10,-R*.75,3,-22,15,-R*.5]);
      for(let i=0;i<7;i++){let a=i*TAU/7;circ(c,Math.cos(a)*R*.78,Math.sin(a)*R*.78,4.5,'#ff604c');}
    } else if(o.kind==='shell'){
      circ(c,0,0,R*.79,'#286e80');c.strokeStyle='#bdf8e6';c.lineWidth=3;
      for(let i=-3;i<=3;i++){c.beginPath();c.moveTo(0,R*.72);c.quadraticCurveTo(i*11,-8,i*11,-R*.68);c.stroke();}
      circ(c,0,-12,8,'#fff0c2');c.beginPath();c.arc(0,0,R*.72,Math.PI*.1,Math.PI*.9);c.stroke();
    } else if(o.kind==='bigroller'||o.kind==='roller'){
      c.strokeStyle=o.biome==='atlantis'?'#c6fff1':'#e5c497';c.lineWidth=4;
      for(let i=0;i<8;i++){let a=i*TAU/8;ln(c,[Math.cos(a)*R*.27,Math.sin(a)*R*.27,Math.cos(a+.13)*R*.85,Math.sin(a+.13)*R*.85]);}
      circ(c,0,0,11,T.c);circ(c,0,0,5,T.a);
      if(o.biome==='atlantis'){for(let i=0;i<8;i++){let a=i*TAU/8;circ(c,Math.cos(a)*R*.72,Math.sin(a)*R*.72,3,'#9dffda');}}
    } else { // standard boulder
      c.strokeStyle='#dec9a7';c.lineWidth=3;ln(c,[-25,-9,-8,3,8,-8,22,9]);ln(c,[-8,-25,1,-12,20,-17]);
      if(o.biome==='inferno')c.strokeStyle='#ff925d';
    }
    c.fillStyle='rgba(255,255,255,.17)';c.beginPath();c.ellipse(-R*.34,-R*.44,R*.27,R*.1,-.65,0,TAU);c.fill();
  }
  function barBody(c,o,p,T,ms){
    const W=p.width,H=p.height;
    c.lineWidth=4;c.strokeStyle=T.c;c.fillStyle=T.b;
    rect(c,-W/2,-H/2,W,H,Math.min(8,H*.22));c.fill();c.stroke();
    const g=c.createLinearGradient(0,-H/2,0,H/2);g.addColorStop(0,T.l);g.addColorStop(.6,T.a);g.addColorStop(1,T.b);
    c.fillStyle=g;rect(c,-W/2+4,-H/2+3,W-8,H-6,Math.min(6,H*.2));c.fill();
    c.strokeStyle=T.c;c.lineWidth=2;
    if(o.kind==='balance'||o.kind==='crumble'||o.kind==='seesaw'){
      for(let i=-Math.floor(W/50);i<=Math.floor(W/50);i++)ln(c,[i*24,-H/2+3,i*24,H/2-4]);
      if(o.biome==='paradise'){
        c.strokeStyle='#92729a';for(let i=-3;i<=3;i++){c.beginPath();c.arc(i*39,0,7,Math.PI,0);c.stroke();}
        ln(c,[0,-8,0,8]);ln(c,[-6,-1,6,-1]);
      }else if(o.biome==='enchanted'){
        c.strokeStyle='#d5efaa';for(let i=-4;i<=4;i++){c.beginPath();c.ellipse(i*27,0,7,3,.2,0,TAU);c.stroke();}
      }else if(o.biome==='neon'){
        c.strokeStyle='#72fff5';ln(c,[-W*.43,1,W*.43,1]);
      }
      if(o.kind==='crumble'){c.lineWidth=3;c.strokeStyle=T.c;ln(c,[-31,-10,-12,1,6,-4,23,8,40,0]);}
    }else if(o.kind==='log'){
      c.strokeStyle='#46694c';c.lineWidth=2;
      for(let i=-3;i<=3;i++){c.beginPath();c.ellipse(i*21,0,7,3,.2,0,TAU);c.stroke();}
      for(let i=-3;i<=3;i+=2){c.fillStyle='#adcf8c';c.beginPath();c.ellipse(i*21,-H*.48,13,7,i*.25,0,TAU);c.fill();}
    }else if(o.kind==='iceblock'){
      c.fillStyle='rgba(239,255,255,.80)';c.beginPath();c.moveTo(-W*.37,-H*.34);c.lineTo(-W*.1,-H*.40);c.lineTo(W*.29,-H*.21);c.lineTo(W*.13,H*.04);c.closePath();c.fill();
      c.strokeStyle='#77cbeb';ln(c,[-W*.25,H*.23,-W*.12,H*.05,W*.11,H*.33]);
    }else if(o.kind==='spring'){
      c.strokeStyle=T.c;c.lineWidth=3;
      for(let i=-3;i<=3;i++)ln(c,[i*17-8,0,i*17,-H*.27,i*17+8,0]);
      if(o.biome==='paradise'){
        c.fillStyle='#fffef3';for(let i=-3;i<=3;i++){c.beginPath();c.ellipse(i*17,-H*.3,16,9,0,0,TAU);c.fill();}
      }else if(o.biome==='enchanted'){
        c.fillStyle='#f3d9f7';c.beginPath();c.ellipse(0,-H*.36,W*.45,16,0,Math.PI,TAU);c.fill();
      }
    }else if(o.kind==='gate'){
      // Narrow vertical barrier whose whole 178px silhouette has collision.
      c.fillStyle=T.c;rect(c,-W*.25,-H*.42,W*.5,H*.84,4);c.fill();
      c.strokeStyle=T.a;c.lineWidth=3;
      for(let i=-2;i<=2;i++)ln(c,[-W*.38,i*H*.18,W*.38,i*H*.18]);
      c.fillStyle=T.l;circ(c,0,0,8,T.l);
    }else if(o.kind==='piston'){
      // Mechanical piston with 56x88 collider; clear lateral boundaries.
      c.strokeStyle=T.a;c.lineWidth=4;
      for(let i=-2;i<=2;i++)ln(c,[-W*.36,i*H*.17,W*.36,i*H*.17]);
      c.fillStyle=T.l;rect(c,-W*.4,-H/2+4,W*.8,9,3);c.fill();
    }
  }
  function draw(ctx,camX,viewportWidth,gy,elapsedMs,overrideItems){
    const items=overrideItems||Terrain.DYNAMIC_OBSTACLES||[];
    if(!items.length)return;
    ctx.save();ctx.translate(-camX,0);
    for(const o of items){
      if(o.x<camX-300||o.x>camX+viewportWidth+300)continue;
      const p=pose(o,elapsedMs,gy),r=remoteStates&&remoteStates[o.id],local=instances[o.id];
      const body=r||((local&&local.body)?[local.body.position.x,local.body.position.y,local.body.angle]:null);
      if(body&&['boulder','balance','crumble'].includes(o.kind)){p.x=body[0];p.y=body[1];p.angle=body[2];}
      const T=COLORS[o.biome]||COLORS.classic;
      const groundY=gy-Terrain.height(o.x);
      // Contact shadow and mechanical fixtures are physically intuitive.
      ctx.fillStyle='rgba(23,26,42,.19)';ctx.beginPath();ctx.ellipse(o.x,groundY+3,
        p.width?Math.min(p.width*.49,145):p.radius?Math.max(39,p.radius):48,6,0,0,TAU);ctx.fill();
      if(p.anchorY!==undefined){
        ctx.strokeStyle=T.c;ctx.lineWidth=10;ctx.lineCap='round';ln(ctx,[p.anchorX,p.anchorY,p.x,p.y]);
        ctx.strokeStyle=T.a;ctx.lineWidth=4;ln(ctx,[p.anchorX,p.anchorY,p.x,p.y]);
        circ(ctx,p.anchorX,p.anchorY,12,T.c);circ(ctx,p.anchorX,p.anchorY,5,T.a);
      } else if(o.kind==='piston'){
        ctx.fillStyle=T.c;ctx.strokeStyle=T.a;ctx.lineWidth=3;
        rect(ctx,o.x-45,groundY-1,90,17,3);ctx.fill();ctx.stroke();
        for(let i=-1;i<=1;i++)circ(ctx,o.x+i*28,groundY+7,2,T.l);
      }else if(o.kind==='gate'){
        for(let d of [-1,1]){
          ctx.strokeStyle=T.a;ctx.lineWidth=7;
          ln(ctx,[o.x+d*35,groundY-238,o.x+d*35,groundY-4]);
          ctx.strokeStyle=T.c;ctx.lineWidth=2.5;
          ln(ctx,[o.x+d*35,groundY-238,o.x+d*35,groundY-4]);
        }
      }else if(o.kind==='balance'||o.kind==='crumble'){
        ctx.fillStyle=T.c;ctx.beginPath();ctx.moveTo(o.x-18,groundY);ctx.lineTo(o.x+18,groundY);ctx.lineTo(o.x,groundY-27);ctx.closePath();ctx.fill();
        circ(ctx,o.x,groundY-25,5,T.a);
      }
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle||0);
      ctx.shadowColor=T.a;ctx.shadowBlur=o.biome==='paradise'||o.biome==='neon'?13:6;
      if(p.radius)circleBody(ctx,o,p,T,elapsedMs);else barBody(ctx,o,p,T,elapsedMs);
      ctx.restore();
    }
    ctx.restore();
  }
  return {pose,mount,update,draw,active,snapshot,setRemoteStates,get bodies(){return instances.map(q=>q.body);}};
})();
