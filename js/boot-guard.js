/* Doodle Wheels V37: never leave a silent blank page after a failed startup. */
(() => {
  'use strict';
  let initialError = '';
  window.addEventListener('error', e => {
    if (e && e.message && !initialError) initialError = String(e.message);
  });
  window.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(() => {
      const problems = [];
      if (typeof Peer === 'undefined') problems.push('PeerJS');
      if (typeof Matter === 'undefined') problems.push('Matter.js');
      if (window.__dwBootReady !== true) problems.push('inizializzazione');
      if (!problems.length) return;
      const cover = document.getElementById('boot-failure');
      if (!cover) return;
      const txt = document.getElementById('boot-failure-message');
      if (txt) {
        txt.textContent = problems.includes('inizializzazione') && !problems.includes('PeerJS') && !problems.includes('Matter.js')
          ? 'Si è verificato un errore durante l’avvio. Ricarica la pagina. Se persiste, segnala il problema.'
          : 'Non è stato possibile caricare alcuni componenti del gioco (' + problems.join(', ') + '). Controlla la connessione e ricarica la pagina.';
      }
      window.__dwBootError = initialError || problems.join(', ');
      cover.hidden = false;
    }, 1100);
  }, { once:true });
})();
