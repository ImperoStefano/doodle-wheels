/* Doodle Wheels V28.2 — Antico Egitto, Museum Reference Art Pass.
   Canvas-only art (no offscreen assets/network). All hazard timing is deterministic
   from the track layout and the fixed host physics clock. */
const EgyptWorld = (() => {
  'use strict';
  const TAU = Math.PI * 2, P = { lapis:'#294a83', cobalt:'#153c79', terracotta:'#b86b48', stone:'#e8c789', gold:'#c9a04d', linen:'#f2dfb1', ink:'#73503a', turquoise:'#368c8a' };
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const fract = n=>n-Math.floor(n);
  const hash = n=>fract(Math.sin(n*127.1+78.23)*43758.5453);
  function path(c,pts,fill,stroke,width=2){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
  function rect(c,x,y,w,h,fill,stroke,r=0){c.beginPath();if(r)c.roundRect(x,y,w,h,r);else c.rect(x,y,w,h);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}}
  function jewel(c,x,y,k=1){c.save();c.translate(x,y);c.scale(k,k);path(c,[[0,-11],[10,0],[0,11],[-10,0]],P.lapis,'#eecb6d',1.7);path(c,[[-4,-5],[0,-8],[3,-3],[0,3]],'#5d9bb2');c.restore();}
  function ankh(c,x,y,k=1){c.save();c.translate(x,y);c.scale(k,k);c.strokeStyle=P.lapis;c.lineWidth=3.2;c.lineCap='round';c.beginPath();c.ellipse(0,-13,7,11,0,0,TAU);c.moveTo(0,-2);c.lineTo(0,20);c.moveTo(-13,5);c.lineTo(13,5);c.stroke();c.restore();}
  function scarab(c,x,y,k=1){c.save();c.translate(x,y);c.scale(k,k);c.fillStyle=P.lapis;c.strokeStyle=P.gold;c.lineWidth=2.5;c.beginPath();c.ellipse(0,3,13,18,0,0,TAU);c.fill();c.stroke();c.beginPath();c.moveTo(0,-17);c.lineTo(0,21);c.moveTo(-12,-1);c.quadraticCurveTo(0,6,12,-1);c.stroke();for(const d of [-1,1]){c.beginPath();c.moveTo(d*10,0);c.lineTo(d*20,-7);c.moveTo(d*12,8);c.lineTo(d*21,14);c.stroke();}c.restore();}
  function pyramid(c,x,y,w,h){c.save();c.translate(x,y);path(c,[[-w*.5,0],[0,-h],[w*.5,0]],'#d69b61','#a76b47',2);path(c,[[0,-h],[w*.5,0],[w*.03,0]],'#a96848');c.strokeStyle='rgba(255,232,172,.52)';c.lineWidth=1.2;for(let j=1;j<7;j++){const yy=-h*j/7;c.beginPath();c.moveTo(-(w/2)*(1-j/7),yy);c.lineTo((w/2)*(1-j/7),yy);c.stroke();}c.restore();}
  function dune(c,w,gy,cam,par,base,amp,color){const drift=cam*par;let x=-120;const mod=drift%680;c.beginPath();c.moveTo(-150,gy+80);for(let i=0;i<Math.ceil((w+360)/80);i++){const xx=-120+i*80;const yy=base+Math.sin((xx+drift)*0.0048+par*3)*amp+Math.cos((xx+drift)*0.011)*amp*.23;c.lineTo(xx,yy);}c.lineTo(w+150,gy+80);c.closePath();c.fillStyle=color;c.fill();}
  function column(c,x,base,k=1,glow=false){c.save();c.translate(x,base);c.scale(k,k);
    rect(c,-18,-158,36,160,'#c99360','#9f6248',4);rect(c,-29,-166,58,15,'#e5bc7e','#a86c47',3);rect(c,-33,-15,66,17,'#c78e58','#9f6248',3);
    c.strokeStyle='#865d40';c.lineWidth=1.7;for(let j=0;j<5;j++){c.beginPath();c.moveTo(-8,-145+j*24);c.lineTo(8,-145+j*24);c.stroke();}for(let j=0;j<3;j++)jewel(c,0,-133+j*47,.45);
    if(glow){rect(c,-19,-168,38,5,'#d3ab5b');}c.restore();}
  function palm(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    // Trunk leans slightly with the desert wind and widens at the sand line.
    c.fillStyle='#916445';c.strokeStyle='#7e583f';c.lineWidth=2;
    c.beginPath();c.moveTo(-13,0);c.bezierCurveTo(-17,-55,8,-103,2,-167);
    c.lineTo(13,-170);c.bezierCurveTo(18,-110,0,-57,1,0);c.closePath();c.fill();c.stroke();
    c.strokeStyle='rgba(232,184,116,.55)';c.lineWidth=3;
    for(let j=0;j<6;j++){const y=-19-j*24;c.beginPath();c.moveTo(-9+Math.sin(j)*4,y);c.lineTo(8+Math.cos(j)*4,y-8);c.stroke();}
    const leaves=[[-97,-36,-124,-20],[-95,-76,-110,-82],[-55,-100,-74,-126],[27,-98,23,-138],[92,-74,115,-92],[102,-30,127,-22]];
    for(const [dx,dy,endX,endY] of leaves){
      c.fillStyle=dx<0?'#788257':'#69784c';c.strokeStyle='#8b945d';c.lineWidth=1.5;
      c.beginPath();c.moveTo(8,-166);c.quadraticCurveTo(dx*.50,-190+dy*.28,dx,dy-166+88);
      c.quadraticCurveTo(endX*.67,-150+endY*.14,8,-166);c.fill();c.stroke();
    }
    c.beginPath();c.arc(8,-168,8,0,TAU);c.fillStyle='#a78853';c.fill();c.restore();
  }
  function sphinx(c,x,base,k=1){c.save();c.translate(x,base);c.scale(k,k);
    // Distinct Egyptian limestone Sphinx silhouette: lion haunches, recumbent
    // body, forepaws, human face, royal striped nemes and royal cobra.
    c.fillStyle='rgba(93,58,43,.18)';c.beginPath();c.ellipse(7,3,215,19,0,0,TAU);c.fill();
    rect(c,-197,-17,413,21,'#b47c51','#80503b',5);
    rect(c,-182,-72,285,69,'#c99765','#996241',26);
    // Lion's hindquarters and tail curl against the raised body.
    c.fillStyle='#d2a371';c.strokeStyle='#965f43';c.lineWidth=3;
    c.beginPath();c.ellipse(-133,-58,70,55,-.12,0,TAU);c.fill();c.stroke();
    c.strokeStyle='#9a684b';c.lineWidth=10;c.lineCap='round';c.beginPath();
    c.moveTo(-183,-63);c.bezierCurveTo(-240,-93,-230,-25,-194,-24);c.stroke();
    for(const xx of [30,109]){
      rect(c,xx,-28,83,26,'#d5a773','#9a674a',11);
      rect(c,xx+7,-16,68,16,'#e3b987','#ad7651',6);
      c.strokeStyle='#a16e4e';c.lineWidth=2;
      for(let i=1;i<4;i++){c.beginPath();c.moveTo(xx+12+i*14,-11);c.lineTo(xx+12+i*14,-4);c.stroke();}
    }
    // Place the human bust over the lion forequarters, not at the back.
    c.save();c.translate(56,-5);c.scale(.94,.94);
    // Chin and ceremonial beard anchor the otherwise elevated bust.
    path(c,[[-50,-90],[-66,-148],[-45,-193],[10,-204],[46,-176],[56,-106],[37,-68],[-42,-67]],'#c89a68','#956344',3);
    path(c,[[-67,-145],[-81,-207],[-54,-242],[-29,-250],[35,-250],[59,-234],[80,-198],[53,-139],[39,-132],[-54,-131]],'#294a83','#caa366',3);
    // Alternating gold-striped nemes headdress, following the side drapes.
    c.strokeStyle='#d9b46b';c.lineWidth=6;
    for(let j=0;j<5;j++){
      let yy=-226+j*18;
      c.beginPath();c.moveTo(-70+j*2,yy);c.lineTo(-39+j*.75,yy+3);c.moveTo(38-j*.4,yy+2);c.lineTo(68-j*2,yy);c.stroke();
    }
    rect(c,-43,-221,83,14,'#d4a55e','#8e6346',3);
    path(c,[[-37,-204],[37,-204],[36,-155],[20,-139],[-26,-139],[-37,-160]],'#dcb17b','#9a674b',4);
    // Noble, readable face rather than a mascot emoji.
    c.strokeStyle='#694632';c.lineWidth=3;c.lineCap='round';
    for(const xx of [-19,19]){
      c.beginPath();c.moveTo(xx-8,-184);c.quadraticCurveTo(xx,-189,xx+8,-184);c.stroke();
      c.fillStyle='#3d3530';c.beginPath();c.arc(xx,-182,2.6,0,TAU);c.fill();
    }
    path(c,[[-3,-177],[4,-161],[-2,-157]],null,'#9d6a4c',2.6);
    c.beginPath();c.moveTo(-13,-151);c.quadraticCurveTo(0,-144,13,-151);c.stroke();
    path(c,[[-11,-139],[-8,-111],[3,-90],[15,-112],[12,-139]],'#bf8b5b','#875a40',2.5);
    // Uraeus above the brow (a royal emblem in gold).
    c.strokeStyle='#e4bb70';c.lineWidth=3;c.beginPath();c.moveTo(0,-238);c.bezierCurveTo(-9,-259,12,-264,6,-244);c.stroke();
    jewel(c,2,-224,.42);
    // Faience stripes inspired by the striped blue-and-gold royal masks.
    lapisInlay(c,-48,-225,86,13);
    c.restore();
    // Small geometric base relief connects the statue to the monumental site.
    hieroglyphFrieze(c,-170,-4,340,.72);
    c.restore();}
  function temple(c,x,base,k=1){c.save();c.translate(x,base);c.scale(k,k);
    rect(c,-160,-45,320,46,'#bc7c50','#9c6045',3);for(const dx of [-135,-70,70,135])column(c,dx,-30,.69);
    path(c,[[-186,-151],[0,-196],[186,-151]],'#b77b4c','#d4a469',4);rect(c,-190,-157,380,17,P.stone,P.terracotta,3);
    rect(c,-63,-138,126,105,'#273e68','#d2a45d',5);rect(c,-48,-128,96,95,'#193e7a','#b99050',4);ankh(c,0,-83,1.1);
    c.restore();}
  function tomb(c,x,base,k=1){c.save();c.translate(x,base);c.scale(k,k);
    rect(c,-187,-30,374,35,'#c48e61','#94593e',5);for(const dx of [-145,145]){rect(c,dx-22,-238,44,204,'#c79161','#8d5941',5);rect(c,dx-29,-247,58,17,'#e6bb78','#a36a48',4);}
    path(c,[[-176,-239],[0,-301],[176,-239]],'#d5a268','#ac6e45',3);
    rect(c,-83,-207,166,177,'#284e86','#d6ab63',10);rect(c,-67,-192,134,164,'#153a71','#ba9459',6);
    c.fillStyle='rgba(102,190,189,.38)';c.beginPath();c.ellipse(0,-121,42,85,0,0,TAU);c.fill();ankh(c,0,-120,2.6);
    for(const dx of [-110,110]){jewel(c,dx,-182,.8);jewel(c,dx,-103,.8);jewel(c,dx,-57,.7);}c.restore();}
  // V28.1: A temple-civilisation, NOT a generic sand biome. These set pieces
  // have no physical colliders: all rideable surfaces remain Terrain.height.
  // V28.2 - Drawn from the player's museum references: carved limestone
  // inscriptions, paired winged guardians, cobalt/gold faience, and striped masks.
  // These are stylised hand-built motifs (NOT copied photographs/textures).
  function hieroglyphFrieze(c,x,y,width,scale=1){
    c.save();c.translate(x,y);c.scale(scale,scale);
    const N=Math.max(1,Math.floor(width/(26*scale)));
    c.lineCap='round';c.lineJoin='round';c.strokeStyle='#664a3c';c.lineWidth=1.7;
    const glyphs=[
      ()=>{c.beginPath();c.ellipse(0,0,8,4,0,0,TAU);c.arc(0,0,2.2,0,TAU);c.stroke();},  // eye
      ()=>{c.beginPath();c.moveTo(-6,-12);c.lineTo(-6,11);c.moveTo(-1,-9);c.lineTo(0,10);c.moveTo(5,-12);c.lineTo(6,11);c.stroke();}, // reeds
      ()=>{c.beginPath();c.arc(0,-6,4,0,TAU);c.moveTo(0,-2);c.lineTo(0,11);c.moveTo(-6,3);c.lineTo(6,3);c.stroke();}, // person
      ()=>{c.beginPath();c.moveTo(-10,2);c.bezierCurveTo(-3,-9,7,-8,11,2);c.moveTo(-10,8);c.bezierCurveTo(-3,-3,7,-2,11,8);c.stroke();},// water
      ()=>{c.beginPath();c.moveTo(-9,-6);c.quadraticCurveTo(0,-13,8,-4);c.lineTo(6,8);c.quadraticCurveTo(-1,14,-8,6);c.closePath();c.stroke();},// jar
      ()=>{c.beginPath();c.ellipse(0,0,8,5,0,0,TAU);c.moveTo(-5,3);c.lineTo(-5,11);c.moveTo(5,3);c.lineTo(5,11);c.stroke();},// bowl
      ()=>{c.beginPath();c.moveTo(-10,6);c.quadraticCurveTo(3,-9,9,-4);c.lineTo(10,3);c.lineTo(-2,11);c.moveTo(4,-6);c.lineTo(-2,-13);c.stroke();},// bird
      ()=>{c.beginPath();c.arc(0,-7,5,0,TAU);c.moveTo(0,-2);c.lineTo(0,12);c.moveTo(-9,6);c.lineTo(9,6);c.stroke();},// sun
      ()=>{c.beginPath();c.moveTo(-5,-12);c.lineTo(5,-12);c.lineTo(7,10);c.lineTo(-7,10);c.closePath();c.moveTo(-5,-3);c.lineTo(5,-3);c.stroke();},// house
      ()=>{c.beginPath();c.moveTo(1,13);c.lineTo(1,-9);c.bezierCurveTo(-9,-15,-10,3,-1,3);c.stroke();},// staff
    ];
    for(let i=0;i<N;i++){
      c.save();c.translate(13+i*26,0);glyphs[(i*7+3)%glyphs.length]();c.restore();
    }
    c.restore();
  }
  function engravedPanel(c,x,y,w,h,rows=3){
    c.save();c.translate(x,y);
    rect(c,0,0,w,h,'rgba(235,191,132,.19)','rgba(103,66,48,.46)',2);
    c.beginPath();c.rect(4,4,Math.max(0,w-8),Math.max(0,h-8));c.clip();
    c.strokeStyle='rgba(255,222,161,.26)';c.lineWidth=1;
    for(let r=0;r<rows;r++){
      const yy=9+(r+.5)*(h-15)/rows;
      c.save();c.translate(1.1,1.4);c.globalAlpha=.4;hieroglyphFrieze(c,3,yy,w-8,.62);c.restore();
      c.save();c.globalAlpha=.78;hieroglyphFrieze(c,3,yy,w-8,.62);c.restore();
    }
    c.restore();
  }
  function lapisInlay(c,x,y,w,h=20){
    c.save();c.translate(x,y);rect(c,0,0,w,h,'#1e477a','#ddaf69',2);
    rect(c,2,2,w-4,2,'#5a8eaa');
    // Repeated blue + gold loop motif derived from inlaid ceremonial woodwork.
    const n=Math.floor((w-8)/26);c.strokeStyle='#edc781';c.lineWidth=2.1;
    for(let i=0;i<n;i++){
      const xx=7+i*26+8;
      c.beginPath();c.ellipse(xx,h*.42,5,h*.23,0,0,TAU);c.moveTo(xx-7,h*.78);c.lineTo(xx+7,h*.78);c.stroke();
      c.fillStyle='#4b91aa';c.fillRect(xx+11,4,3,h-8);
    }
    c.restore();
  }
  function wingedRelief(c,x,y,k=1){
    c.save();c.translate(x,y);c.scale(k,k);
    // Two mirrored carved protectors, visually referencing painted wing reliefs.
    c.strokeStyle='#6d4b3b';c.lineWidth=2;c.lineCap='round';
    for(const d of [-1,1]){
      c.save();c.scale(d,1);
      path(c,[[12,-3],[27,-42],[63,-57],[126,-52],[113,-27],[64,-12],[27,10]],'#e6bb80','#9e6949',2);
      for(let j=0;j<8;j++){
        c.beginPath();c.moveTo(24+j*10,-31+Math.sin(j*.4)*-8);
        c.quadraticCurveTo(70+j*4,-25+j*2,119-j*3,-44+j*3.2);c.stroke();
      }
      c.fillStyle='#a36e4a';c.beginPath();c.ellipse(5,9,11,18,-.12,0,TAU);c.fill();
      c.strokeStyle='#76503e';c.beginPath();c.arc(7,-12,8,0,TAU);c.moveTo(3,25);c.lineTo(-2,36);c.moveTo(12,24);c.lineTo(18,35);c.stroke();
      c.restore();
    }
    c.fillStyle=P.gold;c.beginPath();c.arc(0,-40,10,0,TAU);c.fill();
    c.strokeStyle='#75513f';c.lineWidth=2;c.beginPath();c.arc(0,-40,10,0,TAU);c.stroke();
    c.restore();
  }
  function royalMask(c,x,y,k=1){
    c.save();c.translate(x,y);c.scale(k,k);
    // Gold/cobalt striped nemes and inlaid collar, based on the user's museum
    // photographs. Flat vector work to match the other Canvas landmarks.
    path(c,[[-64,-53],[-82,-104],[-64,-146],[-37,-160],[37,-160],[64,-146],[82,-104],[64,-53],[77,1],[49,18],[-49,18],[-77,1]],'#1d477c','#e7c381',3);
    c.save();c.beginPath();c.moveTo(-82,-104);c.lineTo(-64,-146);c.lineTo(-37,-160);c.lineTo(37,-160);c.lineTo(64,-146);c.lineTo(82,-104);c.lineTo(64,-53);c.lineTo(77,1);c.lineTo(49,18);c.lineTo(-49,18);c.lineTo(-77,1);c.closePath();c.clip();
    c.strokeStyle='#ebc17c';c.lineWidth=8;
    for(let j=0;j<11;j++){
      const yy=-149+j*16;c.beginPath();c.moveTo(-85,yy);c.lineTo(-40,yy+5);c.moveTo(38,yy+5);c.lineTo(85,yy);c.stroke();
    }c.restore();
    path(c,[[-45,-128],[42,-128],[37,-69],[26,-42],[11,-31],[8,-11],[-8,-11],[-11,-31],[-26,-42],[-39,-69]],'#e5ba76','#9e6847',3);
    c.strokeStyle='#86573f';c.lineWidth=3;
    for(const d of [-1,1]){
      c.save();c.scale(d,1);
      c.beginPath();c.moveTo(5,-92);c.quadraticCurveTo(17,-100,30,-92);c.quadraticCurveTo(20,-85,7,-92);c.stroke();
      c.fillStyle='#264b7f';c.beginPath();c.arc(18,-92,3.4,0,TAU);c.fill();
      c.restore();
    }
    c.beginPath();c.moveTo(0,-86);c.lineTo(-4,-65);c.lineTo(4,-62);c.moveTo(-12,-49);c.quadraticCurveTo(0,-44,12,-49);c.stroke();
    path(c,[[-11,-35],[-10,11],[0,28],[10,11],[11,-35]],'#d6b078','#81543e',2);
    for(let j=0;j<5;j++){c.strokeStyle=j%2?'#285086':'#f0cd89';c.lineWidth=4;c.beginPath();c.moveTo(-11,-23+j*9);c.lineTo(11,-23+j*9);c.stroke();}
    rect(c,-46,-132,90,13,'#d5ae6e','#795240',2);
    c.strokeStyle='#d9ac63';c.lineWidth=3;c.beginPath();c.moveTo(0,-140);c.bezierCurveTo(-11,-164,14,-171,9,-140);c.stroke();
    path(c,[[-55,20],[-41,30],[41,30],[55,20]],'#b77950','#83523c',2);
    c.restore();
  }
  function chariotRelief(c,x,y,k=1){
    c.save();c.translate(x,y);c.scale(k,k);c.globalAlpha=.66;
    // Flat incision of a ceremonial chariot from the photographed artifact.
    c.strokeStyle='#785140';c.lineWidth=2.5;c.lineJoin='round';
    for(const xx of [-70,13]){
      c.beginPath();c.arc(xx,2,21,0,TAU);c.stroke();
      for(let i=0;i<6;i++){const a=i*TAU/6;c.beginPath();c.moveTo(xx,2);c.lineTo(xx+19*Math.cos(a),2+19*Math.sin(a));c.stroke();}
    }
    path(c,[[-91,-38],[-54,-42],[-26,-21],[6,-17],[47,-29],[89,-12],[119,-4]],null,'#785140',3);
    c.beginPath();c.moveTo(-47,-29);c.lineTo(-44,-72);c.lineTo(-3,-72);c.lineTo(21,-28);c.moveTo(-28,-72);c.lineTo(-28,-102);c.stroke();
    path(c,[[68,-8],[81,-41],[108,-44],[123,-19],[111,-6],[92,-6],[90,8]],null,'#785140',2.5);
    c.restore();
  }
  function stoneGrain(c,x,y,w,h,seed=0){
    c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
    c.strokeStyle='rgba(104,70,51,.19)';c.lineWidth=1;
    for(let i=0;i<12;i++){
      const px=x+hash(seed*17+i*13)*w,py=y+hash(seed*23+i*37)*h;
      c.beginPath();c.moveTo(px,py);c.lineTo(px+9+hash(i+seed)*15,py-1);c.stroke();
    }c.restore();
  }
  function ancientPylon(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    c.fillStyle='rgba(81,47,41,.14)';c.beginPath();c.ellipse(0,4,245,20,0,0,TAU);c.fill();
    for(const d of [-1,1]){
      const xx=d*135;
      path(c,[[xx-77,0],[xx+77,0],[xx+63,-258],[xx-62,-258]],'#ae684a','#764735',4);
      path(c,[[xx-62,-258],[xx+63,-258],[xx+70,-243],[xx-70,-243]],'#e4bc83','#80523b',3);
      rect(c,xx-72,-235,144,22,'#d39b64','#8d5940',3);
      rect(c,xx-62,-199,124,9,'#274c81','#d5b56e',2);
      rect(c,xx-62,-67,124,10,'#274c81','#c9a04d',2);
      // Deterministic inset reliefs, never high-contrast signs on the roadway.
      for(let q=0;q<3;q++){
        const yy=-175+q*53;
        c.globalAlpha=.38;rect(c,xx-51,yy-17,102,39,'#efd0a0','#a46f4a',2);c.globalAlpha=1;
        engravedPanel(c,xx-53,yy-20,106,42,2);
      }
      rect(c,xx-55,-35,110,7,'#f0ca8c');
    }
    // The winged protection motif is drawn directly into the two facing pylons.
    wingedRelief(c,-137,-109,.43);wingedRelief(c,137,-109,.43);
    // Threshold: recessed dark doorway, flanked by gold and blue, monumental.
    rect(c,-62,-201,124,201,'#7a4f41','#e7bc7b',5);
    rect(c,-51,-189,102,189,'#183b70','#cba356',8);
    const light=c.createLinearGradient(-42,-140,40,-30);
    light.addColorStop(0,'#234e84');light.addColorStop(.6,'#34669a');light.addColorStop(1,'#72b4af');
    rect(c,-36,-163,72,153,light,'#daba7c',4);
    c.strokeStyle='rgba(243,217,137,.62)';c.lineWidth=3;for(let j=0;j<4;j++){
      c.beginPath();c.moveTo(-28+j*18,-147);c.lineTo(-28+j*18,-15);c.stroke();
    }
    ankh(c,0,-116,1.2);
    rect(c,-227,-273,454,23,'#d6a468','#8f573c',3);
    lapisInlay(c,-221,-270,442,17);
    c.restore();
  }
  function jackal(c,x,y,k=1){
    c.save();c.translate(x,y);c.scale(k,k);
    rect(c,-33,-8,66,9,'#c48a56','#86563c',3);
    path(c,[[-23,-10],[-25,-66],[-10,-94],[-16,-131],[-3,-122],[7,-138],[18,-96],[14,-64],[24,-10]],'#79513c','#dbac70',3);
    path(c,[[-8,-95],[-20,-164],[-3,-148],[7,-166],[12,-98],[35,-84],[29,-69],[12,-76]],'#244775','#d0a85e',2.5);
    c.fillStyle='#f0c97b';c.beginPath();c.arc(6,-99,3.2,0,TAU);c.fill();
    rect(c,-20,-43,41,9,'#cc9e58');ankh(c,-2,-27,.5);c.restore();
  }
  function templeAvenue(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    // Wide, grounded temple courtyard behind the actual driveable profile.
    rect(c,-500,-65,1000,70,'#ad6f4d','#86543e',5);
    rect(c,-505,-66,1010,12,'#e7bc82','#a1694b',3);
    for(let i=-4;i<=4;i++){
      const xx=i*113;
      column(c,xx,-66,i%2?.9:.99);
      c.fillStyle='#26497c';c.fillRect(xx-18,-197,36,12);
      c.fillStyle='#e0b67b';c.fillRect(xx-22,-213,44,12);
      if(i%2===0){ankh(c,xx,-143,.48);}
    }
    rect(c,-525,-242,1050,25,'#dca66e','#89543c',4);
    lapisInlay(c,-528,-240,1056,20);
    for(let j=0;j<15;j++)jewel(c,-492+j*70,-236,.35);
    // Large, readable sandstone bas-reliefs that remain behind the track.
    for(const d of [-1,1]){
      rect(c,d*286-113,-141,226,74,'#d3a16d','#8c5b43',3);
      wingedRelief(c,d*286,-99,.62);
      stoneGrain(c,d*286-112,-140,223,72,d+11);
    }
    ancientPylon(c,0,-47,.67);
    c.restore();
  }
  function treasureObelisk(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    rect(c,-31,-11,62,14,'#ad7450','#754a39',3);
    path(c,[[-19,-19],[-16,-161],[0,-205],[16,-161],[19,-19]],'#cd9361','#8b5942',3);
    path(c,[[0,-205],[16,-161],[19,-19],[0,-21]],'#b57450');
    rect(c,-18,-51,35,8,'#294a83','#d3ac64',1);
    rect(c,-18,-140,35,8,'#294a83','#d3ac64',1);
    jewel(c,0,-94,.55);c.restore();
  }
  function royalTomb(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    rect(c,-390,-67,780,74,'#b47853','#81503e',4);
    // Two load-bearing side towers framing a recessed, sacred entrance.
    for(const d of [-1,1]){
      const xx=d*246;
      rect(c,xx-108,-324,216,258,'#a56849','#744737',6);
      rect(c,xx-107,-329,214,22,'#e8b97c','#85513a',3);
      rect(c,xx-100,-278,200,13,'#244978','#d1a55b',2);
      rect(c,xx-100,-102,200,12,'#244978','#d1a55b',2);
      engravedPanel(c,xx-90,-260,180,151,5);
      stoneGrain(c,xx-104,-323,208,258,xx+11);
      royalMask(c,xx,-181,.61);
      for(const sy of [-242,-162])jewel(c,xx+85,sy,.6);
    }
    rect(c,-149,-321,298,264,'#825340','#e9b97a',8);
    rect(c,-126,-307,252,245,'#254476','#d8aa64',8);
    rect(c,-104,-290,208,218,'#112c59','#bb975f',4);
    // Progressive depth, a blue-gold lit tomb; no full-screen FX.
    let aura=c.createRadialGradient(0,-180,8,0,-180,150);
    aura.addColorStop(0,'rgba(119,201,192,.74)');aura.addColorStop(.45,'rgba(53,107,152,.38)');aura.addColorStop(1,'rgba(42,64,103,0)');
    c.fillStyle=aura;c.fillRect(-130,-309,260,250);
    ankh(c,0,-182,2.1);
    // Protective winged figures on the lintel, from the sarcophagus relief photo.
    wingedRelief(c,0,-308,.78);
    rect(c,-341,-357,681,31,'#e4b57b','#85513e',4);
    lapisInlay(c,-324,-355,649,17);
    jackal(c,-131,-62,1.07);jackal(c,131,-62,1.07);
    c.restore();
  }
  function heritageFlags(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    c.strokeStyle='#865038';c.lineWidth=5;c.beginPath();c.moveTo(0,0);c.lineTo(0,-192);c.stroke();
    c.fillStyle='#204678';path(c,[[1,-184],[64,-177],[53,-100],[0,-109]],'#24477c','#d7aa5e',2);
    c.strokeStyle='#ddb469';c.lineWidth=2;c.beginPath();c.moveTo(20,-161);c.lineTo(51,-156);c.stroke();ankh(c,28,-139,.55);
    c.restore();
  }
  // No repeated wallpaper. Each of the three unique landmarks is tied to an
  // actual world-coordinate section; sky & dunes scroll with slower parallax.
  function drawBackdrop(c,S){
    const w=S.w,h=S.h,gy=S.gy,cam=S.camX,seg=S.segment;
    // This world is architecturally distinct from ordinary gravel/desert:
    // sunlight and dunes are only the distant horizon behind a palace complex.
    const sky=c.createLinearGradient(0,0,0,gy+80);
    sky.addColorStop(0,'#a87685');sky.addColorStop(.32,'#dfa18b');sky.addColorStop(.68,'#f7c799');sky.addColorStop(1,'#f8d9a6');
    c.fillStyle=sky;c.fillRect(0,0,w,h);
    const sunX=w*.8-cam*.009%120,sunY=gy*.17,sR=clamp(w*.048,27,62);
    let g=c.createRadialGradient(sunX,sunY,2,sunX,sunY,sR*3.3);
    g.addColorStop(0,'rgba(255,255,220,.48)');g.addColorStop(.5,'rgba(255,218,151,.24)');g.addColorStop(1,'rgba(255,231,183,0)');
    c.fillStyle=g;c.fillRect(sunX-sR*3.3,sunY-sR*3.3,sR*6.6,sR*6.6);
    c.fillStyle='#fff0bf';c.beginPath();c.arc(sunX,sunY,sR,0,TAU);c.fill();
    dune(c,w,gy,cam,.055,gy*.68,23,'#d7a47e');
    // Distant pyramids are monumental landmarks, never the whole biome texture.
    for(let i=-1;i<5;i++){
      const xx=i*675-cam*.105+170;
      if(xx<-320||xx>w+320)continue;
      c.save();c.globalAlpha=.75;pyramid(c,xx,gy*.83,258+(i%2)*74,145+(i%3)*34);c.restore();
    }
    dune(c,w,gy,cam,.15,gy*.89,13,'#c58b6b');
    // A distant urban temple skyline forms an immediately recognisable horizon.
    const skyPar=cam*.22;
    for(let i=Math.floor((skyPar-280)/380);i<Math.ceil((skyPar+w+280)/380);i++){
      const x=i*380+120-skyPar,base=gy*.87;
      if(x<-330||x>w+330)continue;
      c.save();c.globalAlpha=.45;
      rect(c,x-110,base-82,220,83,'#ac7054');
      rect(c,x-123,base-89,246,12,'#d7a17a');
      for(let j=-2;j<=2;j++)rect(c,x+j*40-11,base-62,22,63,'#dfb18a');
      c.restore();
    }
    if(seg){
      const span=seg.end-seg.start;
      const st=[.15,.49,.84].map(q=>seg.start+q*span-cam);
      // Entrance: an enormous Sphinx and royal pylons; second act: temple
      // colonnade; final act: monumental lapis tomb with jackal guardians.
      if(st[0]>-950&&st[0]<w+950){
        ancientPylon(c,st[0]+475,gy-25,.85);
        sphinx(c,st[0]-110,gy-25,1.32);
        heritageFlags(c,st[0]-410,gy-20,.9);
        // Discrete ceremonial-chariot relief set behind the monumental threshold.
        c.save();c.translate(st[0]+155,gy-105);chariotRelief(c,0,0,.47);c.restore();
      }
      if(st[1]>-1100&&st[1]<w+1100){
        templeAvenue(c,st[1],gy-18,.91);
        heritageFlags(c,st[1]-490,gy-17,.75);
        heritageFlags(c,st[1]+495,gy-17,.75);
      }
      if(st[2]>-1100&&st[2]<w+1100){
        royalTomb(c,st[2],gy-21,1.06);
        treasureObelisk(c,st[2]-480,gy-19,.9);
        treasureObelisk(c,st[2]+477,gy-19,.9);
      }
      for(let i=0;i<3;i++){
        const xx=st[i]+380*(i-1);
        if(xx>-180&&xx<w+180)palm(c,xx,gy-25,.65);
      }
    }
    // Very restrained airborne dust; no neon particles or image noise.
    c.save();c.globalAlpha=.14;c.strokeStyle='#fff2cb';c.lineWidth=1.5;
    for(let i=0;i<6;i++){
      const x=((i*293-cam*.16)%(w+220)+w+220)%(w+220)-80;
      const y=gy*.73+Math.sin(i*1.5+S.now*.00028)*6;
      c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+21,y-7,x+39,y-3);c.stroke();
    }c.restore();
  }
  function drawGround(c,cam,w,gy){
    const s=Terrain.WORLD_SEGMENT;if(!s||s.world!=='egypt')return;
    const a=clamp(s.start-cam,0,w),b=clamp(s.end-cam,0,w);
    if(b>a){
      // Paved sandstone causeway: visually follows the TRUE procedural terrain.
      // All details remain beneath the real surface: no fake collidable steps.
      const yAt=sx=>gy-Terrain.naturalHeight(cam+sx);
      c.save();c.beginPath();c.moveTo(a,yAt(a));
      for(let sx=a+8;sx<b;sx+=8)c.lineTo(sx,yAt(sx));
      c.lineTo(b,yAt(b));c.lineTo(b,gy+460);c.lineTo(a,gy+460);c.closePath();
      c.fillStyle='#b87650';c.fill();
      c.save();c.clip();
      // Broad jointed temple blocks, rather than generic brown fill or sand.
      c.strokeStyle='rgba(113,67,49,.36)';c.lineWidth=2;
      for(let yy=Math.floor((gy-180)/39)*39;yy<gy+260;yy+=39){
        c.beginPath();c.moveTo(a,yy);c.lineTo(b,yy);c.stroke();
        for(let sx=Math.floor((cam+a)/120)*120-(cam%120)+((Math.round(yy/39)%2)*60);sx<b;sx+=120){
          c.beginPath();c.moveTo(sx,yy);c.lineTo(sx,yy+39);c.stroke();
        }
      }
      // Occasional inset cartouches are painted on the masonry only, inside
      // the clipped ground, so they never create false colliders or steps.
      for(let gx=Math.floor((cam+a)/360)*360;gx<cam+b;gx+=360){
        const sx=gx-cam+48;
        const yy=yAt(sx)+75;
        c.save();c.globalAlpha=.35;engravedPanel(c,sx,yy,97,39,1);c.restore();
      }
      c.restore();
      c.strokeStyle='#e9bd7d';c.lineWidth=9;c.lineJoin='round';
      c.beginPath();c.moveTo(a,yAt(a));for(let sx=a+8;sx<b;sx+=8)c.lineTo(sx,yAt(sx));c.lineTo(b,yAt(b));c.stroke();
      c.strokeStyle='#8a563e';c.lineWidth=2;
      c.beginPath();c.moveTo(a,yAt(a)+5);for(let sx=a+11;sx<b;sx+=11)c.lineTo(sx,yAt(sx)+5);c.stroke();
      // Thin lapis inlay only at the top edge, avoiding an all-blue track.
      c.strokeStyle='rgba(36,73,124,.55)';c.lineWidth=2;
      c.beginPath();c.moveTo(a,yAt(a)+12);for(let sx=a+15;sx<b;sx+=15)c.lineTo(sx,yAt(sx)+12);c.stroke();
      c.restore();
    }
    c.save();c.translate(-cam,gy-520);
    for(let i=Math.floor((cam-200)/240);i<Math.ceil((cam+w+200)/240);i++){
      const x=i*240+60+hash(i+44)*65;
      if(x<s.start+80||x>s.end-80)continue;
      if(Terrain.rampAt&&Terrain.rampAt(x,160,160))continue;
      const y=520-Terrain.height(x),r=hash(i+5),sc=.72+hash(i+22)*.24;
      if(r>.76){
        // Painted urn, rooted just above the causeway.
        c.save();c.translate(x,y);c.scale(sc,sc);
        rect(c,-11,-30,22,30,'#a96648','#7d523d',6);
        rect(c,-9,-37,18,9,'#e1bb7e','#8c533d',2);
        c.strokeStyle='#294a83';c.lineWidth=2;c.beginPath();c.arc(0,-16,8,0,TAU);c.stroke();
        c.restore();
      }else if(r>.35){
        c.save();c.translate(x,y);c.scale(sc,sc);
        rect(c,-15,-17,30,17,'#cb9560','#86533c',3);
        hieroglyphFrieze(c,-12,-10,30,.55);c.restore();
      }
    }
    c.restore();
  }
  // A mummy casts leftwards as players approach from the left. The projectile is
  // an actual spatial hit test against the rear wheel (not a zone-based debuff).
  function shot(m,clockMs){const t=clockMs/1000+ m.phase;const cycle=((t%m.period)+m.period)%m.period;const flight=1.12;if(cycle>flight)return null;const p=cycle/flight;const x=m.x-240*p;return {x,y:520-Terrain.height(x)-51-19*Math.sin(Math.PI*p),p,cycle};}
  function drawMummy(c,x,y,t,casting){
    c.save();c.translate(x,y);
    // Sarcophagus and figure are decorative: no hidden rigid obstacle.
    // Its raised lid and linen arm anticipate an actual projectile.
    c.fillStyle='rgba(100,57,41,.23)';c.beginPath();c.ellipse(0,2,72,11,0,0,TAU);c.fill();
    rect(c,-68,-12,136,14,'#ca955c','#7b5138',4);
    rect(c,-43,-112,85,101,'#a96d4d','#724a3a',13);
    rect(c,-37,-106,74,90,'#24487e','#d9b36a',11);
    rect(c,-32,-98,64,76,'#1a376c','#c99b54',9);
    // Ornamental coffin lid hinged on its right side; opens wider while casting.
    c.save();c.translate(36,-100);c.rotate(casting?.30:.13);
    path(c,[[0,-10],[13,-14],[24,7],[24,94],[0,100]],'#c18a57','#835139',3);
    rect(c,5,18,13,55,'#2d5182','#d1ad68',2);jewel(c,12,11,.45);
    c.restore();
    // Explicit non-solid rim; always rooted to the plinth.
    for(let j=0;j<4;j++)jewel(c,-25+j*17,-103,.28);
    c.strokeStyle='#f0d7a6';c.lineCap='round';
    const sway=casting?Math.sin(t*8)*2.8:Math.sin(t*1.3)*1.15;
    c.save();c.translate(-8,sway);
    rect(c,-19,-74,42,58,'#ddc79d','#947851',10);
    for(let j=0;j<5;j++){
      c.strokeStyle=j%2?'#ab936d':'#f3dfb5';c.lineWidth=4;
      c.beginPath();c.moveTo(-18,-63+j*10);c.lineTo(22,-70+j*10);c.stroke();
    }
    c.fillStyle='#ebd5ae';c.strokeStyle='#947852';c.lineWidth=3.2;
    c.beginPath();c.ellipse(1,-91,23,25,.09,0,TAU);c.fill();c.stroke();
    for(let j=0;j<5;j++){
      c.strokeStyle=j%2?'#f7e2b7':'#b8a078';c.lineWidth=4;
      c.beginPath();c.moveTo(-20,-108+j*9);c.lineTo(21,-114+j*9);c.stroke();
    }
    rect(c,-21,-98,43,13,'#143660','#cfaa5d',4);
    for(const ex of [-10,11]){
      c.fillStyle='#69c4d0';c.beginPath();c.arc(ex,-92,3.4,0,TAU);c.fill();
    }
    // Front arm points at the moving bandage projectile; a simple cloth tail
    // indicates direction without an exclamation mark or inaccurate hit zone.
    c.strokeStyle='#dcc69e';c.lineWidth=10;c.beginPath();c.moveTo(-18,-65);
    c.quadraticCurveTo(-42,casting?-91:-65,casting?-66:-37,casting?-91:-44);
    c.moveTo(18,-64);c.quadraticCurveTo(31,-53,37,-42);c.stroke();
    if(casting){
      c.strokeStyle='#f4e2b7';c.lineWidth=4.5;
      c.beginPath();c.moveTo(-64,-91);c.quadraticCurveTo(-78,-103,-91,-87);c.stroke();
      c.strokeStyle='rgba(41,74,131,.73)';c.lineWidth=1.8;
      c.beginPath();c.moveTo(-64,-92);c.lineTo(-87,-87);c.stroke();
    }
    c.restore();c.restore();
  }
  function drawHazards(c,cam,w,gy,clockMs){const ms=Terrain.EGYPT_MUMMIES||[];if(!ms.length)return;
    c.save();c.translate(-cam,gy-520);
    for(const m of ms){if(m.x<cam-330||m.x>cam+w+450)continue;const pr=shot(m,clockMs),base=520-Terrain.height(m.x);
      drawMummy(c,m.x,base,clockMs/1000,!!pr);
      if(pr){
        c.save();c.translate(pr.x,pr.y);c.rotate(-.23+.3*pr.p);c.strokeStyle='#f2e1b8';c.lineWidth=9;c.lineCap='round';c.beginPath();c.moveTo(-17,-5);c.bezierCurveTo(-6,-23,4,22,19,-5);c.stroke();
        c.strokeStyle=P.lapis;c.lineWidth=2.5;c.beginPath();c.moveTo(-16,-7);c.quadraticCurveTo(-3,-14,12,2);c.stroke();jewel(c,0,0,.37);c.restore();
      }
    }c.restore();
  }
  // A circular or custom wheel is sampled on the SAME vertices used by Matter.
  // Morph toward a *rounded* equilateral triangular radius with a fixed max radius;
  // original custom wheel and lava erosion are fully restored afterwards.
  function morph(vertices,level){if(!Array.isArray(vertices)||vertices.length<3||!(level>0))return vertices;
    const n=vertices.length;let cx=0,cy=0,R=0;for(const q of vertices){cx+=q.x;cy+=q.y;}cx/=n;cy/=n;
    for(const q of vertices)R=Math.max(R,Math.hypot(q.x-cx,q.y-cy));
    const k=clamp(level,0,1)*.83, normals=[-Math.PI/6,Math.PI/2,7*Math.PI/6];
    return vertices.map(q=>{const dx=q.x-cx,dy=q.y-cy,a=Math.atan2(dy,dx),co=Math.max(...normals.map(n=>Math.cos(a-n)));const rt=R*.53/Math.max(co,.50001);return {x:cx+dx*(1-k)+Math.cos(a)*rt*k,y:cy+dy*(1-k)+Math.sin(a)*rt*k};});
  }
  function drawBandages(c,vertices,level){if(!(level>.01)||!vertices||vertices.length<3)return;
    c.save();c.globalAlpha*=clamp(level*1.3,0,1);c.beginPath();vertices.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));c.closePath();c.clip();
    const R=Math.max(...vertices.map(p=>Math.hypot(p.x,p.y))),w=R*2.5;
    c.rotate(-.38);for(let j=-2;j<=2;j++){const y=j*R*.38;c.fillStyle=j%2?'#ead7a8':'#f8eac6';rect(c,-w*.5,y-7,w,15,c.fillStyle);c.strokeStyle='#baa57f';c.lineWidth=1;c.beginPath();c.moveTo(-w*.5,y+7);c.lineTo(w*.5,y+7);c.stroke();
      for(let i=-2;i<=2;i++){c.strokeStyle=P.lapis;c.lineWidth=1.6;const x=i*R*.44+(j%2)*6;c.beginPath();c.moveTo(x-5,y-2);c.lineTo(x+3,y+2);c.moveTo(x,y-4);c.lineTo(x,y+5);c.stroke();}}
    c.restore();
  }
  return {P,shot,morph,drawBandages,drawBackdrop,drawGround,drawHazards};
})();
