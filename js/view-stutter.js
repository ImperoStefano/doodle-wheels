// Stutter della visuale: nel portale l'intera immagine di gara (bici, pista, sfondo, effetti) ripete per lo stesso ottavo di musica
// (0,25 s a 120 BPM), 3 o 4 volte, in sincronia con la ripetizione della canzone. La corsa NON si ferma: fisica, rete e telecamera vanno
// avanti; cambia solo cosa si vede. Alla fine la vista torna in diretta e salta in avanti al punto vero.
// Come: gli ultimi fotogrammi finiti si copiano (a metà risoluzione) in un piccolo anello; allo scoccare dell'effetto si rimanda quel
// frammento in ciclo invece di disegnare il mondo (per cui, mentre dura, il disegno costa pochissimo). L'anello registra solo vicino al portale.
const ViewStutter = (() => {
  const EIGHTH = 250, CAP = 18, SCALE = .5;
  const ring = Array.from({length: CAP}, () => ({c: null, g: null, t: -Infinity}));
  let head = 0, armed = false, pend = null, burst = null, cw = 0, ch = 0;
  const debug = {idx: [], bursts: 0};

  function alloc(w, h) {
    cw = Math.max(2, Math.round(w * SCALE)); ch = Math.max(2, Math.round(h * SCALE));
    for (const s of ring) { s.c = document.createElement('canvas'); s.c.width = cw; s.c.height = ch; s.g = s.c.getContext('2d', {alpha: false}); s.t = -Infinity; }
  }
  // Vicino al portale registra; altrove no (nessun costo e nessuna memoria).
  function arm(on) {
    on = !!on; if (on === armed) return; armed = on;
    if (!on && !pend && !burst) for (const s of ring) { s.c = s.g = null; s.t = -Infinity; cw = ch = 0; }
  }
  // Da chiamare a fine fotogramma, con il disegno completo sul canvas.
  function record(canvas, t) {
    if (!armed || burst || !canvas.width) return;
    if (canvas.width * SCALE - cw > 2 || cw - canvas.width * SCALE > 2 || !ring[0].c) alloc(canvas.width, canvas.height);
    const s = ring[head]; head = (head + 1) % CAP;
    s.g.drawImage(canvas, 0, 0, cw, ch); s.t = t;
  }
  // `at`: istante (performance.now) in cui l'effetto comincia a sentirsi; `n`: quante volte si ripete l'ottavo.
  function start(at, n, e) { if (burst) return; pend = {at, n, e: e || at}; armed = true; }
  // Prima di disegnare il mondo: se risponde true ha già disegnato il frammento e il fotogramma vivo va saltato.
  function replay(ctx, canvas, t) {
    if (pend && !pend.frames) {   // finestra = l'ottavo che precede l'evento (la scena prima del salto indietro), non quello dopo
      pend.frames = ring.filter(s => s.c && s.t > pend.e - EIGHTH - 4 && s.t <= pend.e + 1).sort((a, b) => a.t - b.t);
      if (pend.frames.length < 3) pend = null;   // troppo pochi fotogrammi: niente effetto
    }
    if (pend && t < pend.at) {   // attesa dell'ottavo musicale: resta fermo sull'ultimo fotogramma prima del salto
      const f = pend.frames[pend.frames.length - 1];
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(f.c, 0, 0, canvas.width, canvas.height); ctx.restore();
      return true;
    }
    if (pend) { burst = {t0: pend.at, n: pend.n, frames: pend.frames}; debug.bursts++; debug.idx.length = 0; pend = null; }
    if (!burst) return false;
    const u = t - burst.t0, total = burst.n * EIGHTH;
    if (u >= total) { burst = null; armed = true; arm(false); return false; }   // fine: torna in diretta e libera l'anello
    const k = Math.min(burst.frames.length - 1, Math.floor(((u % EIGHTH) / EIGHTH) * burst.frames.length));
    if (debug.idx.length < 400) debug.idx.push(k);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(burst.frames[k].c, 0, 0, canvas.width, canvas.height); ctx.restore();
    return true;
  }
  const active = () => !!burst;
  return {arm, record, start, replay, active, debug};
})();
