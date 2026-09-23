const createWheelDrawer = (canvasEl) => {
  let canvas = canvasEl;
  let ctx = canvas.getContext('2d');
  let drawing = false, points = [];
  const MIN_POINTS = 12;
  const MIN_AREA = 500; 

  function init() {
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    clear();
  }

  function clear() { points = []; redraw(); }

  function drawGuide() {
    ctx.save(); ctx.strokeStyle = 'rgba(26,26,26,0.18)'; ctx.setLineDash([6, 8]);
    ctx.lineWidth = 2; ctx.beginPath();
    const r = Math.min(canvas.width, canvas.height) / 2 - 14;
    ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
    ctx.stroke(); ctx.restore();
  }

  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  function start(e) { drawing = true; points = [localPos(e)]; redraw(); }
  function move(e) { if (!drawing) return; points.push(localPos(e)); redraw(); }
  function end() { if (!drawing) return; drawing = false; redraw(); }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); drawGuide();
    if (points.length < 2) return;
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
    if (!drawing && points.length > 2) ctx.closePath();
    ctx.stroke();
    if (!drawing && points.length > 2) { ctx.fillStyle = 'rgba(43,95,222,0.15)'; ctx.fill(); }
  }

  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; a += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(a / 2);
  }

  function isValid() { return points.length >= MIN_POINTS && polygonArea(points) > MIN_AREA; }

  function simplify(pts, tolerance) {
    if (pts.length < 3) return pts;
    function perpDist(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
    }
    function rdp(list) {
      let dmax = 0, idx = 0; const start = list[0], end = list[list.length - 1];
      for (let i = 1; i < list.length - 1; i++) {
        const d = perpDist(list[i], start, end); if (d > dmax) { dmax = d; idx = i; }
      }
      if (dmax > tolerance) {
        const left = rdp(list.slice(0, idx + 1)), right = rdp(list.slice(idx));
        return left.slice(0, -1).concat(right);
      }
      return [start, end];
    }
    return rdp(pts);
  }

  function getNormalizedVertices(targetRadius = 80) {
    let pts = simplify(points, 2.5);
    if (pts.length > 3) {
      const first = pts[0], last = pts[pts.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 10) pts = pts.slice(0, -1);
    }
    if (pts.length < 3) pts = fallbackCircle();

    let cx = 0, cy = 0; pts.forEach(p => { cx += p.x; cy += p.y; });
    cx /= pts.length; cy /= pts.length;

    let maxR = 0; pts.forEach(p => { maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy)); });
    const scale = targetRadius / (maxR || 1);
    return pts.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
  }

  function fallbackCircle() {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2; pts.push({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 });
    }
    return pts;
  }

  return { init, clear, isValid, getNormalizedVertices, fallbackCircle };
};
