const Sim = (() => {
  const GROUND_Y = 520, RACE_TIMEOUT_MS = 180000;
  const FIXED_DT = 1000 / 60; // 60 Hz physics

  // --- Motor -----------------------------------------------------------------
  // Matter.js angular velocity is in rad per 60Hz step. The motor pulls each wheel
  // toward MOTOR_SPEED but can add at most MOTOR_ACCEL per step (= its "torque limit").
  // (The old `body.torque += 0.0025 * mass` was ~1e-6 rad/step^2 for a wheel of this size:
  // nothing ever moved. Torque has to scale with inertia ~ m*r^2, not with mass.)
  const MOTOR_SPEED = 0.16;   // ≈ 9.6 rad/s
  const MOTOR_ACCEL = 0.02;   // rad/step^2 — strong enough to tip a triangle over its corner
  const WHEEL_FRICTION = 2.0; // Matter uses min(wheel, ground) -> the ground value decides
  const GROUND_DEPTH = 300;   // thick ground: a fast wheel can never tunnel through it
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

  let engine, world, racers = {}, running = false, timedOut = false, startedAt = 0, accumulator = 0;
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
  }

  // Ground = one convex quad per 40px column whose TOP EDGE is exactly the terrain line.
  // (Rotated rectangles offset vertically leave small steps at the joints between segments
  // with different slopes; a triangle's corner catches on those steps and digs in.)
  function buildGround() {
    const segW = 40;
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
      bestX: startX, hopBaseX: startX, progressAt: 0, hops: 0, stallStreak: 0
    };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id];
    if (!r || r.finished) return;

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

  function driveWheel(wheel, target) {
    // getAngularVelocity is normalised to a 60Hz step, so it stays correct with SUBSTEPS > 1
    const w = Matter.Body.getAngularVelocity(wheel);
    const dw = Math.max(-MOTOR_ACCEL, Math.min(MOTOR_ACCEL, target - w));
    Matter.Body.setAngularVelocity(wheel, w + dw);
  }

  // Safety net: the terrain profile is known exactly, so if a wheel corner ever ends up more
  // than MAX_SINK px below the ground line (hard landing on a ramp edge), lift the wheel back to
  // the surface instead of letting it dig in and stall.
  function antiSink(wheel) {
    const parts = wheel.parts.length > 1 ? wheel.parts.slice(1) : [wheel];
    let worst = 0;
    for (const p of parts) {
      for (const v of p.vertices) {
        if (v.x < Terrain.TRACK_START || v.x > Terrain.TRACK_END) continue; // no ground out there
        const sink = v.y - (GROUND_Y - Terrain.height(v.x));
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

  // Per-racer logic, runs at the fixed 60Hz step.
  function stepRacer(r, elapsed) {
    if (r.finished) return;

    const ramp = Math.min(1, elapsed / 1500);
    driveWheel(r.fw, MOTOR_SPEED * ramp);
    driveWheel(r.rw, MOTOR_SPEED * ramp);

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
    return timedOut || (running && (performance.now() - startedAt) > RACE_TIMEOUT_MS);
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
    init, addRacer, updateRacerWheel, start, tick,
    snapshot, allFinished, isTimedOut, standings, GROUND_Y,
    get FINISH_X() { return Terrain.FINISH_X; }
  };
})();
