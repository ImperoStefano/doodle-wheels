/*
 * Sim — the physics world. Only the HOST ever runs this. Every wheel
 * gets a constant motor (angular velocity), so a perfectly round wheel
 * converts that straight into forward speed, while a bumpy one loses
 * energy bouncing on every "corner" that hits the ground. That's the
 * whole game, emergent from real physics rather than a hand-tuned score.
 */
const Sim = (() => {
  const GROUND_Y = 520;
  const FINISH_X = 6000;
  const MOTOR_SPEED = 9; // rad/s once at full pedal
  const RACE_TIMEOUT_MS = 60000;

  let engine, world;
  let groundBodies = [];
  let racers = {}; // id -> {body, color, name, finished, finishTime}
  let running = false;
  let startedAt = 0;

  function init() {
    // poly-decomp lets Matter.js split a concave freehand doodle into
    // convex parts — without it, sharp inward dents get "filled in".
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) {
      Matter.Common.setDecomp(decomp);
    }
    engine = Matter.Engine.create();
    world = engine.world;
    engine.gravity.y = 1;
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
        isStatic: true, friction: Terrain.frictionAt(midX),
      });
      Matter.Body.setAngle(seg, angle);
      bodies.push(seg);
    }
    return bodies;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 80 + startIndex * 45;
    let body;
    try {
      body = Matter.Bodies.fromVertices(
        startX, GROUND_Y - 110, [vertices],
        { friction: 0.85, frictionStatic: 1, restitution: 0.04, density: 0.0035 },
        true
      );
    } catch (e) {
      body = Matter.Bodies.circle(startX, GROUND_Y - 110, 80, { friction: 0.85, density: 0.0035 });
    }
    if (!body) {
      body = Matter.Bodies.circle(startX, GROUND_Y - 110, 80, { friction: 0.85, density: 0.0035 });
    }
    Matter.World.add(world, body);
    racers[id] = { body, color, name, finished: false, finishTime: null };
  }

  function start() {
    running = true;
    startedAt = performance.now();
  }

  function tick(dtMs) {
    if (!running) return;
    const elapsed = performance.now() - startedAt;
    // quick ramp-up so the start isn't a jarring snap to full torque
    const ramp = Math.min(1, elapsed / 600);
    Object.values(racers).forEach(r => {
      if (!r.finished) {
        Matter.Body.setAngularVelocity(r.body, MOTOR_SPEED * ramp);
        if (r.body.position.x >= FINISH_X) {
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
      x: r.body.position.x,
      y: r.body.position.y,
      angle: r.body.angle,
      finished: r.finished,
      finishTime: r.finishTime,
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
        distance: r.body.position.x,
      }))
      .sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.distance - a.distance;
      });
  }

  return {
    init, addRacer, start, tick, snapshot, allFinished, isTimedOut, standings,
    FINISH_X, GROUND_Y,
  };
})();
