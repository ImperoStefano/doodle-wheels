# Doodle Wheels

**Multiplayer 2D browser game** — disegna le ruote della tua bici, affronta rampe e ostacoli, gareggia con gli amici attraverso mondi diversi.

Questa è la versione **Doodle Wheels V37 — Atlantis & Screen Recovery**. Mantiene il nome **Doodle Wheels**, la grafica egiziana approvata, le funzioni multiplayer e le probabilità dei biomi (Classico 35%, Egitto 15%, altri speciali 10% ciascuno). Migliora il rapporto fra slancio in avanti e altezza dei salti, l’interazione tra rampa e Salto, il recupero dalle voragini e la fusione delle ruote triangolari nel Vulcano. La gara non viene rallentata.

## Avvio e pubblicazione

Il progetto è statico. La pagina iniziale è `index.html`, già nella **radice** di questo ZIP. Per pubblicare con GitHub Pages, carica il contenuto dello ZIP nella radice della repository che usi per Pages (non una cartella superiore aggiuntiva) e mantieni i percorsi `js/`, `img/`, `audio/` e `style.css`.

Il gioco carica alcune librerie JavaScript da CDN: è quindi necessaria connettività Internet.

## Copyright

**© 2026 Stefano Kolta — All Rights Reserved** per i materiali originali di cui è titolare.

Il codice non è distribuito con una licenza open source. La possibilità di giocare online non equivale al permesso di ridistribuire o commercializzare il progetto. Leggi [COPYRIGHT.md](COPYRIGHT.md) e [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Sicurezza e protezione della repository

- `.github/CODEOWNERS`: designa `@ImperoStefano` quale responsabile del codice. Da solo **non blocca** le modifiche al branch.
- `SECURITY.md`: indicazioni per segnalare vulnerabilità in modo riservato.
- `.gitignore`: esclude file temporanei, segreti locali e configurazioni sensibili comuni.
- `GITHUB_SETUP.md`: istruzioni per attivare manualmente un ruleset sul branch `main`, proteggere l'account e conservare un backup.

> **Attenzione:** in un gioco HTML/JavaScript, il browser deve ricevere i file necessari al funzionamento. Un avviso di copyright protegge giuridicamente i materiali originali ma non rende il codice invisibile né impedisce tecnicamente la copia.

Per segnalazioni di sicurezza, vedere [SECURITY.md](SECURITY.md).

## V37 — Correzioni Atlante e schermo bianco

- **Riepilogo di fine gara:** i segmenti speciali (in particolare Atlantide) sostituiscono i colori delle zone classiche soltanto **sotto il profilo del terreno**. Non viene più disegnato un rettangolo semitrasparente nel cielo e non rimangono alberi, fiori o ponti appartenenti alle colline nello stesso tratto speciale.
- **Barra dei biomi:** le pastiglie delle zone normali sono interrotte sotto la pastiglia del mondo speciale, evitando sovrapposizioni e piccoli frammenti di colore.
- **Canvas della gara:** in caso di eccezione ripetuta non viene più chiamato `CanvasRenderingContext2D.reset()`, che poteva cancellare l'immagine e lasciare lo schermo vuoto. Viene conservato il fotogramma esistente e, dopo tre errori consecutivi, appare un pannello di recupero.
- **Avvio più trasparente:** se i componenti JavaScript esterni (PeerJS o Matter.js) non si caricano, compare una schermata con il pulsante per ricaricare, invece di lasciare l'utente senza indicazioni. Sono stati aggiornati gli identificativi di cache dei file del gioco per evitare versioni miste dopo la pubblicazione.
- **Nessun cambio a fisica, salti, mondi o multiplayer.** L'eventuale recupero riavvia la pagina (non rallenta la simulazione di gara).

**Verifica:** sintassi e regressioni Node, prova browser reale del disegno finale con un tracciato Atlantide e prova separata del pannello di avvio (sia errore sia avvio valido). L'errore specifico della schermata bianca segnalato su un dispositivo reale non è stato riprodotto end-to-end; per verificare se sia completamente eliminato serve una nuova prova dalla pagina pubblicata.

## V36 — salti con vero avanzamento orizzontale

- **Salto manuale**: l'impulso verticale è più moderato e quello in avanti dipende dalla velocità già conquistata dalla bici. Una partenza quasi ferma rimane quasi ferma; una bici veloce esegue una parabola più lunga.
- **Salto al bordo della rampa**: premendo al momento giusto si ottiene un bonus orizzontale limitato, anziché un'esagerata somma di accelerazioni verticali.
- **Decollo automatico**: alle rampe viene applicato un piccolo vettore di spinta in avanti e in alto, in funzione di pendenza e velocità di ingresso; le grandi rampe e i burroni mantengono un carattere più spettacolare.
- **Tocco subito dopo lo stacco**: migliora di poco la traiettoria in avanti e in alto, solo una volta, senza generare una seconda impennata.
- **La gara non rallenta**: nessuna pausa, teletrasporto, time-scale o correzione continua della traiettoria in volo. Il motore Matter.js resta autoritativo e la fisica è calcolata dall'host.
- **Regressioni**: i controlli automatici includono ora un salto quasi fermo, uno lanciato, un salto sincronizzato sulla rampa, una rampa a due velocità, un tocco post-labbro e il movimento in retromarcia. Esegui `node tests/regressions.cjs`.

**Limite della verifica:** i test automatici controllano la logica degli impulsi e non sostituiscono una partita reale con Matter.js su smartphone. La distanza di un salto dipende anche da collisioni, forma delle ruote, pendenza e atterraggio.

## V35 — miglioramenti rampe e atterraggi

- Rilascia anticipatamente lo stato di una rampa quando entrambe le ruote sono rimaste effettivamente a terra, evitando di bloccare lo stacco successivo.
- Quando solo la ruota anteriore è in aria, mantiene il rilevamento del decollo finché la posteriore completa la rampa: importante con geometrie irregolari e ruote grandi.
- Dopo un volo autentico, il simulatore rileva il contatto con il suolo, trasmette un piccolo evento con intensità e i client disegnano localmente polvere/spruzzi in base al bioma. Nessun impulso aggiuntivo e nessun rallentatore.
- Sono stati aggiunti test mirati per decolli incompleti, ruota anteriore sollevata, atterraggi reali e contatti leggeri.

## V34 — perfezionamenti di fisica e maledizione

- Un input Salto subito dopo lo stacco della rampa integra il decollo in modo moderato anziché diventare un secondo salto gigantesco a causa del buffer; nessun rallentatore.
- Le rampe ravvicinate possono riattivarsi rapidamente dopo l’atterraggio; il sistema non segnala un volo inesistente quando una ruota lenta attraversa il labbro.
- Uscendo dall’Antico Egitto le fasce di lino si staccano e cadono per circa un secondo **solo nella grafica**; la ruota posteriore mantiene il suo profilo triangolare e continua a essere consumabile dalla lava.
- Le probabilità restano Classico 35%, Antico Egitto 15%, gli altri biomi speciali 10% ciascuno.

Le verifiche automatiche non sostituiscono una prova multiplayer su smartphone.
