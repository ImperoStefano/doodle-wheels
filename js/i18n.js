// Traduzioni IT/EN. I.t(chiave, {vars}) per i testi dinamici; gli elementi con data-i18n / data-i18n-ph
// si aggiornano da soli quando si cambia lingua. La scelta resta salvata sul dispositivo.
const I18n = (() => {
  const D = {
    it: {
      'menu.credit': 'Ideato e sviluppato da', 'menu.sub': 'Disegna la tua ruota e affronta ostacoli dinamici.<br>Sfida fino a 4 amici in tempo reale (5 giocatori in tutto).',
      'menu.name': 'Il tuo nome', 'menu.name.ph': 'Inserisci il nome...', 'menu.host': 'Crea Nuova Gara', 'share.btn': 'Invita', 'sound.all': 'Musica ed effetti', 'sound.fx': 'Solo effetti (musica spenta)', 'sound.off': 'Audio spento', 'full.title': 'Schermo intero', 'share.label': 'Invita gli amici: copia il link e mandalo in chat', 'share.labelRoom': 'Link d\'invito: si apre già col codice', 'share.copy': 'Copia', 'share.copied': 'Copiato ✓', 'share.toastGame': 'Link copiato! Incollalo in chat per invitare i tuoi amici.', 'share.toastRoom': 'Invito copiato! Chi lo apre trova già il codice della gara.', 'share.text': 'Vieni a giocare a Doodle Wheels con me!', 'share.codeText': 'Vieni a correre con me a Doodle Wheels! Codice gara:', 'share.fromLink': 'Codice dal link: aggiungi il tuo nome e premi Unisciti.',
      'menu.code.ph': 'CODICE', 'menu.join': 'Unisciti',
      'menu.err.name': 'Nome richiesto.', 'menu.err.namecode': 'Nome e codice (4 lettere) richiesti.', 'menu.err.net': 'Errore di rete.',
      'lobby.code': 'Codice della gara', 'lobby.share': 'Condividi questo codice per far entrare altri giocatori.',
      'lobby.worldChance': 'Mondi speciali casuali', 'world.chance.desc': 'Classico 72% · Paradiso 8% · Inferno 8% · Atlantide 4% · Bosco incantato 4% · Città Neon 4%', 'world.tag.classic': 'Gara classica', 'world.tag.paradise': 'Paradiso', 'world.tag.inferno': 'Inferno', 'world.tag.atlantis': 'Atlantide', 'world.tag.enchanted': 'Bosco Incantato', 'world.tag.neon': 'Città Neon',
      'portal.shift': 'Teletrasporto', 'portal.mirror': 'Specchio', 'portal.exit': 'Uscita', 'portal.grow': 'Gigante', 'portal.big': 'Taglia normale', 'lobby.mode': 'Modalità', 'mode.normal': 'Gara classica', 'mode.crazy': 'Gara meno classica', 'mode.hint.normal': 'La gara di sempre.', 'mode.hint.crazy': 'Portali d\'inchiostro: salti avanti o indietro a caso, specchi che ti fanno tornare indietro e un anello che ingigantisce le ruote finché non passi dal portale grande. Salti e specchi si usano una sola volta.', 'crazy.fwd': 'Avanti!', 'crazy.back': 'Indietro!', 'crazy.grow': 'Gigante!', 'crazy.mirror': 'Specchio! Torna indietro fino al portale d\'uscita', 'lobby.len': 'Lunghezza pista', 'len.corta': 'Corta', 'len.media': 'Media', 'len.lunga': 'Lunga',
      'len.hint.corta': '7 zone · circa 40 secondi', 'len.hint.media': '11 zone · circa 1 minuto', 'len.hint.lunga': '15 zone con ponti · circa 1 minuto e mezzo',
      'lobby.goRace': 'Inizia la gara', 'lobby.goChamp': 'Inizia il campionato', 'lobby.alone': 'da solo', 'lobby.nPlayers': '{n} giocatori', 'lobby.hostHint': 'Aspetta che entrino gli amici (codice o link), poi premi: tutti passano a disegnare la ruota e si parte.', 'lobby.start': 'In attesa di giocatori…', 'lobby.hostcfg': 'L\'host sta configurando...', 'lobby.hostbadge': 'HOST',
      'draw.title': 'Disegna il tuo assetto', 'draw.hint': 'Traccia una linea chiusa. Tonda per la velocità, irregolare per far presa su ostacoli difficili.',
      'draw.clear': 'Pulisci', 'draw.send': 'Invia Forma', 'draw.wait': 'In attesa...', 'draw.ready': 'Ruote pronte: {got}/{n}',
      'race.landscape': 'Consigliata visuale orizzontale', 'race.change': 'Cambia Forma ({n})',
      'season.classica': '🏁 Gara classica', 'season.salti': '🦘 Giornata di salti', 'season.tranquilla': '🌿 Pista tranquilla', 'season.palude': '🐸 Palude', 'season.gelo': '❄️ Gelo', 'season.fuoco': '🔥 Fuoco', 'season.canyon': '🏜️ Canyon', 'pace.classica': 'ritmo classico', 'pace.crescendo': 'ritmo in crescendo', 'pace.onda': 'ritmo a onde', 'pace.montagne': 'ritmo a montagne russe', 'pace.respiro': 'ritmo con respiro a metà', 'race.jump': 'Salta', 'race.slow': 'Sei lento! Prova un\'altra forma', 'race.hint': 'Spazio, ↑ o tocca per saltare · due volte in aria = doppio salto', 'race.hintSprint': 'Maiusc / E / → = SCATTO (si ricarica piano)', 'race.hintSprintTouch': 'Il fulmine = SCATTO (si ricarica piano)', 'race.hintTouch': 'Tocca per saltare · due volte in aria = doppio salto', 'race.sprintTip': 'Scatto',
      'race.go': 'VIA!', 'race.you': 'tu', 'race.lastcall': '🏁 Primo al traguardo! Ancora {s}s per arrivare', 'race.hostleft': 'L\'host ha chiuso.',
      'pit.title': 'Pit Stop!', 'pit.hint': 'Disegna in fretta, la gara non si ferma.', 'pit.cancel': 'Annulla', 'pit.apply': 'Applica Ora',
      'lobby.format': 'Formato', 'fmt.1': 'Gara singola', 'fmt.3': '🏆 3 gare', 'fmt.5': '🏆 5 gare', 'fmt.hint.1': 'Una gara sola.', 'fmt.hint.3': 'Campionato di tre gare, ognuna con una stagione diversa. Punti 10-7-5-3-2, l\'ultima vale doppio.', 'fmt.hint.5': 'Campionato di cinque gare con stagioni diverse. Punti 10-7-5-3-2, l\'ultima vale doppio.', 'champ.banner': '🏆 Campionato · gara {i} di {n}', 'champ.table': 'Classifica del campionato', 'champ.final': 'Classifica finale', 'champ.winner': '🏆 {name} vince il campionato!', 'champ.next': 'Prossima gara ({i}/{n})', 'champ.again': 'Nuovo campionato', 'champ.wait': 'Aspetta che l\'host lanci la prossima gara…', 'champ.waitEnd': 'Il campionato è finito: l\'host può farne un altro.', 'champ.double': 'punti doppi', 'champ.pts': 'pt', 'res.title': 'Traguardo', 'res.rematch': 'Rigioca Stessa Pista', 'res.new': 'Nuova Pista', 'res.rank': '{n}°', 'res.dnf': 'DNF',
      'biome.0': 'Prato fiorito', 'biome.1': 'Colline', 'biome.2': 'Ghiacciaio', 'biome.3': 'Canyon', 'biome.4': 'Laguna', 'biome.5': 'Bosco d\'autunno', 'biome.6': 'Traguardo!', 'biome.7': 'Vulcano',
      'sign.hills': 'Colline', 'sign.ice': 'Ghiacciaio', 'sign.gravel': 'Canyon', 'sign.water': 'Laguna', 'sign.ramps': 'Bosco d\'autunno', 'sign.lava': 'Vulcano', 'sign.finish': 'Traguardo', 'sign.start': 'Partenza',
      'gate': 'TRAGUARDO', 'intro.tag': 'Disegna la tua ruota e affronta ostacoli dinamici.',
      'err.server': 'Impossibile contattare il server di gioco. Controlla la connessione e riprova.',
      'err.host': 'Impossibile raggiungere l\'host. Controlla che entrambi siate connessi a internet e riprova (reti molto diverse, es. WiFi e 4G, a volte richiedono qualche secondo in più).',
      'err.full': 'La gara è già piena ({n} giocatori).',
      'doc.title': 'Doodle Wheels — corsa online',
    },
    en: {
      'menu.credit': 'Designed & built by', 'menu.sub': 'Draw your wheel and take on dynamic obstacles.<br>Challenge up to 4 friends in real time (5 players in total).',
      'menu.name': 'Your name', 'menu.name.ph': 'Enter your name...', 'menu.host': 'Create New Race', 'share.btn': 'Invite', 'sound.all': 'Music and effects', 'sound.fx': 'Effects only (music off)', 'sound.off': 'Sound off', 'full.title': 'Full screen', 'share.label': 'Invite friends: copy the link and send it in a chat', 'share.labelRoom': 'Invite link: opens with the code filled in', 'share.copy': 'Copy', 'share.copied': 'Copied ✓', 'share.toastGame': 'Link copied! Paste it in a chat to invite your friends.', 'share.toastRoom': 'Invite copied! Whoever opens it finds the race code already filled in.', 'share.text': 'Come play Doodle Wheels with me!', 'share.codeText': 'Come race me in Doodle Wheels! Race code:', 'share.fromLink': 'Code from the link: add your name and press Join.',
      'menu.code.ph': 'CODE', 'menu.join': 'Join',
      'menu.err.name': 'Name required.', 'menu.err.namecode': 'Name and code (4 letters) required.', 'menu.err.net': 'Network error.',
      'lobby.code': 'Race code', 'lobby.share': 'Share this code to let other players join.',
      'lobby.worldChance': 'Random special worlds', 'world.chance.desc': 'Classic 72% · Paradise 8% · Inferno 8% · Atlantis 4% · Enchanted Forest 4% · Neon City 4%', 'world.tag.classic': 'Classic race', 'world.tag.paradise': 'Paradise', 'world.tag.inferno': 'Inferno', 'world.tag.atlantis': 'Atlantis', 'world.tag.enchanted': 'Enchanted Forest', 'world.tag.neon': 'Neon City',
      'portal.shift': 'Teleport', 'portal.mirror': 'Mirror', 'portal.exit': 'Exit', 'portal.grow': 'Giant', 'portal.big': 'Normal size', 'lobby.mode': 'Mode', 'mode.normal': 'Classic race', 'mode.crazy': 'Less classic race', 'mode.hint.normal': 'The usual race.', 'mode.hint.crazy': 'Ink portals: jump forward or back at random, mirrors that send you backwards, and a ring that makes your wheels giant until you pass the big portal. Jumps and mirrors work only once.', 'crazy.fwd': 'Forward!', 'crazy.back': 'Back!', 'crazy.grow': 'Giant!', 'crazy.mirror': 'Mirror! Drive back to the exit portal', 'lobby.len': 'Track length', 'len.corta': 'Short', 'len.media': 'Medium', 'len.lunga': 'Long',
      'len.hint.corta': '7 zones · about 40 seconds', 'len.hint.media': '11 zones · about 1 minute', 'len.hint.lunga': '15 zones with bridges · about 1 minute 30',
      'lobby.goRace': 'Start the race', 'lobby.goChamp': 'Start the championship', 'lobby.alone': 'solo', 'lobby.nPlayers': '{n} players', 'lobby.hostHint': 'Wait for your friends to join (code or link), then press: everyone moves on to drawing their wheel and the race begins.', 'lobby.start': 'Waiting for players…', 'lobby.hostcfg': 'The host is setting things up...', 'lobby.hostbadge': 'HOST',
      'draw.title': 'Draw your wheel', 'draw.hint': 'Draw a closed line. Round for speed, irregular to grip on tough obstacles.',
      'draw.clear': 'Clear', 'draw.send': 'Submit Shape', 'draw.wait': 'Waiting...', 'draw.ready': 'Wheels ready: {got}/{n}',
      'race.landscape': 'Landscape view recommended', 'race.change': 'Change Shape ({n})',
      'season.classica': '🏁 Classic race', 'season.salti': '🦘 Jump day', 'season.tranquilla': '🌿 Easy ride', 'season.palude': '🐸 Swamp', 'season.gelo': '❄️ Frost', 'season.fuoco': '🔥 Fire', 'season.canyon': '🏜️ Canyon', 'pace.classica': 'classic pace', 'pace.crescendo': 'building pace', 'pace.onda': 'rolling pace', 'pace.montagne': 'roller-coaster pace', 'pace.respiro': 'pace with a breather', 'race.jump': 'Jump', 'race.slow': 'You\'re slow! Try another shape', 'race.hint': 'Space, ↑ or tap to jump · again in the air = double jump', 'race.hintSprint': 'Shift / E / → = SPRINT (slow recharge)', 'race.hintSprintTouch': 'The bolt = SPRINT (slow recharge)', 'race.hintTouch': 'Tap to jump · again in the air = double jump', 'race.sprintTip': 'Sprint',
      'race.go': 'GO!', 'race.you': 'you', 'race.lastcall': '🏁 First at the finish! {s}s left to arrive', 'race.hostleft': 'The host has left.',
      'pit.title': 'Pit Stop!', 'pit.hint': 'Draw quickly, the race doesn\'t stop.', 'pit.cancel': 'Cancel', 'pit.apply': 'Apply Now',
      'lobby.format': 'Format', 'fmt.1': 'Single race', 'fmt.3': '🏆 3 races', 'fmt.5': '🏆 5 races', 'fmt.hint.1': 'One race only.', 'fmt.hint.3': 'Championship of three races, each with a different season. Points 10-7-5-3-2, the last one counts double.', 'fmt.hint.5': 'Championship of five races with different seasons. Points 10-7-5-3-2, the last one counts double.', 'champ.banner': '🏆 Championship · race {i} of {n}', 'champ.table': 'Championship standings', 'champ.final': 'Final standings', 'champ.winner': '🏆 {name} wins the championship!', 'champ.next': 'Next race ({i}/{n})', 'champ.again': 'New championship', 'champ.wait': 'Waiting for the host to start the next race…', 'champ.waitEnd': 'The championship is over: the host can start another.', 'champ.double': 'double points', 'champ.pts': 'pts', 'res.title': 'Finish', 'res.rematch': 'Race Same Track', 'res.new': 'New Track', 'res.rank': '{n}', 'res.dnf': 'DNF',
      'biome.0': 'Flower Meadow', 'biome.1': 'Hills', 'biome.2': 'Glacier', 'biome.3': 'Canyon', 'biome.4': 'Lagoon', 'biome.5': 'Autumn Woods', 'biome.6': 'Finish!', 'biome.7': 'Volcano',
      'sign.hills': 'Hills', 'sign.ice': 'Glacier', 'sign.gravel': 'Canyon', 'sign.water': 'Lagoon', 'sign.ramps': 'Autumn Woods', 'sign.lava': 'Volcano', 'sign.finish': 'Finish', 'sign.start': 'Start',
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
