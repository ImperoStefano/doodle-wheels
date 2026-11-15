// Run with: node tests/ghost.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/ghost.js'), 'utf8');
const route = 'classic|normal|classica|ramps-hills-water';

function storage() {
  const data = new Map();
  return {
    data,
    get length() { return data.size; },
    key(i) { return Array.from(data.keys())[i] ?? null; },
    getItem(key) { return data.get(key) ?? null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}

function open(storageArea) {
  const ctx = vm.createContext({console, localStorage:storageArea, window:{localStorage:storageArea}});
  return vm.runInContext(source + '\n;RaceGhost', ctx);
}

function rider(x, pe = 0) {
  return {id:'me', x, y:280, angle:0, fwX:x + 80, fwY:287, fwAngle:x / 32,
    rwX:x - 80, rwY:287, rwAngle:x / 32, pe, sc:1};
}

function race(api, {key = route, ms = 8000, speed = .25, record = true, finished = true} = {}) {
  api.begin(key, record);
  for (let t = 0; t <= ms; t += 50) api.sample(t, rider(60 + t * speed));
  return api.finish(ms, finished);
}

function near(value, wanted) {
  assert(Math.abs(value - wanted) <= 2, 'expected ' + value + ' near ' + wanted);
}

test('replay survives a page reload, allows backward seeks and uses the requested time', () => {
  const db = storage(), writer = open(db);
  assert.equal(race(writer), true);
  const api = open(db);
  api.begin(route);
  assert(api.hasGhost());
  for (const t of [4000, 1125, 6700, 1200]) {
    const p = api.pose(t), x = 60 + .25 * t;
    near(p.x, x); near(p.fwX, x + 80); near(p.rwX, x - 80);
    near(p.y, 280); near(p.fwY, 287);
    assert(Number.isFinite(p.fwAngle) && Number.isFinite(p.rwAngle));
  }
  api.begin(route + '|other-layout');
  assert.equal(api.hasGhost(), false);
});

test('a slower race, DNF, or mid-race rejoin keeps the previous completed record', () => {
  const db = storage(), api = open(db);
  race(api);
  for (const attempt of [{ms:8500}, {ms:6500, finished:false}, {ms:5000, record:false}]) {
    assert.equal(race(api, {...attempt, speed:.5}), false);
    const fresh = open(db);
    fresh.begin(route);
    near(fresh.pose(3000).x, 810);
  }
  assert.equal(race(api, {ms:7000, speed:.5}), true);
  const fresh = open(db);
  fresh.begin(route);
  near(fresh.pose(3000).x, 1560);
});

test('a portal jump never creates a ride through the skipped terrain', () => {
  const api = open(storage());
  api.begin(route);
  for (let t = 0; t <= 8000; t += 50) {
    const exited = t >= 4100;
    api.sample(t, rider((exited ? 5000 : 60) + t * .1, exited ? 1 : 0));
  }
  assert(api.finish(8000, true));
  api.begin(route);
  for (let t = 3950; t <= 4250; t += 5) {
    const p = api.pose(t);
    assert(!p || p.x < 600 || p.x > 5000, 'interpolated through the portal at ' + t);
  }
  near(api.pose(2000).x, 260); near(api.pose(6000).x, 5600);
});

test('broken local data is ignored and a new clean race can be saved', () => {
  const db = storage();
  race(open(db));
  for (const key of db.data.keys()) db.setItem(key, '{bad json');
  const fresh = open(db);
  fresh.begin(route);
  assert.equal(fresh.hasGhost(), false);
  assert(race(fresh));
  const next = open(db);
  next.begin(route);
  assert(next.hasGhost());
});

test('a long missing interval stays empty, and recordings missing the start or finish are discarded', () => {
  const api = open(storage());
  api.begin(route);
  for (let t = 0; t <= 8000; t += 50) {
    if (t < 2200 || t > 5000) api.sample(t, rider(60 + .25 * t));
  }
  assert(api.finish(8000, true));
  api.begin(route);
  assert.equal(api.pose(3500), null);
  near(api.pose(6000).x, 1560);
  assert.equal(api.pose(8100), null);

  for (const [start, end] of [[1000, 8000], [0, 6500]]) {
    api.begin(route + '/partial');
    for (let t = start; t <= end; t += 50) api.sample(t, rider(t / 5));
    assert.equal(api.finish(8000, true), false);
  }
});

test('bounded history keeps recently replayed routes and ignores malformed input', () => {
  const db = storage(), api = open(db);
  for (let i = 0; i < 6; ++i) assert(race(api, {key:route + i}));
  api.begin(route + 0);
  assert(api.hasGhost());
  assert(race(api, {key:route + 6}));
  const fresh = open(db);
  fresh.begin(route + 1); assert.equal(fresh.hasGhost(), false);
  fresh.begin(route + 0); assert(fresh.hasGhost());
  fresh.begin(route + 6); assert(fresh.hasGhost());
  assert([...db.data.values()].join('').length < 1_400_001);
  fresh.begin('invalid');
  fresh.sample(0, rider(NaN));
  fresh.sample(100, null);
  fresh.sample(Infinity, rider(200));
  assert.equal(fresh.finish(NaN, true), false);
});

test('denied browser storage leaves recording and playback available in the same session', () => {
  const denied = () => { throw Error('Storage access blocked'); };
  const api = open({getItem:denied, setItem:denied, removeItem:denied});
  assert(race(api));
  api.begin(route);
  assert(api.hasGhost());
  near(api.pose(1000).x, 310);
});

test('a slower tab cannot overwrite the faster run that finished while it was racing', () => {
  const db = storage(), slow = open(db), fast = open(db);
  slow.begin(route);
  for (let t = 0; t <= 10000; t += 50) slow.sample(t, rider(60 + t * .15));
  assert(race(fast, {ms:8000, speed:.4}));
  assert.equal(slow.finish(10000, true), false);
  const next = open(db);
  next.begin(route);
  near(next.pose(4000).x,1660);
});

test('waiting for rivals after finishing does not shift the arrival time or final pose', () => {
  const api = open(storage());
  api.begin(route);
  for (let t = 0; t < 8000; t += 50) api.sample(t, rider(60 + t * .25));
  const atLine = {...rider(2060), finished:true, finishTime:8000};
  api.sample(8100, atLine);
  api.sample(10500, {...atLine, x:2220});
  assert(api.finish(8000, true));
  api.begin(route);
  near(api.pose(8000).x, 2060);
  assert.equal(api.pose(8100), null);
});

test('rotations crossing the angle wrap follow the short arc', () => {
  const api = open(storage());
  api.begin(route);
  for (let t = 0; t <= 8000; t += 150) {
    const angle = t < 4050 ? Math.PI - .1 : -Math.PI + .1;
    api.sample(t, {...rider(60 + .25 * t), angle, fwAngle:angle, rwAngle:angle});
  }
  assert(api.finish(8000, true));
  api.begin(route);
  const p = api.pose(3975);
  for (const a of [p.angle, p.fwAngle, p.rwAngle]) assert(Math.abs(Math.abs(a) - Math.PI) < .01);
});
