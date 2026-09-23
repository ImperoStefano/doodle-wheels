const Sim = (() => {
  const GROUND_Y = 520, RACE_TIMEOUT_MS = 180000; // Aumentato a 3 minuti per ostacoli difficili
  let engine, world, racers = {}, running = false, startedAt = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) Matter.Common.setDecomp(decomp);
    engine = Matter.Engine.create(); world = engine.world; engine.gravity.y = 1.3; 
    engine.positionIterations = 20; engine.velocityIterations = 16;
    Matter.World.add(world, buildGround()); racers = {}; running = false;
  }

  function buildGround() {
    const segW = 40; const bodies = [];
    for (let x = Terrain.TRACK_START; x < Terrain.TRACK_END; x += segW) {
      const x2 = x + segW, y1 = GROUND_Y - Terrain.height(x), y2 = GROUND_Y - Terrain.height(x2);
      const midX = (x + x2) / 2, midY = (y1 + y2) / 2, len = Math.hypot(x2 - x, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x);
      // FONDAMENTA SPESSE (200px) PER EVITARE TUNNELING
      const seg = Matter.Bodies.rectangle(midX, midY + 100, len + 2, 200, {
        isStatic: true, friction: Terrain.frictionAt(midX), restitution: 0.15 
      });
      Matter.Body.setAngle(seg, angle); bodies.push(seg);
    }
    return bodies;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 50 + startIndex * 200, group = Matter.Body.nextGroup(true);
    const wOpt = { friction: 0.9, frictionStatic: 1.2, restitution: 0.05, density: 0.003, collisionFilter: { group: group } };
    let fw, rw;
    try {
      fw = Matter.Bodies.fromVertices(startX + 90, GROUND_Y - 140, [vertices], wOpt, true);
      rw = Matter.Bodies.fromVertices(startX - 90, GROUND_Y - 140, [vertices], wOpt, true);
    } catch (e) { fw = null; }
    if (!fw || !rw) {
      fw = Matter.Bodies.circle(startX + 90, GROUND_Y - 140, 80, wOpt); rw = Matter.Bodies.circle(startX - 90, GROUND_Y - 140, 80, wOpt);
    }
    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - 140, 180, 20, { density: 0.0015, collisionFilter: { group: group } });
    const axF = Matter.Constraint.create({ bodyA: chassis, pointA: { x: 90, y: 0 }, bodyB: fw, stiffness: 0.4, damping: 0.1, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: chassis, pointA: { x: -90, y: 0 }, bodyB: rw, stiffness: 0.4, damping: 0.1, length: 0 });
    Matter.World.add(world, [chassis, fw, rw, axF, axR]);
    racers[id] = { chassis, fw, rw, axF, axR, color, name, finished: false, finishTime: null };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id]; if (!r || r.finished) return;
    const group = r.chassis.collisionFilter.group;
    const wOpt = { friction: 0.9, frictionStatic: 1.2, restitution: 0.05, density: 0.003, collisionFilter: { group: group } };
    const fwPos = { ...r.fw.position }, rwPos = { ...r.rw.position }, fwVel = { ...r.fw.velocity }, rwVel = { ...r.rw.velocity };
    const fwAng = r.fw.angularVelocity, rwAng = r.rw.angularVelocity, fwAngle = r.fw.angle, rwAngle = r.rw.angle;
    Matter.World.remove(world, [r.fw, r.rw, r.axF, r.axR]);

    let fw, rw;
    try {
      fw = Matter.Bodies.fromVertices(fwPos.x, fwPos.y, [vertices], wOpt, true); rw = Matter.Bodies.fromVertices(rwPos.x, rwPos.y, [vertices], wOpt, true);
    } catch (e) { fw = null; }
    if (!fw || !rw) { fw = Matter.Bodies.circle(fwPos.x, fwPos.y, 80, wOpt); rw = Matter.Bodies.circle(rwPos.x, rwPos.y, 80, wOpt); }

    Matter.Body.setAngle(fw, fwAngle); Matter.Body.setAngle(rw, rwAngle);
    Matter.Body.setVelocity(fw, fwVel); Matter.Body.setVelocity(rw, rwVel);
    Matter.Body.setAngularVelocity(fw, fwAng); Matter.Body.setAngularVelocity(rw, rwAng);

    const axF = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: 90, y: 0 }, bodyB: fw, stiffness: 0.4, damping: 0.1, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: -90, y: 0 }, bodyB: rw, stiffness: 0.4, damping: 0.1, length: 0 });
    Matter.World.add(world, [fw, rw, axF, axR]);
    r.fw = fw; r.rw = rw; r.axF = axF; r.axR = axR;
  }

  function start() { running = true; startedAt = performance.now(); }

  function tick(dtMs) {
    if (!running) return;
    const elapsed = performance.now() - startedAt; 
    const ramp = Math.pow(Math.min(1, elapsed / 3500), 2); // Accelerazione quadratica fluida
    
    Object.values(racers).forEach(r => {
      if (!r.finished) {
        const MAX_ANG_VEL = 0.65; const TORQUE_POWER = 0.085;
        if (Math.abs(r.fw.angularVelocity) < MAX_ANG_VEL) r.fw.torque = TORQUE_POWER * ramp;
        if (Math.abs(r.rw.angularVelocity) < MAX_ANG_VEL) r.rw.torque = TORQUE_POWER * ramp;
        
        if (r.chassis.velocity.x < -0.2) {
             Matter.Body.setVelocity(r.chassis, { x: 0, y: r.chassis.velocity.y });
             Matter.Body.setVelocity(r.fw, { x: 0, y: r.fw.velocity.y });
             Matter.Body.setVelocity(r.rw, { x: 0, y: r.rw.velocity.y });
        }
        if (Terrain.colorAt(r.chassis.position.x) === '#3b82f6') { // Acqua drag
             Matter.Body.setVelocity(r.chassis, { x: r.chassis.velocity.x * 0.92, y: r.chassis.velocity.y * 0.92 });
             Matter.Body.setAngularVelocity(r.fw, r.fw.angularVelocity * 0.92);
             Matter.Body.setAngularVelocity(r.rw, r.rw.angularVelocity * 0.92);
        }
        if (r.chassis.position.x >= Terrain.FINISH_X) { r.finished = true; r.finishTime = elapsed; }
      }
    });
    Matter.Engine.update(engine, dtMs);
  }

  function snapshot() {
    return Object.entries(racers).map(([id, r]) => ({
      id, x: r.chassis.position.x, y: r.chassis.position.y, angle: r.chassis.angle,
      fwX: r.fw.position.x, fwY: r.fw.position.y, fwAngle: r.fw.angle,
      rwX: r.rw.position.x, rwY: r.rw.position.y, rwAngle: r.rw.angle,
      vx: r.chassis.velocity.x, finished: r.finished, finishTime: r.finishTime,
    }));
  }
  function allFinished() { const list = Object.values(racers); return list.length > 0 && list.every(r => r.finished); }
  function isTimedOut() { return running && (performance.now() - startedAt) > RACE_TIMEOUT_MS; }
  function standings() {
    return Object.entries(racers).map(([id, r]) => ({ id, name: r.name, color: r.color, finished: r.finished, finishTime: r.finishTime, distance: r.chassis.position.x }))
      .sort((a, b) => { if (a.finished && b.finished) return a.finishTime - b.finishTime; if (a.finished) return -1; if (b.finished) return 1; return b.distance - a.distance; });
  }
  return { init, addRacer, updateRacerWheel, start, tick, snapshot, allFinished, isTimedOut, standings, GROUND_Y };
})();
