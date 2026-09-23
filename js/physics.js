const Sim = (() => {
  const GROUND_Y = 520, RACE_TIMEOUT_MS = 180000;
  const FIXED_DT = 1000 / 60; // 60 Hz physics

  let engine, world, racers = {}, running = false, startedAt = 0, accumulator = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) {
      Matter.Common.setDecomp(decomp);
    }
    engine = Matter.Engine.create();
    world = engine.world;
    engine.gravity.y = 1.3;

    engine.positionIterations = 30;
    engine.velocityIterations = 20;

    Matter.World.add(world, buildGround());
    racers = {};
    running = false;
    accumulator = 0;
  }

  function buildGround() {
    const segW = 40;
    const bodies = [];
    for (let x = Terrain.TRACK_START; x < Terrain.TRACK_END; x += segW) {
      const x2 = x + segW;
      const y1 = GROUND_Y - Terrain.height(x);
      const y2 = GROUND_Y - Terrain.height(x2);
      const midX = (x + x2) / 2;
      const midY = (y1 + y2) / 2;
      const len = Math.hypot(x2 - x, y2 - y1);
      const angle = Math.atan2(y2 - y1, x2 - x);

      const seg = Matter.Bodies.rectangle(midX, midY + 100, len + 4, 200, {
        isStatic: true,
        friction: Terrain.frictionAt ? Terrain.frictionAt(midX) : 0.8,
        restitution: 0.1,
        label: 'ground'
      });
      Matter.Body.setAngle(seg, angle);
      bodies.push(seg);
    }
    return bodies;
  }

  // ---------------------------------------------------------------------------
  // Wheel creation: keep the user's exact drawn polygon shape when possible.
  // ---------------------------------------------------------------------------
  function createWheelBody(x, y, vertices, wOpt) {
    if (!vertices || vertices.length < 3) {
      return Matter.Bodies.circle(x, y, 40, wOpt);
    }

    // Compute centroid so the body doesn't "jump" when Matter recenters it.
    let cx = 0, cy = 0;
    for (const v of vertices) { cx += v.x; cy += v.y; }
    cx /= vertices.length; cy /= vertices.length;

    // Shift vertices so the centroid is at the origin; this makes the body's
    // centre-of-mass line up with (x, y) after Matter recenters.
    const centered = vertices.map(v => ({ x: v.x - cx, y: v.y - cy }));

    let wheel = null;
    try {
      wheel = Matter.Bodies.fromVertices(x, y, [centered], wOpt, true);
    } catch (e) {
      wheel = null;
    }

    // Only fall back if fromVertices truly failed.
    if (!wheel || !wheel.parts || wheel.parts.length === 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of centered) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      const r = Math.max(maxX - minX, maxY - minY) / 2 || 40;
      wheel = Matter.Bodies.circle(x, y, r, wOpt);
    }

    return wheel;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 60 + startIndex * 200;
    const group = Matter.Body.nextGroup(true);

    const wOpt = {
      friction: 0.9,
      frictionStatic: 1.0,
      restitution: 0.05,
      density: 0.001,
      collisionFilter: { group: group },
      label: 'wheel'
    };

    const fw = createWheelBody(startX + 90, GROUND_Y - 140, vertices, wOpt);
    const rw = createWheelBody(startX - 90, GROUND_Y - 140, vertices, wOpt);

    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - 140, 160, 16, {
      density: 0.001,
      friction: 0.4,
      collisionFilter: { group: group },
      label: 'chassis'
    });

    const axF = Matter.Constraint.create({
      bodyA: chassis, pointA: { x: 80, y: 0 },
      bodyB: fw, stiffness: 0.9, damping: 0.2, length: 0
    });
    const axR = Matter.Constraint.create({
      bodyA: chassis, pointA: { x: -80, y: 0 },
      bodyB: rw, stiffness: 0.9, damping: 0.2, length: 0
    });

    Matter.World.add(world, [chassis, fw, rw, axF, axR]);
    racers[id] = {
      chassis, fw, rw, axF, axR, color, name,
      finished: false, finishTime: null, stuckTimer: 0, stuckCount: 0
    };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id];
    if (!r || r.finished) return;

    const group = r.chassis.collisionFilter.group;
    const wOpt = {
      friction: 0.9,
      frictionStatic: 1.0,
      restitution: 0.05,
      density: 0.001,
      collisionFilter: { group: group },
      label: 'wheel'
    };

    const fwPos = { x: r.fw.position.x, y: r.fw.position.y };
    const rwPos = { x: r.rw.position.x, y: r.rw.position.y };
    const fwVel = { x: r.fw.velocity.x, y: r.fw.velocity.y };
    const rwVel = { x: r.rw.velocity.x, y: r.rw.velocity.y };
    const fwAng = r.fw.angularVelocity;
    const rwAng = r.rw.angularVelocity;
    const fwTorque = r.fw.torque || 0;
    const rwTorque = r.rw.torque || 0;

    Matter.World.remove(world, [r.fw, r.rw, r.axF, r.axR]);

    const fw = createWheelBody(fwPos.x, fwPos.y, vertices, wOpt);
    const rw = createWheelBody(rwPos.x, rwPos.y, vertices, wOpt);

    Matter.Body.setVelocity(fw, fwVel);
    Matter.Body.setVelocity(rw, rwVel);
    Matter.Body.setAngularVelocity(fw, fwAng);
    Matter.Body.setAngularVelocity(rw, rwAng);
    fw.torque = fwTorque;
    rw.torque = rwTorque;

    const axF = Matter.Constraint.create({
      bodyA: r.chassis, pointA: { x: 80, y: 0 },
      bodyB: fw, stiffness: 0.9, damping: 0.2, length: 0
    });
    const axR = Matter.Constraint.create({
      bodyA: r.chassis, pointA: { x: -80, y: 0 },
      bodyB: rw, stiffness: 0.9, damping: 0.2, length: 0
    });

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

  // ---------------------------------------------------------------------------
  // Internal per-racer drive / anti-stuck logic (runs at fixed dt).
  // ---------------------------------------------------------------------------
  function stepRacer(r, elapsed) {
    if (r.finished) return;

    // Ramp-in over 1.5s so racers don't rocket off the line.
    const ramp = Math.min(1, elapsed / 1500);

    // Torque applied to both wheels. Matter needs units comparable to inertia,
    // which scales with mass * radius^2. Scaling by wheel mass keeps it
    // consistent across drawn shapes of different sizes.
    const baseTorque = 0.0025 * ramp;
    const fwScale = r.fw.mass || 1;
    const rwScale = r.rw.mass || 1;
    r.fw.torque += baseTorque * fwScale;
    r.rw.torque += baseTorque * rwScale;

    // Small forward assist so the chassis starts moving before the wheels bite.
    const vx = r.chassis.velocity.x;
    if (vx < 22) {
      const push = 0.00006 * ramp * (r.chassis.mass || 1);
      Matter.Body.applyForce(r.chassis, r.chassis.position, { x: push, y: 0 });
    }

    // Anti-stuck: only kick while actually stalled, cap attempts.
    if (Math.abs(vx) < 0.3 && elapsed > 1500) {
      r.stuckTimer += FIXED_DT;
      if (r.stuckTimer > 300 && r.stuckCount < 10) {
        const kick = 0.0004 * (r.chassis.mass || 1);
        Matter.Body.applyForce(r.chassis, r.chassis.position, { x: kick, y: -kick * 1.4 });
        r.stuckTimer = 0;
        r.stuckCount++;
      }
    } else {
      r.stuckTimer = 0;
    }

    // Prevent rolling backward: clamp chassis AND wheels together.
    if (r.chassis.velocity.x < -0.1) {
      Matter.Body.setVelocity(r.chassis, { x: 0, y: r.chassis.velocity.y });
      Matter.Body.setVelocity(r.fw,      { x: 0, y: r.fw.velocity.y });
      Matter.Body.setVelocity(r.rw,      { x: 0, y: r.rw.velocity.y });
    }

    // Water drag.
    if (isWater(r.chassis.position.x)) {
      Matter.Body.setVelocity(r.chassis, {
        x: r.chassis.velocity.x * 0.94,
        y: r.chassis.velocity.y * 0.94
      });
    }

    // Finish line.
    if (typeof Terrain.FINISH_X === 'number' && r.chassis.position.x >= Terrain.FINISH_X) {
      r.finished = true;
      r.finishTime = elapsed;
    }
  }

  // Called every animation frame with real elapsed ms.
  // Physics is sub-stepped at a fixed 60 Hz so behaviour is frame-rate independent.
  function tick(dtMs) {
    if (!running) return;

    // Clamp huge gaps (tab switch, breakpoints) so nothing explodes.
    accumulator += Math.min(dtMs, 100);

    const elapsed = performance.now() - startedAt;

    while (accumulator >= FIXED_DT) {
      for (const r of Object.values(racers)) {
        stepRacer(r, elapsed);
      }
      Matter.Engine.update(engine, FIXED_DT);
      accumulator -= FIXED_DT;

      if (allFinished() || isTimedOut()) {
        running = false;
        return;
      }
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
    return running && (performance.now() - startedAt) > RACE_TIMEOUT_MS;
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
    snapshot, allFinished, isTimedOut, standings, GROUND_Y
  };
})();
