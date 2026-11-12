/* Doodle Wheels V21 — ostacoli realmente solidi e animati.
 * Il percorso è deterministico (Terrain.DYNAMIC_OBSTACLES); Matter.js risolve
 * le collisioni SOLTANTO sull'host. I client ridisegnano le stesse traiettorie.
 */
const DynamicObstacles = (() => {
  const TAU = Math.PI * 2, clamp = (v,lo,hi) => Math.min(hi,Math.max(lo,v));
  let instances = [];
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
      case 'log': case 'seesaw':
        return { x:o.x, y:g-16, angle:0.16*s, width:o.kind==='log'?90:110, height:20 };
      case 'iceblock':
        return { x:o.x+18*s, y:g-16, angle:0, width:42, height:30 };
      case 'shell':
        return { x:o.x, y:g-25-12*(0.5+0.5*s), angle:0.09*s, radius:28 };
      default:
        return { x:o.x+18*s, y:g-24, angle:a*0.7, radius:29 };
    }
  }
  function makeBody(o) {
    const p = pose(o,0);
    // Material differences matter: ice is slippery, forest timber grips, Atlantis bounces.
    const profile = ({iceblock:[0.045,0.08,0.04],log:[0.8,0.8,0.12],
      shell:[0.48,0.58,0.32],seesaw:[0.66,0.68,0.14],
      bell:[0.52,0.56,0.2],meteor:[0.64,0.66,0.15],
      piston:[0.5,0.6,0.09],roller:[0.62,0.68,0.2]})[o.kind] || [0.6,0.68,0.16];
    const options={isStatic:true, label:'obstacle-v21-'+o.kind,
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
    instances = (Terrain.DYNAMIC_OBSTACLES || []).map(o=>({config:o, body:makeBody(o)}));
    if (instances.length) Matter.World.add(world, instances.map(q=>q.body));
  }
  function update(elapsedMs) {
    for (const {config,body} of instances) {
      const p=pose(config,elapsedMs);
      // updateVelocity=true: kinematic motion imparts a physical speed to contacts
      // rather than teleporting a static collider without momentum.
      Matter.Body.setPosition(body,{x:p.x,y:p.y},true);
      Matter.Body.setAngle(body,p.angle || 0,true);
    }
  }
  // Used for visual warnings. The warning never changes collision or racer velocity.
  function active(o, t) {
    if (o.kind === 'piston') return pose(o,t).raised > 0.42;
    if (o.kind === 'meteor' || o.kind === 'bell') return Math.abs(Math.cos(TAU*Math.max(0,t)/1000/o.period + o.phase)) > 0.65;
    return true;
  }
  function groundMarker(ctx, x, gy, col, phase, o, elapsedMs) {
    const y=gy-Terrain.height(x);
    ctx.save(); ctx.globalAlpha=0.45; ctx.strokeStyle=col; ctx.lineWidth=2;
    ctx.setLineDash([7,6]); ctx.beginPath();ctx.moveTo(x-62,y+2);ctx.lineTo(x+62,y+2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=col;ctx.globalAlpha=0.75+0.15*Math.sin(phase*3);
    for(let side of [-1,1]) {ctx.beginPath();ctx.moveTo(x+side*68,y-2);ctx.lineTo(x+side*80,y-15);ctx.lineTo(x+side*92,y-2);ctx.closePath();ctx.fill();}
    ctx.restore();
    // Telegraph the next 650 ms: amber = approaching hazard, red = active hazard.
    // In the world layer it scrolls with the track and doesn't block mobile HUD.
    if (o && (o.kind === 'piston' || o.kind === 'meteor' || o.kind === 'bell')) {
      const dangerNow=active(o,elapsedMs), soon=active(o,elapsedMs+650);
      const hazardColor=dangerNow?'#ff6e69':soon?'#ffd071':'#8ce6d4';
      ctx.save();ctx.globalAlpha=0.94;
      const tx=x-145, ty=gy-Terrain.height(tx)-35;
      ctx.fillStyle='rgba(21,26,45,.86)';ctx.strokeStyle=hazardColor;ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(tx,ty,16,0,TAU);ctx.fill();ctx.stroke();
      ctx.fillStyle=hazardColor;ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('!',tx,ty+1);
      ctx.beginPath();ctx.lineWidth=2.5;ctx.moveTo(tx+20,ty);ctx.lineTo(tx+42,ty);ctx.lineTo(tx+35,ty-6);ctx.moveTo(tx+42,ty);ctx.lineTo(tx+35,ty+6);ctx.stroke();
      ctx.restore();
    }
  }
  function draw(ctx, camX, viewportWidth, gy, elapsedMs, overrideItems) {
    const items=overrideItems || Terrain.DYNAMIC_OBSTACLES || [];
    if (!items.length) return;
    ctx.save();ctx.translate(-camX,0);
    for (const o of items) {
      if (o.x < camX-220 || o.x > camX+viewportWidth+220) continue;
      const p=pose(o,elapsedMs,gy), a=TAU * (elapsedMs/1000) / o.period + o.phase;
      const col=({bell:'#eecb82',meteor:'#ff7057',shell:'#76ede1',log:'#b78de6',piston:'#ff6bdc',iceblock:'#91e7ff',seesaw:'#eea467',roller:'#b2a6a0'})[o.kind] || '#e0d6c6';
      groundMarker(ctx,o.x,gy,col,a,o,elapsedMs);
      if (p.anchorY!==undefined) {
        ctx.save();ctx.strokeStyle=o.kind==='meteor'?'#2b1c36':'#e6d4ac';ctx.lineWidth=7;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(p.anchorX,p.anchorY);ctx.lineTo(p.x,p.y);ctx.stroke();
        ctx.lineWidth=2;ctx.strokeStyle=col;ctx.stroke();
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(p.anchorX,p.anchorY,9,0,TAU);ctx.fill();ctx.restore();
      }
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle||0);
      ctx.shadowColor=col;ctx.shadowBlur=9;
      ctx.strokeStyle=o.kind==='meteor'?'#522735':'#4d4c64';ctx.lineWidth=4;
      if (p.radius) {
        ctx.fillStyle= o.kind==='meteor'?'#713846':o.kind==='bell'?'#f6dd99':o.kind==='shell'?'#67b8b3':'#9d8e85';
        ctx.beginPath();ctx.arc(0,0,p.radius,0,TAU);ctx.fill();ctx.stroke();
        ctx.shadowBlur=0;
        if (o.kind==='bell') {
          ctx.fillStyle='#d09d45';ctx.beginPath();ctx.arc(0,p.radius*0.69,7,0,TAU);ctx.fill();
          ctx.strokeStyle='#e4ba69';ctx.lineWidth=3;for(let i=-1;i<=1;i++){
            ctx.beginPath();ctx.moveTo(i*13,-22);ctx.quadraticCurveTo(i*4,0,i*13,19);ctx.stroke();
          }
        } else if(o.kind==='meteor') {
          ctx.fillStyle='#ef755c';for(let i=0;i<6;i++) {const ang=i*TAU/6;const x=Math.cos(ang)*23,y=Math.sin(ang)*23;
            ctx.beginPath();ctx.arc(x,y,5,0,TAU);ctx.fill();}
          ctx.strokeStyle='#ffa471';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-13,-9);ctx.lineTo(3,4);ctx.lineTo(14,-2);ctx.stroke();
        } else if(o.kind==='shell') {
          ctx.fillStyle='#b5eeea';ctx.beginPath();ctx.arc(-4,-6,11,0,TAU);ctx.fill();
          ctx.strokeStyle='#2d868c';ctx.lineWidth=2;for(let i=-2;i<=2;i++){
            ctx.beginPath();ctx.moveTo(0,16);ctx.lineTo(i*12,-22);ctx.stroke();}
        } else {
          ctx.fillStyle='#dcc5a6';ctx.beginPath();ctx.arc(0,0,12,0,TAU);ctx.fill();ctx.strokeStyle='#655c59';ctx.lineWidth=3;
          for(let i=0;i<6;i++){let an=i*TAU/6;ctx.beginPath();ctx.moveTo(Math.cos(an)*13,Math.sin(an)*13);ctx.lineTo(Math.cos(an)*28,Math.sin(an)*28);ctx.stroke();}
        }
      } else {
        ctx.fillStyle= o.kind==='piston'?'#302d57':o.kind==='iceblock'?'#a8eefb':o.kind==='log'?'#65434f':'#826452';
        ctx.beginPath();ctx.roundRect(-p.width/2,-p.height/2,p.width,p.height,6);ctx.fill();ctx.stroke();
        ctx.shadowBlur=0;ctx.strokeStyle=col;ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(-p.width*.38,0);ctx.lineTo(p.width*.38,0);ctx.stroke();
        if(o.kind==='piston') {
          ctx.fillStyle=col;ctx.fillRect(-8,-p.height*.37,16,7);
          ctx.strokeStyle='#93cbf7';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(-7,-23);ctx.lineTo(7,23);ctx.moveTo(7,-23);ctx.lineTo(-7,23);ctx.stroke();
        } else if(o.kind==='log') {
          ctx.strokeStyle='#daafdc';ctx.lineWidth=2;for(let j=-1;j<=1;j++){
            ctx.beginPath();ctx.arc(j*28,0,5,0,TAU);ctx.stroke();}
        } else if(o.kind==='iceblock') {
          ctx.strokeStyle='white';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-14,-10);ctx.lineTo(1,-4);ctx.lineTo(12,-11);ctx.stroke();
        }
      }
      ctx.restore();
      if (o.kind==='piston') {const y=gy-Terrain.height(o.x);ctx.save();ctx.strokeStyle='#9a66db';ctx.lineWidth=3;
        ctx.strokeRect(o.x-20,y+2,40,16);ctx.restore();}
    }
    ctx.restore();
  }
  return {pose,mount,update,draw,active,get bodies(){return instances.map(q=>q.body);}};
})();
