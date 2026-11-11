const createWheelDrawer = (canvasEl) => {
  const canvas = canvasEl, ctx = canvas.getContext('2d');
  let drawing = false, points = [], pointerId = null, redrawQueued = false, onChanged = null;
  const MIN_POINTS = 12, MIN_AREA = 500;
  const POINT_LIMIT = 1600, MIN_POINT_DIST2 = 2.2 * 2.2;

  function init() {
    // Il pointer capture impedisce di perdere il tratto se il dito esce momentaneamente
    // dalla superficie. I punti coalesced preservano i dettagli dei pennini veloci.
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', end);
    clear();
  }
  function changed() { if (onChanged) onChanged(isValid(), getProfile()); }
  function clear() { drawing = false; pointerId = null; points = []; redraw(); changed(); }
  function drawGuide() {
    ctx.save(); ctx.strokeStyle = 'rgba(16,42,67,0.15)'; ctx.setLineDash([8, 12]);
    ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2 - 20, 0, Math.PI * 2);
    ctx.stroke(); ctx.restore();
  }
  function localPos(e) {
    const r = canvas.getBoundingClientRect();
    const w = r.width || canvas.width, h = r.height || canvas.height;
    return { x: Math.max(0, Math.min(canvas.width, (e.clientX - r.left) * canvas.width / w)),
             y: Math.max(0, Math.min(canvas.height, (e.clientY - r.top) * canvas.height / h)) };
  }
  function addPoint(p) {
    if (points.length >= POINT_LIMIT) return;
    const last = points[points.length - 1];
    if (!last || (p.x-last.x)**2 + (p.y-last.y)**2 >= MIN_POINT_DIST2) points.push(p);
  }
  function requestRedraw() {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => { redrawQueued = false; redraw(); });
  }
  function start(e) {
    if (drawing || e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault(); drawing = true; pointerId = e.pointerId;
    points = [localPos(e)];
    if (canvas.setPointerCapture) try { canvas.setPointerCapture(pointerId); } catch (_) {}
    changed(); requestRedraw();
  }
  function move(e) {
    if (!drawing || e.pointerId !== pointerId) return;
    e.preventDefault();
    const batch = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    if (batch && batch.length) { for (const sample of batch) addPoint(localPos(sample)); }
    else addPoint(localPos(e));
    requestRedraw();
  }
  function end(e) {
    if (!drawing || e.pointerId !== pointerId) return;
    addPoint(localPos(e)); drawing = false; pointerId = null;
    if (canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    redraw(); changed();
  }
  function cancel(e) {
    if (!drawing || e.pointerId !== pointerId) return;
    drawing = false; pointerId = null;
    redraw(); changed();
  }
  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); drawGuide();
    if (points.length < 2) return;
    ctx.strokeStyle = '#102a43'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (!drawing && points.length > 2) ctx.closePath();
    ctx.stroke();
    if (!drawing && points.length > 2) { ctx.fillStyle = 'rgba(38,128,235,0.15)'; ctx.fill(); }
  }
  // Indicatori geometrici: descrivono il disegno e NON fingono di predire in modo
  // esatto la velocità (dipende dalla collisione col terreno e dalla fisica Matter).
  function getProfile() {
    if (drawing || points.length < MIN_POINTS) return null;
    const pts = outline(points);
    if (pts.length < 3 || polygonArea(pts) <= MIN_AREA) return null;
    let per = 0, mx = 0, my = 0;
    for (let i=0; i<pts.length; i++) {
      const a=pts[i], b=pts[(i+1)%pts.length];
      per += Math.hypot(a.x-b.x,a.y-b.y); mx+=a.x; my+=a.y;
    }
    mx /= pts.length; my /= pts.length;
    const area = polygonArea(pts), roundness = Math.max(0,Math.min(1,4*Math.PI*area/(per*per)));
    const radii = pts.map(pt=>Math.hypot(pt.x-mx, pt.y-my));
    const mean = radii.reduce((v,x)=>v+x,0)/radii.length;
    const variance = radii.reduce((v,x)=>v+(x-mean)**2,0)/radii.length;
    const balance = Math.max(0,Math.min(1,1-Math.sqrt(variance)/(mean||1)*2));
    return {roundness:Math.round(roundness*100), balance:Math.round(balance*100), complexity:Math.round((1-roundness)*100), points:pts.length};
  }
  function setOnChange(cb) { onChanged = cb; changed(); }
  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; a += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(a / 2);
  }
  function simplify(pts, tol) {
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
      if (dmax > tol) {
        const left = rdp(list.slice(0, idx + 1)), right = rdp(list.slice(idx));
        return left.slice(0, -1).concat(right);
      }
      return [start, end];
    }
    return rdp(pts);
  }

  // ---- make the outline a SIMPLE polygon (no self-crossings) -------------------------
  // Freehand loops almost always cross themselves (tail overlapping the start, figure-eights).
  // poly-decomp can't split such outlines, so the wheel came out mangled in the physics.
  // Where two edges cross we get two loops; keep the larger one.
  function crossPoint(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
    if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
    return { x: a.x + t * r.x, y: a.y + t * r.y };
  }
  function untangle(pts) {
    for (let pass = 0; pass < 12; pass++) {
      const n = pts.length; let cut = null;
      for (let i = 0; i < n && !cut; i++) {
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue;
          const p = crossPoint(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]);
          if (p) { cut = { i, j, p }; break; }
        }
      }
      if (!cut) return pts;
      const loopA = [cut.p, ...pts.slice(cut.i + 1, cut.j + 1)];
      const loopB = [cut.p, ...pts.slice(cut.j + 1), ...pts.slice(0, cut.i + 1)];
      pts = polygonArea(loopA) >= polygonArea(loopB) ? loopA : loopB;
    }
    return null; // still tangled after 12 cuts
  }
  // Same test physics.js uses to decide if a wheel can be built from the exact outline
  // (it also catches edges that merely touch, which poly-decomp chokes on like real crossings).
  function isSimple(pts) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n];
        if (o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)) return false;
      }
    }
    return true;
  }
  function convexHull(pts) { // Andrew's monotone chain
    const p = pts.map(q => ({ x: q.x, y: q.y })).sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // raw stroke -> simplified, non-crossing polygon (still in canvas units)
  function outline(raw) {
    // Un cerchio chiuso alla perfezione finisce esattamente dove è iniziato: con primo e ultimo punto
    // coincidenti la semplificazione (RDP) collassa a 2 punti e la forma risultava "non valida".
    if (raw.length > 3) {
      const f0 = raw[0], l0 = raw[raw.length - 1];
      if (Math.hypot(f0.x - l0.x, f0.y - l0.y) < 1) raw = raw.slice(0, -1);
    }
    let pts = simplify(raw, 2.5);
    if (pts.length > 3) {
      const first = pts[0], last = pts[pts.length - 1];
      if (Math.hypot(first.x - last.x, first.y - last.y) < 10) pts = pts.slice(0, -1);
    }
    if (pts.length >= 3) {
      const simple = untangle(pts);
      pts = (simple && simple.length >= 3 && polygonArea(simple) > 1 && isSimple(simple)) ? simple : convexHull(pts);
    }
    return pts;
  }
  // valid = enough points and a real enclosed area AFTER untangling (a figure-eight's signed
  // area cancels out, so measuring the raw stroke wrongly rejected it)
  function isValid() { return points.length >= MIN_POINTS && polygonArea(outline(points)) > MIN_AREA; }

  // Pure function (also handy for tests): raw stroke points -> normalised polygon around (0,0)
  function normalize(rawPoints, targetRadius = 80) {
    let pts = outline(rawPoints);
    if (pts.length < 3) pts = fallbackCircle();
    // Centre on the AREA centroid, not the mean of the vertices: Matter.js puts the body's origin
    // at the area centroid, so anything else makes the drawn wheel drift off its physics body.
    let cx = 0, cy = 0, area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length], cross = p1.x * p2.y - p2.x * p1.y;
      area2 += cross; cx += (p1.x + p2.x) * cross; cy += (p1.y + p2.y) * cross;
    }
    if (Math.abs(area2) > 1e-6) { cx /= 3 * area2; cy /= 3 * area2; }
    else { cx = pts.reduce((a, p) => a + p.x, 0) / pts.length; cy = pts.reduce((a, p) => a + p.y, 0) / pts.length; }
    let maxR = 0; pts.forEach(p => { maxR = Math.max(maxR, Math.hypot(p.x - cx, p.y - cy)); });
    const scale = targetRadius / (maxR || 1);
    return pts.map(p => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
  }
  function getNormalizedVertices(targetRadius = 80) { return normalize(points, targetRadius); }
  function fallbackCircle() {
    const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push({ x: Math.cos(a) * 100, y: Math.sin(a) * 100 }); } return pts;
  }
  return { init, clear, isValid, getNormalizedVertices, normalize, fallbackCircle, getProfile, setOnChange };
}; //fine draw.js
