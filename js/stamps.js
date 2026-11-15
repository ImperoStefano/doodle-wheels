// Three personal route stamps. Layout and artwork are shared by host and clients.
const RouteStamps = (() => {
  const inks = ['#08776f', '#bd5130', '#5548a8'];
  let track = null, stamps = [];

  function route() {
    if (track === Terrain.ZONES) return stamps;
    track = Terrain.ZONES;
    stamps = [];
    const segment = Terrain.WORLD_SEGMENT;
    const first = segment ? segment.start : 500;
    const last = segment ? segment.end : Terrain.FINISH_X - 400;
    const hazards = [...Terrain.INTERACTIVE_OBSTACLES, ...Terrain.DYNAMIC_OBSTACLES,
      ...Terrain.NEON_GATES, ...Terrain.PORTALS, ...Terrain.EGYPT_MUMMIES];
    for (let i = 0; i < 3; i++) {
      const start = first + (last - first) * i / 3;
      const end = first + (last - first) * (i + 1) / 3;
      const mid = Math.round((start + end) / 2);
      let chosen = null;
      for (let dx = 0; dx < (end - start) / 2 - 120 && chosen === null; dx += 70) {
        for (const x of [mid + dx, mid - dx]) {
          if (!Terrain.landOk(x) || !Terrain.landOk(x - 85) || !Terrain.landOk(x + 85)) continue;
          if (hazards.some(h => Math.abs(x - h.x) < (h.width || 110) / 2 + 160)) continue;
          chosen = x; break;
        }
      }
      if (chosen !== null) stamps.push({x: chosen, height: Terrain.height(chosen) + [78, 158, 226][i], kind: i, bit: 1 << i});
    }
    return stamps;
  }

  function collect(mask, front, rear, groundY) {
    for (const stamp of route()) {
      if ((mask & stamp.bit) || Math.abs(stamp.x - (front.x + rear.x) / 2) > Math.abs(front.x - rear.x) / 2 + 48) continue;
      const dx = front.x - rear.x, dy = front.y - rear.y;
      const x = stamp.x - rear.x, y = groundY - stamp.height - rear.y;
      const along = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - along * dx, y - along * dy) <= 48) mask |= stamp.bit;
    }
    return mask;
  }

  function draw(c, camX, width, groundY, mask, time) {
    for (const s of route()) {
      const x = s.x - camX;
      if ((mask & s.bit) || x < -35 || x > width + 35) continue;
      c.save();
      c.translate(x, groundY - s.height + 2 * Math.sin(time / 350 + s.kind));
      c.rotate(-0.09);
      c.fillStyle = '#fff3ca'; c.strokeStyle = inks[s.kind]; c.lineWidth = 2.8;
      c.beginPath(); c.roundRect(-24,-16,48,32,5); c.fill(); c.stroke();
      c.setLineDash([2,3]); c.beginPath(); c.moveTo(12,-15); c.lineTo(12,15); c.stroke(); c.setLineDash([]);
      c.translate(-5,0); c.beginPath();
      if (s.kind === 0) {
        c.arc(0,0,6,0,Math.PI*2); c.fillStyle=inks[0]; c.fill();
        for (let i=0;i<8;i++) { c.rotate(Math.PI/4); c.beginPath(); c.moveTo(0,-9); c.lineTo(0,-12); c.stroke(); }
      } else if (s.kind === 1) {
        c.moveTo(-11,8); c.lineTo(-3,-8); c.lineTo(1,-1); c.lineTo(5,-6); c.lineTo(12,8); c.closePath(); c.stroke();
      } else {
        for (let i=0;i<10;i++) { const a=i*Math.PI/5-Math.PI/2, r=i%2?5:12;
          if (!i) c.moveTo(r*Math.cos(a),r*Math.sin(a)); else c.lineTo(r*Math.cos(a),r*Math.sin(a)); }
        c.closePath(); c.fillStyle=inks[2]; c.fill();
      }
      c.restore();
    }
  }
  function count(mask) { return route().filter(s => mask & s.bit).length; }
  function postcard(canvas, world, racer, wheel, title) {
    const palettes = {
      classic: ['#fde0ae','#4d8567'], neon: ['#d8c2ff','#3c336d'], egypt: ['#fee4a1','#a85c37'],
      atlantis: ['#bceeea','#236c83'], enchanted: ['#dcebb8','#3c735e'],
      paradise: ['#fff0bb','#8d7180'], inferno: ['#ffbd91','#783b45']
    };
    const [sky, ink] = palettes[world] || palettes.classic;
    canvas.width = 1000; canvas.height = 520;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff5dc'; c.fillRect(0,0,1000,520);
    c.save(); c.beginPath(); c.rect(24,24,952,338); c.clip();
    c.fillStyle = sky; c.fillRect(24,24,952,338);
    c.fillStyle = '#fff4c2'; c.beginPath(); c.arc(787,122,63,0,Math.PI*2); c.fill();
    if (world === 'neon') {
      for (let i=0; i<17; i++) {
        const x=20+60*i, y=145+Math.cos(i*2.3)*46;
        c.fillStyle='#a59bc3'; c.fillRect(x,y,47,230);
        c.fillStyle='#c8f3dd';
        for(let row=0;row<3;row++) c.fillRect(x+7,y+11+row*12,32,3);
      }
    }
    const samples = Array.from({length:480}, (_,i) => Terrain.height(Terrain.FINISH_X*i/479));
    const max = Math.max(...samples), min = Math.min(...samples);
    c.fillStyle = ink; c.beginPath(); c.moveTo(24,362);
    samples.forEach((v,i) => c.lineTo(24+952*i/479,301-(v-min)*102/Math.max(1,max-min)));
    c.lineTo(976,362); c.closePath(); c.fill();
    c.fillStyle = '#fff5dc'; c.font = 'bold 39px system-ui'; c.fillText(title,51,342,875);
    c.restore();
    c.fillStyle = ink; c.font = 'bold 20px system-ui'; c.fillText('DOODLE WHEELS',48,401);
    c.font = 'bold 43px system-ui'; c.fillText(racer.name,46,461,470);
    if (racer.finished) { c.font = '24px system-ui'; c.fillText((racer.finishTime/1000).toFixed(2)+' s',49,494); }
    c.strokeStyle = ink; c.lineWidth = 2; c.setLineDash([3,8]); c.beginPath(); c.moveTo(678,382); c.lineTo(678,496); c.stroke(); c.setLineDash([]);
    if (wheel && wheel.length >= 3) {
      const radius = Math.max(1,...wheel.map(p => Math.hypot(p.x,p.y)));
      c.beginPath(); wheel.forEach((p,i) => {
        const x=882+p.x*39/radius, y=442+p.y*39/radius;
        if(i) c.lineTo(x,y); else c.moveTo(x,y);
      });
      c.closePath(); c.lineWidth = 5; c.stroke();
    }
    c.textAlign = 'center'; c.font = 'bold 28px system-ui';
    c.fillText(count(racer.stampMask)+' / '+route().length,765,452);
  }
  return {route, collect, draw, count, postcard};
})();
