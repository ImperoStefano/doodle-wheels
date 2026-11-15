// node tests/slope-audit.cjs [numero di piste] [seme iniziale]
// Misura i lati superiori dei poligoni costruiti all'ingresso gara.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'js');
const worlds = ['classic', 'paradise', 'inferno', 'atlantis', 'enchanted', 'neon', 'egypt'];
const lengths = [7, 11, 15];
const defaultSeed = 3839;
const trackCount = Number(process.argv[2] ?? 84);
const firstSeed = Number(process.argv[3] ?? defaultSeed);
assert(Number.isSafeInteger(trackCount) && trackCount > 0, 'Il numero di piste deve essere positivo');
assert(Number.isSafeInteger(firstSeed), 'Il seme deve essere un numero intero');
const degrees = grade => Math.atan(grade) * 180 / Math.PI;

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Matter riceve questi quadrilateri prima di triangolazione/risoluzione dei contatti.
// Si usa prepareAsync così corrispondono anche ai tagli da 400 px dell'intro.
let topEdges = [];
const context = vm.createContext({
  Math: Object.create(Math),
  Date: { now: () => 0 },
  DynamicObstacles: { mount() {} },
  InteractiveObstacles: { mount() {} },
  Matter: {
    Engine: { create: () => ({ world: {}, gravity: {} }) },
    Events: { on() {} },
    Body: { nextGroup: () => -1 },
    World: { add() {} },
    Vertices: { centre: () => ({ x: 0, y: 0 }) },
    Bodies: {
      fromVertices(x, y, [quad], options) {
        if (options.label === 'ground') topEdges.push(quad.slice(0, 2));
        return {};
      },
      rectangle: () => ({}),
      circle: () => ({}),
    },
  },
});
context.Math.random = seededRandom(firstSeed);
for (const file of ['terrain.js', 'physics.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}
const T = vm.runInContext('Terrain', context);
const Sim = vm.runInContext('Sim', context);

function uphillLimit(group, name) {
  if (group === 'lancio') return name === 'pipe' ? 40 : 35;
  return name === 'bacino infernale' ? 35 : 32;
}

function featureAt(x, launches) {
  const zone = T.zoneAt(x);
  const launch = launches.find(q => x >= q.start && x <= q.end);
  if (launch) return { group: 'lancio', name: launch.name };
  const active = zone.patches.filter(p => x >= p.a && x <= p.b);
  if (active.length) return { group: 'terreno', name: active[0].kind };
  if (zone.bridge && x >= zone.bridge.start && x <= zone.bridge.end) return { group: 'terreno', name: 'ponte' };
  if (zone.gap && x >= zone.gap.g0 && x <= zone.gap.g1) {
    return { group: 'terreno', name: zone.gap.damned ? 'bacino infernale' : 'bacino ' + zone.key };
  }
  if (T.ROOT_RIDGES.some(q => Math.abs(x - q.x) < q.width / 2)) return { group: 'terreno', name: 'radici' };
  return { group: 'terreno', name: 'base ' + zone.key };
}

const peaks = new Map(), seenLaunchKinds = new Set();
let failingTracks = 0, edgeCount = 0, launchCount = 0, flatLips = 0;
let weakestLip = null;
for (let i = 0; i < trackCount; i++) {
  const seed = firstSeed + i;
  // Il seme da solo riproduce anche le opzioni di lobby stampate nell'errore.
  const period = worlds.length * 2 * lengths.length;
  const slot = ((seed - defaultSeed) % period + period) % period;
  const world = worlds[slot % worlds.length];
  const crazy = Math.floor(slot / worlds.length) % 2 === 1;
  const count = lengths[Math.floor(slot / (worlds.length * 2))];
  context.Math.random = seededRandom(seed);
  const layout = T.generateRandomLayout(count, crazy, null, world);
  T.applyLayout(layout, { world, crazy, np: 2 });
  assert.equal(T.WORLD_SEGMENT?.world ?? T.WORLD, world);
  topEdges = [];
  Sim.prepareAsync();
  assert(topEdges.length > 0, 'Nessun poligono di terreno');
  const launches = T.rampLipsIn(0, T.FINISH_X).map(({ x }) => {
    const q = T.takeoffAt(x, 0, 0);
    assert.equal(q?.lip, x, 'Labbro visibile e decollo fisico discordanti');
    const compound = T.zoneAt(x).patches.find(p => p.r2 && p.a === q.a);
    // Il segnale di salto richiede una salita ancora riconoscibile sotto la ruota.
    const approach = degrees((T.height(x) - T.height(x - 40)) / 40);
    if (!weakestLip || weakestLip.approach > approach) weakestLip = { approach, seed, x, name: q.kind };
    if (approach < 5) flatLips++;
    seenLaunchKinds.add(q.kind);
    return { start: q.a + (q.s || 0), end: q.lip, name: compound ? 'twostage' : q.kind };
  });
  launchCount += launches.length;
  // Il portale specchio si attraversa ritornando verso sinistra fino all'uscita abbinata.
  const reverseSections = T.PORTALS.filter(p => p.kind === 'mirror').map(p => {
    const exit = T.PORTALS.find(other => other.id === p.exit);
    assert(exit && exit.x < p.x, 'Portale specchio senza percorso di ritorno');
    return [exit.x, p.x];
  });
  let failed = false;
  for (const [left, right] of topEdges) {
    const x = (left.x + right.x) / 2;
    if (x < 0 || x > T.FINISH_X) continue;
    const rise = left.y - right.y;
    const run = right.x - left.x;
    assert(run > 0 && Number.isFinite(rise));
    edgeCount++;
    const reverse = rise < 0 && reverseSections.some(([a, b]) => x >= a && x <= b);
    if (rise <= 0 && !reverse) continue;
    const angle = degrees(Math.abs(rise) / run);
    const { group, name } = reverse ? { group: 'specchio', name: T.zoneAt(x).key } : featureAt(x, launches);
    const key = group + '/' + name;
    if (!peaks.has(key) || peaks.get(key).angle < angle) {
      peaks.set(key, { angle, seed, world, crazy, x });
    }
    const limit = uphillLimit(group, name);
    if (angle > limit) failed = true;
  }
  if (failed) failingTracks++;
}

for (const [key, p] of [...peaks].sort(([a], [b]) => a.localeCompare(b))) {
  const over = p.angle > uphillLimit(...key.split('/'));
  console.log(over ? '>' : ' ', key.padEnd(26), p.angle.toFixed(1) + '°', 'seme', p.seed, p.world,
    p.crazy ? 'pazza' : 'normale', 'x=' + p.x);
}
console.log(trackCount, 'piste,', edgeCount, 'segmenti di collisione,', launchCount, 'labbri di lancio.');
if (failingTracks) { console.error(failingTracks, 'piste oltre soglia.'); process.exitCode = 1; }
if (flatLips) {
  console.error(flatLips, 'labbri sotto 5° negli ultimi 40 px. Minimo:', weakestLip);
  process.exitCode = 1;
}
// Se si eliminassero tutte le rampe, le sole soglie massime darebbero comunque esito positivo.
if (trackCount >= 84 && firstSeed === defaultSeed) {
  for (const kind of ['kicker', 'jump', 'ravine', 'gapland', 'pipe', 'wave']) {
    assert(seenLaunchKinds.has(kind), 'Nel campione di riferimento manca il salto ' + kind);
  }
}
