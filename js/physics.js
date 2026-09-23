const Sim = (() => {
  const GROUND_Y = 520, RACE_TIMEOUT_MS = 180000;
  let engine, world, racers = {}, running = false, startedAt = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) Matter.Common.setDecomp(decomp);
    engine = Matter.Engine.create(); 
    world = engine.world; 
    engine.gravity.y = 1.3; 
    
    engine.positionIterations = 30; 
    engine.velocityIterations = 20;

    Matter.World.add(world, buildGround()); 
    racers = {}; 
    running = false;
  }

  function buildGround() {
    const segW = 40; const bodies = [];
    for (let x = Terrain.TRACK_START; x < Terrain.TRACK_END; x += segW) {
      const x2 = x + segW, y1 = GROUND_Y - Terrain.height(x), y2 = GROUND_Y - Terrain.height(x2);
      const midX = (x + x2) / 2, midY = (y1 + y2) / 2, len = Math.hypot(x2 - x, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x);
      
      const seg = Matter.Bodies.rectangle(midX, midY + 100, len + 2, 200, {
        isStatic: true, 
        friction: Terrain.frictionAt(midX), 
        restitution: 0.15 
      });
      Matter.Body.setAngle(seg, angle); 
      bodies.push(seg);
    }
    return bodies;
  }

  function createWheelBody(x, y, vertices, wOpt) {
    let wheel = null;
    try {
      // FORMA PURA: Nessun chamfer o arrotondamento, usa esattamente i vertici disegnati dall'utente
      wheel = Matter.Bodies.fromVertices(x, y, [vertices], wOpt, true);
    } catch (e) {
      wheel = null;
    }
    // Fallback di sicurezza solo se la scomposizione fallisce
    if (!wheel || (wheel.parts && wheel.parts.length > 10)) {
      wheel = Matter.Bodies.circle(x, y, 75, wOpt);
    }
    return wheel;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 60 + startIndex * 200, group = Matter.Body.nextGroup(true);
    
    // Attrito statico a 0 per impedire agli angoli vivi di fare presa e bloccare la ruota
    const wOpt = { 
      friction: 0.7, 
      frictionStatic: 0.0, 
      restitution: 0.2, 
      density: 0.002, 
      collisionFilter: { group: group } 
    };
    
    const fw = createWheelBody(startX + 90, GROUND_Y - 140, vertices, wOpt);
    const rw = createWheelBody(startX - 90, GROUND_Y - 140, vertices, wOpt);
    
    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - 140, 160, 16, { 
      density: 0.0012, 
      collisionFilter: { group: group } 
    });

    const axF = Matter.Constraint.create({ bodyA: chassis, pointA: { x: 80, y: 0 }, bodyB: fw, stiffness: 0.6, damping: 0.12, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: chassis, pointA: { x: -80, y: 0 }, bodyB: rw, stiffness: 0.6, damping: 0.12, length: 0 });
    
    Matter.World.add(world, [chassis, fw, rw, axF, axR]);
    racers[id] = { chassis, fw, rw, axF, axR, color, name, finished: false, finishTime: null, stuckTimer: 0 };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id]; if (!r || r.finished) return;
    const group = r.chassis.collisionFilter.group;
    const wOpt = { 
      friction: 0.7, 
      frictionStatic: 0.0, 
      restitution: 0.2, 
      density: 0.002, 
      collisionFilter: { group: group } 
    };
    const fwPos = { ...r.fw.position }, rwPos = { ...r.rw.position };
    const fwVel = { ...r.fw.velocity }, rwVel = { ...r.rw.velocity };
    const fwAng = r.fw.angularVelocity, rwAng = r.rw.angularVelocity;
    
    Matter.World.remove(world, [r.fw, r.rw, r.axF, r.axR]);

    const fw = createWheelBody(fwPos.x, fwPos.y, vertices, wOpt);
    const rw = createWheelBody(rwPos.x, rwPos.y, vertices, wOpt);

    Matter.Body.setVelocity(fw, fwVel); 
    Matter.Body.setVelocity(rw, rwVel);
    Matter.Body.setAngularVelocity(fw, fwAng); 
    Matter.Body.setAngularVelocity(rw, rwAng);

    const axF = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: 80, y: 0 }, bodyB: fw, stiffness: 0.6, damping: 0.12, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: -80, y: 0 }, bodyB: rw, stiffness: 0.6, damping: 0.12, length: 0 });
    
    Matter.World.add(world, [fw, rw, axF, axR]);
    r.fw = fw; r.rw = rw; r.axF = axF; r.axR = axR;
  }

  function start() { 
    running = true; 
    startedAt = performance.now(); 
  }

  function tick(dtMs) {
    if (!running) return;
    const elapsed = performance.now() - startedAt; 
    const ramp = Math.min(1, elapsed / 2000); 
    
    Object.values(racers).forEach(r => {
      if (!r.finished) {
        const DRIVE_TORQUE = 0.08 * ramp;
        r.fw.torque += DRIVE_TORQUE;
        r.rw.torque += DRIVE_TORQUE;

        if (r.chassis.velocity.x < 15) {
          Matter.Body.applyForce(r.chassis, r.chassis.position, { x: 0.001 * ramp, y: 0 });
        }

        // Sistema anti-stuck per disincastrare la bici se si ferma in una cunetta profonda
        if (Math.abs(r.chassis.velocity.x) < 0.2 && elapsed > 2000) {
          r.stuckTimer = (r.stuckTimer || 0) + dtMs;
          if (r.stuckTimer > 400) {
            Matter.Body.applyForce(r.chassis, r.chassis.position, { x: 0.015, y: -0.02 });
            r.stuckTimer = 0;
          }
        } else {
          r.stuckTimer = 0;
        }

        if (r.chassis.velocity.x < -0.1) {
          Matter.Body.setVelocity(r.chassis, { x: 0, y: r.chassis.velocity.y });
        }

        if (Terrain.colorAt(r.chassis.position.x) === '#3b82f6') {
          Matter.Body.setVelocity(r.chassis, { x: r.chassis.velocity.x * 0.94, y: r.chassis.velocity.y * 0.94 });
        }

        if (r.chassis.position.x >= Terrain.FINISH_X) { 
          r.finished = true; 
          r.finishTime = elapsed; 
        }
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

  function allFinished() { 
    const list = Object.values(racers); 
    return list.length > 0 && list.every(r => r.finished); 
  }
  
  function isTimedOut() { 
    return running && (performance.now() - startedAt) > RACE_TIMEOUT_MS; 
  }
  
  function standings() {
    return Object.entries(racers).map(([id, r]) => ({ 
      id, name: r.name, color: r.color, finished: r.finished, finishTime: r.finishTime, distance: r.chassis.position.x 
    })).sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; 
      if (b.finished) return 1; 
      return b.distance - a.distance;
    });
  }

  return { init, addRacer, updateRacerWheel, start, tick, snapshot, allFinished, isTimedOut, standings, GROUND_Y };
})();
