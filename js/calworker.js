// Worker di taratura: esegue la stessa calibrazione di physics.js (Sim.calibrateSync) fuori dal thread principale,
// così l'intro e il conto alla rovescia non perdono fotogrammi nemmeno su un telefono lento.
// Messaggi: {init, matter, decomp, physics} -> {ready}; {id, vertices} -> {id, cal}
let ready = false;
self.onmessage = e => {
  const m = e.data;
  if (m.init) {
    try { importScripts(m.matter); if (m.decomp) { try { importScripts(m.decomp); } catch (err) {} } importScripts(m.physics); ready = true; self.postMessage({ ready: true }); }
    catch (err) { self.postMessage({ ready: false, error: String(err) }); }
    return;
  }
  if (!ready) { self.postMessage({ id: m.id, error: 'not ready' }); return; }
  try { self.postMessage({ id: m.id, cal: Sim.calibrateSync(m.vertices) }); }
  catch (err) { self.postMessage({ id: m.id, error: String(err) }); }
};
