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
  // Sprint ricaricabile: per SPRINT_MS il tetto di velocità e la spinta salgono di TUNE.sprint; poi ricarica lunga (SPRINT_RECHARGE_MS). Serve per le rampe che chiedono velocità (mezzo tubo).
  const SPRINT_MS = 1700, SPRINT_RECHARGE_MS = 22000, TICK_MS = 1000 / 60;
  const V_CAP = 7.3;         // oltre questa velocità (px/tick a 60 Hz ≈ 440 px/s) il motore smette di spingere
  const ACCEL_CAL = 1;       // quanto la taratura scala anche la coppia (0 = spento)
  const ACCEL_SPIKE = 1;     // le forme spigolose hanno più "coppia" per riprendere velocità dopo ogni urto
  const ROLL_MAX = 1.7;      // tetto della compensazione di velocità su piano
  const ROLL_GAIN = 1.0;     // 1 = pareggio teorico (perimetro dell'involucro convesso)
  // Fango e ghiaccio: serve una forma "con le punte" per mordere; strade acciottolate e dune: le forme
  // poligonali le prendono bene, la tonda sobbalza. min = fattore sulla spinta della ruota perfettamente tonda;
  // full = spigolosità oltre la quale non si perde nulla.
  const MATCH_MAX = 1.14;   // bonus di spinta per la forma "in tinta" con la strada ad archi
  const GRIP = { mud: { min: 0.75, full: 1 }, ice: { min: 0.95, full: 1 }, rough: { min: 0.93, full: 0.75 } };
  // Contatto: la bici non deve "galleggiare" né far girare le ruote a vuoto.
  //  downAcc  : accelerazione verticale extra (px/tick^2) per una ruota senza contatto (gravità circa 1.8x in volo)
  //  airGap   : distanza (px) oltre la quale una ruota si considera in aria
  //  hold/holdMin/hopV/antiHop : vicino al suolo (fra holdMin e hold px: a contatto no, altrimenti si frena il rotolamento sullo spigolo) la velocità che si allontana dalla strada (<hopV px/tick) viene smorzata
  //  airDamp  : smorzamento del giro delle ruote in aria; slipMax : (0 = spento) tetto di giro rispetto all'avanzamento a terra —
  //  provato e scartato: anche a 2.0 rallenta troppo le partenze e le salite
  const TUNE = { downAcc: 0.40, airGap: 4, hold: 16, holdMin: 1.5, hopV: 12, antiHop: 0.8, airDamp: 1, slipMax: 0, slipVmin: 2.5, speed: 1, sprint: 1.55, pop: 3.0 };
  const WHEEL_STATIC = 0.5;    // static friction (Matter takes the max of the two bodies)
  const GROUND_STATIC = 0.5;
  const AXLE_STIFFNESS = 1;
  const AXLE_DAMPING = 0.1;
  // Anti-stall: a racer that gains < STALL_MIN_PROGRESS px in STALL_MS (snagged on a hook, wedged
  // in a dip, driving backwards...) is lifted and moved a little forward so nobody can hold the
  // whole race hostage until the timeout.
  const STALL_MS = 2500;
  // V25.9: before the emergency teleport, attempt a small *continuous* wheel release.
  // A low-speed polygon caught on a terrain lip receives a short, bounded push; it
  // still has to roll/clear the terrain via Matter's solver. No position is changed.
  const CORNER_RELEASE_MS = 1350;
  const CORNER_RELEASE_COOLDOWN_MS = 1350;
  const CORNER_RELEASE_VX = 3.6, CORNER_RELEASE_VY = -3.8;
  const STALL_MIN_PROGRESS = 60;   // px per STALL_MS (24 px/s): legit slow bikes on ice still do far more
  const HOP_X = 90, HOP_MAX_X = 450, HOP_Y = 140; // hop distance grows while the racer keeps failing to move
  const SPAWN_H = 140;        // px above the ground line where wheels/chassis spawn (drop height)
  const MAX_SINK = 2;         // px a wheel corner may dip below the ground line before it's lifted out
  const SUBSTEPS = 2;         // physics sub-steps per 60Hz step: softer landings, less corner digging

  const IMMUNE_MS = 2500;   // dopo un salto (o l'uscita dallo specchio) la bici non attiva portali per un po': chi è in testa non viene rimbalzato di continuo
  let portalUsed = {};   // portali già attraversati da qualcuno: spariscono per tutti (chi arriva per primo li consuma)
  let engine, world, racers = {}, running = false, timedOut = false, startedAt = 0, accumulator = 0, obstacleClockMs = 0, firstFinishAt = null, timeoutMs = 180000;
  const racerOrder = []; let raceStepNo = 0;
  // ONE shared negative group for every racer: bikes pass through each other (ghost racing) but all
  // collide with the ground (group 0). With a group per racer the grid spacing (200px) is smaller
  // than a bike + its wheels, so neighbouring wheels spawned overlapping and were violently ejected.
  let racerGroup = 0;

  function initBase() {
    if (typeof decomp !== 'undefined' && Matter.Common.setDecomp) {
      Matter.Common.setDecomp(decomp);
    }
    engine = Matter.Engine.create();
    world = engine.world;
    engine.gravity.y = 1.3;

    engine.positionIterations = 30;
    engine.velocityIterations = 20;
    // Solo l'host rileva il contatto delle pedane. Viene letto il tempo fisico
    // della simulazione, non Date.now: stessi eventi anche dopo frame persi.
    Matter.Events.on(engine,'collisionStart',ev=>{
      for(const pair of ev.pairs){
        InteractiveObstacles.contact(pair.bodyA,pair.bodyB,obstacleClockMs);
        DynamicObstacles.contact(pair.bodyA,pair.bodyB,obstacleClockMs,racerOrder);
      }
    });
    Matter.Events.on(engine,'collisionActive',ev=>{
      for(const pair of ev.pairs){
        InteractiveObstacles.contact(pair.bodyA,pair.bodyB,obstacleClockMs);
        DynamicObstacles.contact(pair.bodyA,pair.bodyB,obstacleClockMs,racerOrder);
      }
    });

    racerGroup = Matter.Body.nextGroup(true);
  }
  function resetRaceState() {
    racers = {}; racerOrder.length = 0; raceStepNo = 0; portalUsed = {};
    running = false;
    timedOut = false;
    accumulator = 0; obstacleClockMs = 0;
    firstFinishAt = null;
    timeoutMs = raceTimeoutMs();
  }
  function init() {
    prepToken++; prepared = false;
    initBase();
    Matter.World.add(world, buildGround());
    Matter.World.add(world, buildWalls());
    Matter.World.add(world, buildFlowers());
    DynamicObstacles.mount(world);
    InteractiveObstacles.mount(world);
    resetRaceState();
  }
  // Costruzione del mondo "a fette" (≈4 ms alla volta) durante l'intro: su una pista lunga sono ~1100 corpi statici
  // (≈100 ms su un PC, mezzo secondo su un telefono lento) e farli tutti al "VIA" è un freeze visibile.
  // beginRace chiama ensureWorld(): se la preparazione è finita la usa, altrimenti la scarta e costruisce di colpo.
  let prepared = false, prepToken = 0;
  function prepareAsync(cb) {
    const tok = ++prepToken; prepared = false; initBase();
    let x = Terrain.TRACK_START; const END = Terrain.TRACK_END, CH = 400;
    const step = () => {
      if (tok !== prepToken) return;                      // annullata (init sincrono nel frattempo)
      const t0 = Date.now(); const bodies = [];
      while (x < END && Date.now() - t0 < 4) { bodies.push(...buildGround(x, Math.min(x + CH, END))); x += CH; }
      if (bodies.length) Matter.World.add(world, bodies);
      if (x < END) { setTimeout(step, 0); return; }
      Matter.World.add(world, buildWalls()); Matter.World.add(world, buildFlowers());
      DynamicObstacles.mount(world);
    InteractiveObstacles.mount(world);
      resetRaceState(); prepared = true; if (cb) cb();
    };
    step();
  }
  function ensureWorld() { if (prepared) { prepared = false; prepToken++; return false; } init(); return true; }

  // Ground = one convex quad per 40px column whose TOP EDGE is exactly the terrain line.
  // (Rotated rectangles offset vertically leave small steps at the joints between segments
  // with different slopes; a triangle's corner catches on those steps and digs in.)
  function buildGround(xa, xb) {
    const bodies = [];
    if (xa === undefined) { xa = Terrain.TRACK_START; xb = Terrain.TRACK_END; }
    for (let x = xa; x < xb;) {
      // A wider segment on straight terrain halves most collision geometry;
      // tight ramps, island edges and small obstacles retain 20 px resolution.
      const h0 = Terrain.height(x), hm = Terrain.height(x + 20), h1 = Terrain.height(x + 40);
      const curve = Math.abs(h0 - 2 * hm + h1);
      // At very sharp lips (steep ravines / launch edges), use 10 px to avoid
      // the coarse collision surface cutting across a curved cliff face.
      const fine10 = Math.abs(hm - h0) > 29 || curve > 22;
      const fine = curve > 2.2 || Math.abs(h1 - h0) > 25 || x + 40 > xb;
      const x2 = Math.min(x + (fine10 ? 10 : fine ? 20 : 40), xb);
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
      x = x2;
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
      const body = Matter.Bodies.circle(f.x, groundY + f.r * (1 - FLOWER_POKE), f.r, {   // centro sotto la riva: sporge solo FLOWER_POKE·r
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
    const ax = Matter.Constraint.create({
      bodyA: chassis, pointA: { x: dx, y: 0 },
      bodyB: wheel, stiffness: AXLE_STIFFNESS, damping: AXLE_DAMPING, length: 0
    });
    // Matter misura pointA nel telaio com'era alla creazione del vincolo (angleA = angolo di allora): se il telaio è già inclinato (ruota sciolta o ridisegnata
    // mentre la moto è in salita) l'attacco resterebbe storto di quell'angolo per sempre. L'attacco è sempre sull'asse del telaio.
    ax.angleA = 0;
    return ax;
  }

  function addRacer(id, vertices, color, name, startIndex) {
    const startX = 60;   // partenza identica per tutti (le bici non si urtano: gruppo di collisione condiviso), nessun vantaggio di posizione; startIndex non conta più
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
      bestX: startX, hopBaseX: startX, progressAt: 0, hops: 0,
      cornerReleases: 0, releaseAt: -1e9, releaseTriedFor: -1, stallEvents: [],
      curseAt:-1,curseStage:0,curseLevel:0,curseHits:{},
      rampTakeoffAt:-1e9,rampInputUsed:false,rampGroundTicks:0,
      flightTicks:0,flightArmed:false,landHits:0,landPower:0,
      stallStreak: 0, dir: 1, lx: startX, exitId: -1, immuneUntil: 0, jn: 0, ln: 0, ls: 0, jumpAt: -1e9, pe: 0, pt: '', pd: 0, sc: 1, scT: 1, scAt: 0, pUsed: {}, gEv: {}, spCharge: 1, spOn: false, spT: 0,
      cal: calOf(vertices), spike: spikiness(vertices), teeth: teethGrip(vertices), peaks: lastPeaks, prom: lastProm, roll: rollFactor(vertices, teethGrip(vertices)), reff: lastReff, accelK: 1 + ACCEL_SPIKE * spikiness(vertices)
    };
    meltInit(racers[id], id, vertices);
    racerOrder.push(racers[id]);
  }

  function updateRacerWheel(id, vertices) {
    const r = racers[id];
    if (!r || r.finished) return;

    meltInit(r, r.nid, vertices);   // ruota ridisegnata: materiale nuovo, niente più bruciature
    r.cal = calOf(vertices); calibrate(vertices, v => { r.cal = v; });
    r.spike = spikiness(vertices); r.teeth = teethGrip(vertices); r.peaks = lastPeaks; r.prom = lastProm; r.roll = rollFactor(vertices, r.teeth); r.reff = lastReff; r.accelK = 1 + ACCEL_SPIKE * r.spike;
    const group = r.chassis.collisionFilter.group;
    const wOpt = wheelOptions(group);

    const fwPos = { x: r.fw.position.x, y: r.fw.position.y };
    const rwPos = { x: r.rw.position.x, y: r.rw.position.y };
    const fwVel = Matter.Body.getVelocity(r.fw);
    const rwVel = Matter.Body.getVelocity(r.rw);
    const fwAng = Matter.Body.getAngularVelocity(r.fw);
    const rwAng = Matter.Body.getAngularVelocity(r.rw);

    Matter.World.remove(world, [r.fw, r.rw, r.axF, r.axR]);

    const sv = r.sc && r.sc !== 1 ? vertices.map(p => ({ x: p.x * r.sc, y: p.y * r.sc })) : vertices;   // portale gigante: la ruota ridisegnata nasce già della taglia attuale
    const fw = createWheelBody(fwPos.x, fwPos.y, sv, wOpt);
    const rw = createWheelBody(rwPos.x, rwPos.y, r.curseLevel>0 ? EgyptWorld.morph(sv,r.curseLevel) : sv, wOpt);
    if (r.sc && r.sc > 1.001) { Matter.Body.setDensity(fw, fw.density / (r.sc * r.sc)); Matter.Body.setDensity(rw, rw.density / (r.sc * r.sc)); }

    Matter.Body.setVelocity(fw, fwVel);
    Matter.Body.setVelocity(rw, rwVel);
    Matter.Body.setAngularVelocity(fw, fwAng);
    Matter.Body.setAngularVelocity(rw, rwAng);

    const axF = makeAxle(r.chassis, 80 * (r.sc || 1), fw);
    const axR = makeAxle(r.chassis, -80 * (r.sc || 1), rw);

    Matter.World.add(world, [fw, rw, axF, axR]);
    r.fw = fw; r.rw = rw; r.axF = axF; r.axR = axR;
  }


  // ---- vulcano: il materiale che tocca la lava si scioglie ----------------------------------------------------
  // Ogni ruota è un contorno fitto di punti (r.base: i lati lunghi sono suddivisi, gli spigoli restano) e ogni punto ha una "fusione" m (0..MELT_MAX).
  // Solo i punti IMMERSI nella lava si sciolgono, tanto più quanto sono più a fondo (verso il fondale), e le punte prima del resto; il materiale non è
  // identico dappertutto (un'irregolarità fissa sulla ruota), quindi ci si "mangia" a chiazze invece di rimpicciolire in modo uniforme.
  // La forma sciolta è base·(1−m) con m appena sfumato fra punti vicini (profilo continuo, "cera che cede") e ricentrata sul baricentro.
  // I corpi fisici si ricostruiscono ogni MELT_BUILD_MS: la ruota cambia forma davvero (e, più piccola in quel punto, spinge meno). Nessuna ritaratura: lo svantaggio resta.
  const MELT_RATE = 1.0, MELT_MAX = 0.62, MELT_DEPTH = 24, MELT_BUILD_MS = 120, LAVA_DRAG = 0.965;
  const smooth01 = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  function meltBase(v) {
    const n = v.length; if (n < 3) return v.map(p => ({ x: p.x, y: p.y }));
    let per = 0; for (let i = 0; i < n; i++) per += Math.hypot(v[(i + 1) % n].x - v[i].x, v[(i + 1) % n].y - v[i].y);
    const seg = Math.max(7, per / 150), out = [];
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n], k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / seg));
      for (let j = 0; j < k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k });
    }
    return out;
  }
  // forma sciolta: base (punti) e m (0..1 per punto) → contorno ricentrato sul baricentro. Pura: la usano anche i client per disegnare.
  function meltVertices(base, m) {
    const n = base.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = Math.min(MELT_MAX, 0.25 * m[(i + n - 1) % n] + 0.5 * m[i] + 0.25 * m[(i + 1) % n]), k = 1 - t;
      out[i] = { x: base[i].x * k, y: base[i].y * k };
    }
    let cx = 0, cy = 0, a2 = 0;
    for (let i = 0; i < n; i++) { const p = out[i], q = out[(i + 1) % n], cr = p.x * q.y - q.x * p.y; a2 += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr; }
    if (Math.abs(a2) > 1e-6) { cx /= 3 * a2; cy /= 3 * a2; for (const p of out) { p.x -= cx; p.y -= cy; } }
    return out;
  }
  function meltInit(r, id, vertices) {
    const base = meltBase(vertices), n = base.length, rad = base.map(p => Math.hypot(p.x, p.y));
    let h = 2166136261 >>> 0; const sid = String(id); for (let i = 0; i < sid.length; i++) { h ^= sid.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const ph = (h % 6283) / 1000, lobes = 2 + (h % 3);
    r.nid = id; r.base = base; r.mF = new Float32Array(n); r.mR = new Float32Array(n); r.meltAt = 0; r.meltDirty = false; r.meltOut = false; r.molten = 0; r.mkF = 1; r.mkR = 1; r.baseArea = undefined;
    r.tip = base.map((p, i) => { let s = 0; for (let k = -4; k <= 4; k++) s += rad[(i + k + n * 2) % n]; return Math.max(0, Math.min(1, (rad[i] - s / 9) / 9)); });
    r.hot = base.map((p, i) => 0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * lobes * i / n + ph), 1.3));   // 0.2..1: dove il materiale cede più volentieri
  }
  function meltWheel(r, w, m, dtSec) {
    const x0=w.position.x,y0=w.position.y,scale=r.sc||1;
    // V33: il vulcano deve consumare la ruota REALE, anche dopo la mummia.
    // Prima si fonde il materiale, poi si applica la forma triangolare:
    // lo stesso ordine usato da rebuildWheel() e dal client grafico.
    if(!Terrain.nearLava(x0,140*scale))return false;
    const n=r.base.length, ca=Math.cos(w.angle),sa=Math.sin(w.angle);
    const melted=meltVertices(r.base,m);
    const shape=(w===r.rw&&r.curseLevel>0)
      ? EgyptWorld.morph(melted,r.curseLevel):melted;
    let any=false;
    for(let i=0;i<n;i++){
      const bx=shape[i].x*scale,by=shape[i].y*scale;
      const wx=x0+ca*bx-sa*by,wy=y0+sa*bx+ca*by;
      if(!Terrain.isLava(wx))continue;
      const d=wy-(GROUND_Y-Terrain.lavaLevel(wx));
      if(d<=0)continue;
      const dm=MELT_RATE*dtSec*smooth01(d/MELT_DEPTH)*(1+1.3*r.tip[i])*r.hot[i];
      if(m[i]<MELT_MAX){m[i]=Math.min(MELT_MAX,m[i]+dm);any=true;}
    }
    return any;
  }
  // il corpo fisico non ha bisogno di ogni puntino: semplifica il contorno (Douglas–Peucker, 1,4 px) e la scomposizione in pezzi convessi resta leggera
  function simplifyRing(pts, tol) {
    const n = pts.length; if (n < 12) return pts;
    const dist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; if (l < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y); return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(l); };
    const keep = new Array(n).fill(false);
    const rdp = (i, j) => { let mx = 0, k = -1; for (let t = i + 1; t < j; t++) { const d = dist(pts[t], pts[i], pts[j]); if (d > mx) { mx = d; k = t; } } if (mx > tol && k > 0) { keep[k] = true; rdp(i, k); rdp(k, j); } };
    let far = 0, fd = 0; for (let i = 1; i < n; i++) { const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y); if (d > fd) { fd = d; far = i; } }
    keep[0] = keep[far] = true; rdp(0, far);
    const tail = pts.slice(far).concat([pts[0]]); // seconda metà, chiusa sul punto 0
    const keep2 = new Array(tail.length).fill(false); keep2[0] = keep2[tail.length - 1] = true;
    const rdp2 = (i, j) => { let mx = 0, k = -1; for (let t = i + 1; t < j; t++) { const d = dist(tail[t], tail[i], tail[j]); if (d > mx) { mx = d; k = t; } } if (mx > tol && k > 0) { keep2[k] = true; rdp2(i, k); rdp2(k, j); } };
    rdp2(0, tail.length - 1);
    const out = []; for (let i = 0; i <= far; i++) if (keep[i]) out.push(pts[i]); for (let i = 1; i < tail.length - 1; i++) if (keep2[i]) out.push(tail[i]);
    return out.length >= 3 ? out : pts;
  }
  const ringArea = v => { let a = 0; for (let i = 0; i < v.length; i++) { const p = v[i], q = v[(i + 1) % v.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; };
  // una ruota mangiata dalla lava spinge peggio: la perdita di spinta segue la materia persa (MELT_GRIP = quanto pesa), ma la forma resta quella vera
  const MELT_GRIP = 1.0;
  function rebuildWheel(r, key, m) {
    let mv = meltVertices(r.base, m);
    // La maledizione cambia esclusivamente la geometria; non applicare ANCHE
    // una penalità di aderenza da lava per il materiale compresso dalle bende.
    const materialArea = ringArea(mv);
    if(key==='rw' && r.curseLevel>0) mv=EgyptWorld.morph(mv,r.curseLevel);
    if (r.baseArea === undefined) r.baseArea = ringArea(r.base);
    const kk = Math.max(0.35, 1 - MELT_GRIP * Math.max(0, 1 - materialArea / (r.baseArea || 1)));
    if (r.sc && r.sc !== 1) { const S = r.sc; mv = mv.map(p => ({ x: p.x * S, y: p.y * S })); }
    if (key === 'fw') r.mkF = kk; else r.mkR = kk;
    const old = r[key], axKey = key === 'fw' ? 'axF' : 'axR', dx = (key === 'fw' ? 80 : -80) * (r.sc || 1), group = r.chassis.collisionFilter.group;
    const pos = { x: old.position.x, y: old.position.y }, ang = old.angle;
    const nw = createWheelBody(pos.x, pos.y, simplifyRing(mv, 1.4), wheelOptions(group));
    // si copia lo stato di moto così com'è (posizione precedente, angolo precedente, passo di tempo): niente scossoni alla ricostruzione
    if (r.sc && r.sc > 1.001) Matter.Body.setDensity(nw, nw.density / (r.sc * r.sc));
    // La maledizione cambia il profilo ma non modifica all'improvviso massa
    // e inerzia effettiva tramite un salto di densita' del nuovo collider.
    if(key==='rw' && r.curseLevel>0) Matter.Body.setDensity(nw,old.mass/Math.max(1,nw.area));   // ruota gigante: stessa massa di prima (4,8 volte più pesante farebbe esplodere i vincoli con il telaio leggero)
    Matter.Body.setPosition(nw, pos); Matter.Body.setAngle(nw, ang);   // (setPosition: difesa se la scomposizione in pezzi lascia il corpo altrove)
    nw.deltaTime = old.deltaTime; nw.deltaTimePrev = old.deltaTimePrev; nw.positionPrev.x = pos.x - (old.position.x - old.positionPrev.x); nw.positionPrev.y = pos.y - (old.position.y - old.positionPrev.y);
    nw.anglePrev = nw.angle - (old.angle - old.anglePrev); nw.velocity.x = old.velocity.x; nw.velocity.y = old.velocity.y; nw.angularVelocity = old.angularVelocity; nw.speed = old.speed; nw.angularSpeed = old.angularSpeed;
    Matter.World.remove(world, [old, r[axKey]]);
    const ax = makeAxle(r.chassis, dx, nw); Matter.World.add(world, [nw, ax]);
    r[key] = nw; r[axKey] = ax;
  }
  function meltStep(r, elapsed) {
    if (!Terrain.nearLava || !(Terrain.nearLava(r.fw.position.x, 140) || Terrain.nearLava(r.rw.position.x, 140))) return;
    const dt = FIXED_DT / 1000;
    if (meltWheel(r, r.fw, r.mF, dt)) r.dF = true;
    if (meltWheel(r, r.rw, r.mR, dt)) r.dR = true;
    if ((r.dF || r.dR) && elapsed - r.meltAt >= MELT_BUILD_MS) {
      if (r.dF) rebuildWheel(r, 'fw', r.mF); if (r.dR) rebuildWheel(r, 'rw', r.mR);
      r.dF = r.dR = false; r.meltAt = elapsed; r.meltOut = true;
    }
  }
  // novità da mandare a tutti: per ogni ruota che si è sciolta, i valori m (interi 0..100 per punto). I client rifanno la forma con meltBase + meltVertices.
  function drainMelts() {
    const out = [];
    for (const id in racers) { const r = racers[id]; if (!r.meltOut) continue; r.meltOut = false; out.push({ id, f: Array.from(r.mF, v => Math.round(v * 100)), r: Array.from(r.mR, v => Math.round(v * 100)) }); }
    return out;
  }

  function getAllMeltStates() {
    return Object.entries(racers).filter(([id,r]) => r.mF && r.mR &&
      (r.mF.some(v=>v>0) || r.mR.some(v=>v>0))).map(([id,r]) => ({
      id, f:Array.from(r.mF, v=>Math.round(v*100)),
      r:Array.from(r.mR, v=>Math.round(v*100))
    }));
  }

  function start() {
    running = true;
    startedAt = performance.now();
    accumulator = 0; obstacleClockMs = 0;
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
  let lastPeaks = 0, lastProm = 0, lastReff = 0;
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
    const reff = per / (2 * Math.PI); lastReff = reff;
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

  function driveWheel(wheel, target, accelK, lim) {
    // getAngularVelocity is normalised to a 60Hz step, so it stays correct with SUBSTEPS > 1
    let w = Matter.Body.getAngularVelocity(wheel);
    const g = wheel.gapNow;
    if (g !== undefined && g > TUNE.airGap) {            // in aria il motore non "frulla" la ruota: smorzamento, nessuna spinta
      Matter.Body.setAngularVelocity(wheel, w * TUNE.airDamp);
      return;
    }
    const acc = MOTOR_ACCEL * (accelK || 1);
    if (lim !== undefined && target > lim) target = Math.max(lim, w > lim ? w * 0.9 : 0, 0);   // a terra: niente giro oltre SLIP_MAX volte l'avanzamento
    const dw = Math.max(-acc, Math.min(acc, target - w));
    Matter.Body.setAngularVelocity(wheel, w + dw);
  }

  // V27.3: l'assetto sul salto da rampa rimane interamente affidato alle
  // constraints e alle collisioni di Matter.js: niente rotazione in aria
  // pilotata verso la pendenza di atterraggio.

  // V27.3: Matter.js rimane responsabile della gravita' delle tre parti.
  // Quando la bici e' INTERAMENTE in volo, aggiungiamo una piccola gravita'
  // arcade uniforme a ruote e telaio (non soltanto alla ruota anteriore).
  // Nessuna gravita' differenziata per salti manuali / rampe: stessa parabola
  // per tutti i tipi di decollo a parita' di velocita' iniziale.
  // L'anti-saltello sul terreno e' solo una protezione, disattivata durante
  // un salto richiesto e quando una ruota attraversa una rampa reale.
  function assist(r, H) {
    H = H || Terrain.height;
    const elapsed=performance.now()-startedAt;
    const grace=(r.jumpGraceUntil||0)>elapsed || (r.springGraceTicks||0)>0;
    if(r.springGraceTicks>0)r.springGraceTicks--;
    const fwGap=r.fw.gapNow, rwGap=r.rw.gapNow;
    const airborne=fwGap>TUNE.airGap && rwGap>TUNE.airGap;
    if (airborne) {
      for(const b of [r.chassis,r.fw,r.rw]) {
        const v=b.velocity;
        Matter.Body.setVelocity(b,{x:v.x,y:v.y+TUNE.downAcc});
      }
      return;
    }
    if(grace||r.rampFly>0)return;
    for (const w of [r.fw,r.rw]) {
      const g=w.gapNow;
      if(g===undefined || g<=TUNE.holdMin || g>=TUNE.hold ||
         (Terrain.onRamp && Terrain.onRamp(w.position.x)))continue;
      const v=w.velocity,x=w.position.x,slope=(H(x+3)-H(x-3))/6;
      const len=Math.hypot(slope,1),nx=slope/len,ny=-1/len;
      const vn=v.x*nx+v.y*ny;
      if(vn>0 && vn<TUNE.hopV)
        Matter.Body.setVelocity(w,{x:v.x-vn*TUNE.antiHop*nx,y:v.y-vn*TUNE.antiHop*ny});
    }
  }

  // Safety net: the terrain profile is known exactly, so if a wheel corner ever ends up more
  // than MAX_SINK px below the ground line (hard landing on a ramp edge), lift the wheel back to
  // the surface instead of letting it dig in and stall.
  function antiSink(wheel, hfn) {
    const H = hfn || Terrain.height;
    const parts = wheel.parts.length > 1 ? wheel.parts.slice(1) : [wheel];
    let worst = 0, gap = 1e9;
    for (const p of parts) {
      for (const v of p.vertices) {
        if (!hfn && (v.x < Terrain.TRACK_START || v.x > Terrain.TRACK_END)) continue; // no ground out there
        const sink = v.y - (GROUND_Y - H(v.x));
        if (sink > worst) worst = sink;
        if (-sink < gap) gap = -sink;
      }
      // una ruota poligonale che poggia su uno spigolo (non su un vertice) su una salita ha i vertici "in aria" anche se tocca:
      // si controllano anche punti lungo gli spigoli, altrimenti il motore la crede sospesa e non spinge (il fagiolo si piantava così)
      const vs = p.vertices;
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i], c = vs[(i + 1) % vs.length], len = Math.abs(c.x - a.x);
        if (len < 9) continue;
        const m = len > 24 ? 3 : 1;
        for (let k = 1; k <= m; k++) {
          const t = k / (m + 1), px = a.x + (c.x - a.x) * t, py = a.y + (c.y - a.y) * t;
          if (!hfn && (px < Terrain.TRACK_START || px > Terrain.TRACK_END)) continue;
          const sk = py - (GROUND_Y - H(px));
          if (-sk < gap) gap = -sk;
        }
      }
    }
    wheel.gapNow = gap > 1e8 ? undefined : gap;
    if (worst > MAX_SINK) {
      Matter.Body.translate(wheel, { x: 0, y: -(worst - MAX_SINK) });
      if (wheel.velocity.y > 0) Matter.Body.setVelocity(wheel, { x: wheel.velocity.x, y: 0 });
    }
  }

  // V25.9 diagnostic snapshot of the exact terrain/context where a rider is blocked.
  // Only available to local QA; never added to multiplayer snapshots.
  function stallContext(r, elapsed, type) {
    const x = r.chassis.position.x;
    const z = Terrain.zoneAt(x);
    const segment = Terrain.WORLD_SEGMENT;
    const worldName = segment && x >= segment.start && x <= segment.end ? segment.world : 'classic';
    const patch = Terrain.patchAt ? Terrain.patchAt(x) : null;
    const near = [];
    for (const o of Terrain.INTERACTIVE_OBSTACLES || []) if (Math.abs(o.x - x) < 260) near.push('interactive:' + o.kind);
    for (const o of Terrain.DYNAMIC_OBSTACLES || []) if (Math.abs(o.x - x) < 260) near.push('dynamic:' + o.kind);
    const record = {
      type, ms: Math.round(elapsed), x: Math.round(x),
      world: worldName, zone: z && z.key || 'unknown',
      patch: patch && patch.kind || '',
      vx: Math.round(r.chassis.velocity.x * 100) / 100,
      vy: Math.round(r.chassis.velocity.y * 100) / 100,
      frontGap: Math.round((r.fw.gapNow ?? 999) * 10) / 10,
      rearGap: Math.round((r.rw.gapNow ?? 999) * 10) / 10,
      spike: Math.round((r.spike || 0) * 100) / 100,
      nearby: near.slice(0, 5)
    };
    r.stallEvents = r.stallEvents || [];
    r.stallEvents.push(record);
    if (r.stallEvents.length > 24) r.stallEvents.shift();
  }

  // A conservative physical unhook for a spinning polygon that has stopped moving
  // on regular ground. This is not a teleport, does not skip an obstacle, and does
  // not change the bike's angle or wheel shape. One attempt per stalled stretch.
  function releaseCorner(r, elapsed) {
    if ((r.dir || 1) !== 1 || r.finished || r.righting || r.rampFly || r.airJ ||
        (r.spike || 0) < 0.12 ||
        elapsed - (r.releaseAt || -1e9) < CORNER_RELEASE_COOLDOWN_MS ||
        r.releaseTriedFor === r.progressAt) return false;
    const x = r.chassis.position.x;
    const z = Terrain.zoneAt(x);
    if (!z || z.key === 'start' || z.key === 'finish' ||
        Terrain.isWater(x) || Terrain.isLava(x) ||
        (Terrain.onRamp && Terrain.onRamp(x)) ||
        (Terrain.ravineAt && Terrain.ravineAt(x)) ||
        (Terrain.bridgeAt && Terrain.bridgeAt(x))) return false;
    // Avoid pushing through an actual obstacle: this intervention targets
    // terrain-corner snagging, not authored barriers or multiplayer collisions.
    if ((Terrain.INTERACTIVE_OBSTACLES || []).some(o => Math.abs(o.x - x) < 190) ||
        (Terrain.DYNAMIC_OBSTACLES || []).some(o => Math.abs(o.x - x) < 190)) return false;
    // Must be close to the rideable ground, NOT falling / flying over a gap.
    const g1 = r.fw.gapNow, g2 = r.rw.gapNow;
    if (!Number.isFinite(g1) || !Number.isFinite(g2) ||
        Math.min(g1, g2) > 12 || Math.max(g1, g2) > 80) return false;
    if (r.chassis.velocity.x > 1.8 || r.chassis.velocity.x < -1.2 ||
        Math.abs(r.chassis.velocity.y) > 4.5) return false;
    for (const b of [r.chassis, r.fw, r.rw]) {
      const vx = Math.max(b.velocity.x, CORNER_RELEASE_VX);
      const vy = Math.min(b.velocity.y, CORNER_RELEASE_VY);
      Matter.Body.setVelocity(b, { x: vx, y: vy });
    }
    r.releaseTriedFor = r.progressAt;
    r.releaseAt = elapsed;
    r.cornerReleases = (r.cornerReleases || 0) + 1;
    stallContext(r, elapsed, 'corner-release');
    return true;
  }

  function unstick(r) {
    stallContext(r, performance.now() - startedAt, 'teleport');
    const dist = Math.min(HOP_MAX_X, HOP_X * (1 + r.stallStreak)) * (r.dir || 1);   // in retromarcia il salto è all'indietro
    const cx = r.chassis.position.x + dist, cy = r.chassis.position.y - HOP_Y;
    Matter.Body.setPosition(r.chassis, { x: cx, y: cy });
    Matter.Body.setAngle(r.chassis, 0);            // also rights a flipped bike
    Matter.Body.setPosition(r.fw, { x: cx + 80 * (r.sc || 1), y: cy });
    Matter.Body.setPosition(r.rw, { x: cx - 80 * (r.sc || 1), y: cy });
    for (const b of [r.chassis, r.fw, r.rw]) {
      Matter.Body.setVelocity(b, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(b, 0);
    }
    r.hops++;
    r.lastUnstickX = r.chassis.position.x - dist;
    r.lastUnstickAt = performance.now() - startedAt;
    r.stallStreak++;
    r.bestX = cx * (r.dir || 1);   // new baseline: only real driving from here counts as progress (in coordinate di avanzamento: dir·x)
    r.hopBaseX = cx * (r.dir || 1);
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
    const spm = r.spOn ? TUNE.sprint : 1;
    const dir = r.dir || 1, gov = dir * r.chassis.velocity.x > V_CAP * spm * capK * Math.pow(r.sc || 1, 0.6);   // ruote giganti: tetto più alto (il motore non cambia, ma il giro è più lungo)
    // tetto di giro a terra: la ruota non gira più di SLIP_MAX volte quanto serve per l'avanzamento (partenza: velocità minima di riferimento)
    const lim = TUNE.slipMax > 0 && r.reff > 0 ? TUNE.slipMax * Math.max(r.chassis.velocity.x, TUNE.slipVmin) / (r.reff * (r.sc || 1)) : undefined;
    const ak = (r.accelK || 1) * Math.max(1, ACCEL_CAL * c);   // taratura della singola geometria
    // Aderenza in salita: il motore dispone di un po' piu' di coppia quando
    // le ruote premono DAVVERO su un piano inclinato. Non modifica velocita'
    // lineari, direzione o angolo in aria; niente boost al labbro.
    const slopeTorque=w=>{
      if(!(Terrain.onRamp && Terrain.onRamp(w.position.x)) ||
         !(w.gapNow!==undefined && w.gapNow<=TUNE.airGap)) return 1;
      const x=w.position.x, slope=(Terrain.height(x+8)-Terrain.height(x-8))/16;
      return 1+Math.min(.14,Math.max(0,dir*slope)*.24);
    };
    const mkF = r.mkF || 1, mkR = r.mkR || 1;   // vulcano: ruote sciolte, meno spinta
    driveWheel(r.fw, gov ? 0 : dir * MOTOR_SPEED * TUNE.speed * spm * ramp * gf * c * mkF, ak*slopeTorque(r.fw), lim);
    driveWheel(r.rw, gov ? 0 : dir * MOTOR_SPEED * TUNE.speed * spm * ramp * gr * c * mkR, ak*slopeTorque(r.rw), lim);
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
    r.roll = rollFactor(vertices, r.teeth); r.reff = lastReff; r.accelK = 1 + ACCEL_SPIKE * r.spike;
    const at = CAL_SEC.map(() => null);
    for (let tick = 0; tick < CAL_MAX_TICKS; tick++) {
      driveRacer(r, tick * FIXED_DT, false);
      assist(r, hf);
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

  // Pool di worker per la taratura (solo nel browser): niente blocchi del thread principale. Se il worker non parte
  // (file mancante, rete, browser vecchio) si ricade sul calcolo a fette sul thread principale.
  const calPool = { workers: [], pending: new Map(), nextId: 1, state: 'idle' };
  function calPoolInit() {
    if (calPool.state !== 'idle') return;
    calPool.state = 'off';
    try {
      if (typeof Worker === 'undefined' || typeof document === 'undefined') return;
      const abs = s => new URL(s, document.baseURI).href;
      const sc = sel => { const e = document.querySelector(sel); return e ? e.src : null; };
      const urls = { init: true, matter: sc('script[src*="matter"]'), decomp: sc('script[src*="decomp"]'), physics: sc('script[src*="js/physics.js"]') };
      if (!urls.matter || !urls.physics) return;
      const wsrc = abs('js/calworker.js' + ((urls.physics.match(/\?.*$/) || [''])[0]));
      const n = Math.max(1, Math.min(3, ((navigator.hardwareConcurrency || 2) - 1)));
      calPool.state = 'starting'; let ok = 0, dead = 0;
      const fail = () => { if (calPool.state === 'off') return; if (++dead >= n) { calPool.state = 'off'; calPool.workers.forEach(w => { try { w.w.terminate(); } catch (e) {} }); calPool.workers = []; const jobs = [...calPool.pending.values()].concat(calQueue.splice(0)); calPool.pending.clear(); jobs.forEach(j => j.fail()); } };
      for (let i = 0; i < n; i++) {
        const w = new Worker(wsrc), rec = { w, ready: false, busy: 0 };
        const timer = setTimeout(() => { if (!rec.ready) { try { w.terminate(); } catch (e) {} fail(); } }, 6000);
        w.onmessage = ev => {
          const m = ev.data;
          if (m.ready === true) { rec.ready = true; clearTimeout(timer); if (++ok === 1) calPool.state = 'on'; calPoolPump(); return; }
          if (m.ready === false) { clearTimeout(timer); fail(); return; }
          const job = calPool.pending.get(m.id); if (!job) return; calPool.pending.delete(m.id); rec.busy--;
          if (m.cal) job.done(m.cal); else job.fail();
          calPoolPump();
        };
        w.onerror = () => { clearTimeout(timer); fail(); };
        w.postMessage(Object.assign({}, urls, { physics: urls.physics, matter: abs(urls.matter), decomp: urls.decomp ? abs(urls.decomp) : null }));
        calPool.workers.push(rec);
      }
    } catch (e) { calPool.state = 'off'; }
  }
  const calQueue = [];
  function calPoolPump() {
    while (calQueue.length) {
      const rec = calPool.workers.filter(w => w.ready).sort((a, b) => a.busy - b.busy)[0];
      if (!rec || rec.busy >= 1) return;
      const job = calQueue.shift(); job.id = calPool.nextId++; calPool.pending.set(job.id, job); rec.busy++;
      rec.w.postMessage({ id: job.id, vertices: job.vertices });
    }
  }
  function calViaPool(vertices, done, fallback) {
    calPoolInit();
    if (calPool.state === 'off') return false;
    calQueue.push({ vertices, done, fail: () => fallback() }); calPoolPump(); return true;
  }

  // Taratura di una forma: usa la cache; cb(cal). Se già pronta risponde subito.
  function calibrate(vertices, cb) {
    if (!vertices || vertices.length < 3) { cb([1, 1, 1, 1]); return; }
    const key = calKey(vertices);
    if (calCache.has(key)) { const v = calCache.get(key); if (Array.isArray(v)) { cb(v); return; } v.push(cb); return; }
    const waiting = [cb]; calCache.set(key, waiting);
    const done = val => { calCache.set(key, val); waiting.forEach(f => f(val)); if (calCache.size > 60) calCache.delete(calCache.keys().next().value); };
    const local = () => runSliced(calibrateGen(vertices), done);
    if (!calViaPool(vertices, done, local)) local();
  }
  function calibrateSync(vertices) { const key = calKey(vertices); const v = calCache.get(key); if (Array.isArray(v)) return v; const val = drain(calibrateGen(vertices)); calCache.set(key, val); return val; }
  function calOf(vertices) { const v = calCache.get(calKey(vertices)); return Array.isArray(v) ? v : [1, 1, 1, 1]; }

  // Per-racer logic, runs at the fixed 60Hz step.
  // Portali (modalità pazza): attraversati lungo x fra due passi. L'host decide tutto, gli altri vedono solo gli effetti.
  function portalEvent(r, type, dx, id) { r.pe++; r.pt = type; r.pd = dx || 0; r.pi = id; }
  // gli eventi del portale gigante hanno il loro contatore: se capitano nello stesso istante di un teletrasporto non si cancellano a vicenda
  function growEvent(r, type, id) { r.ge = (r.ge || 0) + 1; r.gt = type; r.gi = id; }
  function teleport(r, dx) {
    const cx = r.chassis.position.x + dx; let top = 1e9;
    for (let x = cx - 140; x <= cx + 140; x += 20) top = Math.min(top, GROUND_Y - Terrain.height(x));   // il punto più alto del terreno sotto la bici
    const dy = (top - 150 - 90 * Math.max(0, (r.sc || 1) - 1)) - r.chassis.position.y;   // ruote giganti: si parte più in alto, altrimenti affondano nel terreno
    for (const b of [r.chassis, r.fw, r.rw]) Matter.Body.translate(b, { x: dx, y: dy });
  }
  // Portale gigante: la taglia dipende da DOVE sei rispetto agli anelli, non da un istante. Cresce mentre attraversi l'anello (da 1 a GROW lungo il suo
  // spessore), resta gigante nel tratto in mezzo e torna normale mentre attraversi il portale grande. Non si consuma: ognuno lo fa una volta sola.
  const sm01 = t => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  function growLogic(r, P, x) {
    let target = 1;
    for (const q of P) {
      if (q.kind !== 'grow' || r.pUsed[q.id]) continue;
      const big = P.find(e => e.kind === 'big' && e.grow === q.id); if (!big) continue;
      const end = big.x + BIG_HW;
      if ((r.dir !== 1 && !r.gEv[q.id]) || x < q.x - GROW_HW) { continue; }   // in retromarcia non si entra in un tratto gigante, ma se ci sei già dentro (specchio nel mezzo) resti gigante
      if (x >= end) { r.pUsed[q.id] = true; if (r.gEv[q.id] === 1) { r.gEv[q.id] = 2; growEvent(r, 'n', big.id); } continue; }
      const up = sm01((x - (q.x - GROW_HW)) / (2 * GROW_HW)), down = sm01((x - (big.x - BIG_HW)) / (2 * BIG_HW));
      target = 1 + (GROW - 1) * up * (1 - down);
      if (!r.gEv[q.id] && x >= q.x) { r.gEv[q.id] = 1; growEvent(r, 'g', q.id); }
      if (r.gEv[q.id] === 1 && x >= big.x) { r.gEv[q.id] = 2; growEvent(r, 'n', big.id); }
      break;
    }
    r.scT = target;
  }
  // le ruote passano sopra il bordo alto dell'anello (le uscite non si scavalcano: riportano comunque la bici in avanti)
  function overPortal(r, q) {
    return r.airJ >= 1 && GROUND_Y - Math.max(r.fw.bounds.max.y, r.rw.bounds.max.y) - Terrain.height(q.x) >= PORTAL_SKIP_H;
  }
  function checkPortals(r, elapsed) {
    const P = Terrain.PORTALS; if (!P || !P.length) return;
    const x = r.chassis.position.x, lx = r.lx; r.lx = x;
    if (r.dir === -1) {   // rete di sicurezza: se la bici ha oltrepassato la SUA uscita senza "toccarla" (sblocco all'indietro), torna comunque normale
      const ex = P.find(e => e.id === r.exitId);
      if (ex && x <= ex.x) { portalUsed[ex.id] = true; r.exitId = -1; r.dir = 1; r.immuneUntil = elapsed + IMMUNE_MS; r.bestX = x; r.hopBaseX = x; r.progressAt = elapsed; r.stallStreak = 0; portalEvent(r, 'x', 0, ex.id); return; }
    }
    growLogic(r, P, x);
    if (x === lx) return;
    for (const q of P) {
      if (q.kind === 'grow' || q.kind === 'big') continue;   // gestiti da growLogic (la taglia segue la posizione dentro l'anello)
      if (portalUsed[q.id]) continue;   // già consumato: da chiunque, spariscono per tutti
      if (q.kind !== 'exit' && elapsed < r.immuneUntil) continue;   // immune: ci passa attraverso, il portale resta per gli altri
      if ((lx - q.x) * (x - q.x) > 0 || (lx === q.x && x === q.x)) continue;
      if (q.kind !== 'exit' && overPortal(r, q)) continue;   // scavalcato col salto: il portale resta lì (per chi lo vuole prendere)
      if (q.kind === 'shift') {
        let d = 150 + Math.random() * 250; if (Math.random() < 0.5) d = -d;
        if (!Terrain.landOk(x + d)) d = -d; if (!Terrain.landOk(x + d)) continue;
        portalUsed[q.id] = true; teleport(r, d); r.lx = r.chassis.position.x;
        r.immuneUntil = elapsed + IMMUNE_MS;
        r.bestX = r.dir * r.chassis.position.x; r.hopBaseX = r.bestX; r.progressAt = elapsed; portalEvent(r, 's', d, q.id);
      } else if (q.kind === 'mirror') {
        if (r.dir !== 1) continue;
        portalUsed[q.id] = true; r.dir = -1; r.exitId = q.exit;   // l'uscita è solo di chi ha preso questo specchio
        r.bestX = -x; r.hopBaseX = -x; r.progressAt = elapsed; r.stallStreak = 0; portalEvent(r, 'm', 0, q.id);
      } else if (q.kind === 'exit') {
        if (r.dir !== -1 || r.exitId !== q.id) continue;
        portalUsed[q.id] = true; r.exitId = -1; r.dir = 1; r.immuneUntil = elapsed + IMMUNE_MS;
        r.bestX = x; r.hopBaseX = x; r.progressAt = elapsed; r.stallStreak = 0; portalEvent(r, 'x', 0, q.id);
      }
    }
  }

  // ---- portale gigante: la ruota cresce (o torna normale) un po' alla volta, con la stessa forma ----------------------------------
  const GROW = 2.2, GROW_STEP = 0.14, GROW_MS = 30, GROW_HW = 45, BIG_HW = 110;   // mezze larghezze dei due anelli (il grande è 1,75 volte più largo)
  function scaleStep(r, elapsed) {
    const dd = Math.abs(r.sc - r.scT);
    if (dd < 0.001 || (dd < 0.02 && r.scT > 1.001 && r.scT < GROW - 0.001) || elapsed - r.scAt < GROW_MS) return;   // (fra un gradino e l'altro non si ricostruisce per variazioni minime)
    const d = r.scT - r.sc, st = Math.sign(d) * Math.min(GROW_STEP, Math.abs(d));
    r.sc = Math.abs(r.scT - (r.sc + st)) < 0.002 ? r.scT : r.sc + st; r.scAt = elapsed;
    // la bici cresce tutta insieme: gli attacchi delle ruote si allontanano in proporzione (altrimenti due ruote giganti si sovrapporrebbero) e,
    // crescendo, si alza tutta (la ruota più grande non deve affondare nel terreno)
    const ca = Math.cos(r.chassis.angle), sa = Math.sin(r.chassis.angle);
    if (st > 0) for (const b of [r.chassis, r.fw, r.rw]) Matter.Body.translate(b, { x: 0, y: -80 * st });
    Matter.Body.translate(r.fw, { x: 80 * st * ca, y: 80 * st * sa }); Matter.Body.translate(r.rw, { x: -80 * st * ca, y: -80 * st * sa });
    // gli attacchi sono più lontani dal centro del telaio: con la sua inerzia di prima i vincoli rigidi lo farebbero esplodere (leva troppo lunga)
    if (r.chI0 === undefined) r.chI0 = r.chassis.inertia;
    Matter.Body.setInertia(r.chassis, r.chI0 * r.sc * r.sc);
    rebuildWheel(r, 'fw', r.mF); rebuildWheel(r, 'rw', r.mR);
    r.dF = r.dR = false;
  }

  // Antiribaltamento: la bici si rimette in piedi da sola, in poco tempo, in volo come a terra. Interviene quando il telaio è inclinato oltre FLIP_A0 (≈43°; la guida
  // normale resta sotto, quindi non cambia) o quando STA per arrivarci: l'angolo previsto tiene conto di quanto in fretta ruota (impennata che sale, giro in volo).
  // L'angolo è "avvolto": a testa in giù la strada più breve per tornare su è quella giusta. Non teletrasporta nulla e non tocca le ruote.
  const FLIP_A0 = 0.75, FLIP_MAXW = 0.16, FLIP_LOOK = 8;
  function antiFlip(r) {
    // In volo lasciamo ruotare il telaio liberamente: la correzione preventiva
    // del ribaltamento si applica soltanto vicino al terreno, mai a meta' salto.
    if(r.fw.gapNow>24 && r.rw.gapNow>24)return;
    const ch = r.chassis, TAU = Math.PI * 2;
    const a = ch.angle - TAU * Math.round(ch.angle / TAU), m = Math.abs(a);
    const w = Matter.Body.getAngularVelocity(ch);
    const s = (m < 0.15 ? w : a) >= 0 ? 1 : -1;                        // verso in cui si sta inclinando (o ruotando, se è ancora dritta)
    const eff = m + FLIP_LOOK * Math.max(0, w * s);                       // angolo fra ~8 passi (0,13 s) se continua a ruotare così
    if (eff <= FLIP_A0) return;
    const ex = Math.min(eff - FLIP_A0, 1.6);
    const target = -s * Math.min(FLIP_MAXW, 0.02 + 0.1 * ex);           // rad per passo a 60 Hz, verso la posizione in piedi
    const gain = Math.min(0.8, 0.15 + 0.45 * ex);                         // quanto in fretta ci si arriva
    Matter.Body.setAngularVelocity(ch, w + (target - w) * gain);
  }
  // Ribaltata davvero (a testa in giù da più di FLIP_HARD_MS): la bici intera ruota rigida attorno al telaio fino a tornare in piedi, in circa un terzo di secondo,
  // alzandosi un poco perché le ruote non finiscano nel terreno. Corpo e ruote restano alla distanza giusta, quindi gli assi non si deformano.
  const FLIP_HARD = 1.9, FLIP_END = 0.45, FLIP_HARD_STEPS = 3, FLIP_RATE = 0.2, FLIP_LIFT = 5;
  function rightBike(r) {
    // La rimessa in piedi forzata e' una protezione estrema, non un assist
    // d'assetto a mezz'aria. Aspettiamo il contatto con il terreno.
    if(!r.righting && r.fw.gapNow>26 && r.rw.gapNow>26){r.flipN=0;return false;}
    const ch = r.chassis, TAU = Math.PI * 2;
    const a = ch.angle - TAU * Math.round(ch.angle / TAU);
    if (r.righting) { if (Math.abs(a) < FLIP_END) { r.righting = false; r.flipN = 0; return false; } }   // già in manovra: si va avanti fino a quasi in piedi
    else {
      if (Math.abs(a) < FLIP_HARD) { r.flipN = 0; return false; }
      if ((r.flipN = (r.flipN || 0) + 1) < FLIP_HARD_STEPS) return false;
      r.righting = true;
    }
    const d = -(a > 0 ? 1 : -1) * Math.min(FLIP_RATE, Math.abs(a)), c = Math.cos(d), sn = Math.sin(d), px = ch.position.x, py = ch.position.y;
    for (const b of [r.fw, r.rw]) {
      const dx = b.position.x - px, dy = b.position.y - py;
      Matter.Body.setPosition(b, { x: px + dx * c - dy * sn, y: py + dx * sn + dy * c - FLIP_LIFT });
    }
    Matter.Body.setPosition(ch, { x: px, y: py - FLIP_LIFT });
    Matter.Body.setAngle(ch, ch.angle + d);
    for (const b of [ch, r.fw, r.rw]) Matter.Body.setVelocity(b, { x: b.velocity.x * 0.6, y: Math.min(0, b.velocity.y) * 0.6 });
    Matter.Body.setAngularVelocity(ch, 0);
    return true;
  }

  // ---- Salto (comando del giocatore) ---------------------------------------------------------------------------------------------
  // Un colpo verso l'alto a bici e ruote insieme. Funziona solo con almeno una ruota vicino al suolo (niente doppi salti in aria)
  // e con una pausa fra un salto e l'altro, così non si "vola" tenendo premuto. Le ruote giganti saltano un po' più forte.
  const JUMP_V = 14.4;         // V36: meno verticalita' a velocita' di gara, parabola piu' tesa e piu' avanzamento
  // V36: una bici in movimento traduce parte della velocita' di corsa in
  // slancio orizzontale al salto. Un mezzo fermo non viene trascinato avanti;
  // il motore/collisioni continuano a decidere chi arriva veloce alla rampa.
  const JUMP_FORWARD_MIN = 1.4, JUMP_FORWARD_MAX = 2.8, RAMP_FORWARD_MAX = 1.65;
  const JUMP_GAP = 27;       // px: distanza massima dal suolo per poter saltare (un attimo di tolleranza dopo un dosso)
  const JUMP_COOLDOWN = 440; // ms
  const JUMP_RISE_CAP = 2.8; // V36: tetto verticale piu moderato, evita razzi quando si salta su una rampa
  const DJ_MIN_MS = 130;     // doppio salto: un secondo salto in aria, non prima di tanto dal primo
  const DJ_POWER = 0.95;     // e un filo meno potente
  const PORTAL_SKIP_H = 34; // px: si scavalca un portale se il fondo delle ruote passa a quest'altezza dal suolo o più (un salto ben tempestivo arriva a ~128, il doppio salto a ~225); l'anello è alto 2·PORTAL_RY + 3
  const JUMP_BUF_MS = 330;   // un tocco "troppo presto" (pausa dopo un salto, doppio salto prematuro, atterraggio imminente) viene ricordato e parte appena si può
  const COYOTE_MS = 170;     // tolleranza al labbro senza fermare mai il tempo della gara
  const RAMP_LATE_MS = 155;  // un tap appena dopo il labbro integra lo stacco, non diventa un doppio salto differito
  function jumpTry(r, elapsed) {
    const grounded = r.fw.gapNow <= JUMP_GAP || r.rw.gapNow <= JUMP_GAP;
    // A launch-edge tap that arrives a handful of frames late is part of the
    // same takeoff. Without this check, the buffered tap becomes a delayed
    // DOUBLE jump, producing an unnatural high parabola and punishing latency.
    // One small bounded correction only; it consumes the aerial tap for this
    // flight and does not change physics time or translate the bike.
    const lateRampTap = !grounded && r.airJ === 1 && r.rampLaunched &&
      !r.rampInputUsed && elapsed - (r.rampTakeoffAt ?? -1e9) <= RAMP_LATE_MS;
    if (lateRampTap) {
      const speed = Math.max(0, r.chassis.velocity.x);
      const target = -Math.min(13.4, 9.5 + speed * .45);
      // A late, well-timed tap extends the actual ramp flight forward as
      // well as upward. The bonus is bounded and can only apply once.
      const forwardBoost = speed > 3 ? Math.min(1.25, .16 * (speed - 3) + .32) : 0;
      for (const b of [r.chassis,r.fw,r.rw]) {
        Matter.Body.setVelocity(b, {x:b.velocity.x + (r.dir||1)*forwardBoost,
          y:Math.min(b.velocity.y,target)});
      }
      r.rampInputUsed = true; r.rampFly = 0; r.airJ = 2;
      r.jumpAt = elapsed; r.jn = (r.jn||0)+1;
      r.ln = (r.ln||0)+1; r.ls = 3;
      return 1;
    }
    if (grounded) r.lastGroundAt = elapsed;
    const coyote = !grounded && r.airJ === 0 && elapsed - (r.lastGroundAt || 0) < COYOTE_MS;
    let ok = false;
    if (grounded || coyote) ok = elapsed - r.jumpAt >= JUMP_COOLDOWN;
    else ok = r.airJ === 1 && elapsed - r.jumpAt >= DJ_MIN_MS;   // in aria: solo il secondo salto, e solo dopo uno da terra
    if (!ok) return 0;
    const air = !(grounded || coyote);
    let v = JUMP_V * Math.pow(r.sc || 1, 0.4) * (air ? DJ_POWER : 1);
    r.rampFly = 0; r.rampLaunched = false; r.rampGroundTicks = 0; // il salto manuale prende il comando
    // da terra: spinta sopra la velocità verticale attuale; in aria (doppio salto): la velocità verso l'alto diventa almeno v, SENZA sommarsi a quella che c'è
    // già (sommate, un secondo tocco ravvicinato lanciava la bici altissima, soprattutto con le ruote giganti)
    // Rovi tesi dell'Inferno: una fionda VISIBILE e a comando, non una raffica invisibile.
    // Il salto dalla prima riva raggiunge l'isolotto; quello sull'isolotto arriva alla riva opposta.
    // Chi non salta continua invece ad attraversare il lago dal basso, nella lava.
    let thorn = null;
    if (!air && (r.dir || 1) === 1) {
      const z = Terrain.zoneAt(r.chassis.position.x);
      if (z && z.gap && z.gap.damned && z.thorns) {
        for (const pad of [z.thorns.left, z.thorns.midR]) {
          const distance = Math.abs(r.chassis.position.x - pad.x);
          if (distance < pad.width * 0.5 + 27) { thorn = pad; break; }
        }
      }
    }
    // V27.2: jumping higher alone did not help a bike that had already slowed
    // against a mass or moving obstacle.  When a solid obstacle is immediately
    // ahead, carry a modest FORWARD launch speed into the jump, keeping all
    // three bodies together.  Regular jumps and jumps at full speed are unchanged.
    const dir = r.dir || 1;
    const px = r.chassis.position.x;
    const ahead = !air && [...(Terrain.INTERACTIVE_OBSTACLES || []), ...(Terrain.DYNAMIC_OBSTACLES || [])]
      .some(o => { const d = (o.x - px) * dir; return d >= -70 && d <= 340; });
    const forward = Math.max(0, dir * r.chassis.velocity.x);
    // V32: il premio è VOLONTARIO. Il salto al labbro con una corsa
    // abbastanza veloce dà una traiettoria appena più lunga, non un volo
    // automatico arbitrario. Vale anche per le rampe ritmiche del bioma.
    const takeoff = !air && dir===1 && !thorn && Terrain.takeoffAt
      ? Terrain.takeoffAt(r.fw.position.x, 100, 20) : null;
    const distance=takeoff?(takeoff.lip-r.fw.position.x):1e9;
    const perfect=!!takeoff&&forward>=3.8&&distance>=-12&&distance<=72;
    // Sweet spot at the same distance indicated by the lone golden arrow.
    const quality=perfect?Math.max(0,1-Math.abs(distance-42)/58):0;
    if(perfect) v*=1+.05+.04*quality;
    // V36: A FAST jump needs a forward arc, not a vertical rocket. The kick
    // grows with the speed actually earned on the ground and is shared by
    // all three bike bodies to avoid stretching the axle constraints.
    // Slow/stationary attempts still stay slow: no free race-length boosts.
    const runningKick = !air && forward > 2
      ? Math.min(JUMP_FORWARD_MAX, Math.max(JUMP_FORWARD_MIN, .45+.36*forward)) : 0;
    const obstacleRecovery = ahead && !air
      ? Math.min(2.0,Math.max(0,4.8-forward)) : 0;
    const lipBonus = perfect ? Math.min(1.15,.16*forward+.12*quality) : 0;
    const launchDx = air ? 0 : Math.min(3.7, runningKick + obstacleRecovery + lipBonus);
    for (const b of [r.chassis, r.fw, r.rw]) {
      const riseCap = takeoff ? 1.4 : JUMP_RISE_CAP;
      let vx = b.velocity.x + dir * launchDx,
        vy = air ? Math.min(b.velocity.y, -v)
          : Math.max(-(v + riseCap), Math.min(b.velocity.y, 0) - v);
      if (thorn) { vx = Math.max(vx, 16.0); vy = Math.min(vy, -29.0); }
      Matter.Body.setVelocity(b, { x: vx, y: vy });
    }
    if (thorn) { r.ln = (r.ln || 0) + 1; r.ls = 2; } // stessa animazione di un grande lancio
    if (perfect) { r.ln=(r.ln||0)+1; r.ls=3; } // conferma client: salto al labbro, non input presunto
    r.jumpGraceUntil = elapsed + 350; r.jumpAt = elapsed; r.jn = (r.jn || 0) + 1; r.airJ = air ? 2 : 1; if (air) r.ja = (r.ja || 0) + 1;
    return 1;
  }
  function sprintStep(r) {
    if (r.spOn) { r.spT -= TICK_MS; r.spCharge = Math.max(0, r.spT / SPRINT_MS) * 0.999; if (r.spT <= 0) { r.spOn = false; r.spCharge = 0; } }
    else if (r.spCharge < 1) r.spCharge = Math.min(1, r.spCharge + TICK_MS / SPRINT_RECHARGE_MS);
  }
  function sprint(id) {
    const r = racers[id]; if (!r || !running || r.finished || r.righting || r.spOn || r.spCharge < 1) return false;
    if (performance.now() - startedAt < 400) return false;
    r.spOn = true; r.spT = SPRINT_MS; return true;
  }
  function jump(id) {
    const r = racers[id]; if (!r || !running || r.finished || r.righting) return false;
    const elapsed = performance.now() - startedAt;
    if (elapsed < 400) return false;
    if (jumpTry(r, elapsed)) { r.jBuf = 0; return true; }
    // rifiutato: se non è un secondo salto già fatto, lo ricordo per un attimo
    if (r.airJ !== 2 || r.fw.gapNow <= JUMP_GAP || r.rw.gapNow <= JUMP_GAP) r.jBuf = elapsed;
    return false;
  }

  // V27.3: nessuna velocita' minima forzata in salita, nessun lancio
  // aggiunto al labbro. L'unico sistema di recupero rimane l'anti-blocco
  // generale, con diagnostica: la rampa non teletrasporta piu' la bici.
  const RAVINE_ASSIST_MS = 1900, RAVINE_RESCUE_MS = 6500;
  function ravineStep(r, elapsed) {
    const p=Terrain.ravineAt?Terrain.ravineAt(r.chassis.position.x):null;
    if(!p){r.pitAt=-1;r.pitBoostAt=-1e9;return;}
    const rim=Terrain.height(p.a+p.u2+p.rr+10);
    const low=GROUND_Y-Math.max(r.fw.bounds.max.y,r.rw.bounds.max.y);
    if(low>=rim-p.D*.55){r.pitAt=-1;return;}
    if(!(r.pitAt>=0)){r.pitAt=elapsed;r.pitBoostAt=-1e9;return;}
    // If trapped below a lip, a small continuous rescue gives the tyres a
    // chance to climb the new, gentler exit slope without teleporting.
    const trappedFor=elapsed-r.pitAt;
    if(trappedFor>RAVINE_ASSIST_MS&&elapsed-r.pitBoostAt>1350&&
       r.chassis.velocity.x<2.8&&
       Math.min(r.fw.gapNow,r.rw.gapNow)<22){
      for(const body of [r.chassis,r.fw,r.rw])
        Matter.Body.setVelocity(body,{x:Math.max(3.8,body.velocity.x),y:Math.min(-7.3,body.velocity.y)});
      r.pitBoostAt=elapsed;
    }
    if(trappedFor<RAVINE_RESCUE_MS)return;
    // Absolute multiplayer safeguard, only after several failed climbs.
    const dir=r.dir||1,tx=dir===1?p.a+p.u2+p.rr+70:p.a+p.s-120;
    teleport(r,tx-r.chassis.position.x);
    Matter.Body.setAngle(r.chassis,0);
    {const c=r.chassis.position,k=80*(r.sc||1);
     Matter.Body.setPosition(r.fw,{x:c.x+k,y:c.y});
     Matter.Body.setPosition(r.rw,{x:c.x-k,y:c.y});}
    for(const body of [r.chassis,r.fw,r.rw]){
      Matter.Body.setVelocity(body,{x:0,y:0});Matter.Body.setAngularVelocity(body,0);
    }
    r.lx=r.chassis.position.x;r.pitAt=-1;r.bestX=dir*tx;
    r.hopBaseX=dir*tx;r.progressAt=elapsed;r.stallStreak=0;
  }

  // V32: the lip is determined by procedural geometry, including kicker,
  // jump, ravine, halfpipe, gapland and nested twin / drop-in ramps.
  // Only the authoritative host applies a bounded takeoff vector when
  // crossing the actual lip with grounded wheels. The horizontal component
  // inherits the approaching speed; the vertical one follows the lip slope.
  // Neither the game clock nor body positions are touched.
  const RAMP_KINDS=new Set(['kicker','jump','ravine','pipe','gapland','wave']);
  function rampStep(r,elapsed){
    const fx=r.fw.position.x,previous=r.rfx;
    r.rfx=fx;
    if(r.rampFly>0){
      r.rfT=(r.rfT||0)+1;
      const frontAir=r.fw.gapNow>12, rearAir=r.rw.gapNow>12;
      const airborne=frontAir&&rearAir;
      if(!r.rampLaunched&&airborne&&!r.airJ){
        r.rampLaunched=true;
        r.rampTakeoffAt=elapsed;
        r.rampInputUsed=false;
        r.airJ=1;r.jumpAt=elapsed;
        r.ln=(r.ln||0)+1;r.ls=r.rampSmall?1:2;
      }
      // V35: a launch may leave only the FRONT wheel airborne for several
      // ticks while the rear still follows the ramp. Do not unlock that real
      // takeoff prematurely. But if BOTH wheels stayed on the surface, the
      // ramp only caused a short bump: re-arm promptly for the next lip.
      r.rampGroundTicks=(!frontAir&&!rearAir)?(r.rampGroundTicks||0)+1:0;
      const missedTakeoff=!r.rampLaunched&&r.rampGroundTicks>=6;
      const landed=r.rampLaunched&&!airborne&&r.rfT>=8;
      const stale=r.rfT>(r.rampLaunched?75:54);
      if(missedTakeoff||landed||stale){
        if(!airborne&&r.rampLaunched&&r.airJ===1)r.airJ=0;
        r.rampFly=0;r.rampLaunched=false;r.rampGroundTicks=0;
      } else return;
    }
    if(previous===undefined||(r.dir||1)!==1||r.airJ||r.righting)return;
    const lipInfo=Terrain.takeoffAt?Terrain.takeoffAt(fx,80,70):null;
    if(!lipInfo||!RAMP_KINDS.has(lipInfo.kind))return;
    const lip=lipInfo.lip;
    if(!(previous<lip&&fx>=lip))return;
    const speed=Math.max(0,r.chassis.velocity.x);
    const grounded=Math.min(r.fw.gapNow,r.rw.gapNow)<32;
    const big=lipInfo.kind==='pipe'||lipInfo.kind==='ravine'||lipInfo.kind==='gapland'||lipInfo.tier>=1;
    // Ramp geometry supplies the energy. The bounded impulse follows the
    // current forward speed and the lip slope, so quick approaches fly farther
    // and odd-shaped wheels keep their real traction penalties.
    // Do not change game time or force orientation; no slow motion.
    const assisted=speed>3.7&&grounded;
    if(assisted){
      const slope=Math.max(.24,Math.min(.82,Math.sin(Math.abs(lipInfo.th||.30))));
      // A fast, steep ramp generates a long, shallow-ish forward parabola.
      // Small ramps pop gently; big ravines give more flight time. This is a
      // single takeoff impulse, not mid-air steering or a scripted trajectory.
      const lift=3.8+(big?1.0:0)+speed*slope*(big?1.95:1.8);
      const launchY=-Math.min(big?11.5:9.0,lift);
      const forwardKick=Math.min(big?RAMP_FORWARD_MAX:1.15,
        Math.max(0,(speed-3.7)*.35)+slope*1.1);
      for(const body of [r.chassis,r.fw,r.rw]){
        Matter.Body.setVelocity(body,{x:body.velocity.x+forwardKick,
          y:Math.min(body.velocity.y,launchY)});
      }
    }
    // No artificial "ramp flight" state when a slow wheel merely rolls over
    // a lip. That state suppresses ground stabilisation and can cause a stall.
    const naturallyAirborne=r.fw.gapNow>12&&r.rw.gapNow>12;
    if(!assisted&&!naturallyAirborne)return;
    r.rampFly=1;r.rampLaunched=false;
    r.rampSmall=!big;r.rfT=0;r.rampGroundTicks=0;
  }

  // V35: detect genuine landings from the *solved* wheel contacts, not from
  // input presses or predicted arcs. One event per flight; host publishes only
  // a tiny integer counter/intensity for all clients to draw local dust.
  // No extra force, no slowdown and no changes to authoritative trajectory.
  function landingStep(r){
    if(r.finished)return;
    const f=r.fw.gapNow, b=r.rw.gapNow;
    if(!Number.isFinite(f)||!Number.isFinite(b))return;
    const bothAir=f>24&&b>24;
    if(bothAir){
      r.flightTicks=Math.min(300,(r.flightTicks||0)+1);
      if(r.flightTicks>=5)r.flightArmed=true;
      return;
    }
    if(!(r.flightArmed)){
      r.flightTicks=0;return;
    }
    if(Math.min(f,b)>13)return;
    const downward=Math.max(0,r.fw.velocity.y,r.rw.velocity.y,r.chassis.velocity.y);
    const vX=Math.abs(r.chassis.velocity.x);
    if(downward>=2.6 && vX>=.6){
      r.landHits=(r.landHits||0)+1;
      r.landPower=Math.min(3,Math.max(1,Math.round((downward-1.5)/3.5)));
    }
    r.flightArmed=false;r.flightTicks=0;
  }

  // Correnti del Paradiso e geyser dell'Inferno: vengono applicati solo dall'host,
  // quindi restano sincronizzati con la simulazione autoritativa già esistente.
  function worldEffectStep(r, elapsed) {
    const bodies = [r.chassis, r.fw, r.rw], x = r.chassis.position.x;
    const segment = Terrain.WORLD_SEGMENT;
    const world = segment && x >= segment.start && x <= segment.end ? segment.world : Terrain.WORLD;
    if (world === 'paradise') {
      let lift = 0;
      for (const q of Terrain.UPDRAFTS) {
        const k = 1 - Math.abs(x - q.x) / (q.width * 0.5);
        if (k > lift) lift = k;
      }
      if (lift > 0 && r.chassis.position.y > GROUND_Y - 290) {
        const impulse = 0.12 * Math.min(1, lift);
        for (const b of bodies) Matter.Body.setVelocity(b, { x: b.velocity.x, y: Math.max(-6.5, b.velocity.y - impulse) });
      }
      // Nessun anello boost: la verticalità del Paradiso è ora data dalle nubi
      // e dalle pedane reattive, con punti d'appoggio fisici riconoscibili.
      r.cloudPadHits = r.cloudPadHits || {};
      for (const q of Terrain.CLOUD_PADS) {
        const near = Math.abs(x - q.x) < q.width * 0.5;
        if (!near) { r.cloudPadHits[q.id] = false; continue; }
        if (!r.cloudPadHits[q.id] && (r.fw.gapNow < 22 || r.rw.gapNow < 22)) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(b.velocity.y, -q.power) });
          r.cloudPadHits[q.id] = true;
        }
      }
    } else if (world === 'inferno') {
      // Raffiche pulsanti, anticipate da una scia visibile per 0,85 s.
      // Non bloccano una bici già lenta: chi è in difficoltà non resta intrappolato.
      for (const q of Terrain.ASH_GUSTS) {
        const phase = ((elapsed / 1000 + q.phase) % q.period + q.period) % q.period;
        if (phase < q.burst && Math.abs(x - q.x) < q.width * 0.5 &&
            (r.fw.gapNow < 45 || r.rw.gapNow < 45) && r.chassis.velocity.x > 3.2) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: Math.max(3.0, b.velocity.x - q.drag), y: b.velocity.y });
        }
      }
      r.geyserHits = r.geyserHits || {};
      const t = elapsed / 1000;
      for (const q of Terrain.GEYSERS) {
        const phase = ((t + q.phase) % q.period + q.period) % q.period;
        const active = phase < q.burst;
        if (!active) { r.geyserHits[q.id] = false; continue; }
        if (!r.geyserHits[q.id] && Math.abs(x - q.x) < q.width * 0.5 && (r.fw.gapNow < 28 || r.rw.gapNow < 28)) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(b.velocity.y, -q.power) });
          r.geyserHits[q.id] = true;
        }
      }
    } else if (world === 'atlantis') {
      // Correnti percepibili solo nel canale: spingono avanti chi mantiene la linea
      // bassa, controbilanciando l'attrito dell'acqua senza creare teletrasporti.
      for (const q of Terrain.TIDAL_CURRENTS) {
        const phase = ((elapsed / 1000 + q.phase) % q.period + q.period) % q.period;
        if (phase < q.burst && Math.abs(x - q.x) < q.width * 0.5 && Terrain.isWater(x)) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: Math.min(9.5, b.velocity.x + q.push), y: b.velocity.y });
        }
      }
      r.bubbleVentHits = r.bubbleVentHits || {};
      for (const q of Terrain.BUBBLE_VENTS) {
        const near = Math.abs(x - q.x) < q.width * 0.5;
        if (!near) { r.bubbleVentHits[q.id] = false; continue; }
        if (!r.bubbleVentHits[q.id] && (r.fw.gapNow < 30 || r.rw.gapNow < 30)) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(b.velocity.y, -q.power) });
          r.bubbleVentHits[q.id] = true;
        }
      }
    } else if (world === 'enchanted') {
      r.mushroomHits = r.mushroomHits || {};
      for (const q of Terrain.CLOUD_PADS) {
        const near = Math.abs(x - q.x) < q.width * 0.5;
        if (!near) { r.mushroomHits[q.id] = false; continue; }
        if (!r.mushroomHits[q.id] && (r.fw.gapNow < 24 || r.rw.gapNow < 24)) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: b.velocity.x, y: Math.min(b.velocity.y, -q.power) });
          r.mushroomHits[q.id] = true;
        }
      }
    } else if (world === 'neon') {
      // Shutter laser temporizzati: saltando abbastanza in alto non si prende il
      // rallentamento. Una sola penalità per attraversamento, mai blocco totale.
      r.neonGateHits = r.neonGateHits || {};
      for (const q of Terrain.NEON_GATES) {
        const near = Math.abs(x - q.x) < q.width * 0.5;
        if (!near) { r.neonGateHits[q.id] = false; continue; }
        const phase = ((elapsed / 1000 + q.phase) % q.period + q.period) % q.period;
        if (phase < q.burst && !r.neonGateHits[q.id] &&
            (r.fw.gapNow < 36 || r.rw.gapNow < 36) && r.chassis.velocity.x > 3.0) {
          for (const b of bodies) Matter.Body.setVelocity(b, { x: Math.max(2.8, b.velocity.x * q.slow), y: b.velocity.y });
          r.neonGateHits[q.id] = true;
        }
      }
      r.neonBoostHits = r.neonBoostHits || {};
      for (const q of Terrain.NEON_BOOSTS) {
        const near = Math.abs(x - q.x) < q.width * 0.5;
        if (!near) { r.neonBoostHits[q.id] = false; continue; }
        if (!r.neonBoostHits[q.id] && (r.fw.gapNow < 24 || r.rw.gapNow < 24)) {
          const vx = Math.min(15.5, Math.max(0, r.chassis.velocity.x) + q.boost);
          for (const b of bodies) Matter.Body.setVelocity(b, { x: vx, y: b.velocity.y - 0.18 });
          r.neonBoostHits[q.id] = true;
        }
      }
    }
  }

  // Antico Egitto — maledizione permanente per la gara corrente.
  // Una benda che colpisce DAVVERO la ruota posteriore comprime il profilo
  // Matter in dieci stadi: raggiunto il triangolo, resta cosi' fino al traguardo.
  // La partita successiva ricrea la ruota originale in addRacer().
  const CURSE_RISE_MS=900;
  function egyptCurseStep(r,clockMs){
    const segment=Terrain.WORLD_SEGMENT;
    const inEgypt=segment&&segment.world==='egypt'&&r.chassis.position.x>=segment.start-250&&r.chassis.position.x<=segment.end+300;
    if(inEgypt && r.curseAt<0){
      for(const mummy of Terrain.EGYPT_MUMMIES){
        if(Math.abs(mummy.x-r.rw.position.x)>405)continue;
        let caught=false;
        for(const dir of [-1,1]){
          if(!EgyptWorld.detects(mummy,r,dir))continue;
          const projectile=EgyptWorld.shot(mummy,clockMs,dir);
          if(!projectile)continue;
          const shotNo=Math.floor((clockMs/1000+mummy.phase)/mummy.period);
          const hitKey=mummy.id+':'+dir;
          if(r.curseHits[hitKey]===shotNo)continue;
          // Projectile must hit the *actual rear wheel*, not merely the bike.
          const dx=projectile.x-r.rw.position.x,dy=projectile.y-r.rw.position.y;
          if(dx*dx/(55*55)+dy*dy/(51*51)>1)continue;
          r.curseHits[hitKey]=shotNo;
          caught=true;break;
        }
        if(!caught)continue;
        r.curseAt=clockMs;
        break;
      }
    }
    if(r.curseAt<0)return;
    // Anche dopo l'uscita dall'Egitto il tempo continua, ma l'effetto
    // non diminuisce: 0 → 10 stadi, poi triangolo e bende permanenti.
    const age=Math.max(0,clockMs-r.curseAt);
    const level=Math.min(1,age/CURSE_RISE_MS);
    const stage=Math.round(level*10);
    if(stage!==r.curseStage){
      r.curseStage=stage;
      r.curseLevel=stage/10;
      rebuildWheel(r,'rw',r.mR);
    }
  }

  function stepRacer(r, elapsed) {
    if (r.finished) return;

    driveRacer(r, elapsed, true);
    meltStep(r, elapsed);
    egyptCurseStep(r,obstacleClockMs);
    scaleStep(r, elapsed);
    if (!rightBike(r)) antiFlip(r);
    if (r.jBuf) { if (elapsed - r.jBuf > JUMP_BUF_MS) r.jBuf = 0; else if (jumpTry(r, elapsed)) r.jBuf = 0; }
    else if (r.fw.gapNow <= JUMP_GAP || r.rw.gapNow <= JUMP_GAP) r.lastGroundAt = elapsed;
    if (r.airJ && elapsed - r.jumpAt > 150 && (r.fw.gapNow <= JUMP_GAP || r.rw.gapNow <= JUMP_GAP)) r.airJ = 0;   // atterrata: il doppio salto si ricarica
    checkPortals(r, elapsed);
    ravineStep(r, elapsed);
    rampStep(r, elapsed);
    sprintStep(r);
    worldEffectStep(r, elapsed);

    // progress = furthest x reached IN THE DIRECTION OF TRAVEL (dir·x); if it hasn't improved enough for STALL_MS, hop
    const dir = r.dir || 1, px = dir * r.chassis.position.x;
    if (px > r.bestX + STALL_MIN_PROGRESS) {
      r.bestX = px;
      r.progressAt = elapsed;
      if (px > r.hopBaseX + 250) r.stallStreak = 0; // reset only after real driving
    } else {
      const stalledFor = elapsed - r.progressAt;
      // Intervene before the last-resort teleport only if the bike is almost
      // stationary and actually touching ground. Do not restart the stall clock.
      if (stalledFor > CORNER_RELEASE_MS && stalledFor < STALL_MS) releaseCorner(r, elapsed);
      if (stalledFor > STALL_MS &&
          !(Terrain.ravineAt && Terrain.ravineAt(r.chassis.position.x))) {
        unstick(r);
        r.progressAt = elapsed;
      }
    }

    if (Terrain.isLava && (Terrain.isLava(r.fw.position.x) || Terrain.isLava(r.rw.position.x))) {
      // la lava frena solo per quanto le ruote sono davvero immerse (non per tutta la conca): altrimenti l'uscita in salita si trasforma in una trappola
      let f = 0;
      for (const w of [r.fw, r.rw]) {
        const wx = w.position.x; if (!Terrain.isLava(wx)) continue;
        const dep = w.bounds.max.y - (GROUND_Y - Terrain.lavaLevel(wx)); if (dep > 0) f += Math.min(1, dep / 24) * 0.5;
      }
      if (f > 0) { const k = 1 - (1 - LAVA_DRAG) * f; Matter.Body.setVelocity(r.chassis, { x: r.chassis.velocity.x * k, y: r.chassis.velocity.y * k }); }
    }
    if (isWater(r.chassis.position.x)) {
      const seg = Terrain.WORLD_SEGMENT;
      const atl = seg && seg.world === 'atlantis' && r.chassis.position.x >= seg.start && r.chassis.position.x < seg.end;
      // Atlantide: acqua bassa, attraversabile anche con ruote non tonde.
      // L'acqua delle altre zone mantiene il drag originale.
      const drag = atl ? 0.982 : 0.94;
      Matter.Body.setVelocity(r.chassis, {
        x: r.chassis.velocity.x * drag,
        y: r.chassis.velocity.y * drag
      });
    }

    if (dir === 1 && r.chassis.position.x >= Terrain.FINISH_X) {
      r.finished = true;
      r.finishTime = elapsed;
      if (firstFinishAt === null) firstFinishAt = elapsed;
    }
  }

  // Called with real elapsed ms; physics is sub-stepped at a fixed 60Hz.
  function tick(dtMs) {
    if (!running) return;

    // Preserve fractional physics time across a stalled host frame. V16 discarded
    // the entire remainder after 3 steps, introducing irregular small pauses.
    // Cap total debt so a slow device never enters a spiral of death.
    accumulator = Math.min(FIXED_DT * 3.999, accumulator + Math.max(0, Math.min(dtMs, 100)));
    const elapsed = performance.now() - startedAt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 3) {
      steps++;
      // Same fairness as rotating turns, without allocating/shuffling an array each step.
      const n = racerOrder.length, offset = n ? (raceStepNo++ % n) : 0;
      for (let i = 0; i < n; i++) {
        const r = racerOrder[(i + offset) % n];
        stepRacer(r, elapsed);
        if (!r.finished) assist(r);
      }
      // Muoviamo corpi STATICI con traiettorie continue, una volta per substep.
      // Nessuna collisione fittizia: il solver Matter risolve i contatti con ruote e telaio.
      for (let sub = 0; sub < SUBSTEPS; sub++) {
        // Each fixed physics substep advances the obstacle by the same fixed dt.
        // Multiple catch-up steps no longer push the obstacle to identical positions.
        const nextObstacleTime = obstacleClockMs + FIXED_DT / SUBSTEPS;
        DynamicObstacles.update(nextObstacleTime,racerOrder);
        InteractiveObstacles.beforeStep(nextObstacleTime, racerOrder);
        Matter.Engine.update(engine, FIXED_DT / SUBSTEPS);
        InteractiveObstacles.afterStep(nextObstacleTime, racerOrder);
        obstacleClockMs = nextObstacleTime;
        for (let i = 0; i < n; i++) { const r = racerOrder[i]; antiSink(r.fw); antiSink(r.rw); }
        if(sub===SUBSTEPS-1)for(let i=0;i<n;i++)landingStep(racerOrder[i]);
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
      finished: r.finished, finishTime: r.finishTime,
      dir: r.dir || 1, sc: Math.round((r.sc || 1) * 100) / 100, pe: r.pe || 0, ge: r.ge || 0, gt: r.gt || '', gi: r.gi === undefined ? -1 : r.gi, jn: r.jn || 0, ja: r.ja || 0, ln: r.ln || 0, ls: r.ls || 0, ld: r.landHits || 0, lp: r.landPower || 0, pt: r.pt || '', pd: r.pd || 0, pi: r.pi === undefined ? -1 : r.pi, cu: r.curseLevel || 0, sp: Math.round((r.spCharge === undefined ? 1 : r.spCharge) * 100) / 100, so: r.spOn ? 1 : 0, im: Math.max(0, Math.round((r.immuneUntil || 0) - (performance.now() - startedAt)))
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
    init, addRacer, updateRacerWheel, drainMelts, getAllMeltStates, meltBase, meltVertices, start, tick, calibrate, calibrateSync, prepareAsync, ensureWorld, warmCalibration: calPoolInit, _calTrial: (v, k, ph) => drain(calTrial(v, [k, k, k, k], ph)),
    // Local QA diagnostics only. Never added to network snapshots.
    diagnostics: () => racerOrder.map(r => ({
      id: Object.keys(racers).find(k=>racers[k]===r),
      hops:r.hops||0, rampRescues:r.rampRescues||0, springHits:r.springHits||0,
      lastUnstickX:r.lastUnstickX??null,
      lastUnstickAt:r.lastUnstickAt??null,
      cornerReleases:r.cornerReleases||0,
      stallEvents:(r.stallEvents||[]).slice()
    })),
    snapshot, jump, sprint, allFinished, isTimedOut, standings, GROUND_Y, getElapsed: () => running ? performance.now() - startedAt : 0, getObstacleTime: () => obstacleClockMs, getInteractiveState: () => InteractiveObstacles.snapshot(), obstacleSnapshot:()=>DynamicObstacles.snapshot(), usedPortals: () => Object.keys(portalUsed).map(Number),
    get FINISH_X() { return Terrain.FINISH_X; },
    // ms rimasti agli altri dopo che il primo ha tagliato il traguardo (null = nessuno è arrivato)
    graceLeft() { if (firstFinishAt === null || !running) return null; return Math.max(0, GRACE_BASE_MS + firstFinishAt * GRACE_FRAC - (performance.now() - startedAt - firstFinishAt)); },
  };
})();
