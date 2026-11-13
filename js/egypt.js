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
    // Sculpted papyrus column, with separate shaft, flutes and lotus capital.
    c.fillStyle='rgba(62,39,35,.15)';c.beginPath();c.ellipse(3,1,33,6,0,0,TAU);c.fill();
    rect(c,-28,-16,56,15,'#d6aa77','#8c5b44',2);
    rect(c,-21,-169,42,155,'#cd9867','#986448',2);
    rect(c,-15,-168,16,151,'#e9bd83');
    rect(c,8,-168,10,151,'#b88158');
    c.strokeStyle='#ab744b';c.lineWidth=1.25;
    for(const dx of [-13,-6,4,13]){c.beginPath();c.moveTo(dx,-151);c.lineTo(dx,-29);c.stroke();}
    for(const yy of [-146,-132,-45,-32])rect(c,-21,yy,42,6,yy<-100?'#284d7e':'#d9ac6b','#ab7951',1);
    // Papyrus / lotus blooming capital, recognisable silhouette at racing speed.
    path(c,[[-20,-163],[-30,-179],[-37,-196],[-30,-211],[-18,-206],[-10,-189],[-5,-203],[0,-215],[5,-203],[11,-189],[21,-207],[32,-211],[38,-196],[30,-179],[20,-163]],'#d5a572','#88583f',2);
    c.strokeStyle='#30537e';c.lineWidth=2.5;
    for(const dx of [-26,-13,0,13,26]){c.beginPath();c.moveTo(dx*.55,-167);c.quadraticCurveTo(dx,-189,dx,-201);c.stroke();}
    rect(c,-40,-218,80,9,'#e6bd84','#945d43',1);
    rect(c,-35,-224,70,6,'#285181','#d5ad65',1);
    for(const xx of [-13,13])jewel(c,xx,-218,.26);
    if(glow)rect(c,-20,-172,40,3,'#f2d095');c.restore();}
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
  function sphinx(c,x,base,k=1){
    c.save();c.translate(x,base);c.scale(k,k);
    // V29: the Giza Sphinx as an aged single limestone monolith, informed by
    // the player's original photograph (not a copied photograph/texture).
    // All artwork is deterministic Canvas geometry; no bitmap or image asset.
    const edge='#8f694c', seam='#8d7458', sun='#f5d7a5';
    const grad=(x1,y1,x2,y2,stops)=>{const g=c.createLinearGradient(x1,y1,x2,y2);for(const [s,col] of stops)g.addColorStop(s,col);return g;};
    const stone=grad(-230,-300,270,50,[[0,'#f2d7a4'],[.35,'#e5c38f'],[.68,'#d1a879'],[1,'#b98a60']]);
    const faceStone=grad(94,-344,216,-226,[[0,'#f5ddb0'],[.35,'#e5c597'],[.75,'#cda276'],[1,'#ab7856']]);
    const shadowStone=grad(-280,-150,160,5,[[0,'#b48b64'],[.6,'#d5ad7d'],[1,'#b68660']]);
    const sculpt=(draw,fill,stroke=edge,lw=1.55)=>{
      c.beginPath();draw();c.closePath();c.fillStyle=fill;c.fill();
      if(stroke){c.strokeStyle=stroke;c.lineWidth=lw;c.lineJoin='round';c.stroke();}
    };
    const line=(draw,color=seam,w=1.3)=>{c.beginPath();draw();c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.stroke();};
    const texture=(clip,seed,count,xmin,xmax,ymin,ymax,strata=true)=>{
      c.save();c.beginPath();clip();c.closePath();c.clip();
      // Strata through the body: the actual Giza statue retains horizontal
      // bedding, distressed edges and block restoration seams.
      if(strata) for(let j=0;j<13;j++){
        const yy=ymin+18+j*(ymax-ymin-36)/12;
        c.strokeStyle=j%3===0?'rgba(114,85,57,.21)':'rgba(255,235,190,.24)';
        c.lineWidth=j%3===0?2.8:1.7;
        c.beginPath();c.moveTo(xmin-30,yy);
        for(let z=0;z<9;z++){
          const xx=xmin-30+(xmax-xmin+60)*(z+1)/9;
          c.lineTo(xx,yy+2.6*Math.sin(z*2.45+j*1.6));
        }
        c.stroke();
      }
      // Small stone cuts and erosion, visually distinct from hieroglyphs.
      for(let j=0;j<count;j++){
        const r=hash(j*9.17+seed), q=hash(j*21.73+seed*6.39);
        const px=xmin+r*(xmax-xmin), py=ymin+q*(ymax-ymin);
        const len=4+hash(j+seed*17)*20;
        c.strokeStyle=j%3===0?'rgba(255,235,191,.36)':'rgba(106,73,50,.24)';
        c.lineWidth=j%4===0?1.65:.85;
        c.beginPath();c.moveTo(px,py);c.lineTo(px+len,py+(j%7===0?3:0));c.stroke();
        if(j%13===0){c.beginPath();c.moveTo(px+len*.7,py);c.lineTo(px+len*.68,py+5);c.stroke();}
      }
      c.restore();
    };
    // Subtle ground shadow and buried lower courses — no floating baseline.
    c.fillStyle='rgba(83,56,37,.20)';c.beginPath();c.ellipse(-2,7,335,23,0,0,TAU);c.fill();
    sculpt(()=>{c.moveTo(-343,-19);c.lineTo(315,-19);c.lineTo(328,-6);c.lineTo(319,7);c.lineTo(-339,7);},'#a77c57','#8a6349',1.5);
    sculpt(()=>{c.moveTo(-327,-36);c.lineTo(306,-36);c.lineTo(320,-19);c.lineTo(-335,-19);},'#d6ad7d','#9a6e4d',1.4);
    for(const yy of [-31,-22,-12])line(()=>{c.moveTo(-322,yy);c.lineTo(313,yy+1)},'rgba(101,69,49,.35)',1.25);
    // Small chipped blocks in the ancient lower enclosure.
    for(let j=0;j<20;j++){
      let xx=-316+j*31, yy=-14+(j%3)*4;
      line(()=>{c.moveTo(xx,yy);c.lineTo(xx+17,yy+.8)},'rgba(245,218,167,.36)',1.3);
      if(j%2===1)line(()=>{c.moveTo(xx+15,-19);c.lineTo(xx+13,-9)},'rgba(112,77,53,.26)',1);
    }
    // The rear flank is strongly rounded, but cut by weathered limestone beds.
    const bodyClip=()=>{
      c.moveTo(-312,-44);
      c.bezierCurveTo(-329,-77,-308,-127,-279,-147);
      c.bezierCurveTo(-251,-174,-205,-186,-155,-181);
      c.bezierCurveTo(-98,-178,-52,-169,-18,-171);
      c.bezierCurveTo(36,-180,83,-166,112,-140);
      c.bezierCurveTo(131,-122,144,-80,133,-42);
      c.lineTo(95,-33);c.lineTo(-309,-33);
    };
    sculpt(bodyClip,stone,'#9c7858',2);
    // Backlit shoulder ridge and lower eroded volume.
    sculpt(()=>{c.moveTo(-307,-72);c.bezierCurveTo(-299,-127,-269,-150,-230,-164);
      c.bezierCurveTo(-181,-186,-123,-170,-88,-165);
      c.bezierCurveTo(-176,-153,-240,-134,-276,-86);c.closePath();},
      grad(-240,-173,-260,-54,[[0,'#f6dba7'],[1,'#d2a779']]),null);
    sculpt(()=>{c.moveTo(-294,-70);c.bezierCurveTo(-237,-95,-187,-102,-130,-100);
      c.bezierCurveTo(-40,-96,47,-101,124,-89);c.lineTo(123,-39);c.lineTo(-290,-39);},
      'rgba(147,104,70,.19)',null);
    texture(bodyClip,33,84,-316,137,-183,-31);
    // Upper back weathering: limestone seams are deliberately uneven, not bricks.
    for(const [yy,sh] of [[-154,0],[-135,9],[-115,-7],[-94,4],[-75,-8],[-57,6]]){
      line(()=>{c.moveTo(-290+Math.abs(yy+140)*.35,yy);
        c.bezierCurveTo(-241+sh,yy+5,-192-sh,yy-6,-128,yy+2);
        c.bezierCurveTo(-70,yy+3,-21,yy+5,65,yy+4);},
        yy%2===0?'rgba(117,83,58,.33)':'rgba(251,228,179,.38)',yy===-115?3:1.8);
    }
    // Hip joint is a large semi-circular carved mass, never a cartoon spiral.
    sculpt(()=>{c.moveTo(-307,-55);c.bezierCurveTo(-316,-97,-288,-137,-253,-144);
      c.bezierCurveTo(-219,-154,-170,-138,-154,-112);
      c.bezierCurveTo(-139,-88,-157,-54,-181,-36);
      c.lineTo(-292,-37);},'rgba(157,110,73,.16)',null);
    line(()=>{c.moveTo(-297,-98);c.bezierCurveTo(-271,-137,-239,-146,-212,-139);
      c.bezierCurveTo(-187,-131,-176,-115,-177,-94);},'rgba(246,218,170,.35)',2.4);
    line(()=>{c.moveTo(-172,-81);c.bezierCurveTo(-182,-72,-202,-69,-219,-72)},'rgba(118,85,59,.27)',1.6);
    // Stone-block restoration below hip, like the user's original photograph.
    for(const [x1,y1,x2,y2] of [[-298,-68,-252,-65],[-273,-52,-207,-52],[-205,-69,-160,-69],[-295,-39,-209,-39]]){
      line(()=>{c.moveTo(x1,y1);c.lineTo(x2,y2)},'rgba(107,73,53,.33)',2.5);
    }
    // Shoulder-to-chest volume: massive, sloped and organically joined to head.
    const chestClip=()=>{
      c.moveTo(34,-45);c.bezierCurveTo(19,-93,33,-145,55,-188);
      c.bezierCurveTo(76,-226,109,-234,140,-207);
      c.bezierCurveTo(171,-175,178,-112,160,-46);
      c.lineTo(154,-30);c.lineTo(37,-30);
    };
    sculpt(chestClip,grad(30,-226,177,-30,[[0,'#e8c395'],[.44,'#d8ae81'],[1,'#b68962']]),'#a77c59',1.7);
    texture(chestClip,67,42,30,176,-205,-32);
    line(()=>{c.moveTo(61,-179);c.bezierCurveTo(43,-137,45,-85,63,-48)},'rgba(255,234,190,.55)',4.7);
    for(let j=0;j<4;j++)line(()=>{const yy=-122+j*25;c.moveTo(48,yy);c.bezierCurveTo(80,yy+4,123,yy+4,161,yy+9)},'rgba(139,92,59,.29)',2);
    // Two forward lion paws are deep reliefs, a key recognisable Giza feature.
    sculpt(()=>{c.moveTo(95,-82);c.bezierCurveTo(135,-85,160,-68,173,-62);
      c.lineTo(291,-61);c.quadraticCurveTo(312,-60,316,-45);
      c.lineTo(313,-29);c.lineTo(89,-29);c.closePath();},'#b88b64','#a07755',1.8);
    sculpt(()=>{c.moveTo(84,-91);c.bezierCurveTo(131,-100,164,-77,175,-68);
      c.lineTo(288,-67);c.quadraticCurveTo(310,-67,312,-52);
      c.lineTo(313,-42);c.lineTo(91,-42);c.closePath();},
      grad(105,-94,255,-37,[[0,'#efcea0'],[.65,'#d0a075'],[1,'#b98e64']]),'#9d7656',1.55);
    line(()=>{c.moveTo(117,-76);c.lineTo(289,-76)},'rgba(255,234,195,.54)',2);
    line(()=>{c.moveTo(94,-50);c.lineTo(305,-50)},'rgba(120,84,55,.32)',2);
    for(let j=0;j<4;j++)line(()=>{const xx=272+j*10;c.moveTo(xx,-58);c.quadraticCurveTo(xx+2,-49,xx-1,-41)},'rgba(116,82,59,.48)',1.6);
    // Lower leg extends across the plinth to emphasize enormous length.
    sculpt(()=>{c.moveTo(96,-43);c.lineTo(299,-42);c.quadraticCurveTo(319,-39,320,-27);
      c.lineTo(317,-18);c.lineTo(91,-18);},'#bb916c','#9a7657',1.2);
    for(let j=0;j<4;j++)line(()=>{c.moveTo(279+j*9,-36);c.lineTo(276+j*9,-19)},'rgba(94,67,48,.3)',1.3);
    // Separate head proportions: smaller, integrated into the monumental chest.
    c.save();c.translate(36,-31);c.scale(.83,.88);
    // V29.7 — Giza royal nemes: flat crown, carved angular shoulders, stone pleats.
    // Following the actual Great Sphinx silhouette (including the player's
    // own photo): this is a squared-off royal headdress, NOT a rounded hood.
    // The head and face are unchanged. The rear lappet falls to the shoulders.
    const hoodClip=()=>{
      c.moveTo(68,-224);
      c.lineTo(57,-269);         // straight rear cloth fall
      c.lineTo(56,-310);
      c.lineTo(70,-349);         // angular upper fold
      c.lineTo(96,-371);
      c.lineTo(153,-371);        // distinctive nearly FLAT top
      c.lineTo(173,-363);
      c.lineTo(185,-345);
      c.lineTo(189,-316);        // angular temple frame
      c.lineTo(186,-275);
      c.lineTo(177,-233);
      c.lineTo(181,-214);
      c.lineTo(202,-187);        // projecting lappet over shoulder
      c.lineTo(161,-168);
      c.lineTo(145,-195);
      c.quadraticCurveTo(124,-204,105,-190);
      c.lineTo(85,-185);
      c.lineTo(68,-224);
    };
    sculpt(hoodClip,grad(52,-370,202,-170,[[0,'#f1d8aa'],[.45,'#dbb78b'],[1,'#ab7d5c']]),'#946e50',2.2);
    // Broad planar facet of the cloth along the rear upper fold: distinct
    // straight segments replace the earlier semi-circular halo.
    sculpt(()=>{
      c.moveTo(57,-308);c.lineTo(70,-348);c.lineTo(96,-371);
      c.lineTo(118,-371);c.lineTo(88,-336);
      c.lineTo(83,-291);c.lineTo(91,-234);
      c.lineTo(108,-191);c.lineTo(85,-185);
      c.lineTo(68,-224);c.lineTo(57,-269);
    },grad(59,-363,103,-195,[[0,'rgba(255,245,207,.71)'],[.58,'rgba(232,194,141,.26)'],[1,'rgba(170,120,78,.19)']]),null);
    // Flat top plane and sharp edge from the quarrying, NOT a rounded turban.
    sculpt(()=>{
      c.moveTo(97,-371);c.lineTo(153,-371);c.lineTo(173,-363);
      c.lineTo(160,-357);c.lineTo(108,-356);c.lineTo(81,-349);
    },'rgba(255,239,200,.23)',null);
    line(()=>{c.moveTo(95,-370);c.lineTo(151,-371);c.lineTo(174,-362)},'rgba(255,247,210,.70)',2.0);
    line(()=>{c.moveTo(57,-309);c.lineTo(70,-348);c.lineTo(95,-370)},'rgba(120,89,64,.47)',1.8);
    // The real nemes has a wide chiseled side lappet; shallow parallel
    // pleats descend from the squared shoulder, consistent with limestone.
    c.save();c.beginPath();hoodClip();c.closePath();c.clip();
    for(let j=0;j<8;j++){
      const startY=-319+j*16.5;
      line(()=>{
        c.moveTo(59+(j>5?(j-5)*2:0),startY);
        c.lineTo(80+j*.9,startY+19);
        c.lineTo(95+j*.7,startY+25);
      },j%3===0?'rgba(117,88,64,.50)':'rgba(127,98,72,.37)',j%3===0?2.0:1.35);
      line(()=>{c.moveTo(63,startY+3);c.lineTo(84+j*.8,startY+22)},
        'rgba(255,234,191,.26)',.95);
    }
    c.restore();
    texture(hoodClip,91,29,54,198,-360,-182,false);
    // Rear edge has the strong trapezoidal profile visible in Giza photographs.
    line(()=>{c.moveTo(65,-222);c.lineTo(83,-185);c.lineTo(106,-191)},
      'rgba(112,79,54,.49)',1.65);
    // V29.3 — Portrait restoration pass based on the photographed Great Sphinx.
    // The nose is intentionally BROKEN, the eyes are low-relief chisel work,
    // and every colour is a limestone plane, never painted cosmetics.
    // Directional light comes from the upper left; sculptural shadows form
    // below brows, the nasal bridge, the cheek and beneath the mouth.
    const faceClip=()=>{
      c.moveTo(111,-331);
      c.bezierCurveTo(129,-345,161,-338,176,-318); // high forehead
      c.bezierCurveTo(183,-309,185,-293,184,-277);
      c.bezierCurveTo(185,-269,187,-267,188,-263); // broken nose root
      c.lineTo(187,-259);c.lineTo(181,-256);c.lineTo(186,-251);
      c.bezierCurveTo(189,-248,187,-245,184,-242); // nostril remnant
      c.lineTo(183,-238);
      c.quadraticCurveTo(188,-235,187,-233); // deeply incised, restrained lip
      c.bezierCurveTo(185,-229,180,-225,175,-224);
      c.bezierCurveTo(174,-217,169,-213,160,-212); // broad, firm chin
      c.bezierCurveTo(145,-207,128,-215,120,-233);
      c.bezierCurveTo(113,-253,107,-296,111,-331);
    };
    sculpt(faceClip,faceStone,'#977051',1.75);

    // Frontal plane and forehead: broad light, narrow rear temple.
    sculpt(()=>{c.moveTo(114,-322);c.bezierCurveTo(127,-339,155,-338,167,-326);
      c.bezierCurveTo(157,-313,154,-303,156,-287);
      c.lineTo(146,-256);c.lineTo(132,-243);
      c.bezierCurveTo(122,-264,112,-301,114,-322);},
      grad(109,-332,162,-228,[[0,'rgba(255,244,208,.53)'],[.64,'rgba(245,211,165,.23)'],[1,'rgba(172,123,82,.03)']]),null);
    // Flat temple recedes behind the stone cheekbone.
    sculpt(()=>{c.moveTo(116,-290);c.lineTo(135,-297);c.quadraticCurveTo(141,-282,146,-272);
      c.lineTo(146,-236);c.bezierCurveTo(131,-251,121,-267,116,-290);},
      'rgba(143,99,69,.12)',null);

    // V29.5 — eyes carved IN limestone, not painted ON a cartoon face.
    // Reference: the user's photograph of the Giza Sphinx. A weathered royal
    // almond eye with a projecting brow, tucked shadow, light-catching lower
    // lid and no black pupil/white sclera. A second eye only glances around
    // the receding plane of the face; both remain part of the same monolith.
    // Temple plane projects around the nearest eye socket.
    sculpt(()=>{c.moveTo(145,-293);c.bezierCurveTo(159,-303,172,-302,181,-293);
      c.lineTo(183,-283);c.bezierCurveTo(172,-290,159,-286,148,-279);
      c.quadraticCurveTo(147,-286,145,-293);},
      grad(148,-301,181,-279,[[0,'rgba(255,238,200,.58)'],[.40,'rgba(233,198,151,.55)'],[1,'rgba(148,103,72,.33)']]),null);
    // Carved crease in the stone above the eyelid, broken by erosion.
    line(()=>{c.moveTo(148,-289);c.bezierCurveTo(159,-295,175,-295,182,-287)},
      'rgba(132,94,69,.50)',1.35);
    line(()=>{c.moveTo(151,-290);c.quadraticCurveTo(167,-298,178,-290)},
      'rgba(255,235,196,.63)',1.55);
    // The almond-shaped depression is slightly raised at the outer corner.
    sculpt(()=>{c.moveTo(153,-281);c.bezierCurveTo(162,-286,174,-287,181,-281);
      c.bezierCurveTo(173,-276.1,163,-275.3,155,-278.7);
      c.quadraticCurveTo(154,-280,153,-281);},
      grad(166,-286,165,-275,[[0,'rgba(111,80,58,.41)'],[.55,'rgba(157,119,86,.29)'],[1,'rgba(221,183,137,.15)']]),null);
    // Upper lid is the sharp chiseled edge of the brow shadow.
    line(()=>{c.moveTo(153,-281.5);c.bezierCurveTo(163,-287.5,174,-287,181,-281)},
      'rgba(115,83,63,.72)',1.65);
    line(()=>{c.moveTo(155,-279);c.bezierCurveTo(164,-275.5,175,-276.1,180.5,-281)},
      'rgba(255,235,192,.79)',1.5);
    line(()=>{c.moveTo(155,-277.3);c.bezierCurveTo(168,-274.5,175,-277.2,179,-279.3)},
      'rgba(141,105,76,.23)',.65);
    // Weathered iris: a very shallow circular relief made entirely of stone.
    // Its lower half is swallowed by erosion, so the gaze is solemn, not cartoonish.
    line(()=>{c.moveTo(169.6,-283.4);c.bezierCurveTo(167.6,-282.0,167.7,-278.5,169.8,-277.2)},
      'rgba(114,81,58,.38)',.78);
    line(()=>{c.moveTo(172,-283.2);c.quadraticCurveTo(173.6,-280.8,172,-278.5)},
      'rgba(250,222,174,.32)',.68);
    // Tear duct is a small cut, softly blended with the broken nasal bridge.
    line(()=>{c.moveTo(180.5,-280.6);c.lineTo(182,-278.8)},
      'rgba(142,102,73,.45)',.9);
    // A receding far eye: part of the side facet, not a disconnected eyebrow.
    sculpt(()=>{c.moveTo(132,-283);c.quadraticCurveTo(140,-287,148,-283);
      c.quadraticCurveTo(141,-280.7,134,-282.2);},
      'rgba(158,117,84,.09)',null);
    line(()=>{c.moveTo(131,-284);c.quadraticCurveTo(140,-288.9,148,-283.5)},
      'rgba(122,89,67,.20)',1.15);
    line(()=>{c.moveTo(134,-281.8);c.quadraticCurveTo(141,-280,147,-283.4)},
      'rgba(255,237,194,.29)',.8);
    // Keep this edge weathered so the far eye reads only at close zoom.
    line(()=>{c.moveTo(130,-291);c.lineTo(137,-292)},
      'rgba(255,239,204,.25)',.95);

    // Nasal structure: carved ridge runs from brow into a missing, broken tip.
    // No projecting intact nose: the photo shows a flat eroded stump.
    sculpt(()=>{c.moveTo(177,-285);c.quadraticCurveTo(183,-279,186,-267);
      c.lineTo(189,-261);c.lineTo(185,-257);c.lineTo(180,-258);
      c.bezierCurveTo(175,-266,175,-275,177,-285);},
      grad(175,-281,191,-258,[[0,'rgba(255,239,193,.51)'],[1,'rgba(164,113,77,.24)']]),null);
    // Chipped tip silhouette: irregular but compact, with a rough fracture.
    line(()=>{c.moveTo(184,-260);c.lineTo(187,-259);c.lineTo(181,-255);c.lineTo(185,-253)},
      'rgba(113,79,55,.73)',1.45);
    line(()=>{c.moveTo(179,-255);c.lineTo(183,-251)},
      'rgba(250,222,171,.62)',1.15);
    // The cheek is a broad raised limestone plane, not a thin cartoon cheek.
    sculpt(()=>{c.moveTo(149,-272);c.quadraticCurveTo(163,-269,175,-266);
      c.lineTo(183,-250);c.bezierCurveTo(175,-240,167,-232,150,-229);
      c.lineTo(134,-238);c.quadraticCurveTo(146,-254,149,-272);},
      grad(146,-269,177,-235,[[0,'rgba(249,226,181,.34)'],[.55,'rgba(224,182,130,.11)'],[1,'rgba(132,86,60,.18)']]),null);
    line(()=>{c.moveTo(156,-261);c.quadraticCurveTo(165,-260,174,-255)},
      'rgba(255,240,199,.38)',1.25);
    // Subtle nasolabial crease, softened by centuries of weathering.
    line(()=>{c.moveTo(179,-249);c.quadraticCurveTo(177,-245,177,-240)},
      'rgba(124,86,60,.30)',1.2);

    // Calm royal mouth, carved as a narrow shadow between raised stone lips.
    sculpt(()=>{c.moveTo(173,-240);c.quadraticCurveTo(179,-241,185,-236);
      c.quadraticCurveTo(181,-233,173,-235);},
      'rgba(241,208,165,.26)',null);
    line(()=>{c.moveTo(173,-237);c.quadraticCurveTo(181,-239,187,-234)},
      '#8b6349',1.35);
    line(()=>{c.moveTo(176,-231);c.quadraticCurveTo(183,-231,185,-233)},
      'rgba(249,225,180,.72)',1.25);
    // Sphinx's chin: angular eroded block, not pointed jaw or modern beard.
    sculpt(()=>{c.moveTo(143,-230);c.quadraticCurveTo(156,-235,173,-225);
      c.lineTo(177,-216);c.quadraticCurveTo(167,-208,152,-211);
      c.lineTo(136,-220);},
      grad(146,-230,176,-211,[[0,'rgba(246,220,178,.21)'],[1,'rgba(125,82,57,.21)']]),null);
    line(()=>{c.moveTo(149,-214);c.quadraticCurveTo(163,-210,175,-219)},
      'rgba(127,89,63,.29)',1.55);
    line(()=>{c.moveTo(155,-220);c.lineTo(164,-221)},
      'rgba(255,240,195,.49)',1.1);

    // Ear in raised low relief. Behind it, preserve the nemes stone texture.
    sculpt(()=>{c.moveTo(115,-281);c.bezierCurveTo(107,-284,104,-273,108,-264);
      c.quadraticCurveTo(113,-254,120,-263);c.quadraticCurveTo(123,-272,115,-281);},
      '#cba77e','rgba(112,82,61,.66)',1.05);
    line(()=>{c.moveTo(111,-273);c.quadraticCurveTo(119,-272,114,-262)},
      'rgba(119,86,63,.56)',1.2);

    // Nemes band is itself a weathered carved ridge, in limestone not gold.
    line(()=>{c.moveTo(104,-325);c.bezierCurveTo(132,-340,163,-339,181,-324)},
      '#9f785a',2.4);
    line(()=>{c.moveTo(109,-330);c.bezierCurveTo(141,-343,168,-336,179,-326)},
      'rgba(255,236,199,.70)',2.0);
    sculpt(()=>{c.moveTo(174,-326);c.quadraticCurveTo(171,-334,176,-337);
      c.quadraticCurveTo(184,-333,180,-323);c.lineTo(181,-319);c.lineTo(177,-318);},
      '#d2b088','#98745a',.85);

    // Geological weathering of the face is localized to the stone, avoiding
    // random scratches across the eye, lips or silhouette.
    c.save();c.beginPath();faceClip();c.closePath();c.clip();
    c.strokeStyle='rgba(115,80,56,.14)';c.lineWidth=1.45;
    for(const [x1,y1,x2,y2] of [[122,-316,135,-317],[135,-307,145,-307],[118,-247,126,-246],[139,-228,150,-229],[156,-216,169,-216]]){
      c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();
    }
    c.fillStyle='rgba(252,237,202,.34)';
    for(const [x1,y1] of [[140,-320],[153,-315],[131,-255],[171,-245],[161,-224]]){
      c.fillRect(x1,y1,2.2,.9);
    }
    c.restore();
    // Hairline fractures and rim wear, deliberately limited to the monument.
    line(()=>{c.moveTo(87,-245);c.lineTo(98,-236);c.lineTo(104,-229)},'rgba(119,90,65,.34)',1.5);
    line(()=>{c.moveTo(-35,-152);c.lineTo(-27,-143);c.lineTo(-18,-144)},'rgba(116,78,54,.31)',1.6);
    c.restore(); // proportional head transform
    c.restore(); // monument transform
  }
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
    // A true axial ceremonial courtyard: wall, recessed sanctum, papyrus columns,
    // architrave and carved story panels, all behind the physical race surface.
    rect(c,-515,-67,1030,74,'#a66d4e','#81533e',4);
    rect(c,-508,-68,1016,10,'#e5b682','#8f5c43',2);
    // Deep cool recesses between columns create perspective without textures.
    for(let j=-4;j<=3;j++){
      const xx=j*113+56;
      rect(c,xx-42,-211,84,143,'#955d47','#83503c',2);
      rect(c,xx-35,-198,70,126,'#bb8a61','#9b6749',2);
      rect(c,xx-27,-192,54,114,'#5f574f','#dcaf7a',3);
      c.fillStyle='#233954';c.fillRect(xx-21,-185,42,107);
      c.save();c.globalAlpha=.4;ankh(c,xx,-137,.55);c.restore();
    }
    // Two broad relief wall sections above lower foundation.
    for(const d of [-1,1]){
      rect(c,d*286-116,-145,232,78,'#d6a573','#8c5944',3);
      rect(c,d*286-111,-138,222,65,null,'#eccc92',2);
      wingedRelief(c,d*286,-101,.62);
      stoneGrain(c,d*286-110,-141,223,72,d+11);
    }
    // Full height lotus/papyrus columns, rather than small repeated sticks.
    for(let i=-4;i<=4;i++)column(c,i*113,-67,i%2?.92:1.02);
    // Architectural architrave closes the void above capitals.
    rect(c,-525,-295,1050,34,'#c99665','#88563f',3);
    rect(c,-532,-263,1064,30,'#e0b27b','#945e42',2);
    rect(c,-518,-258,1036,13,'#9a6548');
    lapisInlay(c,-519,-292,1038,23);
    for(let j=0;j<20;j++)jewel(c,-488+j*51,-237,.37);
    // Upper cornice with carved uraei/lotus accents, not a disconnected floating line.
    rect(c,-543,-310,1086,17,'#ebc48a','#926044',2);
    for(let j=-7;j<=7;j++){
      const xx=j*69;
      c.strokeStyle='#9a684a';c.lineWidth=1.7;c.beginPath();
      c.moveTo(xx-14,-299);c.quadraticCurveTo(xx,-320,xx+14,-299);c.stroke();
    }
    // Symmetrical sacred court at center, projected forward for focus.
    ancientPylon(c,0,-52,.79);
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
    // Gold-stone sanctuary inspired by the original museum photographs.
    rect(c,-410,-67,820,74,'#ac7550','#80523f',4);
    rect(c,-412,-72,824,10,'#e7bd85','#936044',2);
    // A stepped cornice and two richly worked wings provide hierarchy.
    for(const d of [-1,1]){
      const xx=d*245;
      rect(c,xx-112,-351,224,284,'#a76c4e','#744937',4);
      rect(c,xx-108,-352,216,9,'#edc68e');
      rect(c,xx-101,-334,202,13,'#265080','#d6ae6f',2);
      rect(c,xx-101,-305,202,9,'#eac288','#88583f',2);
      rect(c,xx-101,-96,202,11,'#284e80','#d5ae6c',2);
      // Densely carved side walls, but deliberately behind the giant masks.
      engravedPanel(c,xx-94,-288,188,181,6);
      stoneGrain(c,xx-100,-346,200,278,xx+7);
      c.save();c.translate(xx,0);
      for(let j=-1;j<=1;j++){
        jewel(c,-94,-198+j*44,.37);jewel(c,94,-198+j*44,.37);
      }
      c.restore();
      // Raised lapis cartouche anchors the royal funerary mask.
      rect(c,xx-84,-289,168,175,'#9d7355','#e7bd83',6);
      rect(c,xx-74,-281,148,160,'#1b426f','#cfa968',5);
      royalMask(c,xx,-158,.67);
      lapisInlay(c,xx-96,-118,192,13);
    }
    // Central portal: a deep layered dark blue corridor, not a flat rectangle.
    rect(c,-164,-345,328,282,'#81503f','#d3a36a',7);
    rect(c,-145,-325,290,260,'#b9895c','#f0cc8c',5);
    rect(c,-129,-311,258,246,'#1f4876','#d9b477',5);
    rect(c,-111,-294,222,228,'#102a4d','#b78a56',4);
    const aura=c.createRadialGradient(0,-174,8,0,-174,173);
    aura.addColorStop(0,'rgba(97,190,183,.51)');aura.addColorStop(.55,'rgba(53,111,142,.2)');aura.addColorStop(1,'rgba(30,63,106,0)');
    c.fillStyle=aura;c.fillRect(-113,-297,226,234);
    // Receding lintels and two illuminated door leaves suggest a real sanctuary.
    c.strokeStyle='#d0aa67';c.lineWidth=2.6;
    for(const xx of [-87,-69,69,87]){c.beginPath();c.moveTo(xx,-266);c.lineTo(xx,-76);c.stroke();}
    c.strokeStyle='#376187';c.lineWidth=3;c.beginPath();c.moveTo(0,-263);c.lineTo(0,-75);c.stroke();
    for(const dx of [-42,42]){
      c.save();c.globalAlpha=.9;ankh(c,dx,-176,.84);c.restore();
    }
    // Central carved solar disk, hovering within its architectural recess.
    c.fillStyle='#d5a95e';c.beginPath();c.arc(0,-252,15,0,TAU);c.fill();
    c.strokeStyle='#f5d68f';c.lineWidth=2;c.beginPath();c.arc(0,-252,18,0,TAU);c.stroke();
    // Two ceremonial guardian statues flank but never occlude the race line.
    jackal(c,-153,-61,.88);jackal(c,153,-61,.88);
    // Winged sun disk above the entrance, within a dedicated upper band.
    rect(c,-375,-381,750,34,'#e3b47e','#855440',3);
    rect(c,-365,-377,730,21,'#244778','#dbb56e',2);
    wingedRelief(c,0,-333,1.05);
    lapisInlay(c,-350,-378,700,20);
    // Short crowned pylons/pedestals for a final architectural silhouette.
    for(const d of [-1,1]){
      const xx=d*386;
      rect(c,xx-20,-310,40,239,'#c38b5b','#85533c',2);
      rect(c,xx-26,-318,52,13,'#edc68b','#986345',2);
      lapisInlay(c,xx-19,-300,38,11);
      rect(c,xx-31,-85,62,13,'#e1b67b','#8d593e',2);
    }
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
        ancientPylon(c,st[0]+665,gy-26,.88);
        sphinx(c,st[0]-120,gy-62,1.55);
        heritageFlags(c,st[0]-760,gy-20,.83);
        // Discrete ceremonial-chariot relief set behind the monumental threshold.
        c.save();c.translate(st[0]+205,gy-104);chariotRelief(c,0,0,.45);c.restore();
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
      // Keep foreground palms off the silhouette of the Sphinx; the monument
      // must read as a single uninterrupted landmark. Other scenes retain palms.
      for(let i=1;i<3;i++){
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
  // Symmetrical launch from the mummy: dir = -1 (left) or +1 (right).
  // No random target steering: the same race layout and host physics clock give
  // identical projectile positions to host and remote clients.
  const SHOT_RANGE = 325, DETECT_RANGE = 395, SHOT_FLIGHT = 1.40;
  function shot(m,clockMs,dir=-1){
    const t=clockMs/1000+m.phase;
    const cycle=((t%m.period)+m.period)%m.period;
    if(cycle>SHOT_FLIGHT)return null;
    const p=cycle/SHOT_FLIGHT,side=dir>=0?1:-1;
    const x=m.x+side*(25+SHOT_RANGE*p);
    const y=520-Terrain.height(x)-51-28*Math.sin(Math.PI*p);
    return {x,y,p,cycle,dir:side};
  }
  // A mummy only casts toward a detected bike; other riders remain unaffected.
  // 'bike' may be a Matter racer (rw.position), or a network-rendered snapshot.
  function detects(m,bike,dir){
    if(!bike||bike.finished)return false;
    const wheel=bike.rw?.position||bike;
    const x=wheel.rwX??wheel.x, y=wheel.rwY??wheel.y;
    const dx=(x-m.x)*dir;
    if(!Number.isFinite(dx)||dx<-20||dx>DETECT_RANGE)return false;
    const groundY=520-Terrain.height(x)-51;
    return !Number.isFinite(y)||Math.abs(y-groundY)<180;
  }
  function drawMummy(c,x,y,t,casting,dir=-1,doubleShot=false){
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
    // The casting arm reaches toward the side on which a racer is detected.
    const aim=dir>=0?1:-1;
    c.strokeStyle='#dcc69e';c.lineWidth=10;c.beginPath();
    c.moveTo(aim*19,-64);
    c.quadraticCurveTo(aim*44,casting?-89:-63,aim*(casting?67:38),casting?-89:-43);
    c.moveTo(-aim*17,-65);
    c.quadraticCurveTo(-aim*(doubleShot?44:31),doubleShot?-89:-53,-aim*(doubleShot?67:37),doubleShot?-89:-42);
    c.stroke();
    if(casting){
      c.strokeStyle='#f4e2b7';c.lineWidth=5;
      c.beginPath();c.moveTo(aim*65,-89);c.quadraticCurveTo(aim*78,-103,aim*94,-87);c.stroke();
      c.strokeStyle='rgba(41,74,131,.73)';c.lineWidth=1.8;
      c.beginPath();c.moveTo(aim*66,-90);c.lineTo(aim*89,-87);c.stroke();
      if(doubleShot){
        c.strokeStyle='#f4e2b7';c.lineWidth=5;
        c.beginPath();c.moveTo(-aim*65,-89);c.quadraticCurveTo(-aim*78,-103,-aim*94,-87);c.stroke();
      }
    }
    c.restore();c.restore();
  }
  // Drawn from the exact same projectile trajectory used by the host hit-test.
  // Detection is visual-only on clients; gameplay remains server authoritative.
  function drawHazards(c,cam,w,gy,clockMs,bikes=[]){
    const ms=Terrain.EGYPT_MUMMIES||[];if(!ms.length)return;
    c.save();c.translate(-cam,gy-520);
    for(const m of ms){
      if(m.x<cam-440||m.x>cam+w+440)continue;
      const active=[];
      for(const dir of [-1,1]){
        if(bikes.some(b=>detects(m,b,dir))){
          const pr=shot(m,clockMs,dir);if(pr)active.push(pr);
        }
      }
      const base=520-Terrain.height(m.x);
      drawMummy(c,m.x,base,clockMs/1000,active.length>0,active[0]?.dir||-1,active.length===2);
      for(const pr of active){
        const dir=pr.dir;
        c.save();c.translate(pr.x,pr.y);c.scale(dir,1);
        c.rotate(-.11+.36*pr.p);
        // The spinning linen bolt travels sideways with a loose, curling tail.
        c.globalAlpha=.25;c.strokeStyle='#3d5e87';c.lineWidth=14;
        c.beginPath();c.moveTo(-12,3);c.quadraticCurveTo(-44,-26,-65,-4-13*Math.sin(pr.p*9));c.stroke();
        c.globalAlpha=1;
        c.strokeStyle='#d1ab7b';c.lineWidth=12;c.lineCap='round';
        c.beginPath();c.moveTo(-20,-4);c.bezierCurveTo(-2,-22,11,22,28,-4);c.stroke();
        c.strokeStyle='#f8e8be';c.lineWidth=8;
        c.beginPath();c.moveTo(-20,-4);c.bezierCurveTo(-2,-22,11,22,28,-4);c.stroke();
        c.strokeStyle='#8b765a';c.lineWidth=1.25;
        for(let i=0;i<5;i++){
          const xx=-16+i*9;
          c.beginPath();c.moveTo(xx,-6-4*Math.sin(i));c.lineTo(xx+5,4-4*Math.sin(i));c.stroke();
        }
        c.strokeStyle=P.lapis;c.lineWidth=2;
        c.beginPath();c.moveTo(-12,-5);c.quadraticCurveTo(1,-13,18,1);c.stroke();
        c.restore();
      }
    }
    c.restore();
  }
  // The wheel is physically squeezed toward a near-equilateral triangle.
  // The very slight residual rounding limits Matter.js contact chatter while
  // preserving the triangular silhouette at full intensity.
  function morph(vertices,level){
    if(!Array.isArray(vertices)||vertices.length<3||!(level>0))return vertices;
    let cx=0,cy=0,R=0;
    for(const q of vertices){cx+=q.x;cy+=q.y;}
    cx/=vertices.length;cy/=vertices.length;
    for(const q of vertices)R=Math.max(R,Math.hypot(q.x-cx,q.y-cy));
    if(R<1)return vertices;
    const k=clamp(level,0,1)*.985;
    const normals=[-Math.PI/6,Math.PI/2,7*Math.PI/6];
    return vertices.map(q=>{
      const dx=q.x-cx,dy=q.y-cy,a=Math.atan2(dy,dx);
      const co=Math.max(...normals.map(n=>Math.cos(a-n)));
      const target=R*.505/Math.max(.5,co);
      const rr=Math.hypot(dx,dy), nr=rr*(1-k)+target*k;
      return {x:cx+Math.cos(a)*nr,y:cy+Math.sin(a)*nr};
    });
  }
  // Real layered linen: ribbons tighten across the actual deformed ring as
  // the physical curse progresses, then unwind while it returns to normal.
  // All in wheel-local coordinates, so the pattern rotates with the bike.
  function drawBandages(c,vertices,level){
    if(!(level>.01)||!vertices||vertices.length<3)return;
    const k=clamp(level,0,1);
    let R=0;for(const p of vertices)R=Math.max(R,Math.hypot(p.x,p.y));
    if(R<2)return;
    const trace=()=>{c.beginPath();vertices.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();};
    c.save();
    // First, a tension cord over the tyre perimeter makes the squeezing visible.
    trace();c.strokeStyle=`rgba(139,103,63,${(.36+.5*k).toFixed(3)})`;
    c.lineWidth=2.3+5*k;c.lineJoin='round';c.stroke();
    trace();c.strokeStyle=`rgba(248,224,169,${(.32+.58*k).toFixed(3)})`;
    c.lineWidth=1.5+3.2*k;c.stroke();
    trace();c.clip();
    const count=6;
    for(let j=0;j<count;j++){
      const reveal=clamp((k-j*.115)*5.2,0,1);
      if(reveal<=0)continue;
      const y=R*(-.76+j*.305),angle=(j%2===0?-.52:.46);
      c.save();c.rotate(angle);
      c.globalAlpha=.32+.68*reveal;
      const xx=R*1.6, width=6+8*reveal;
      c.lineCap='round';
      const ribbon=()=>{c.beginPath();c.moveTo(-xx,y+5);c.bezierCurveTo(-R*.45,y-5,R*.32,y+9,xx,y-4);};
      ribbon();c.strokeStyle='#927555';c.lineWidth=width+3;c.stroke();
      ribbon();c.strokeStyle=j%2?'#e2c69a':'#f0ddba';c.lineWidth=width;c.stroke();
      ribbon();c.strokeStyle='rgba(255,250,224,.67)';c.lineWidth=2;c.stroke();
      // Thin woven threads and transverse fold marks.
      c.strokeStyle='rgba(119,89,60,.48)';c.lineWidth=1.1;
      for(let t=-4;t<=4;t++){
        const x=t*R*.32+(j%2)*6;
        c.beginPath();c.moveTo(x,y-width*.42);c.lineTo(x+5,y+width*.42);c.stroke();
      }
      c.restore();
    }
    // Crossing strips at full tension enhance the bandaged triangle.
    if(k>.56){
      const a=clamp((k-.56)*2.27,0,1);
      c.save();c.globalAlpha=.72*a;c.rotate(.7);
      c.strokeStyle='#f5e4c1';c.lineCap='round';c.lineWidth=7+5*a;
      c.beginPath();c.moveTo(-R,0);c.quadraticCurveTo(0,-R*.2,R,0);c.stroke();
      c.strokeStyle='#9d805f';c.lineWidth=1.3;c.stroke();c.restore();
    }
    c.restore();
  }
  return {P,shot,detects,morph,drawBandages,drawBackdrop,drawGround,drawHazards};
})();
