// Traduzioni IT/EN. I.t(chiave, {vars}) per i testi dinamici; gli elementi con data-i18n / data-i18n-ph
// si aggiornano da soli quando si cambia lingua. La scelta resta salvata sul dispositivo.
const I18n = (() => {
  const D = {
    it: {
      'menu.sub': 'Disegna la tua ruota e affronta ostacoli dinamici.<br>Sfida fino a 4 amici in tempo reale (5 giocatori in tutto).',
      'menu.name': 'Il tuo nome', 'menu.name.ph': 'Inserisci il nome...', 'menu.host': 'Crea Nuova Gara', 'share.btn': 'Invita', 'full.title': 'Schermo intero', 'share.label': 'Invita gli amici: copia il link e mandalo in chat', 'share.labelRoom': 'Link d\'invito: si apre già col codice', 'share.copy': 'Copia', 'share.copied': 'Copiato ✓', 'share.toastGame': 'Link copiato! Incollalo in chat per invitare i tuoi amici.', 'share.toastRoom': 'Invito copiato! Chi lo apre trova già il codice della gara.', 'share.text': 'Vieni a giocare a Doodle Wheels con me!', 'share.codeText': 'Vieni a correre con me a Doodle Wheels! Codice gara:', 'share.fromLink': 'Codice dal link: aggiungi il tuo nome e premi Unisciti.',
      'menu.code.ph': 'CODICE', 'menu.join': 'Unisciti',
      'menu.err.name': 'Nome richiesto.', 'menu.err.namecode': 'Nome e codice (4 lettere) richiesti.', 'menu.err.net': 'Errore di rete.',
      'lobby.code': 'Codice della gara', 'lobby.share': 'Condividi questo codice per far entrare altri giocatori.',
      'lobby.mode': 'Modalità', 'mode.normal': 'Gara classica', 'mode.crazy': 'Gara meno classica', 'mode.hint.normal': 'La gara di sempre.', 'mode.hint.crazy': 'Portali d\'inchiostro: salti avanti o indietro a caso e specchi che ti fanno tornare indietro. Ogni portale si usa una sola volta.', 'crazy.fwd': 'Avanti!', 'crazy.back': 'Indietro!', 'crazy.mirror': 'Specchio! Torna indietro fino al portale d\'uscita', 'lobby.len': 'Lunghezza pista', 'len.corta': 'Corta', 'len.media': 'Media', 'len.lunga': 'Lunga',
      'len.hint.corta': '7 zone · circa 40 secondi', 'len.hint.media': '11 zone · circa 1 minuto', 'len.hint.lunga': '15 zone con ponti · circa 1 minuto e mezzo',
      'lobby.start': 'In attesa di giocatori…', 'lobby.hostcfg': 'L\'host sta configurando...', 'lobby.hostbadge': 'HOST',
      'draw.title': 'Disegna il tuo assetto', 'draw.hint': 'Traccia una linea chiusa. Tonda per la velocità, irregolare per far presa su ostacoli difficili.',
      'draw.clear': 'Pulisci', 'draw.send': 'Invia Forma', 'draw.wait': 'In attesa...', 'draw.ready': 'Ruote pronte: {got}/{n}',
      'race.landscape': 'Consigliata visuale orizzontale', 'race.change': 'Cambia Forma ({n})',
      'race.go': 'VIA!', 'race.you': 'tu', 'race.lastcall': '🏁 Primo al traguardo! Ancora {s}s per arrivare', 'race.hostleft': 'L\'host ha chiuso.',
      'pit.title': 'Pit Stop!', 'pit.hint': 'Disegna in fretta, la gara non si ferma.', 'pit.cancel': 'Annulla', 'pit.apply': 'Applica Ora',
      'res.title': 'Traguardo', 'res.rematch': 'Rigioca Stessa Pista', 'res.new': 'Nuova Pista', 'res.rank': '{n}°', 'res.dnf': 'DNF',
      'biome.0': 'Prato fiorito', 'biome.1': 'Colline', 'biome.2': 'Ghiacciaio', 'biome.3': 'Canyon', 'biome.4': 'Laguna', 'biome.5': 'Bosco d\'autunno', 'biome.6': 'Traguardo!',
      'sign.hills': 'Colline', 'sign.ice': 'Ghiacciaio', 'sign.gravel': 'Canyon', 'sign.water': 'Laguna', 'sign.ramps': 'Bosco d\'autunno', 'sign.finish': 'Traguardo',
      'gate': 'TRAGUARDO', 'intro.tag': 'Disegna la tua ruota e affronta ostacoli dinamici.',
      'err.server': 'Impossibile contattare il server di gioco. Controlla la connessione e riprova.',
      'err.host': 'Impossibile raggiungere l\'host. Controlla che entrambi siate connessi a internet e riprova (reti molto diverse, es. WiFi e 4G, a volte richiedono qualche secondo in più).',
      'err.full': 'La gara è già piena ({n} giocatori).',
      'doc.title': 'Doodle Wheels — corsa online',
    },
    en: {
      'menu.sub': 'Draw your wheel and take on dynamic obstacles.<br>Challenge up to 4 friends in real time (5 players in total).',
      'menu.name': 'Your name', 'menu.name.ph': 'Enter your name...', 'menu.host': 'Create New Race', 'share.btn': 'Invite', 'full.title': 'Full screen', 'share.label': 'Invite friends: copy the link and send it in a chat', 'share.labelRoom': 'Invite link: opens with the code filled in', 'share.copy': 'Copy', 'share.copied': 'Copied ✓', 'share.toastGame': 'Link copied! Paste it in a chat to invite your friends.', 'share.toastRoom': 'Invite copied! Whoever opens it finds the race code already filled in.', 'share.text': 'Come play Doodle Wheels with me!', 'share.codeText': 'Come race me in Doodle Wheels! Race code:', 'share.fromLink': 'Code from the link: add your name and press Join.',
      'menu.code.ph': 'CODE', 'menu.join': 'Join',
      'menu.err.name': 'Name required.', 'menu.err.namecode': 'Name and code (4 letters) required.', 'menu.err.net': 'Network error.',
      'lobby.code': 'Race code', 'lobby.share': 'Share this code to let other players join.',
      'lobby.mode': 'Mode', 'mode.normal': 'Classic race', 'mode.crazy': 'Less classic race', 'mode.hint.normal': 'The usual race.', 'mode.hint.crazy': 'Ink portals: jump forward or back at random, and mirrors that send you backwards. Every portal works only once.', 'crazy.fwd': 'Forward!', 'crazy.back': 'Back!', 'crazy.mirror': 'Mirror! Drive back to the exit portal', 'lobby.len': 'Track length', 'len.corta': 'Short', 'len.media': 'Medium', 'len.lunga': 'Long',
      'len.hint.corta': '7 zones · about 40 seconds', 'len.hint.media': '11 zones · about 1 minute', 'len.hint.lunga': '15 zones with bridges · about 1 minute 30',
      'lobby.start': 'Waiting for players…', 'lobby.hostcfg': 'The host is setting things up...', 'lobby.hostbadge': 'HOST',
      'draw.title': 'Draw your wheel', 'draw.hint': 'Draw a closed line. Round for speed, irregular to grip on tough obstacles.',
      'draw.clear': 'Clear', 'draw.send': 'Submit Shape', 'draw.wait': 'Waiting...', 'draw.ready': 'Wheels ready: {got}/{n}',
      'race.landscape': 'Landscape view recommended', 'race.change': 'Change Shape ({n})',
      'race.go': 'GO!', 'race.you': 'you', 'race.lastcall': '🏁 First at the finish! {s}s left to arrive', 'race.hostleft': 'The host has left.',
      'pit.title': 'Pit Stop!', 'pit.hint': 'Draw quickly, the race doesn\'t stop.', 'pit.cancel': 'Cancel', 'pit.apply': 'Apply Now',
      'res.title': 'Finish', 'res.rematch': 'Race Same Track', 'res.new': 'New Track', 'res.rank': '{n}', 'res.dnf': 'DNF',
      'biome.0': 'Flower Meadow', 'biome.1': 'Hills', 'biome.2': 'Glacier', 'biome.3': 'Canyon', 'biome.4': 'Lagoon', 'biome.5': 'Autumn Woods', 'biome.6': 'Finish!',
      'sign.hills': 'Hills', 'sign.ice': 'Glacier', 'sign.gravel': 'Canyon', 'sign.water': 'Lagoon', 'sign.ramps': 'Autumn Woods', 'sign.finish': 'Finish',
      'gate': 'FINISH', 'intro.tag': 'Draw your wheel and take on dynamic obstacles.',
      'err.server': 'Unable to reach the game server. Check your connection and try again.',
      'err.host': 'Unable to reach the host. Make sure you are both online and try again (very different networks, e.g. Wi-Fi and 4G, sometimes need a few more seconds).',
      'err.full': 'The race is already full ({n} players).',
      'doc.title': 'Doodle Wheels — online racing',
    },
  };
  let lang = 'it';
  try { const s = localStorage.getItem('dw_lang'); lang = s === 'en' || s === 'it' ? s : ((navigator.language || 'it').toLowerCase().startsWith('it') ? 'it' : 'en'); } catch (e) {}
  const listeners = [];
  function t(key, vars) {
    let s = (D[lang] && D[lang][key]) || D.it[key] || key;
    if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    return s;
  }
  function apply() {
    document.documentElement.lang = lang; document.title = t('doc.title');
    document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('lang-btn--on', b.dataset.lang === lang));
    listeners.forEach(f => { try { f(lang); } catch (e) {} });
  }
  function set(l) { lang = l; try { localStorage.setItem('dw_lang', l); } catch (e) {} apply(); }
  function init() {
    document.querySelectorAll('.lang-btn').forEach(b => b.addEventListener('click', () => set(b.dataset.lang)));
    apply();
  }
  return { t, set, init, apply, onChange: f => listeners.push(f), get lang() { return lang; } };
})();
