const Sim = (() => {
  const GROUND_Y = 520, RACE_TIMEOUT_MS = 180000;
  let engine, world, racers = {}, running = false, startedAt = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) Matter.Common.setDecomp(decomp);
    engine = Matter.Engine.create(); 
    world = engine.world; 
    engine.gravity.y = 1.0; // Gravità bilanciata per una discesa fluida
    
    // Iterazioni stabili per azzerare qualsiasi micro-scatter o compenetrazione
    engine.positionIterations = 20; 
    engine.velocityIterations = 15;

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
        restitution: 0.1 
      });
      Matter.Body.setAngle(seg, angle); 
      bodies.push(seg);
    }
    return bodies;
  }

  function createWheelBody(x, y, vertices, wOpt) {
    let wheel = null;
    try {
      wheel = Matter.Bodies.fromVertices(x, y, [vertices], wOpt, true);
    } catch (e) {
      wheel = null;
    }
    // Fallback di sicurezza assoluta: se la scomposizione geometrica fallisce o crea troppe parti, usa un cerchio perfetto
    if (!wheel || (wheel.parts && wheel.parts.length > 6)) {
      wheel = Matter.Bodies.circle(x, y, 70, wOpt);
    }
    // Assegna un'inerzia fissa per evitare il blocco della rotazione
    Matter.Body.setInertia(wheel, 1500);
    return wheel;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 60 + startIndex * 200, group = Matter.Body.nextGroup(true);
    
    const wOpt = { 
      friction: 0.4, 
      frictionStatic: 0.3, 
      restitution: 0.05, 
      density: 0.0015, 
      collisionFilter: { group: group } 
    };
    
    const fw = createWheelBody(startX + 90, GROUND_Y - 140, vertices, wOpt);
    const rw = createWheelBody(startX - 90, GROUND_Y - 140, vertices, wOpt);
    
    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - 140, 160, 16, { 
      density: 0.001, 
      collisionFilter: { group: group } 
    });

    // Sospensioni elastiche ma stabili per assorbire i dislivelli senza rimbalzi violenti
    const axF = Matter.Constraint.create({ bodyA: chassis, pointA: { x: 80, y: 0 }, bodyB: fw, stiffness: 0.5, damping: 0.2, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: chassis, pointA: { x: -80, y: 0 }, bodyB: rw, stiffness: 0.5, damping: 0.2, length: 0 });
    
    Matter.World.add(world, [chassis, fw, rw, axF, axR]);
    racers[id] = { chassis, fw, rw, axF, axR, color, name, finished: false, finishTime: null };
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id]; if (!r || r.finished) return;
    const group = r.chassis.collisionFilter.group;
    const wOpt = { 
      friction: 0.4, 
      frictionStatic: 0.3, 
      restitution: 0.05, 
      density: 0.0015, 
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

    const axF = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: 80, y: 0 }, bodyB: fw, stiffness: 0.5, damping: 0.2, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: r.chassis, pointA: { x: -80, y: 0 }, bodyB: rw, stiffness: 0.5, damping: 0.2, length: 0 });
    
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
    const ramp = Math.min(1, elapsed / 2500); // Accelerazione graduale nei primi 2.5 secondi
    
    Object.values(racers).forEach(r => {
      if (!r.finished) {
        // TRASMISSIONE A COPPIA STABILE: Spinge le ruote in avanti in modo organico e senza scatti
        const DRIVE_TORQUE = 0.035 * ramp;
        
        r.fw.torque += DRIVE_TORQUE;
        r.rw.torque += DRIVE_TORQUE;

        // Piccola forza propulsiva di supporto sul telaio per superare le pendenze senza impuntarsi
        if (r.chassis.velocity.x < 12) {
          Matter.Body.applyForce(r.chassis, r.chassis.position, { x: 0.0004 * ramp, y: 0 });
        }

        // Impedisce alla bici di scivolare all'indietro se si ferma in salita
        if (r.chassis.velocity.x < -0.1) {
          Matter.Body.setVelocity(r.chassis, { x: 0, y: r.chassis.velocity.y });
        }

        // Attrito dell'acqua (rallentamento calibrato)
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
