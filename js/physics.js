const Sim = (() => {
  const GROUND_Y = 520;
  const RACE_TIMEOUT_MS = 120000; 

  let engine, world;
  let groundBodies = [];
  let racers = {}; 
  let running = false;
  let startedAt = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) Matter.Common.setDecomp(decomp);
    engine = Matter.Engine.create(); world = engine.world; engine.gravity.y = 1.2; 
    
    engine.positionIterations = 16; engine.velocityIterations = 12;

    groundBodies = buildGround();
    Matter.World.add(world, groundBodies);
    racers = {}; running = false;
  }

  function buildGround() {
    const segW = 40; const bodies = [];
    for (let x = Terrain.TRACK_START; x < Terrain.TRACK_END; x += segW) {
      const x2 = x + segW, y1 = GROUND_Y - Terrain.height(x), y2 = GROUND_Y - Terrain.height(x2);
      const midX = (x + x2) / 2, midY = (y1 + y2) / 2;
      const len = Math.hypot(x2 - x, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x);
      
      const seg = Matter.Bodies.rectangle(midX, midY + 10, len + 2, 28, {
        isStatic: true, 
        friction: Terrain.frictionAt(midX),
        restitution: 0.25 
      });
      Matter.Body.setAngle(seg, angle); bodies.push(seg);
    }
    return bodies;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 50 + startIndex * 180; 
    const group = Matter.Body.nextGroup(true);
    const wOpt = { friction: 0.85, frictionStatic: 1, restitution: 0.05, density: 0.003, collisionFilter: { group: group } };

    let fw, rw;
    try {
      fw = Matter.Bodies.fromVertices(startX + 90, GROUND_Y - 120, [vertices], wOpt, true);
      rw = Matter.Bodies.fromVertices(startX - 90, GROUND_Y - 120, [vertices], wOpt, true);
    } catch (e) { fw = null; }
    
    if (!fw || !rw) {
      fw = Matter.Bodies.circle(startX + 90, GROUND_Y - 120, 80, wOpt);
      rw = Matter.Bodies.circle(startX - 90, GROUND_Y - 120, 80, wOpt);
    }

    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - 120, 180, 15, { density: 0.001, collisionFilter: { group: group } });
    const axF = Matter.Constraint.create({ bodyA: chassis, pointA: { x: 90, y: 0 }, bodyB: fw, stiffness: 0.35, damping: 0.08, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: chassis, pointA: { x: -90, y: 0 }, bodyB: rw, stiffness: 0.35, damping: 0.08, length: 0 });

    Matter.World.add(world, [chassis, fw, rw, axF, axR]);
    racers[id] = { chassis, fw, rw, axF, axR, color, name, finished: false, finishTime: null };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id]; if (!r || r.finished) return;
    const group = r.chassis.collisionFilter.group;
    const wOpt = { friction: 0.85, frictionStatic: 1, restitution: 0.05, density: 0.003, collisionFilter: { group: group } };
    
    const fwPos = { ...r.fw.position }, rwPos = { ...r.rw.position };
    const fwVel = { ...r.fw.velocity }, rwVel = { ...r.rw.velocity };
    const fwAng = r.fw.angularVelocity, rwAng = r.rw.angularVelocity;
    const fwAngle = r.fw.angle, rwAngle = r.rw.angle;

    Matter.World.remove(world, [r.fw, r.rw, r.axF, r.axR]);

    let fw, rw;
    try {
      fw = Matter.Bodies.fromVertices(fwPos.x, fwPos.y, [vertices], wOpt, true);
      rw = Matter.Bodies.fromVertices(rwPos.x, rwPos.y, [vertices], wOpt, true);
    } catch (e) { fw = null; }
    if (!fw || !rw) {
      fw = Matter.Bodies.circle(fwPos.x, fwPos.y, 80, wOpt);
      rw = Matter.Bodies.circle(rwPos.x, rwPos.y, 80, wOpt);
    }

    Matter.Body.setAngle(fw, fwAngle); Matter.Body.setAngle(rw, rwAngle);
    Matter.Body.setVelocity(fw, fwVel); Matter.Body.setVelocity(rw, rwVel);
    Matter.Body.setAngularVelocity(fw, fwAng); Matter.Body.setAngularVelocity(rw, rwAng);

    const axF = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: 90, y: 0 }, bodyB: fw, stiffness: 0.35, damping: 0.08, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: -90, y: 0 }, bodyB: rw, stiffness: 0.35, damping: 0.08, length: 0 });

    Matter.World.add(world, [fw, rw, axF, axR]);
    r.fw = fw; r.rw = rw; r.axF = axF; r.axR = axR;
  }

  function start() { running = true; startedAt = performance.now(); }

  function tick(dtMs) {
    if (!running) return;
    const elapsed = performance.now() - startedAt; const ramp = Math.min(1, elapsed / 1000); 
    
    Object.values(racers).forEach(r => {
      if (!r.finished) {
        
        const MAX_ANG_VEL = 0.6; const TORQUE_POWER = 0.05;
        if (Math.abs(r.fw.angularVelocity) < MAX_ANG_VEL) r.fw.torque = TORQUE_POWER * ramp;
        if (Math.abs(r.rw.angularVelocity) < MAX_ANG_VEL) r.rw.torque = TORQUE_POWER * ramp;
        
        if (r.chassis.velocity.x < -0.1) {
             Matter.Body.setVelocity(r.chassis, { x: 0, y: r.chassis.velocity.y });
             Matter.Body.setVelocity(r.fw, { x: 0, y: r.fw.velocity.y });
             Matter.Body.setVelocity(r.rw, { x: 0, y: r.rw.velocity.y });
        }

        if (Terrain.colorAt(r.chassis.position.x) === '#3498db') {
             Matter.Body.setVelocity(r.chassis, { x: r.chassis.velocity.x * 0.94, y: r.chassis.velocity.y * 0.94 });
             Matter.Body.setAngularVelocity(r.fw, r.fw.angularVelocity * 0.94);
             Matter.Body.setAngularVelocity(r.rw, r.rw.angularVelocity * 0.94);
        }

        if (r.chassis.velocity.y > 18) Matter.Body.setVelocity(r.chassis, { x: r.chassis.velocity.x, y: 18 });
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
    return Object.entries(racers)
      .map(([id, r]) => ({ id, name: r.name, color: r.color, finished: r.finished, finishTime: r.finishTime, distance: r.chassis.position.x }))
      .sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1; if (b.finished) return 1; return b.distance - a.distance;
      });
  }

  return { init, addRacer, updateRacerWheel, start, tick, snapshot, allFinished, isTimedOut, standings, GROUND_Y };
})();
