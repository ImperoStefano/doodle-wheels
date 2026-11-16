// The rival is a recording of a finished race. Its clock is the host race clock.
const RaceGhost = (() => {
  const STORAGE = 'dw_ghost_v1';
  const INTERVAL = 120, MAX_GAP = 600, MAX_TIME = 15 * 60 * 1000;
  const MAX_ROWS = 10000, MAX_TRACKS = 6, MAX_CHARS = 1400000;
  const fields = ['x','y','angle','fwX','fwY','fwAngle','rwX','rwY','rwAngle','sc'];
  const angles = new Set([3,6,9]); // indices in a stored row, following its timestamp
  const validKey = k => typeof k === 'string' && k.length > 0 && k.length <= 1024;
  let bank = [], key = null, rival = null, recording = false;
  let rows = [], pending = null, previousPortal = 0, crossedFinish = false;

  function validRow(row) {
    return Array.isArray(row) && row.length === 12 && Number.isInteger(row[0]) &&
      row[0] >= 0 && row[0] <= MAX_TIME && row.slice(1,11).every(n => Number.isFinite(n) && Math.abs(n) <= 1e7) &&
      row[10] > 0 && row[10] <= 16 && (row[11] === 0 || row[11] === 1);
  }

  function validRecord(r) {
    if (!r || !validKey(r.key) || !Number.isSafeInteger(r.used) || r.used < 0 || r.used > 1e14 || !Number.isFinite(r.ms) ||
        r.ms <= 0 || r.ms > MAX_TIME || !Array.isArray(r.rows) ||
        r.rows.length < 2 || r.rows.length > MAX_ROWS) return false;
    return r.rows.every((f,i) => validRow(f) && (!i || f[0] > r.rows[i-1][0])) &&
      r.rows[0][0] <= MAX_GAP && r.rows[r.rows.length-1][0] === Math.round(r.ms);
  }

  function refresh() {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw || raw.length > MAX_CHARS) return;
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries) || entries.length > MAX_TRACKS) return;
      for (const rec of entries) {
        if (!validRecord(rec)) continue;
        const old = bank.find(v => v.key === rec.key);
        if (!old) bank.push(rec);
        else if (rec.ms < old.ms) Object.assign(old, rec, {wheel: rec.wheel || null});
        else old.used = Math.max(old.used, rec.used);
      }
      bank.sort((a,b) => b.used - a.used);
      bank = bank.slice(0, MAX_TRACKS);
    } catch (_) { /* Keep session records when storage is unavailable. */ }
  }

  function persist() {
    bank.sort((a,b) => b.used - a.used);
    bank = bank.slice(0,MAX_TRACKS);
    let raw = JSON.stringify(bank);
    while (raw.length > MAX_CHARS && bank.length > 1) {
      bank.pop(); raw = JSON.stringify(bank);
    }
    if (raw.length > MAX_CHARS) return;
    try { localStorage.setItem(STORAGE, raw); } catch (_) { /* Rivincite still work in this tab. */ }
  }

  function accessTime() {
    // Sequential starts can share a wall-clock millisecond on fast rematches.
    return Math.max(Date.now(), ...bank.map(r => r.used + 1));
  }

  let startingWheel=null;
  function copyWheel(points) {
    if (!Array.isArray(points) || points.length<3 || points.length>256 ||
        !points.every(p=>p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x)<=200 && Math.abs(p.y)<=200)) return null;
    return points.map(p=>({x:p.x,y:p.y}));
  }
  function begin(trackKey, allowRecord = true, wheel = null) {
    startingWheel=copyWheel(wheel);
    key = validKey(trackKey) ? trackKey : null;
    recording = !!key && allowRecord;
    rival = null; rows = []; pending = null; previousPortal = 0; crossedFinish = false;
    if (!key) return;
    refresh();
    const best = bank.find(r => r.key === key);
    if (best) {
      // Keep this opponent fixed even if another race updates the local best.
      rival = {ms:best.ms, rows:best.rows, wheel:copyWheel(best.wheel)};
      best.used = accessTime(); persist();
    }
  }

  function encode(ms,r) {
    const row = [Math.round(ms)];
    for (let i=0; i<fields.length; i++) {
      const n = fields[i] === 'sc' ? r.sc ?? 1 : r[fields[i]];
      if (!Number.isFinite(n) || Math.abs(n) > 1e7) return null;
      const precision = angles.has(i+1) ? 1000 : fields[i] === 'sc' ? 100 : 4;
      row.push(Math.round(n*precision)/precision);
    }
    if (row[10] <= 0 || row[10] > 16) return null;
    row.push(0);
    return row;
  }

  function sample(ms,r) {
    if (!recording || !r || crossedFinish) return;
    if (r.finished && Number.isFinite(r.finishTime)) ms = r.finishTime;
    if (!Number.isFinite(ms) || ms < 0 || ms > MAX_TIME) return;
    const t = Math.round(ms);
    if (pending && t < pending[0]) return;
    const row = encode(t,r);
    if (!row) return;
    const portal = r.pe ?? 0;
    if (pending) {
      const dt = t - pending[0];
      const dx = row[1] - pending[1], dy = row[2] - pending[2];
      if (previousPortal !== portal || Math.hypot(dx,dy) > Math.min(320,125+dt*1.3)) {
        if (pending[0] > rows[rows.length-1][0]) rows.push(pending);
        row[11] = 1;
      }
    }
    if (!rows.length || row[11] || t - rows[rows.length-1][0] >= INTERVAL) {
      if (rows.length && rows[rows.length-1][0] === t) rows.pop();
      rows.push(row);
    }
    pending = row; previousPortal = portal;
    crossedFinish = !!r.finished;
    if (rows.length >= MAX_ROWS) { recording = false; rows = []; pending = null; }
  }

  function finish(ms,finished) {
    if (!recording) return false;
    recording = false;
    if (!finished || !Number.isFinite(ms) || ms <= 0 || ms > MAX_TIME || !pending ||
        rows[0][0] > MAX_GAP || Math.abs(Math.round(ms)-pending[0]) > MAX_GAP) return false;
    const end = Math.round(ms);
    // A delayed results packet may carry a more precise arrival time than the last snapshot.
    const last = pending.slice(); last[0] = end;
    while (rows.length && rows[rows.length-1][0] >= end) rows.pop();
    if (!rows.length || pending[0] <= rows[0][0]) return false;
    rows.push(last);
    refresh();
    const best = bank.find(r => r.key === key);
    if (best && best.ms <= ms) return false;
    bank = bank.filter(r => r.key !== key);
    bank.unshift({key, ms, rows, wheel:startingWheel, used:accessTime()});
    persist();
    return true;
  }

  function pose(ms) {
    if (!rival || !Number.isFinite(ms) || ms < rival.rows[0][0] || ms > rival.ms) return null;
    const data = rival.rows;
    if (ms === rival.ms) ms = data[data.length-1][0];
    let lo = 0, hi = data.length-1;
    while (lo < hi) {
      const mid = Math.ceil((lo+hi)/2);
      if (data[mid][0] <= ms) lo = mid; else hi = mid-1;
    }
    const a = data[lo], b = data[Math.min(lo+1,data.length-1)];
    const span = b[0]-a[0];
    if (span > MAX_GAP && ms > a[0]) return null;
    const fraction = span && !b[11] ? (ms-a[0])/span : 0;
    const out = {};
    for (let i=0; i<fields.length; i++) {
      const j=i+1, diff=b[j]-a[j];
      const delta=angles.has(j) ? Math.atan2(Math.sin(diff),Math.cos(diff)) : diff;
      out[fields[i]]=a[j]+delta*fraction;
    }
    return out;
  }

  return {begin, sample, pose, finish, hasGhost: () => !!rival, bestTime: () => rival?.ms ?? null, wheel: () => rival?.wheel ?? null};
})();
