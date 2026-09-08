/*
 * Sim — the physics world. Only the HOST ever runs this.
 * Trasformato per gestire un telaio completo a due ruote (chassis + anteriore + posteriore).
 * Integra attrito e rimbalzo specifici per ogni zona calcolata da terrain.js.
 */
const Sim = (() => {
  const GROUND_Y = 520;
  // Fallback di sicurezza in caso terrain.js non sia stato aggiornato correttamente
  const FINISH_X = typeof Terrain !== 'undefined' && Terrain.FINISH_X ? Terrain.FINISH_X : 14000;
  const MOTOR_SPEED = 6.0; 
  const RACE_TIMEOUT_MS = 120000; 

  let engine, world;
  let groundBodies = [];
  let racers = {}; 
  let running = false;
  let startedAt = 0;

  function init() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) {
      Matter.Common.setDecomp(decomp);
    }
    engine = Matter.Engine.create();
    world = engine.world;
    engine.gravity.y = 1.2; 
    groundBodies = buildGround();
    Matter.World.add(world, groundBodies);
    racers = {};
    running = false;
  }

  function buildGround() {
    const segW = 40;
    const bodies = [];
    for (let x = Terrain.TRACK_START; x < Terrain.TRACK_END; x += segW) {
      const x2 = x + segW;
      const y1 = GROUND_Y - Terrain.height(x);
      const y2 = GROUND_Y - Terrain.height(x2);
      const midX = (x + x2) / 2, midY = (y1 + y2) / 2;
      const len = Math.hypot(x2 - x, y2 - y1);
      const angle = Math.atan2(y2 - y1, x2 - x);
      
      const seg = Matter.Bodies.rectangle(midX, midY + 10, len + 2, 28, {
        isStatic: true, 
        // Aggiunti i fallback per evitare crash grafici se terrain.js è obsoleto
        friction: typeof Terrain.frictionAt === 'function' ? Terrain.frictionAt(midX) : 0.9,
        restitution: typeof Terrain.restitutionAt === 'function' ? Terrain.restitutionAt(midX) : 0.05
      });
      Matter.Body.setAngle(seg, angle);
      bodies.push(seg);
    }
    return bodies;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 50 + startIndex * 180; 
    
    // Generiamo il gruppo di collisione *prima* di creare le ruote
    const group = Matter.Body.nextGroup(true);

    // FIX: inseriamo il collisionFilter direttamente all'interno delle opzioni.
    // In questo modo, se fromVertices genera un corpo concavo multi-parti, 
    // Matter.js propaga il filtro anticolllisione nativamente a tutti i frammenti.
    const wOpt = { 
      friction: 0.85, 
      frictionStatic: 1, 
      restitution: 0.05, 
      density: 0.003,
      collisionFilter: { group: group } 
    };

    let fw, rw;
    try {
      fw = Matter.Bodies.fromVertices(startX + 90, GROUND_Y - 120, [vertices], wOpt, true);
      rw = Matter.Bodies.fromVertices(startX - 90, GROUND_Y - 120, [vertices], wOpt, true);
    } catch (e) {
      console.warn("Complex shape failed, falling back to circles", e);
    }
    
    if (!fw || !rw) {
      fw = Matter.Bodies.circle(startX + 90, GROUND_Y - 120, 80, wOpt);
      rw = Matter.Bodies.circle(startX - 90, GROUND_Y - 120, 80, wOpt);
    }

    const chassis = Matter.Bodies.rectangle(startX, GROUND_Y - 120, 180, 15, {
      density: 0.001, 
      collisionFilter: { group: group }
    });

    const axF = Matter.Constraint.create({ bodyA: chassis, pointA: { x: 90, y: 0 }, bodyB: fw, stiffness: 1, length: 0 });
    const axR = Matter.Constraint.create({ bodyA: chassis, pointA: { x: -90, y: 0 }, bodyB: rw, stiffness: 1, length: 0 });

    const composite = Matter.Composite.create({
      bodies: [chassis, fw, rw],
      constraints: [axF, axR]
    });
    Matter.World.add(world, composite);
    racers[id] = { chassis, fw, rw, color, name, finished: false, finishTime: null };
  }

  function start() {
    running = true;
    startedAt = performance.now();
  }

  function tick(dtMs) {
    if (!running) return;
    const elapsed = performance.now() - startedAt;
    const ramp = Math.min(1, elapsed / 1000); 
    
    Object.values(racers).forEach(r => {
      if (!r.finished) {
        Matter.Body.setAngularVelocity(r.fw, MOTOR_SPEED * ramp);
        Matter.Body.setAngularVelocity(r.rw, MOTOR_SPEED * ramp);
        
        if (r.chassis.position.x >= FINISH_X) {
          r.finished = true;
          r.finishTime = elapsed;
        }
      }
    });
    Matter.Engine.update(engine, dtMs);
  }

  function snapshot() {
    return Object.entries(racers).map(([id, r]) => ({
      id,
      x: r.chassis.position.x, y: r.chassis.position.y, angle: r.chassis.angle,
      fwX: r.fw.position.x, fwY: r.fw.position.y, fwAngle: r.fw.angle,
      rwX: r.rw.position.x, rwY: r.rw.position.y, rwAngle: r.rw.angle,
      finished: r.finished, finishTime: r.finishTime,
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
    return Object.entries(racers)
      .map(([id, r]) => ({
        id, name: r.name, color: r.color,
        finished: r.finished, finishTime: r.finishTime,
        distance: r.chassis.position.x,
      }))
      .sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.distance - a.distance;
      });
  }

  return { init, addRacer, start, tick, snapshot, allFinished, isTimedOut, standings, FINISH_X, GROUND_Y };
})();
