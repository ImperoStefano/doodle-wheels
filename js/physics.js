const Sim = (() => {
  const GROUND_Y = 520;
  // Pista lunga => tempo massimo proporzionale (almeno 3 minuti, poi ~100px/s di media minima)
  const raceTimeoutMs = () => Math.max(180000, ((Terrain.FINISH_X - 60) / 100) * 1000);
  // Dopo il primo traguardo gli altri hanno ancora un po' di tempo, poi la gara si chiude (DNF):
  // su una pista lunga non si tiene nessuno in ostaggio dell'ultimo arrivato.
  const GRACE_BASE_MS = 30000, GRACE_FRAC = 0.4;
  const FIXED_DT = 1000 / 60; // 60 Hz physics

  // --- Motor -----------------------------------------------------------------
  // Matter.js angular velocity is in rad per 60Hz step. The motor pulls each wheel
  // toward MOTOR_SPEED but can add at most MOTOR_ACCEL per step (= its "torque limit").
  // (The old `body.torque += 0.0025 * mass` was ~1e-6 rad/step^2 for a wheel of this size:
  // nothing ever moved. Torque has to scale with inertia ~ m*r^2, not with mass.)
  const MOTOR_SPEED = 0.16;   // ≈ 9.6 rad/s
  const MOTOR_ACCEL = 0.035;  // rad/step^2 — strong enough to tip a triangle over its corner
  const WHEEL_FRICTION = 2.0; // Matter uses min(wheel, ground) -> the ground value decides
  const GROUND_DEPTH = 300;   // thick ground: a fast wheel can never tunnel through it
  const CAP_GRIP_MAX = 1.1;
  const V_CAP = 7.3;         // oltre questa velocità (px/tick a 60 Hz ≈ 440 px/s) il motore smette di spingere
  const ACCEL_SPIKE = 1;     // le forme spigolose hanno più "coppia" per riprendere velocità dopo ogni urto
  const ROLL_MAX = 1.7;      // tetto della compensazione di velocità su piano
  const ROLL_GAIN = 1.0;     // 1 = pareggio teorico (perimetro dell'involucro convesso)
  // Fango e ghiaccio: serve una forma "con le punte" per mordere; strade acciottolate e dune: le forme
  // poligonali le prendono bene, la tonda sobbalza. min = fattore sulla spinta della ruota perfettamente tonda;
  // full = spigolosità oltre la quale non si perde nulla.
  const MATCH_MAX = 1.14;   // bonus di spinta per la forma "in tinta" con la strada ad archi
  const GRIP = { mud: { min: 0.75, full: 1 }, ice: { min: 0.95, full: 1 }, rough: { min: 0.93, full: 0.75 } };
  const WHEEL_STATIC = 0.5;    // static friction (Matter takes the max of the two bodies)
  const GROUND_STATIC = 0.5;
  const AXLE_STIFFNESS = 1;
  const AXLE_DAMPING = 0.1;
  // Anti-stall: a racer that gains < STALL_MIN_PROGRESS px in STALL_MS (snagged on a hook, wedged
  // in a dip, driving backwards...) is lifted and moved a little forward so nobody can hold the
  // whole race hostage until the timeout.
  const STALL_MS = 2500;
  const STALL_MIN_PROGRESS = 60;   // px per STALL_MS (24 px/s): legit slow bikes on ice still do far more
  const HOP_X = 90, HOP_MAX_X = 450, HOP_Y = 140; // hop distance grows while the racer keeps failing to move
  const SPAWN_H = 140;        // px above the ground line where wheels/chassis spawn (drop height)
  const MAX_SINK = 2;         // px a wheel corner may dip below the ground line before it's lifted out
  const SUBSTEPS = 2;         // physics sub-steps per 60Hz step: softer landings, less corner digging

  let engine, world, racers = {}, running = false, timedOut = false, startedAt = 0, accumulator = 0, firstFinishAt = null, timeoutMs = 180000;
  // ONE shared negative group for every racer: bikes pass through each other (ghost racing) but all
  // collide with the ground (group 0). With a group per racer the grid spacing (200px) is smaller
  // than a bike + its wheels, so neighbouring wheels spawned overlapping and were violently ejected.
  let racerGroup = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) {
      Matter.Common.setDecomp(decomp);
    }
    engine = Matter.Engine.create();
    world = engine.world;
    engine.gravity.y = 1.3;

    engine.positionIterations = 30;
    engine.velocityIterations = 20;

    racerGroup = Matter.Body.nextGroup(true);
    Matter.World.add(world, buildGround());
    Matter.World.add(world, buildWalls());
    Matter.World.add(world, buildFlowers());
    racers = {};
    running = false;
    timedOut = false;
    accumulator = 0;
    firstFinishAt = null;
    timeoutMs = raceTimeoutMs();
  }

  // Ground = one convex quad per 40px column whose TOP EDGE is exactly the terrain line.
  // (Rotated rectangles offset vertically leave small steps at the joints between segments
  // with different slopes; a triangle's corner catches on those steps and digs in.)
  function buildGround() {
    const segW = 20;
    const bodies = [];
    for (let x = Terrain.TRACK_START; x < Terrain.TRACK_END; x += segW) {
      const x2 = x + segW;
      const y1 = GROUND_Y - Terrain.height(x);
      const y2 = GROUND_Y - Terrain.height(x2);
      const quad = [
        { x: x,  y: y1 }, { x: x2, y: y2 },
        { x: x2, y: Math.max(y1, y2) + GROUND_DEPTH }, { x: x, y: Math.max(y1, y2) + GROUND_DEPTH },
      ];
      const segFriction = Terrain.frictionAt ? Terrain.frictionAt((x + x2) / 2) : 0.8;
      const c = Matter.Vertices.centre(quad);
      const seg = Matter.Bodies.fromVertices(c.x, c.y, [quad], {
        isStatic: true,
        friction: segFriction,
        frictionStatic: GROUND_STATIC,
        restitution: 0.05,
        slop: 0.02,
        label: 'ground'
      });
      // Matter's Body.setStatic() silently forces friction = 1 and restitution = 0 on static
      // bodies, so the per-zone friction (ice, gravel...) was never applied. Set it afterwards.
      seg.friction = segFriction;
      seg.restitution = 0.05;
      bodies.push(seg);
    }
    return bodies;
  }

  // Invisible walls at both ends so a bike can never leave the track (backwards or forwards).
  function buildWalls() {
    const opts = { isStatic: true, friction: 0, label: 'wall' };
    return [
      Matter.Bodies.rectangle(Terrain.TRACK_START - 50, GROUND_Y - 500, 100, 2400, opts),
      Matter.Bodies.rectangle(Terrain.TRACK_END + 50, GROUND_Y - 500, 100, 2400, opts),
    ];
  }

  // Fiorellini: piccoli dossi rotondi, non spigoli. Affondati per metà nel terreno così sporge
  // solo una piccola calotta arrotondata: niente angoli vivi su cui una ruota possa incastrarsi
  // (lo stesso problema che avevano i vecchi segmenti a gradino del terreno).
  const FLOWER_POKE = 0.55; // frazione del raggio che sporge sopra il terreno

  function buildFlowers() {
    return (Terrain.FLOWERS || []).map(f => {
      const groundY = GROUND_Y - Terrain.height(f.x);
      const body = Matter.Bodies.circle(f.x, groundY - f.r * FLOWER_POKE, f.r, {
        isStatic: true,
        friction: Terrain.frictionAt ? Terrain.frictionAt(f.x) : 0.8,
        restitution: 0.15,
        slop: 0.02,
        label: 'flower'
      });
      return body;
    });
  }

  function wheelOptions(group) {
    return {
      friction: WHEEL_FRICTION,
      frictionStatic: WHEEL_STATIC,
      restitution: 0.02,
      density: 0.001,
      slop: 0.02,
      collisionFilter: { group: group },
      label: 'wheel'
    };
  }

  // --- helpers for the wheel outline ------------------------------------------------
  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a / 2);
  }

  function segmentsCross(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  function isSimplePolygon(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
      }
    }
    return true;
  }

  function createWheelBody(x, y, vertices, wOpt) {
    if (!vertices || vertices.length < 3) {
      return Matter.Bodies.circle(x, y, 40, wOpt);
    }

    // Shift the vertices so the centroid is at the origin; Matter recentres on the centre of mass.
    let cx = 0, cy = 0;
    for (const v of vertices) { cx += v.x; cy += v.y; }
    cx /= vertices.length; cy /= vertices.length;
    const centered = vertices.map(v => ({ x: v.x - cx, y: v.y - cy }));
    const drawnArea = polygonArea(centered);

    let wheel = null;

    // 1) exact drawn shape (concave OK) — only if the outline doesn't cross itself
    if (isSimplePolygon(centered)) {
      try {
        wheel = Matter.Bodies.fromVertices(x, y, [centered], wOpt, true);
      } catch (e) {
        wheel = null;
      }
      // poly-decomp can silently drop pieces of a shape it can't split: reject a body whose
      // area no longer matches the drawing
      if (wheel && !(isFinite(wheel.area) && Math.abs(wheel.area - drawnArea) <= 0.25 * drawnArea)) {
        wheel = null;
      }
    }

    // 2) self-crossing / undecomposable outline: use its convex hull
    if (!wheel) {
      try {
        const hull = Matter.Vertices.hull(centered.map(v => ({ x: v.x, y: v.y })));
        if (hull.length >= 3) wheel = Matter.Bodies.fromVertices(x, y, [hull], wOpt);
      } catch (e) {
        wheel = null;
      }
    }

    // 3) last resort: a circle
    if (!wheel || !wheel.parts || wheel.parts.length === 0) {
      let maxR = 0;
      for (const v of centered) maxR = Math.max(maxR, Math.hypot(v.x, v.y));
      wheel = Matter.Bodies.circle(x, y, maxR || 40, wOpt);
    }
    return wheel;
  }

  function makeAxle(chassis, dx, wheel) {
    return Matter.Constraint.create({
      bodyA: chassis, pointA: { x: dx, y: 0 },
      bodyB: wheel, stiffness: AXLE_STIFFNESS, damping: AXLE_DAMPING, length: 0
    });
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 60 + startIndex * 200;
    const group = racerGroup;
    const wOpt = wheelOptions(group);

    const fw = createWheelBody(startX + 90, GROUND_Y - SPAWN_H, vertices, wOpt);
    const rw = createWheelBody(startX - 90, GROUND_Y - SPAWN_H, vertices, wOpt);

    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - SPAWN_H, 160, 16, {
      density: 0.001,
      friction: 0.4,
      collisionFilter: { group: group },
      label: 'chassis'
    });

    const axF = makeAxle(chassis, 80, fw);
    const axR = makeAxle(chassis, -80, rw);

    Matter.World.add(world, [chassis, fw, rw, axF, axR]);
    racers[id] = {
      chassis, fw, rw, axF, axR, color, name,
      finished: false, finishTime: null,
      bestX: startX, hopBaseX: startX, progressAt: 0, hops: 0, stallStreak: 0,
      cal: calOf(vertices), spike: spikiness(vertices), teeth: teethGrip(vertices), peaks: lastPeaks, prom: lastProm, roll: rollFactor(vertices, teethGrip(vertices)), accelK: 1 + ACCEL_SPIKE * spikiness(vertices)
    };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id];
    if (!r || r.finished) return;

    r.cal = calOf(vertices); calibrate(vertices, v => { r.cal = v; });
    r.spike = spikiness(vertices); r.teeth = teethGrip(vertices); r.peaks = lastPeaks; r.prom = lastProm; r.roll = rollFactor(vertices, r.teeth); r.accelK = 1 + ACCEL_SPIKE * r.spike;
    const group = r.chassis.collisionFilter.group;
    const wOpt = wheelOptions(group);

    const fwPos = { x: r.fw.position.x, y: r.fw.position.y };
    const rwPos = { x: r.rw.position.x, y: r.rw.position.y };
    const fwVel = Matter.Body.getVelocity(r.fw);
    const rwVel = Matter.Body.getVelocity(r.rw);
    const fwAng = Matter.Body.getAngularVelocity(r.fw);
    const rwAng = Matter.Body.getAngularVelocity(r.rw);

    Matter.World.remove(world, [r.fw, r.rw, r.axF, r.axR]);

    const fw = createWheelBody(fwPos.x, fwPos.y, vertices, wOpt);
    const rw = createWheelBody(rwPos.x, rwPos.y, vertices, wOpt);

    Matter.Body.setVelocity(fw, fwVel);
    Matter.Body.setVelocity(rw, rwVel);
    Matter.Body.setAngularVelocity(fw, fwAng);
    Matter.Body.setAngularVelocity(rw, rwAng);

    const axF = makeAxle(r.chassis, 80, fw);
    const axR = makeAxle(r.chassis, -80, rw);

    Matter.World.add(world, [fw, rw, axF, axR]);
    r.fw = fw; r.rw = rw; r.axF = axF; r.axR = axR;
  }

  function start() {
    running = true;
    startedAt = performance.now();
    accumulator = 0;
  }

  function isWater(x) {
    if (typeof Terrain.isWater === 'function') return Terrain.isWater(x);
    if (typeof Terrain.colorAt === 'function') {
      const c = Terrain.colorAt(x);
      return typeof c === 'string' && c.toLowerCase() === '#3b82f6';
    }
    return false;
  }

  // "Spigolosità" di una forma: 0 = tonda, ~0.3 quadrato, ~0.5 triangolo, ~0.6+ stella.
  // = 1 - (raggio del cerchio inscritto / raggio del cerchio circoscritto), rispetto al baricentro.
  function spikiness(vertices) {
    if (!vertices || vertices.length < 3) return 0;
    let cx = 0, cy = 0;
    for (const v of vertices) { cx += v.x; cy += v.y; }
    cx /= vertices.length; cy /= vertices.length;
    let rout = 0, rin = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      rout = Math.max(rout, Math.hypot(a.x - cx, a.y - cy));
      const ex = b.x - a.x, ey = b.y - a.y, L = Math.hypot(ex, ey) || 1;
      rin = Math.min(rin, Math.abs((cx - a.x) * ey - (cy - a.y) * ex) / L);
    }
    return rout > 0 ? Math.max(0, Math.min(1, 1 - rin / rout)) : 0;
  }
  // "Denti": quante punte vere ha il contorno (massimi del raggio con una certa prominenza). Una tonda ne ha 0,
  // un ovale 2, un triangolo 3, un quadrato 4, una stella 5. Serve a decidere quanto "morde" fango e ghiaccio:
  // basta un ovale allungato a non mordere come una stella.
  const PEAK_PROM = 0.065;
  const MISMATCH = 0.22;   // su una strada a N archi chi ha un numero di punte diverso da N perde fino al 12%
  let lastPeaks = 0, lastProm = 0;
  function teethGrip(vertices) {
    lastPeaks = 0; lastProm = 0;
    if (!vertices || vertices.length < 3) return 0;
    let cx = 0, cy = 0;
    for (const v of vertices) { cx += v.x; cy += v.y; }
    cx /= vertices.length; cy /= vertices.length;
    const N = 90, rr = new Array(N).fill(0);
    let rout = 0;
    for (let i = 0; i < N; i++) {
      const dx = Math.cos(i / N * 2 * Math.PI), dy = Math.sin(i / N * 2 * Math.PI);
      let best = 0;
      for (let j = 0; j < vertices.length; j++) {
        const a = vertices[j], b = vertices[(j + 1) % vertices.length];
        const ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a.x - cx) * ey - (a.y - cy) * ex) / den, u = ((a.x - cx) * dy - (a.y - cy) * dx) / den;
        if (t > best && u >= 0 && u <= 1) best = t;
      }
      rr[i] = best; if (best > rout) rout = best;
    }
    if (rout <= 0) return 0;
    const sm = rr.map((_, i) => (rr[(i + N - 1) % N] + 2 * rr[i] + rr[(i + 1) % N]) / 4);
    let peaks = 0, promSum = 0;
    for (let i = 0; i < N; i++) {
      const v = sm[i];
      if (v < sm[(i + N - 1) % N] || v <= sm[(i + 1) % N]) continue;           // massimo locale (a destra stretto)
      let lmin = v, rmin = v;
      for (let k = 1; k < N; k++) { const w = sm[(i - k + N) % N]; if (w > v) break; if (w < lmin) lmin = w; }
      for (let k = 1; k < N; k++) { const w = sm[(i + k) % N]; if (w > v) break; if (w < rmin) rmin = w; }
      const prom = v - Math.max(lmin, rmin);
      if (prom >= PEAK_PROM * rout) { peaks++; promSum += prom / rout; }
    }
    if (!peaks) return 0;
    lastPeaks = peaks; lastProm = promSum / peaks;
    return Math.min(1, peaks / 4) * Math.min(1, (promSum / peaks) / 0.24);
  }
  // Compensazione "su piano": una forma con meno perimetro del cerchio percorre meno strada per
  // giro (triangolo ~0.83, quadrato ~0.90). Il motore la gira un po' più in fretta, così su terreno
  // piatto tutte le forme vanno circa alla stessa velocità e a decidere sono i terreni, non la geometria.
  // Reff = perimetro dell'involucro convesso / 2π; fattore = raggio massimo / Reff (>= 1, con un tetto).
  function rollFactor(vertices, teeth) {
    if (!vertices || vertices.length < 3) return 1;
    let hull;
    try { hull = Matter.Vertices.hull(vertices.map(v => ({ x: v.x, y: v.y }))); } catch (e) { return 1; }
    if (!hull || hull.length < 3) return 1;
    let cx = 0, cy = 0;
    for (const v of vertices) { cx += v.x; cy += v.y; }
    cx /= vertices.length; cy /= vertices.length;
    let rout = 0, per = 0;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      rout = Math.max(rout, Math.hypot(a.x - cx, a.y - cy));
      per += Math.hypot(b.x - a.x, b.y - a.y);
    }
    const reff = per / (2 * Math.PI);
    return reff > 0 ? Math.max(1, Math.min(ROLL_MAX, 1 + ROLL_GAIN * (0.35 + 0.65 * (teeth || 0)) * (rout / reff - 1))) : 1;
  }
  // Fango e ghiaccio: la ruota liscia "pattina" e rende meno, quella con le punte morde.
  // Fattore sulla velocità del motore (0..1): in modo deterministico, senza dipendere dall'attrito di Matter.
  function gripFactor(grip, teeth, peaks, n, spike, prom) {
    if (!grip) return 1;
    // dentiera: i denti a V si incastrano con le punte (≥5 punte, affilate): stella e simili; la tonda sbanda
    // sabbia: la ruota liscia galleggia (e può andare un po' oltre il tetto), i denti e le punte affondano
    if (grip === 'sand') return 1.06 - 0.28 * Math.min(1, 0.7 * teeth + 0.6 * spike);
    if (grip === 'rack') return 0.78 + 0.36 * Math.max(0, Math.min(1, (peaks - 3) / 2)) * (0.35 + 0.65 * Math.max(0, Math.min(1, (spike - 0.15) / 0.4))) * Math.min(1, teeth * 1.2);
    const g = GRIP[grip]; if (!g) return 1;
    const base = g.min + (1 - g.min) * Math.min(1, teeth / g.full);
    // strada ad archi per un poligono a N lati: chi ha esattamente N punte ci rotola come sul proprio binario
    if (grip === 'rough' && n > 0 && peaks > 0) {
      const d = (peaks - n) / 0.9, m = Math.exp(-d * d);
      return (base + (MATCH_MAX - base) * m * Math.min(1, prom / 0.08)) * (1 - MISMATCH * (1 - m));
    }
    // ramponi: le punte lunghe e affilate (stella, triangolo) mordono fango e ghiaccio meglio di tutti
    if (grip === 'mud') return base + 0.07 * Math.max(0, Math.min(1, (spike - 0.4) / 0.15)) * teeth * Math.min(1, peaks / 4);
    return base;
  }

  function driveWheel(wheel, target, accelK) {
    // getAngularVelocity is normalised to a 60Hz step, so it stays correct with SUBSTEPS > 1
    const w = Matter.Body.getAngularVelocity(wheel);
    const acc = MOTOR_ACCEL * (accelK || 1);
    const dw = Math.max(-acc, Math.min(acc, target - w));
    Matter.Body.setAngularVelocity(wheel, w + dw);
  }

  // Safety net: the terrain profile is known exactly, so if a wheel corner ever ends up more
  // than MAX_SINK px below the ground line (hard landing on a ramp edge), lift the wheel back to
  // the surface instead of letting it dig in and stall.
  function antiSink(wheel, hfn) {
    const H = hfn || Terrain.height;
    const parts = wheel.parts.length > 1 ? wheel.parts.slice(1) : [wheel];
    let worst = 0;
    for (const p of parts) {
      for (const v of p.vertices) {
        if (!hfn && (v.x < Terrain.TRACK_START || v.x > Terrain.TRACK_END)) continue; // no ground out there
        const sink = v.y - (GROUND_Y - H(v.x));
        if (sink > worst) worst = sink;
      }
    }
    if (worst > MAX_SINK) {
      Matter.Body.translate(wheel, { x: 0, y: -(worst - MAX_SINK) });
      if (wheel.velocity.y > 0) Matter.Body.setVelocity(wheel, { x: wheel.velocity.x, y: 0 });
    }
  }

  function unstick(r) {
    const dist = Math.min(HOP_MAX_X, HOP_X * (1 + r.stallStreak));
    const cx = r.chassis.position.x + dist, cy = r.chassis.position.y - HOP_Y;
    Matter.Body.setPosition(r.chassis, { x: cx, y: cy });
    Matter.Body.setAngle(r.chassis, 0);            // also rights a flipped bike
    Matter.Body.setPosition(r.fw, { x: cx + 80, y: cy });
    Matter.Body.setPosition(r.rw, { x: cx - 80, y: cy });
    for (const b of [r.chassis, r.fw, r.rw]) {
      Matter.Body.setVelocity(b, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(b, 0);
    }
    r.hops++;
    r.stallStreak++;
    r.bestX = cx;   // new baseline: only real driving from here counts as progress
    r.hopBaseX = cx;
  }

  // Spinta delle due ruote: tetto di velocità (governor), compensazione di forma, presa su fango/ghiaccio/strade dissestate
  // e taratura individuale r.cal (vedi calibrate): il motore smette di spingere oltre V_CAP, la bici prosegue per inerzia.
  function driveRacer(r, elapsed, useGrip) {
    const ramp = Math.min(1, elapsed / 1500);
    const gf = useGrip && Terrain.gripAt ? gripFactor(Terrain.gripAt(r.fw.position.x), r.teeth, r.peaks, Terrain.gripN(r.fw.position.x), r.spike, r.prom) : 1;
    const gr = useGrip && Terrain.gripAt ? gripFactor(Terrain.gripAt(r.rw.position.x), r.teeth, r.peaks, Terrain.gripN(r.rw.position.x), r.spike, r.prom) : 1;
    const cx = r.chassis.position.x;
    const c = r.roll * (Array.isArray(r.cal) ? r.cal[r.secOf ? r.secOf(cx) : (SEC_OF_KEY[Terrain.zoneKeyAt ? Terrain.zoneKeyAt(cx) : ''] || 0)] : (r.cal || 1));
    // la presa sposta anche il tetto di velocità: sul terreno sbagliato la bici non arriva a V_CAP, su quello giusto sì (o poco oltre)
    const capK = Math.min(CAP_GRIP_MAX, (gf + gr) / 2);
    const gov = r.chassis.velocity.x > V_CAP * capK;
    driveWheel(r.fw, gov ? 0 : MOTOR_SPEED * ramp * gf * c, r.accelK);
    driveWheel(r.rw, gov ? 0 : MOTOR_SPEED * ramp * gr * c, r.accelK);
  }


  // ---- Taratura automatica delle ruote ---------------------------------------------------------------
  // Ogni forma disegnata a mano rotola diversamente (rimbalza, perde spinta agli urti): nessuna formula fissa
  // le pareggia. Quindi, prima del via, ogni ruota fa una breve prova invisibile su un tratto neutro
  // (colline dolci, in un motore fisico a parte) e trova il moltiplicatore di spinta `cal` che la porta
  // allo stesso tempo di una tonda perfetta. Così su terreno normale vanno tutte uguali e a fare la differenza
  // sono i terreni a tema. La prova gira a fette di pochi ms (generatore), senza bloccare il gioco.
  const CAL_SEC = [450, 750, 1270, 1830, 2930, 3400], CAL_START = 150, CAL_MAX_TICKS = 1300, CAL_CLAMP = [0.6, 3.2], CAL_GRID = [0.8, 1, 1.25, 1.55, 1.9, 2.2];
  const calSm = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  // una rampa vera (stesse costanti del bioma "rampe") fra x=1500 e x=2000: l'atterraggio costa di più a certe forme
  const calRamp = u => {
    if (u < 0 || u > 500) return 0;
    if (u < 220) return calSm(u / 220) * 70;
    if (u < 360) { const t = (u - 220) / 140; return 70 * (1 - calSm(t)) - 15 * calSm(t); }
    const t = (u - 360) / 140; return -15 * (1 - calSm(t));
  };
  // pista di taratura (un assaggio di ogni bioma, in proporzione): colline (450–750), ponte ad arco (750–1270),
  // ghiaia con ponte di corda (1270–1830), due rampe di fila (1880–2880), ghiaccio (2930–3400)
  const CAL_ICE_X = 2930;
  const calWin = (x, a, b) => calSm((x - a) / 60) * (1 - calSm((x - b) / 60));
  // ph = 0,1,2: tre varianti della pista (onde sfasate, rampa e ponte spostati) — si tara su tutte e tre, per non "imparare" una pista sola
  const calHph = (x, ph) => {
    const s = ph * 1.9, dr = ph * 41, dh = ph * 23;
    return calSm((x - 300) / 300) * (38 * Math.sin(x / 260 + s) + 9 * Math.sin(x / 90 + s * 1.3) + 5 * Math.sin(x / 41 + s * 0.7)) * (1 - calSm((x - 750) / 60)) +
      (x >= 750 && x <= 1270 ? 58 * Math.pow(Math.sin((x - 750) / 520 * Math.PI), 1.45) : 0) +
      calWin(x, 1270, 1830) * (14 * Math.sin(x / 120 + s) + 6 * Math.sin(x / 52 + s * 1.6)) +
      (x >= 1270 && x <= 1830 ? -12 * Math.pow(Math.sin((x - 1270) / 560 * Math.PI), 1.45) : 0) +
      calRamp(x - 1880 - dr + (ph ? 10 : 0)) + calRamp(x - 2380 - dr + (ph ? 10 : 0)) +
      calSm((x - 2910) / 80) * 13 * Math.sin((x - 2930) / 380 + s);
  };
  const calH = x => calHph(x, 0);
  const calSecOf = x => (x < 1830 ? 0 : x < 2930 ? 2 : 3);
  const SEC_OF_KEY = { ramps: 2, ice: 3 };
  let calRefTicks = null;
  const calCache = new Map();
  const calKey = v => v.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join(';');

  function* calTrial(vertices, cal, ph) {
    ph = ph || 0; const hf = x => calHph(x, ph);
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) Matter.Common.setDecomp(decomp);
    const eng = Matter.Engine.create(); eng.gravity.y = 1.3; eng.positionIterations = 30; eng.velocityIterations = 20;
    const w = eng.world, grp = Matter.Body.nextGroup(true), W = 20, segs = [];
    for (let x = 0; x < 3700; x += W) {
      const y1 = GROUND_Y - hf(x), y2 = GROUND_Y - hf(x + W);
      const quad = [{ x, y: y1 }, { x: x + W, y: y2 }, { x: x + W, y: Math.max(y1, y2) + GROUND_DEPTH }, { x, y: Math.max(y1, y2) + GROUND_DEPTH }];
      const c = Matter.Vertices.centre(quad);
      const seg = Matter.Bodies.fromVertices(c.x, c.y, [quad], { isStatic: true, friction: x >= CAL_ICE_X ? 0.1 : 0.9, frictionStatic: GROUND_STATIC, restitution: 0.05, slop: 0.02, label: 'ground' });
      seg.friction = x >= CAL_ICE_X ? 0.1 : 0.9; seg.restitution = 0.05; segs.push(seg);
    }
    Matter.World.add(w, segs);
    Matter.World.add(w, Matter.Bodies.rectangle(-50, GROUND_Y - 500, 100, 2400, { isStatic: true, friction: 0 }));
    const wOpt = wheelOptions(grp);
    const fw = createWheelBody(CAL_START + 90, GROUND_Y - SPAWN_H, vertices, wOpt), rw = createWheelBody(CAL_START - 90, GROUND_Y - SPAWN_H, vertices, wOpt);
    const chassis = Matter.Bodies.rectangle(CAL_START, GROUND_Y - SPAWN_H, 160, 16, { density: 0.001, friction: 0.4, collisionFilter: { group: grp }, label: 'chassis' });
    Matter.World.add(w, [chassis, fw, rw, makeAxle(chassis, 80, fw), makeAxle(chassis, -80, rw)]);
    const r = { chassis, fw, rw, spike: spikiness(vertices), teeth: teethGrip(vertices), peaks: lastPeaks, prom: lastProm, cal, secOf: calSecOf };
    r.roll = rollFactor(vertices, r.teeth); r.accelK = 1 + ACCEL_SPIKE * r.spike;
    const at = CAL_SEC.map(() => null);
    for (let tick = 0; tick < CAL_MAX_TICKS; tick++) {
      driveRacer(r, tick * FIXED_DT, false);
      for (let i = 0; i < SUBSTEPS; i++) { Matter.Engine.update(eng, FIXED_DT / SUBSTEPS); antiSink(fw, hf); antiSink(rw, hf); }
      const x = chassis.position.x;
      for (let s = 0; s < CAL_SEC.length; s++) if (at[s] === null && x >= CAL_SEC[s]) at[s] = tick;
      if (at[CAL_SEC.length - 1] !== null) break;
      if (tick % 20 === 19) yield;
    }
    // tempi per sezione (colline, ghiaia, rampa, ghiaccio); se non arriva in fondo: tempo massimo
    return [0, 1, 2, 3, 4].map(s => (at[s + 1] === null ? CAL_MAX_TICKS : at[s + 1]) - (at[s] === null ? CAL_MAX_TICKS : at[s]));
  }

  // Il tempo di una prova oscilla di ±5–8% da un k al successivo (rimbalzi, atterraggi): cercare "il k che fa
  // esattamente il tempo della tonda" premierebbe la fortuna. Ogni misura è quindi la media di due prove con k vicini (±5%).
  // Tempi medi (su tre varianti di pista) per gruppo: [piano, rampa, ghiaccio]
  function* calGroups(vertices, ks) {
    const g = [0, 0, 0];
    for (let ph = 0; ph < 3; ph++) {
      const kk = [ks[0], ks[0], ks[1], ks[2]].map(v => v * (0.96 + 0.04 * ph));
      const t = yield* calTrial(vertices, kk, ph);
      g[0] += (t[0] + t[1] + t[2]) / 3; g[1] += t[3] / 3; g[2] += t[4] / 3;
    }
    return g;
  }
  // Una spinta per gruppo di zone (piano: colline/ghiaia/acqua/ponti; rampe; ghiaccio): le forme non pareggiano ovunque
  // allo stesso modo (una poligonale atterra peggio sulle rampe, pattina meglio sul ghiaccio), quindi la taratura è per gruppo.
  function* calibrateGen(vertices) {
    if (calRefTicks === null) {
      const circle = Array.from({ length: 32 }, (_, i) => ({ x: Math.cos(i / 32 * 2 * Math.PI) * 80, y: Math.sin(i / 32 * 2 * Math.PI) * 80 }));
      calRefTicks = yield* calGroups(circle, [1, 1, 1]);
    }
    const ref = calRefTicks;
    let ks = [1, 1, 1], t = yield* calGroups(vertices, ks);
    const best = ks.slice(), bestErr = t.map((v, i) => Math.abs(v - ref[i]) / ref[i]);
    for (let it = 0; it < 3 && Math.max(...bestErr) > 0.015; it++) {
      ks = ks.map((k, i) => Math.max(CAL_CLAMP[0], Math.min(CAL_CLAMP[1], k * Math.pow(t[i] / ref[i], 1.1))));
      t = yield* calGroups(vertices, ks);
      t.forEach((v, i) => { const e = Math.abs(v - ref[i]) / ref[i]; if (e < bestErr[i]) { bestErr[i] = e; best[i] = ks[i]; } });
    }
    return [best[0], best[0], best[1], best[2]];
  }

  // esegue un generatore a fette (≈8 ms alla volta); cb(valore) alla fine
  function runSliced(gen, cb) {
    const step = () => {
      const t0 = Date.now();
      for (;;) {
        const r = gen.next();
        if (r.done) { cb(r.value); return; }
        if (Date.now() - t0 > 8) break;
      }
      setTimeout(step, 0);
    };
    step();
  }
  function drain(gen) { for (;;) { const r = gen.next(); if (r.done) return r.value; } }

  // Taratura di una forma: usa la cache; cb(cal). Se già pronta risponde subito.
  function calibrate(vertices, cb) {
    if (!vertices || vertices.length < 3) { cb([1, 1, 1, 1]); return; }
    const key = calKey(vertices);
    if (calCache.has(key)) { const v = calCache.get(key); if (Array.isArray(v)) { cb(v); return; } v.push(cb); return; }
    const waiting = [cb]; calCache.set(key, waiting);
    runSliced(calibrateGen(vertices), val => { calCache.set(key, val); waiting.forEach(f => f(val)); if (calCache.size > 60) calCache.delete(calCache.keys().next().value); });
  }
  function calibrateSync(vertices) { const key = calKey(vertices); const v = calCache.get(key); if (Array.isArray(v)) return v; const val = drain(calibrateGen(vertices)); calCache.set(key, val); return val; }
  function calOf(vertices) { const v = calCache.get(calKey(vertices)); return Array.isArray(v) ? v : [1, 1, 1, 1]; }

  // Per-racer logic, runs at the fixed 60Hz step.
  function stepRacer(r, elapsed) {
    if (r.finished) return;

    driveRacer(r, elapsed, true);

    // progress = furthest x reached; if it hasn't improved enough for STALL_MS, hop
    if (r.chassis.position.x > r.bestX + STALL_MIN_PROGRESS) {
      r.bestX = r.chassis.position.x;
      r.progressAt = elapsed;
      if (r.chassis.position.x > r.hopBaseX + 250) r.stallStreak = 0; // reset only after real driving
    } else if (elapsed - r.progressAt > STALL_MS) {
      unstick(r);
      r.progressAt = elapsed;
    }

    if (isWater(r.chassis.position.x)) {
      Matter.Body.setVelocity(r.chassis, {
        x: r.chassis.velocity.x * 0.94,
        y: r.chassis.velocity.y * 0.94
      });
    }

    if (r.chassis.position.x >= Terrain.FINISH_X) {
      r.finished = true;
      r.finishTime = elapsed;
      if (firstFinishAt === null) firstFinishAt = elapsed;
    }
  }

  // Called with real elapsed ms; physics is sub-stepped at a fixed 60Hz.
  function tick(dtMs) {
    if (!running) return;

    accumulator += Math.min(dtMs, 100);
    const elapsed = performance.now() - startedAt;

    while (accumulator >= FIXED_DT) {
      for (const r of Object.values(racers)) {
        stepRacer(r, elapsed);
      }
      for (let i = 0; i < SUBSTEPS; i++) {
        Matter.Engine.update(engine, FIXED_DT / SUBSTEPS);
        // right after the solver: correct any corner that just hit hard, before it's ever rendered
        for (const r of Object.values(racers)) { antiSink(r.fw); antiSink(r.rw); }
      }
      accumulator -= FIXED_DT;

      if (allFinished()) { running = false; return; }
      if (isTimedOut()) { timedOut = true; running = false; return; }
    }
  }

  function snapshot() {
    return Object.entries(racers).map(([id, r]) => ({
      id,
      x: r.chassis.position.x, y: r.chassis.position.y, angle: r.chassis.angle,
      fwX: r.fw.position.x, fwY: r.fw.position.y, fwAngle: r.fw.angle,
      rwX: r.rw.position.x, rwY: r.rw.position.y, rwAngle: r.rw.angle,
      vx: r.chassis.velocity.x,
      finished: r.finished, finishTime: r.finishTime
    }));
  }

  function allFinished() {
    const list = Object.values(racers);
    return list.length > 0 && list.every(r => r.finished);
  }

  function isTimedOut() {
    // stays true after tick() stops the sim, otherwise game.js never sees the timeout
    if (timedOut) return true;
    if (!running) return false;
    const el = performance.now() - startedAt;
    if (el > timeoutMs) return true;
    return firstFinishAt !== null && el - firstFinishAt > GRACE_BASE_MS + firstFinishAt * GRACE_FRAC;
  }

  function standings() {
    return Object.entries(racers).map(([id, r]) => ({
      id, name: r.name, color: r.color,
      finished: r.finished, finishTime: r.finishTime,
      distance: r.chassis.position.x
    })).sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });
  }

  return {
    init, addRacer, updateRacerWheel, start, tick, calibrate, calibrateSync, _calTrial: (v, k, ph) => drain(calTrial(v, [k, k, k, k], ph)),
    snapshot, allFinished, isTimedOut, standings, GROUND_Y,
    get FINISH_X() { return Terrain.FINISH_X; },
    // ms rimasti agli altri dopo che il primo ha tagliato il traguardo (null = nessuno è arrivato)
    graceLeft() { if (firstFinishAt === null || !running) return null; return Math.max(0, GRACE_BASE_MS + firstFinishAt * GRACE_FRAC - (performance.now() - startedAt - firstFinishAt)); },
  };
})();
