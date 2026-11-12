# 🖊️ Doodle Wheels

**Versione documentata: V22 — 12 novembre 2026** · Gioco web multiplayer per GitHub Pages.

### Novità della V22 in breve

- **Ostacoli fisici dinamici e interattivi:** rulli, pendoli, pistoni e oggetti mobili; massi spingibili, pedane basculanti, passerelle cedevoli che si ripristinano e superfici elastiche.
- **Aspetto diverso in ciascun mondo:** varianti di materiali e animazioni per biomi normali, Paradiso, Inferno, Atlantide, Bosco Incantato e Città Neon. Le sagome solide sono dimensionate per risultare visibili rispetto alle biciclette.
- **Paradiso ridisegnato:** architetture celesti, rosoni, luce, pedane e nubi elastiche. Rimossi i precedenti anelli boost e i segnali di pericolo «!».
- **Emote visibili anche a distanza:** emote grande sopra le bici presenti nell’inquadratura; emote ridotta, con nome e direzione, sul bordo dello schermo quando l’avversario è fuori campo.
- **Fisica autoritativa dell’host:** i client ricevono gli stati degli ostacoli e ne interpolano la posizione per il rendering.

> **Stato delle verifiche:** sintassi, generazione dei tracciati, posizionamento e integrità del pacchetto controllati con test automatici. Il bilanciamento su ruote irregolari, la fluidità su smartphone e le partite multiplayer con dispositivi reali richiedono ancora collaudi manuali.

Corsa online per 1–5 giocatori (anche in solitaria): **disegni a mano libera la forma della tua ruota**, poi la fisica fa il resto. Una forma tonda rotola liscia, una spigolosa fa saltare tutto. Ispirato al meccanismo di gioco tipo "Pocket Champs".

Nessun server da mantenere: è tutto statico (HTML/CSS/JS), pensato per girare su **GitHub Pages**, con la rete peer-to-peer gestita da [PeerJS](https://peerjs.com/) (broker pubblico gratuito) e la fisica da [Matter.js](https://brm.io/matter-js/).

## Il tracciato

Non è più un rettilineo piatto: `js/terrain.js` genera un percorso deterministico (stessa funzione calcolata da host e client, nessun dato da sincronizzare in rete) diviso in zone:

| Zona | Cosa fa |
|---|---|
| Partenza / Arrivo | piatta, per una partenza e un traguardo puliti |
| Colline | saliscendi dolce — le ruote spigolose iniziano a perdere terreno |
| Ghiaia | attrito basso, terreno irregolare — chi ha una ruota bitorzoluta rischia di sbandare |
| Rampe | salite brusche che lanciano in aria chi arriva con abbastanza velocità |

La minimappa in alto nella HUD mostra l'intero tracciato colorato per zona, il traguardo e un pallino per ogni corridore aggiornato in tempo reale.

## Mondi speciali a comparsa casuale

A ogni nuova pista l'host sorteggia un mondo: i mondi speciali sono eventi casuali frequenti ma non garantiti, non selezionabili manualmente. Le probabilità sono:

| Mondo | Probabilità | Identità e meccanica distintiva |
|---|---:|---|
| **Classico** | **60%** | Biomi, stagioni e ostacoli originali, incluso il Vulcano. |
| **Paradiso** | **8%** | Architetture celesti, isole sospese, luce serena, correnti ascensionali e nuvole elastiche. |
| **Inferno** | **8%** | Paesaggio vulcanico e dantesco, bufera, lava e geyser che spingono la ruota. |
| **Atlantide** | **8%** | Città sommersa, palazzi abissali, raggi subacquei, fauna marina e correnti di bolle. |
| **Bosco Incantato** | **8%** | Foresta notturna, albero antico con portale, funghi luminosi e piattaforme elastiche. |
| **Città Neon** | **8%** | Metropoli futuristica, torri luminose, maglev e varchi di accelerazione. |

I tre mondi aggiunti hanno fondali panoramici dedicati in `img/worlds/`: non riutilizzano le montagne generiche del Classico. Per Atlantide, Bosco Incantato e Città Neon sono presenti fondali e livelli di primo piano locali rasterizzati in PNG, con parallasse differenziata; alghe/coralli, felci/rami e dettagli urbani incorniciano la scena senza coprire terreno o corridori. Particelle ambientali leggere completano l’atmosfera; non sono richiesti servizi esterni. Terreno, ostacoli e meccaniche restano disegnati dal motore di gioco.

Il sorteggio avviene una sola volta per ogni nuova pista e viene comunicato dall'host ai client insieme al tracciato. Il replay conserva lo stesso mondo; una nuova gara estrae di nuovo. Le posizioni degli eventi ambientali dipendono dal layout, così i giocatori vedono le stesse condizioni.

## Come si gioca

1. Un giocatore crea la gara (**host**) e ottiene un codice a 4 lettere.
2. Gli altri (fino a 4: il massimo è 5 giocatori in tutto) lo inseriscono per unirsi.
3. Tutti disegnano la propria ruota entro 30 secondi, dentro il cerchio guida.
4. Countdown 3-2-1, via! Le ruote rotolano con un motore costante — solo la forma determina chi va più veloce.
   - **Salto e doppio salto**: Spazio, ↑ o W (tastiera), tocco/clic sulla pista o pulsante *Salta* su telefono. Sono disponibili il doppio salto, un breve *jump buffer* e una tolleranza (*coyote time*) vicino al bordo delle rampe. La simulazione è decisa dall'host (`js/physics.js`).
   - **Sei lento?** Se la tua bici resta sotto ~2,4 px/tick per più di un secondo (e hai ancora cambi forma), la bici lampeggia, il pulsante *Cambia Forma* pulsa e compare il suggerimento (`updateSlow` in `js/game.js`).
5. Classifica finale, si può rigiocare con le stesse persone.

## Architettura in breve

- **Rete a stella**: l'host è l'unico che parla con tutti (`js/peer.js`). I client non comunicano mai tra loro direttamente — più semplice e robusto di una mesh completa per 5 giocatori.
- **Host autoritativo**: solo l'host esegue la simulazione fisica (`js/physics.js`, Matter.js) e trasmette ~20 volte al secondo la posizione di tutti (`{type:'snap', racers:[...]}`). I client interpolano gli snapshot ricevuti, includendo le posizioni degli ostacoli interattivi; ciò riduce le divergenze visive, senza eliminare ogni possibile problema di latenza.
- **Normalizzazione della ruota**: ogni forma disegnata viene ricentrata sul baricentro e scalata così che il punto più lontano dal centro sia sempre alla stessa distanza (`js/draw.js → getNormalizedVertices`). Questo impedisce di vincere disegnando semplicemente un cerchio enorme: conta solo quanto è **rotonda**, non quanto è **grande**.
- **Forme concave**: le ruote disegnate a mano quasi sempre hanno rientranze. `poly-decomp.js` le scompone in parti convesse per Matter.js, altrimenti verrebbero "riempite" perdendo i dettagli del disegno.

## Provarlo in locale

Non serve un server: basta aprire `index.html` in due schede/browser diversi (uno fa da host, l'altro si unisce con il codice). Per farlo funzionare con amici veri, va pubblicato online — PeerJS ha bisogno di https per funzionare fuori dalla stessa macchina.

## Pubblicarlo su GitHub Pages

```bash
cd doodle-wheels
git init
git add .
git commit -m "Doodle Wheels — corsa a ruote disegnate"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/doodle-wheels.git
git push -u origin main
```

Poi su GitHub: **Settings → Pages → Source: `main` branch, cartella `/ (root)`**. Dopo un minuto il gioco è online su `https://<tuo-utente>.github.io/doodle-wheels/`.

## Prossimi controlli e idee (TODO aggiornato alla V22)

- **Collaudo reale con 2–5 giocatori** su più dispositivi: stabilità PeerJS, riconnessioni, ritardi e sincronizzazione degli ostacoli interattivi.
- **Bilanciamento per forme irregolari** (tonda, triangolo, quadrato, stella, ovale, forme libere): completare gare con ogni tipo di ostacolo, verificando incastri, recuperi e vantaggi indebiti.
- **Prestazioni mobile**: monitorare FPS e costo del rendering in Paradiso e negli altri mondi con molte particelle.
- **Accessibilità degli ostacoli**: controllare che siano riconoscibili senza indicatori «!», che la loro sagoma coincida con il collider e che rimangano superabili o sfruttabili.
- **Modalità spettatore e riconnessione**: da sviluppare o verificare separatamente prima di descriverle come funzionalità consolidate.

## Struttura principale del progetto (V22)

```text
doodle-wheels/
├── index.html                 menu, lobby, disegno, gara, risultati
├── style.css                 interfaccia responsive e stile illustrato
├── audio/musica.mp3          colonna sonora
├── img/                      avatar, emote e fondali dei mondi
├── js/
│   ├── peer.js               connessione PeerJS
│   ├── draw.js               ruote disegnate e normalizzazione
│   ├── terrain.js            piste, biomi ed eventi deterministici
│   ├── physics.js            simulazione Matter.js dell'host
│   ├── game.js               stato di gioco, camera, UI e rete
│   ├── obstacles.js          ostacoli fisici mobili
│   ├── interactive-obstacles.js  ostacoli interattivi V22
│   ├── emote-layout.js       emote inquadrate e fuori campo
│   ├── scenery.js            paesaggi e livelli di profondità
│   ├── world-art-v19.js      art direction dei mondi speciali
│   ├── worldfx.js            effetti e dettagli ambientali
│   ├── props.js              ponti e altri elementi della pista
│   ├── flora.js              flora animata
│   ├── sound.js              musica ed effetti sonori
│   ├── i18n.js               interfaccia italiano/inglese
│   └── calworker.js          taratura delle ruote in worker
├── preview-ostacoli.html    tavola tecnica di preview
└── V22-Anteprima-Interattiva.html  galleria autonoma V22
```

**Nota:** la distribuzione V22 contiene anche i documenti di rilascio `V19-README.txt`–`V22-README.txt`. Le dipendenze Matter.js, PeerJS e poly-decomp sono caricate da CDN pubbliche. La galleria HTML è una **anteprima visiva**, non una gara simulata.

## Novità: percorso lungo, biomi, ponti, fiori vivi

- **Lunghezza gara** (scelta in lobby): corta ~16.000 px (≈40 s), media ~25.000 px (≈1 min), lunga ~33.000 px (≈1:30). Tempo massimo e "ultima chiamata" dopo il primo arrivo si adattano alla pista.
- **Biomi** (`js/scenery.js`): prato fiorito, colline, ghiacciaio, canyon, laguna, bosco d'autunno, traguardo. Sole che percorre il cielo da alba a tramonto, nuvole, uccelli, lucciole, farfalle, neve e foglie.
- **Ponti** (`js/props.js`): ponte di pietra ad arco sulla laguna, ponte di corda sul canyon; almeno uno per gara, di media 2–4 nelle piste lunghe.
- **Fiori** (`js/terrain.js` + `js/flora.js`): posizione e specie derivano solo dalla coordinata x e dal bioma (uguali per tutti i giocatori, nessun dato in rete). Margherite, tulipani, rose, girasoli (campi da 4), bucaneve, cristalli di ghiaccio, funghi, cactus. Fanno piccoli dossi fisici; l'animazione è solo visiva: ondeggiano col vento, si piegano al passaggio, sbocciano di giorno e si chiudono di notte, i girasoli seguono il sole, le api volano attorno.
- Cache: gli script in `index.html` hanno `?v=20261112-v22-interactive-release`; se il sito pubblicato sembra vecchio, ricarica forzando (Ctrl+Shift+R) e verifica che anche `style.css` sia stato caricato.

## Intro: l'avatar che spennella la gara
`js/intro.js` + `img/av1-3.png` (avatar, 3 frame) e `img/br1-3.png` (pennello, 3 frame, ricavati dai tuoi file con sfondo rosa tolto). Sul foglio a quadretti della prima schermata (con il titolo "Doodle Wheels" solo se il font Kalam è caricato, mai sottotitoli) arriva l'avatar: cammina (gambe tagliate dal tuo disegno e fatte ondeggiare attorno al bacino) e spennella a tre passate; dove passa il pennello resta inchiostro nero a setole che si asciuga a strisce e compare la gara con le bici in griglia. Dura 4,75 s e il VIA è spostato di conseguenza (`Intro.DUR`, in `checkAllWheelsIn`); il 3-2-1 parte solo a intro finita. Un tocco la salta. Per spegnerla: `localStorage.setItem('dw_intro','off')`. È solo grafica locale.

## Lingua (IT / EN)
Toggle **IT | EN** in alto a destra, sempre visibile (anche durante la gara); la scelta resta salvata sul dispositivo e di default segue la lingua del browser. Le traduzioni sono in `js/i18n.js` (`I18n.t('chiave')`): menu, lobby, disegno, Pit Stop, cartelli e banner dei biomi, cancello del traguardo, conto alla rovescia, risultati ed errori di rete. Per aggiungere una lingua basta un nuovo blocco nel dizionario `D`. Ogni giocatore sceglie la propria lingua in modo indipendente.

## Terreni a tema e bilanciamento delle forme

La tonda è la ruota che rotola meglio, quindi su terreno normale vincerebbe sempre. Due meccanismi la riportano alla pari
e poi lasciano decidere ai terreni (tutti **senza icone**: si scoprono guidando):

1. **Taratura automatica** (`Sim.calibrate`, in `physics.js`): prima del via l'host fa girare ogni ruota su un tratto neutro in un
   motore fisico a parte (~100 ms a forma, a fette di 8 ms) e ricava un moltiplicatore di spinta che la porta allo stesso tempo di una tonda perfetta.
   Vale anche per i cambi ruota ai box. In più: tetto di velocità morbido (`V_CAP`) per evitare che la tonda scappi sui rettilinei.
2. **Terreni a tema** (`Terrain.PATCHES`, deterministici dal layout, con un "sapore" diverso per ogni gara):

| Terreno | Dove | Chi va meglio |
|---|---|---|
| Strada acciottolata ad archi | colline, canyon | forme poligonali (la tonda sobbalza) |
| Dune ondulate | canyon | forme con denti / poligoni |
| Fango | colline, bosco | forme con punte vere (il numero di "denti" conta: un ovale morde la metà di una stella) |
| Ghiaccio (tutta la zona) | ghiacciaio | idem, più lieve |
| Buche, tronchi, gradoni alti | colline, bosco, canyon | la tonda e le forme grandi e lisce |
| Sabbia | colline, canyon, rampe | la tonda (galleggia); le punte affondano |

Parametri in `physics.js`: `GRIP` (fango/ghiaccio/strade), `ROLL_GAIN`, `ACCEL_SPIKE`, `V_CAP`; in `terrain.js`: `PATCH_TABLE`.

**Studio** (simulatore Node, 9 forme normalizzate a raggio 80 come nel gioco, 40 piste casuali da 11 zone, ogni forma da sola
sulla stessa pista, tarate): vittorie ovale 12, tonda 11, quadrato 5, blob 5, esagono 4, triangolo 2, dentata 1; 0 salti/ritiri.
Pentagono e stella non vincono mai l'intera gara. Risultati molto sensibili ai parametri e misurati solo in headless (da verificare su telefoni veri).
Nota: la griglia di partenza è sfalsata di 200 px a testa e il tempo si misura al traguardo, quindi chi parte più avanti ha un piccolo vantaggio.

**Cambi forma in gara:** dipendono dalla lunghezza — corta 2, media 4, lunga 6 (`redrawsForTrack` in `game.js`). Ogni cambio viene ritarato in automatico.

**Telecamera** (`updateCamera` in `game.js`): morbidezza indipendente dagli fps, "guarda avanti" in base alla velocità, inseguimento verticale
(la bici resta tra il 30% e il 72% dell'altezza su rampe e salite), e dopo il traguardo segue il primo ancora in gara.

**Terreni su misura per forme specifiche** (`gripN`, `gripFactor` in `physics.js`):
- *Strada ad archi per un poligono a N lati* (N = 3, 4, 5 o 6): la forma con esattamente N punte (contate dal contorno, non dai lati disegnati) ci rotola in tinta e prende un piccolo bonus di spinta; le altre sobbalzano.
- *Dentiera* (rotaia con denti a V, canyon e colline): premia le forme con 5+ punte affilate (stella); la tonda sbanda.
- *Ramponi* su fango e ghiaccio: un bonus extra per punte lunghe e affilate (triangolo, stella).
- La taratura automatica ora include anche una rampa vera, così l'atterraggio non penalizza in partenza le forme spigolose.

### Bilanciamento — secondo giro (misure oneste)

Cosa è cambiato rispetto al giro precedente, e perché:
- **La presa ora sposta anche il tetto di velocità.** Prima il limitatore `V_CAP` mascherava quasi del tutto fango/ghiaccio/strade: ora chi sbaglia terreno non arriva a `V_CAP` (`GRIP`: fango 0.75, ghiaccio 0.95, strade 0.93 per la tonda).
- **Strade ad archi:** chi ha un numero di punte diverso da N perde fino al 22% (`MISMATCH`); il bonus per la forma "in tinta" non dipende più da quanto è profonda la punta (l'esagono ha punte basse ma deve poter vincere sulla sua strada a 6).
- **Dentiera** (`gripFactor`): conta le punte (≥5) e quanto sono affilate; senza punte buone si perde il 30%.
- **Punte più affidabili** (`PEAK_PROM`): con una forma disegnata a mano l'esagono veniva letto come 1–4 punte; ora 5–6 in modo stabile, e la tonda ruvida resta a 0.
- **Coppia del motore** `MOTOR_ACCEL` 0.02→0.035: le forme a punte erano limitate dalla coppia e la taratura non poteva compensarlo.
- **Buche** più piccole (W 140–155, D 48): prima le forme a punte perdevano ~1 s a buca.
- **Taratura più robusta:** il tempo di prova oscilla di ±5–8% da un k al successivo, per cui ogni misura è la media su 3 varianti di pista (colline, ponte ad arco, ghiaia con ponte di corda, due rampe di fila, ghiaccio) e 2 prove, e ci sono 3 moltiplicatori (piano / rampe / ghiaccio). Costa ~0,5 s a ruota, a fette di 8 ms: 4 ruote ≈ 2,4 s in Chromium headless; su un telefono lento può finire dopo il via (fino ad allora vale 1, poi si applica).
- Provato e scartato: una taratura per sezione, una retta di regressione, alzare anche il tetto di velocità con la taratura (tutte rendevano una forma sola vincente o la tonda più lenta del 10–17%).

**Terreno più denso (terzo giro):** zone di colline/ghiaia/rampe più corte (1750/1750/2000 px), tratti a tema anche sul ghiaccio (archi, dentiera: lì vale la strada, non il ghiaccio), più buche in collina e più tronchi sulle rampe per dare una nicchia alla tonda; pavimento della dentiera 0.78; limite della taratura 3.2.

**Sabbia (quarto giro)** — resa grafica: strato spesso a sfumatura calda con creste e ombre di vento, ciuffi d'erba secca che ondeggiano, conchiglie e sassolini, granelli portati dal vento, luccichii, estremità che si assottigliano; la bici solleva polvere dorata. Il terreno "al contrario": la tonda galleggia (fino a +6% di velocità), le forme con denti e punte affondano (`gripFactor`, `'sand'`: 1.06 − 0.28·(0.7·denti + 0.6·spigolosità)); compare in colline, ghiaia e rampe. Dà alla tonda una nicchia vera: sul tratto di sabbia perde circa 40% la stella e guadagna la tonda. Dentiera più frequente (colline 0.2, ghiaia 0.3, ghiaccio 0.3) per la stella.

**Superfici ridisegnate (quinto giro)** — stesso trattamento della sabbia per tutti i terreni, nessuna modifica alla fisica: *fango* lucido a strati con solchi di ruote, pozze che riflettono il cielo, bolle che scoppiano e giunchi che ondeggiano; *dentiera* con ballast, traversine di legno, rotaia d'acciaio con bulloni e ruggine e paraurti giallo-neri; *strada ad archi* in selciato di arenaria a filari sfalsati con chiavi di volta e muschio; *gradoni* di pietra a blocchi con alzate in ombra, licheni (o brina e cristalli sul ghiaccio); *buche* con pareti di terra e sassi, fondo con pozza e anelli d'acqua animati; *tronchi* di testa con anelli, corteccia, muschio e funghetti; *dune ondulate* come la sabbia in tono ghiaia. Estremità che si assottigliano ovunque; solo path e gradienti semplici, nessun offscreen canvas.

**Contatto con il terreno (sesto giro)** — le forme poligonali "volavano": prima, con le due ruote contemporaneamente sopra il suolo (>4 px) per il 43–76% del tempo (tonda 4%), con la quota media in volo di 12–29 px. Cause misurate: il motore faceva girare la ruota più in fretta di quanto servisse e ogni spigolo che atterrava rimbalzava; la gravità (1.3) non basta a seguire il baricentro di un poligono a 7 px/tick. Interventi in `physics.js` (parametri in `TUNE`, uguali nella taratura automatica, quindi l'equità resta tarata): (1) ruota senza contatto (distanza dal profilo noto > 4 px): il motore non la spinge più — non "frulla" a vuoto (provato uno smorzamento del giro in aria: penalizzava triangolo, ovale e fagiolo di 5–10%, tolto); (2) gravità extra in volo (+0.6 px/tick², circa 2.7× in totale per ruote e, a ruote entrambe in aria, telaio); (3) vicino al suolo (1.5–16 px) la velocità che si allontana dalla strada, se < 12 px/tick, viene smorzata dell'80% lungo la normale — i salti veri delle rampe restano, i saltelli no; la zona sotto 1.5 px è esclusa perché lì la ruota sta rotolando sullo spigolo e smorzarla la frenava (provato: triangolo 2× più lento sulle rampe). Provato e scartato: tetto al giro rispetto all'avanzamento (rallentava anche la tonda del 45%) e motore più lento (tonda −13%/−20%). Misure (headless, `contact.js`, 3 piste fisse): tempo in aria tonda 2%, ovale 26%, quadrato 31%, triangolo 40%, pentagono 27%, stella 22%, ingranaggio 12%, blob 25% (prima: 4%, 72%, 70%, 76%, 65%, 56%, 43%, 64%); quota media in volo 7–13 px (prima 12–29). Equità su 8 piste fisse, 12 forme perfette: vittorie su 7 forme diverse; ritardo medio dal migliore: tonda 2.4%, quadrato 1.8%, pentagono 1.7%, stelle 0.7–2.2%, ingranaggio 1.9%, triangolo 6.2%, ovale 7.0%, blob 6.1%, fagiolo 15% (prima: 1–4%, blob 6.7%, fagiolo 11.8%): triangolo e ovale restano un po' dietro; i poligoni spigolosi continuano a "saltellare" un po' perché ruotano sullo spigolo, è la loro natura.

**Nuovi ostacoli nei biomi (settimo giro)** — quattro tratti in più, tutti solo profilo del terreno (nessun corpo fisico extra: costo di disegno 0,1–0,6 ms per fotogramma su desktop, misurato con `drawcost.js`): *massi* (2–3 pietre tondeggianti di altezza 28–58 px, a distanze irregolari: muschio nelle colline, ruggine nella ghiaia, polvere sulle rampe, alghe nella laguna), *dossi* stile motocross (4–5 gobbe di 28–46 px a ritmo irregolare, sulle rampe e nella laguna: piccoli trampolini), *creste di ghiaccio* (3–4 schegge cristalline alte 26–36 px sul ghiaccio) e *conche* (avvallamento di 60–80 px con pozza sul fondo, in colline e ghiaia). Sono una "seconda scelta" che si aggiunge al terreno a tema (`PATCH_EXTRA` in `terrain.js`): se il primo tratto c'è, viene spinto verso un'estremità della zona per lasciare posto; margini più stretti per gli ostacoli corti (`LIGHT`). Ostacoli per pista: da 5,7 a circa 7,8 in media. Equità misurata su 8 piste fisse con 12 forme: invariata (vittorie e ritardi medi nello stesso intervallo di prima); nel passaggio singolo gli ostacoli sono quasi neutri fra le forme (±5% sui tempi), la ricchezza viene dalla varietà, non da nuove nicchie. Ottimizzati anche i disegni più pesanti (strada ad archi 1,44 → 0,83 ms, dentiera meno punti per linea). Misura/consegna: l'intro del pennello è ora più lunga (8,3 s con `LANE = 2500`), quindi gli script di test aspettano 16,5 s prima della partenza.

**Anti-freeze e anti-glitch (ottavo giro)** — misure (browser headless con profiler; fotogrammi assoluti non confrontabili perché il rasterizzatore è software): il JS durante la gara è quasi tutto inattivo (93% idle; fisica ~0,6 ms mediana e 1,3 ms al 95° percentile per passo con 8 bici, massimo 9,5 ms), mentre i punti che potevano bloccare il thread principale erano altri tre. (1) *Taratura delle ruote* (~0,5 s di calcolo per forma su un PC, a fette da 8 ms sul thread principale ⇒ metà dei fotogrammi dell'intro persi, e su un telefono lento non finiva in tempo): ora gira in un pool di worker (`js/calworker.js`, fino a 3, `Sim.warmCalibration` all'avvio dell'host); il profilo dell'intro non mostra più calcoli fisici sul thread principale; se il worker non parte si ricade sul calcolo a fette di prima. (2) *Costruzione del mondo fisico* (~1100 corpi statici su una pista lunga, ~100 ms in un colpo al "VIA", mezzo secondo su un telefono lento): `Sim.prepareAsync()` la costruisce a fette da 4 ms durante l'intro, `Sim.ensureWorld()` la usa al via (o ricade sulla costruzione immediata). (3) *Timer della fisica dell'host*: un `setInterval` sul thread principale scende a 1 Hz con la scheda in secondo piano e bloccherebbe la gara per tutti; ora è un tick da un Worker (`Ticker` in `game.js`, fallback a `setInterval`). Sul lato client, gli snapshot ora portano il timbro dell'host e vengono collocati sull'orologio del client con la latenza minima osservata, e se un pacchetto è in ritardo le bici proseguono sulla velocità dell'ultimo intervallo (max 120 ms) invece di fermarsi: in una simulazione con jitter (40–90 ms, 2% di stalli da 250 ms) l'errore di velocità mediano per fotogramma passa dal 28% allo 0,8% e i fotogrammi "quasi fermi" da 128 a 28 su ~1100. Misure in gioco: aprendo la pagina con `?perf=1` compare un riquadro con fps, fotogrammi >50/100 ms, costo di disegno, massimo della fisica e buco massimo fra snapshot (anche `window.__perf`). Non misurabile qui: il costo di raster su GPU di un telefono vero (in software, sfondo/terreno/primo piano sono le voci più care; esiste già `qualityGuard` che abbassa la qualità se il dispositivo fatica).


**Carattere della pista, audit del terreno e suoni (nono giro)**
- *Audit statico* (`audit.js`, 150 piste casuali): pendenze, gradini fra punti a 2 px, tratti troppo vicini, tratti sopra ponti/vuoti o a ridosso dei bordi di zona, fiori. Trovato e corretto: i **massi** e i **tronchi** avevano pareti verticali all'estremità (profilo `(1−d²)^0.55`, pendenza infinita al bordo, passi >9 px fra due punti a 2 px); ora il profilo è a campana `(0.5+0.5·cos πd)^0.7` con pendenza nulla al bordo e massi più larghi (72–102 px). Dopo la correzione: 0 gradini, 0 sovrapposizioni, 0 tratti su ponti/vuoti. Restano segmenti >52° (max 65°) solo dove è voluto: pareti di buche, archi e gradoni.
- *Bot di corsa* (`snag.js`: 10 forme × 25 piste, ogni gara completa, rileva blocchi con sblocco automatico e ribaltamenti): nessuna gara non finita. Il test ha scovato che la **conca** e il **gradino** sul ghiaccio bloccano le bici (ruote che non risalgono con grip 0.1): tolti dal ghiaccio, che resta con le creste. (Il rilevatore di ribaltamento aveva l'angolo invertito e segnalava tutte le partenze: corretto.)
- *Due nuovi ostacoli di carattere*, solo profilo del terreno: **trampolino + fossato** (`jump`: rampa di 34–44 px, bordo ripido, fossato largo 120–150 px profondo 38–46, risalita di 110 px; rampe e ghiaia) e **gradino in discesa** (`drop`: calo di 46–62 px su 120 px, tratto basso, risalita larga 240 px; colline e ghiaia). Il fossato è largo meno dell'interasse (le due ruote non ci stanno insieme). Equità misurata (`obsstudy.js`, tempo extra rispetto alla tonda): trampolino 0–0.33 s, gradino 0–0.47 s su ~3.3 s di tratto: nessuna forma è tagliata fuori; la prima versione del gradino (calo 54–74 su salita di 170 px) costava al triangolo 0.78 s ed è stata ammorbidita. Ostacoli per pista: ~8. Bot dopo la correzione: 10 forme × 25 piste = 250 gare, 0 non finite, 11 sblocchi automatici (4%), 6 ribaltamenti, sparsi senza un punto fisso. Equità su 8 piste fisse × 12 forme (`wins5`/`agg5`): **peggiorata** rispetto al giro precedente — la stella a 8 punte vince 6 piste su 8 (prima 3–5) con ritardo medio 0.8% contro 2–3% della maggior parte delle altre; fagiolo +15.7%, ovale +7.2%, triangolo +6.7%, esagono +6.5%. Misura solo headless e su 8 piste (rumore ±1–2 vittorie), ma la tendenza c'è: è il punto da affrontare per primo nel prossimo giro.
- *Altre correzioni trovate dall'audit*: i fiori non nascono più su pendenze >~28° (prima 6–10 su 150 piste, sembravano sospesi); `zoneAt` non si rompe più se il layout nuovo è più corto del precedente (indice di zona in cache fuori intervallo).
- *Tema inchiostro*: il fossato è una macchia d'inchiostro nero lucida con setole, gocce che colano e schizzi; il gradino è una larga pennellata nera con gocce, schizzi e una freccia a pennello; il trampolino ha assi (rampe) o lastre (ghiaia) con strisce nere di avviso. I pulsanti IT / EN / audio in alto a destra sono macchie d'inchiostro nero con una goccia (filtro SVG `#dw-ink` solo sullo sfondo, il testo resta nitido).
- *Suoni* (`js/sound.js`): tutto **sintetizzato con WebAudio**, nessun file scaricato e nessuna licenza da rispettare. Rotolamento continuo che segue velocità e superficie (erba, ghiaia, ghiaccio, sabbia, fango, dentiera/archi a ritmo, terreno sconnesso, acqua), bip del 3-2-1 e "VIA", pennellata dell'intro, atterraggi (peso in base alla velocità verticale), schizzo in acqua, fanfara di arrivo (diversa per 1° posto, piazzamento, non arrivato), suono del cambio ruota, click sui pulsanti. Parte solo dopo il primo tocco (regola dei browser mobili), si ferma con la scheda in secondo piano; il pulsante in alto (🔊/🔇 disegnato in SVG) lo spegne e la scelta resta salvata (`localStorage`, chiave `dw_sound`). Non aggiunge dati in rete: gli atterraggi/schizzi si deducono dalla posizione già interpolata della propria bici. Provato in headless: nessun errore, nodi audio creati, pulsante che commuta; **il risultato sonoro su un dispositivo vero non è verificabile qui**.

**"Gara meno classica" (decimo giro)** — nel lobby l'host sceglie *Classic race* o *Less classic race* (`allReady` porta il flag `crazy`; pista e ostacoli restano gli stessi). Nella modalità meno classica compaiono **portali d'inchiostro** (`Terrain.PORTALS`, piazzati con un RNG separato dal layout, quindi la gara classica non cambia; mai su ponti/vuoti né sui tratti a tema; 1/2/3 coppie specchio e 2/3/5 salti per pista corta/media/lunga):
- *Salto* (carta chiara con vortice): sposta la bici di 150–400 px **avanti o indietro, a caso a ogni passaggio** (decide l'host; la bici riappare sul punto più alto del terreno sotto di lei, mai sul vuoto).
- *Specchio* (nero): solo per chi lo attraversa la vista si specchia e si passa in **bianco e nero sulla carta a quadretti** (lo stesso foglio della schermata iniziale), e la bici va davvero all'indietro (`racer.dir = -1`: motore, tetto di velocità, controllo anti-blocco e salto di sblocco lavorano in coordinate di avanzamento `dir·x`; il traguardo vale solo in avanti).
- *Uscita* (anello tratteggiato, 650–900 px dietro lo specchio, appena visibile finché non serve): rimette tutto com'era. C'è anche una rete di sicurezza: se la bici supera l'uscita senza toccarla, torna normale comunque.
- **Ogni portale si attraversa una sola volta in tutta la gara e poi si dissolve per tutti** (schizzi d'inchiostro che cadono): chi arriva per primo lo consuma, gli altri lo trovano sparito (versione precedente: ognuno poteva usarlo una volta). Lo specchio è di chi lo prende, e l'uscita collegata è solo sua (le altre uscite restano in ombra; la sua è in evidenza). Se due bici toccano lo stesso portale nello stesso passo di fisica l'ordine è casuale. Gli altri giocatori non vedono lo specchio degli altri: è un effetto solo sulla propria vista.
- Disegno: anelli ondulati sovrapposti che scorrono verso una spirale centrale, sbavatura e puntini, gocce che colano; la metà anteriore dell'anello è disegnata *sopra* la bici, così sembra entrarci. Lo specchio è nel disegno (non un ribaltamento CSS), quindi **le scritte restano leggibili** (ogni `fillText/strokeText` viene raddrizzato attorno al suo punto). Avviso a macchia d'inchiostro ("Avanti!", "Indietro!", "Specchio! Torna indietro fino al portale d'uscita"), lampo d'inchiostro al salto, camera che guarda davanti alla bici anche in retromarcia.
- Misure (`crazybot.js`, 10 forme × 10 piste in modalità meno classica = 100 gare): 0 non finite; 200 specchi su 200 chiusi dall'uscita; retromarcia media 2.6 s (massimo 7.2 s); 4 sblocchi in retromarcia su 100 gare. Gara classica dopo le modifiche (`snag.js`, 100 gare): 0 non finite, 3 sblocchi, 1 ribaltamento. Non misurabile qui: come si sente su un dispositivo vero e se il salto casuale è "divertente" (a gusto).
- *Suoni*: nuovi suoni dei portali (schizzo che sale/scende per il salto, nastro al contrario per lo specchio, campanella per l'uscita); il rotolamento ora ha un ronzio che sale con la velocità e, per le ruote poligonali, il "colpo" di ogni vertice sul terreno (ritmo = giri della ruota × vertici); il suono resta sintetizzato in WebAudio. Il pulsante audio e il tema a inchiostro dei pulsanti IT/EN sono già descritti nel giro precedente.
- *Più portali e arrivo con effetto (undicesimo giro)*: salti 4/6/9 e coppie specchio 2/3/4 per pista corta/media/lunga (in media 6/9/12 portali; distanza minima fra portali 260 px). Chi attraversa un salto vede il portale dissolversi, la bici riappare **rimpicciolita** nel punto d'arrivo e cresce con un piccolo rimbalzo dentro un anello d'inchiostro che si apre e poi si dissolve in schizzi (lo vedono anche gli altri giocatori sulle bici altrui), con la scritta "Avanti! +167" / "Indietro! −231" e due suoni (entrata e, 0,33 s dopo, "pop" d'uscita). Bot (100 gare, 12 portali per pista): 0 non finite, 300 specchi su 300 chiusi dall'uscita, 600 salti, 0 sblocchi in retromarcia, retromarcia massima 5 s. L'intro del pennello è stata accorciata (`LANE` 2500 → 1900, da ~8,3 a ~6,5 s).

**Partenza uguale per tutti e massimo 5 giocatori (dodicesimo giro)**
- *Stesso punto di partenza*: prima ogni bici partiva 200 px più avanti della precedente (60 + indice·200) e chi era più avanti guadagnava spazio. Ora tutte partono da x = 60, alla stessa quota, sia nella fisica (`addRacer`) sia nella griglia mostrata durante il conto alla rovescia (`placeGrid`). Le bici non si urtano (gruppo di collisione condiviso), quindi possono stare nello stesso punto; la propria bici viene disegnata per ultima, sopra le altre.
- Prova (`fairstart.js`, pista corta): 5 bici alla partenza hanno tutte x = 60 e y = 380; **5 ruote tonde identiche tagliano il traguardo nello stesso istante (37,967 s ×5)**; l'ordine di partenza invertito dà gli stessi tempi per ogni bici; ogni bici fa lo stesso tempo da sola e in gruppo (differenza massima 0,000 s). Il vantaggio dell'host è solo visivo: la fisica è la stessa per tutti (l'host vede le bici con 45 ms di ritardo di interpolazione, i client con 130 ms, ma nessuno controlla la bici).
- *Massimo 5 giocatori* (host + 4): `MAX_PLAYERS = 5` era già controllato all'apertura della connessione, ma il giocatore veniva registrato solo al messaggio `join`: se più persone aprivano la connessione insieme potevano entrarne più di 5. Provato con connessioni finte (`maxplayers.js`, 8 persone che entrano insieme): **prima 9 giocatori in lobby, ora 5** (gli altri ricevono «pieno»), 5 colori distinti. Ora `join` ricontrolla il limite. Testo del menu: «fino a 4 amici (5 giocatori in tutto)».
- *Portali condivisi e non più numerosi del necessario (tredicesimo giro)*: la gara meno classica deve essere molto più casuale, quindi i portali sono **in comune**: l'host tiene l'elenco dei portali consumati (`Sim.usedPortals()`, mandato in ogni snapshot come `pu`) e ogni client li fa dissolvere. Il numero **dipende dai giocatori** (`np`, mandato nel messaggio `allReady`): i valori sono tarati per 5 giocatori e scalati in proporzione (minimo 1 coppia e 2 salti), perché chi è in testa li consuma tutti e con pochi giocatori ognuno ne incontrerebbe troppi. Portali piazzati in media (coppie specchio + salti) — 5 giocatori: 2,6+5,3 / 3,5+8,9 / 5,5+11,8; 3 giocatori: 1,8+4 / 2+7 / 3,9+10; 2 giocatori: 1+3 / 2+4 / 2+6; 1 giocatore: 1+2 / 1+2 / 1+3 (pista corta / media / lunga; ogni coppia conta 2 portali). Prova con 5 bici insieme (`crazy5.js`, 10 piste): **ogni portale consumato una sola volta** (eventi = portali usati, per salti e specchi), uscite = specchi, **tutti i salti e tutti gli specchi vengono usati da qualcuno**, 5 su 5 arrivano in tutte le 10 gare, retromarcia massima 3,2 s, nessuno resta specchiato. (Una versione precedente di questa nota parlava di portali inutilizzati: era una lettura sbagliata dei dati.)
- *Immunità dopo il salto (quattordicesimo giro)*: dopo un salto o l'uscita dallo specchio la bici è **immune ai portali per 2,5 s** (`IMMUNE_MS` in `physics.js`): ci passa attraverso e i portali restano per gli altri, così chi è in testa non viene rimbalzato di continuo. Effetto visivo: alone luminoso nel colore del giocatore (bagliore bianco→colore dietro la bici, anello tratteggiato e scintille sopra), che pulsa e si spegne negli ultimi 0,6 s; lo vedono tutti (`im` = ms rimanenti nello snapshot). Prova con 5 bici (6 piste): l'intervallo minimo fra due portali presi dalla stessa bici è 2,9 s (prima poteva essere subito), tutte arrivano, nessuno resta specchiato.

**Studio** (9 forme perfette, 2 serie da 60 piste, ognuna da sola e tarata → 120 piste): pentagono 32, ovale 21, esagono 16, triangolo 15, quadrato 14, tonda 11, stella 8, dentata 3, blob 0. Ritardo medio: pentagono ~1.4%, tonda 2.4%, quadrato 2.2%, esagono 2.3%, ovale 2.7%, triangolo 3%, dentata 3%, stella 3.2%, blob 6%. Da una serie all'altra una forma varia di ±5–8 vittorie (rumore).
Con forme disegnate a mano (rumore + rotazione, 60 piste): quadrato 24, pentagono 18, esagono 7, dentata 4, blob 2, tonda 2, stella 2, ovale 1, triangolo 0.
Tempi per tipo di terreno: strada a 3 archi → triangolo (o blob), a 4 → quadrato, a 5 → pentagono/stella, a 6 → esagono; dentiera (anche sul ghiaccio) → stella (-25% sulla tonda); fango → stella; buche/gradoni → ovale/tonda; rampe → tonda/quadrato.

**Limiti noti:** le differenze fra forme sui terreni "normali" restano ±2–3% (la fisica è caotica: un rimbalzo diverso cambia il tempo), e le nicchie dei terreni a tema pesano circa quanto questo scarto; per questo il vincitore dell'intera gara cambia a ogni piccola modifica dei parametri. La stella perde ancora sulle rampe/buche/gradoni, la tonda quasi non vince mai l'intera gara, il triangolo disegnato a mano è lento sulle rampe (+9%), e tutto è misurato solo in headless.
Nota: la griglia di partenza non è più sfalsata (vedi «Partenza uguale per tutti» sotto).

### Fluidità di visualizzazione
- **Interpolazione degli snapshot** (`interpolateRacers` in `game.js`): prima bici e ruote venivano disegnate con l'ultimo snapshot, che cambiava solo 20 volte al secondo, quindi si vedevano "a scatti" anche su schermi a 60/120 Hz (la telecamera era già morbida, i mezzi no). Ora si tengono gli ultimi 16 snapshot e si disegna un istante nel passato (host 45 ms, client 130 ms) interpolando posizioni e angoli (angoli sul percorso più corto); un salto grande (rimessa in pista) non viene interpolato. Non c'è controllo del giocatore, quindi il ritardo non si nota.
- **Host**: la fisica gira ogni ~16 ms (prima 50 ms, 3 passi alla volta) e gli snapshot di rete restano a ~20/s.
- **Taratura in anticipo:** parte appena l'host riceve ogni ruota (`receiveWheel`), durante i 30 s di disegno degli altri; al conto alla rovescia il risultato è già in cache.
- Non misurabile qui: il Chromium headless senza GPU fa 4–5 fps, quindi la verifica va fatta su dispositivi veri.

## Quindicesimo giro: scia a pennello e tracciato finale

- Dietro ogni bici (in entrambe le gare, costante `TRAIL_CLASSIC` in `js/game.js`) c'è una **pennellata piena** nel colore del giocatore: nasce da una macchia più scura, ha righe chiare di carta che affiorano, la coda si sfilaccia in setole e lascia schizzi. Si spezza quando la bici attraversa un portale che la sposta.
- Nella schermata dei risultati il canvas `#results-trace` mostra il **tracciato finale**: foglio a quadretti, profilo morbido della pista, portali, bandierina e la corsa di ognuno come pennellata, con archi tratteggiati per i salti.
- Verificato solo in Chromium headless (nessun telefono reale).

Tracciato finale (rifinito): le linee sono quelle vere della gara ma ammorbidite (niente tremolio dei sobbalzi) e appoggiate alla collina; con più giocatori ogni corsia è leggermente sfalsata, con bordo chiaro, l'ultimo sotto e il primo sopra, e all'arrivo c'è il numero di posizione. I portali (anelli neri, tratteggiati le uscite) sono disegnati sopra le linee con un alone chiaro. Il canvas è a doppia risoluzione.

## Sedicesimo giro: equità (fiori e contatto a terra) e tasto "Invia link"

- **Fiorellini**: il corpo fisico era posizionato col segno sbagliato (sporgeva 1,55·r invece di 0,55·r, cioè 14–23 px invece di 5–8). Le ruote piatte (fagiolo, ovale) ci si appoggiavano sopra restando sospese. Corretto in `buildFlowers` (`js/physics.js`).
- **Contatto a terra**: `antiSink` ora controlla anche punti lungo gli spigoli della ruota (non solo i vertici), così una ruota poligonale che poggia su uno spigolo in salita non viene creduta "in aria" (il motore non spinge in aria).
- Misure headless (8 layout, 12 forme): il fagiolo passa da +15,7% a +11,2% di ritardo medio e le vittorie si distribuiscono fra più forme (prima la stella a 8 punte ne vinceva 6 su 8, ora 3); su colline senza ostacoli il fagiolo non si pianta più (23,9 s → 18,1 s, tonda 17,2 s). Bot su 100 gare: nessun salto di recupero, nessun capovolgimento, tutte finite.
- Strumenti: `stall.js`, `stall2.js`, `stall4.js`, `stall5.js` (dove e perché una forma si ferma).
- **Invia link**: nel menu il tasto "Invia il link del gioco" (condivisione nativa su telefono, altrimenti copia negli appunti); in lobby "Invia invito" manda il link con `?c=CODICE`, e chi lo apre trova il codice già compilato (deve solo mettere il nome e premere Unisciti).

Rifinitura "Invita": su telefono resta una macchia d'inchiostro in alto (icona condividi, apre la condivisione nativa e, se manca, copia il link con un avviso a schermo); su desktop (≥701 px) il link compare dentro la card, nel menu e in lobby, in un campo da copiare con il tasto "Copia" (diventa "Copiato ✓"). In lobby il link contiene `?c=CODICE`.

## Diciassettesimo giro: audio più morbido e musica

- **Effetti**: via onde quadre e a dente di sega; solo sinusoidi/triangoli e rumore filtrato, con un filtro che taglia gli acuti (3,6 kHz) e un riverbero corto. Clic, conto alla rovescia, arrivo, rifacimento ruota e uscita dal portale sono note "di legno" (marimba/kalimba) invece di bip. Rotolamento circa 6 dB più basso (il tappeto continuo era la cosa più rumorosa), colpi delle ruote poligonali al massimo 9 al secondo, modulazione dei terreni a ritmo limitata a 14 Hz.
- **Musica generativa** (nessun file): do maggiore pentatonico a 88 bpm, accordi di una battuta in progressioni da 4 battute scelte a caso fra 4, pad morbido + basso sinusoidale + arpeggio di kalimba che sceglie note vicine alla precedente. Menu, lobby, disegno e risultati: umore "calma". In gara: umore "corsa" (cassa leggera e spazzola, musica un po' più bassa). Si spegne e riaccende col pulsante audio (la scelta resta salvata) e si ferma quando la scheda è in background.
- **Misure** (render offline in Chromium headless, `br/audiotest.js`): rotolamento da −27,7 a −34,2 dB RMS (erba) e da −27,1 a −33,5 dB (ghiaia); centroide degli effetti più basso (es. specchio 2094 → 611 Hz, quota sopra 4 kHz dal 13,7% allo 0,1%); musica −33 dB RMS in calma e −35 dB in corsa, sotto gli eventi. Non ho potuto ascoltarlo su altoparlanti veri: giudizio finale all'orecchio.

## Diciottesimo giro: fagiolo e forme "scomode"

- La taratura trovava solo la velocità del motore: le ruote che sbandano per le asperità (fagiolo, triangolo) accelerano in modo ineguale e dopo ogni urto restavano indietro. Ora la taratura scala anche la coppia (`ACCEL_CAL` in `js/physics.js`, la ricalibrazione è automatica).
- Misure headless (8 piste, 12 forme, ritardo medio dal migliore): fagiolo 11,2% → 5,3%; triangolo 7,0% → 3,1%; oval 5,9% → 5,1%. Su colline, ghiaia e ghiaccio senza ostacoli il fagiolo fa lo stesso tempo della tonda (4,63 s contro 4,62 s); resta indietro del ~10% sulle rampe.
- Bot su 100 gare con 10 forme: tutte finite; 2 eventi rari (un ribaltamento del triangolo su rampa, un recupero dell'ovale sul ghiaccio a dossi), prima 0. Provato anche con coppia scalata al 60%: peggio (fagiolo 7,7% e 3 ribaltamenti), quindi tenuta al 100%.

## Diciannovesimo giro: telefono (verticale/orizzontale), schermo intero e installazione

- **Titolo del bioma** non più coperto dal riquadro in alto a sinistra (minimappa + classifica) in verticale: se lo coprirebbe, scende sotto il riquadro (`js/scenery.js`).
- **Suggerimento "Consigliata visuale orizzontale"** spostato in basso e sfuma dopo 7 s (prima copriva il riquadro e i tasti).
- **Orizzontale con barre del browser** (altezza ≤ 480 px): riquadro compatto (senza barra di avanzamento, minimappa e righe più piccole, pulsante "Cambia forma" più basso e piccolo).
- **Schermo intero**: dove il browser lo permette (Android, iPad) c'è un tasto a macchia che lo attiva e prova a bloccare l'orizzontale; Safari su iPhone non lo consente a una pagina. (L'installazione "Aggiungi alla schermata Home" con manifest e suggerimento nel menu è stata provata e poi tolta su richiesta.)
- Corretto un refuso nel numero di versione del CSS (`style.css?v=`), che poteva lasciare in cache vecchi stili.

Pulsante audio a tre stati (tocchi successivi): musica ed effetti → solo effetti (musica spenta; icona con un'onda sola) → muto (icona barrata); un avviso a schermo dice quale è attivo e la scelta resta salvata. Per togliere solo la musica (l'arpeggio di kalimba) basta un tocco.

## Ventesimo giro: la canzone al posto della musica generativa

- La musica generativa (arpeggio di kalimba/marimba, pad, basso) è stata tolta. Al suo posto c'è la canzone dell'autore: `audio/canzone.mp3` (2:50, 128 kbps stereo, 2,7 MB, normalizzata a −16,5 LUFS con −9 dB di guadagno lineare, senza compressione; l'originale era a −7,1 LUFS con picchi a 0 dBFS).
- Si ascolta in streaming con un elemento `<audio>` collegato al bus della musica (niente decodifica in memoria), in loop, parte al primo tocco, ha due livelli (calma nei menu, un po' più bassa in gara per farsi sentire gli effetti), e si ferma in "solo effetti", in muto e quando la scheda va in background. Il pulsante audio a tre stati resta com'è.
- Per cambiare canzone basta sostituire `audio/musica.mp3` (pezzi e tempi sono nelle costanti `SEQ`/`PACK` di `js/sound.js`); i livelli sono le costanti `MUSIC` in `js/sound.js`.
- Gli effetti con note "di legno" (clic dei pulsanti, conto alla rovescia, arrivo, portali) restano.

## Ventunesimo giro: la canzone tagliata sulle battute
- Analisi della traccia: 120 BPM esatti (la ripetizione del drop dista 80,000 s = 40 battute), 4/4, tonalità di Do (Do minore/maggiore ambigua: Re, Do, Si♭, Mi♭, Sol sono le note più presenti). Il drop cade all'inizio della battuta 8 (15,5 s nel file originale): è lì che la griglia delle battute è ancorata.
- `audio/musica.mp3` (1,3 MB, 160 kbps, 70,4 s) sostituisce `canzone.mp3`: contiene solo i pezzi che servono, tagliati sulle battute (2 s l'una): intro calma + drop + due frasi di gara (0–50 s), quattro battute calme del break (50,2–58,2 s), finale con coda (58,4–70,4 s). Le parti calme sono alzate di 6 dB (−19 LUFS; la gara è a −15 LUFS), il tutto con −9 dB come prima.
- Motore a sezioni in `js/sound.js`: i pezzi sono programmati sull'orologio dell'audio (non con timer), cambiano solo sulla battuta successiva e si sovrappongono con dissolvenze a potenza costante brevi (80 ms, prima della battuta così il colpo resta intatto) o lunghe (1,5 s, uscite verso il menu).
  - Menu/lobby/disegno: loop calmo di 8 battute (intro + break).
  - Gara: `Sfx.raceStart(startTime)` fa arrivare al drop con le battute dell'intro e il colpo cade esattamente sul "VIA" (misurato: 0 ms di scarto); poi loop di 16 battute. I bip 3-2-1-VIA sono programmati sullo stesso orologio e il VIA è un accordo Do-Sol-Re sul colpo del drop.
  - Risultati: il finale parte alla battuta successiva, poi rientra il loop calmo con dissolvenza lunga.
  - Effetti forti (arrivo, atterraggi violenti, portali) abbassano la musica per un attimo; in acqua la musica diventa ovattata.
  - Note degli effetti accordate sulla canzone (Do, Re, Sol, Si♭).
- Se un browser non toglie il ritardo dell'encoder mp3 (~25 ms), il motore lo compensa da solo (Chromium lo toglie già).
- `musica_a_sezioni_demo.mp3` (fuori dal gioco) è un'anteprima della sequenza: calma → arrivo → via → loop di gara → finale → calma.

## Ventiduesimo giro: il Vulcano (la lava scioglie le ruote)
- Nuovo bioma (7° tipo di zona, `lava`): un lago di lava largo, ~56 px di fondo con pareti dolci, e di tanto in tanto un ponte di basalto. Intorno: cielo rosso, vulcano con cratere e fumo, alberi bruciati, braci e cenere, riflessi caldi sulle ruote. Compare nei percorsi lunghi (1 volta, 2 su quelli da 11+ zone).
- La lava è disegnata opaca davanti alle bici (le ruote ci affondano): gradiente arancio→rosso, vene di luce, croste scure alla deriva, bolle che scoppiano con scintille, bordo luminoso e alone caldo (ellisse sfumata, senza bordi).
- **Ruote che si sciolgono (organico e graduale):** ogni ruota è un contorno fitto di punti con una "fusione" per punto (0–62%). Si sciolgono solo i punti immersi nella lava, tanto più quanto sono profondi, e le punte per prime; il materiale non è uguale dappertutto (un'irregolarità fissa per ruota), quindi si "mangia" a chiazze invece di rimpicciolire. Il contorno sciolto è continuo ("cera che cede") e il corpo fisico si ricostruisce ogni 120 ms con la forma vera.
- Lo svantaggio resta (la ruota non viene ritarata) e in più la spinta cala in proporzione alla materia persa (`MELT_GRIP`): dopo un lago, ~1–4 s in più sul resto di un percorso medio. Ridisegnare la ruota (cambio forma) azzera tutto: è lì che chi ha già usato i cambi paga lo svantaggio.
- La lava frena solo le ruote davvero immerse (prima frenava per tutta la conca e bloccava l'uscita in salita).
- Rete: l'host manda `{type:'melt', id, f:[…], r:[…]}` (interi 0–100 per punto); i client ricostruiscono la forma con `Sim.meltBase`/`Sim.meltVertices`.
- **Bug trovato e corretto lungo la strada:** i vincoli degli assi (Matter ricorda l'angolo del telaio alla creazione) restavano storti se la ruota veniva ricostruita (fusione, ma anche ridisegno in gara) con la moto inclinata; la moto si incastrava per decine di secondi. Ora `makeAxle` azzera `angleA`.
- Misurato (bot, 12 forme): tempi entro ±1 s su percorsi con uno o due laghi (es. colline>lava>colline 18,1–20,2 s). Non sono prove su dispositivi reali.
- Suoni: sfrigolio nella lava (`Sfx.sizzle`), ovattamento come in acqua.

## Ventitreesimo giro: il portale gigante (solo "Gara meno classica")
Idea: godersi, per un tratto di gara, il fatto di avere ruote enormi.
- Coppia di portali: **gigante** (anello d'inchiostro, cerchi concentrici che si allargano) e, 1400–1900 px dopo, il **portale grande** (3 volte più largo e 2,4 più alto, tratteggiato, cerchi che si stringono). 1/2/3 coppie secondo la lunghezza; il tratto non contiene laghi, canyon o lava, ma può avere massi, dossi e fango: una ruota enorme ci passa sopra.
- Non si consumano: ognuno li attraversa una volta (chi è in testa non li toglie agli altri); l'anello si dissolve solo sullo schermo di chi l'ha usato.
- **Taglia legata alla posizione:** da 1 a **2,2** mentre attraversi il portale gigante (±45 px), resta così nel tratto, torna a 1 mentre attraversi il grande (±110 px). In fisica la scala segue la posizione con gradini di 0,14 ogni 30 ms. Se un teletrasporto ti lascia a metà, la taglia è già quella giusta.
- **La bici cresce intera:** gli attacchi delle ruote si allontanano in proporzione (×scala), il telaio ha l'inerzia moltiplicata per scala² (senza, i vincoli rigidi con leve così lunghe esplodevano a ×2,2), le ruote giganti mantengono la massa di quelle normali, e a ogni gradino la bici si alza quanto serve per non affondare. Le ruote ricostruite conservano forma e fusione da lava.
- Velocità: il tetto cresce con `scala^0,6` (≈ +60%): ~600–700 px/s contro i ~440 normali; il tratto dura circa 5 s. Tempi equi fra le forme (bot, 6 forme × 4 piste: 64–76 s).
- **Effetti (solo disegno e suono, nessun effetto sulla fisica):** la telecamera si allontana (zoom dinamico fino a ~0,68, con ritorno dolce); la terra trema appena mentre sei gigante e veloce e più forte agli atterraggi; polvere sotto le ruote e nuvole di terra quando atterri; fiori e cespugli reagiscono con raggio proporzionale; rombo grave continuo sotto la musica e "tonfo" all'atterraggio (`Sfx.giant`, `Sfx.thud`). La bici e il pilota sono disegnati scalati.
- Rete: `sc` viaggia nello snapshot dell'host e nell'interpolazione dei client; tutto il resto (zoom, tremolio, polvere, suoni) è locale. Eventi `g` (gigante) e `n` (normale) con nota "Gigante!" e suoni dedicati.
- Bug trovati lungo la strada: le ruote giganti si vedevano normali (la scala non passava nell'interpolazione dei client) e, a ×2,2, la bici esplodeva (inerzia del telaio).
- Misurato con bot, non su dispositivi reali: la sensazione di guida, il tremolio e il rombo vanno provati a mano.

## Ventiquattresimo giro: biomi più lunghi e vulcano che incide davvero
Dopo due partite corte il feedback era: i biomi cambiano troppo in fretta e il vulcano passa senza far sentire la lava sulla ruota (una volta è anche arrivato subito dopo la partenza).
- **Zone più lunghe (circa +15%):** colline 1750→2000 px, ghiaccio 1700→1950, canyon 1750→2000, laguna 2400→2750, rampe 2000→2300, vulcano 2300→3000. Partenza e arrivo invariati. Le lunghezze (7/11/15 zone) non cambiano: una corta passa da circa 45 s a circa 52 s.
- **Lago di lava più lungo:** 640→940 px (pareti 300 px). La fusione è più lenta (`MELT_RATE` 1,6→1,0), così il danno cresce gradualmente per tutto il lago invece di saturare subito: dopo un lago la ruota è sciolta al 30–35% circa, dopo due al 45–50% (il massimo resta 62%).
- **Mai il vulcano come prima zona:** se il sorteggio lo mette in testa, viene scambiato con una zona più avanti senza creare due zone uguali vicine.
- Frequenza del vulcano (20 000 piste per misura): corta sempre 1 (2 nel 17% dei casi), media sempre 2, lunga 2 o 3 (metà e metà). In tutte le piste compaiono tutti e 6 i biomi.
- Misurato (bot, 12 forme): un lago, 22,7–24,7 s; due laghi in fila (colline>lava>ghiaccio>lava>canyon) 37–44 s con la sola ovale più lenta (44,5 s). Modo meno classico: 60 gare, tutte finite, 65–88 s; portali giganti sempre 2 coppie su 11 zone, tratto di circa 5 s. Con la fusione veloce di prima il danno si sommava troppo e la spanna fra le forme arrivava a 14 s: per questo è stata rallentata. Non sono prove su dispositivi reali.

## Venticinquesimo giro: la bici non si ribalta più
Segnalato in gara: dopo il portale gigante la bici si è ribaltata. Riprodotto coi bot (13 ribaltamenti su 144 gare, anche a taglia normale, per lo più subito dopo l'anello o all'atterraggio), quindi risolto in generale, per tutte le modalità.
- **Antiribaltamento (`antiFlip`):** se il telaio è inclinato oltre ~43° o *sta per* esserlo (si stima l'angolo fra 8 passi dalla velocità di rotazione: impennata che sale, cappottata, giro in volo), la rotazione viene frenata e riportata verso l'alto con una forza che cresce con l'angolo. Sotto i 43° non fa nulla: la guida normale (rampe, salti, colline) non cambia.
- **Raddrizzamento (`rightBike`):** se la bici resta a testa in giù (oltre 109° per 3 passi), tutta la bici ruota rigida attorno al telaio fino a tornare in piedi, in circa un quarto di secondo, alzandosi un poco per non finire nel terreno. Non è un teletrasporto e non rompe gli assi.
- Misurato con bot (non su dispositivi reali): a testa in giù da fermo, in piedi in 0,27 s con tutte le forme provate; giro completo in volo a ~6 rad/s: prima restava capovolta per sempre, ora l'angolo massimo è ~1,0 rad e torna in piedi in 0,4–0,6 s; 144 gare nel modo meno classico, 0 ribaltamenti; inclinazione massima in gara normale ridotta (fagiolo 1,16→0,76 rad); tempi fra le 12 forme invariati o più vicini (due laghi in fila: 35–42 s, prima 37–44).
- La rete non cambia: è solo fisica dell'host.

## Ventiseiesimo giro: il tracciato finale rifatto (schermata dei risultati)
Il disegno a fine gara era una collina grigia con le pennellate sopra: non diceva dove si era corso, tagliava i salti in alto e laghi e ponti non si vedevano.
- **Biomi:** il terreno è colorato per bioma ad acquerello e sotto c'è una fascia con il nome di ogni zona (se non ci sta tutto, la prima parola; se non ci sta neanche quella, niente).
- **Laghi e ponti:** acqua e lava si vedono nei loro bacini (pelo luminoso: azzurro o arancio), i ponti sono archi bassi di legno con i due pali. Il profilo mostra anche canyon e bacini con la profondità vera; dossi e fango sono levigati, così il disegno resta pulito.
- **Tratto gigante** ("Gara meno classica"): una striscia gialla dal portale gigante al portale grande, con la scritta "Gigante!" e i bordi tratteggiati; lì le pennellate sono più spesse, in proporzione alla taglia (cresce e cala con la stessa curva della fisica). Gli anelli di quei due portali non si disegnano più, sono già nella striscia.
- **Scala:** la quota massima ora comprende anche i salti e i tratti giganti, quindi la corsa non esce più dal bordo in alto.
- **Scheda più larga:** la scheda dei risultati sale a 640 px (500 sui telefoni in orizzontale, con margini ridotti) perché i nomi restino leggibili; il corpo dei testi si adatta alla larghezza prevista.
- Resta lo stile: foglio a quadretti, linea a matita, pennellate con bordo chiaro, salti tratteggiati, numeri d'arrivo e bandierina.
- Controllato (browser headless, non dispositivi reali): desktop, telefono in verticale e in orizzontale, classica (nessun portale) e meno classica, da 1 a 4 giocatori.
- **Lingua:** nomi dei biomi e "Gigante!" vengono dalle traduzioni (italiano e inglese). Se si cambia lingua con i pulsanti IT/EN mentre si è nei risultati, la mappa si ridisegna subito nella lingua nuova. Sui telefoni in verticale un nome di una sola parola troppo lungo per la zona (es. "Ghiacciaio") non viene scritto.


## Stile grafico "poster"

`js/scenery.js` ha un interruttore `POSTER` (in alto): cielo crema quasi piatto, sole arancio pieno che respira piano, fasce collinari calde a onde (giallo → arancio → salmone → verde), alberi teal/menta con rametti sottili e stormi di gabbiani scuri che sbattono le ali. Con `POSTER = false` si torna al look precedente (cielo sfumato, sole con la faccina).


## Ventisettesimo giro: redesign "stile illustrazione" + salto e lampeggio dello zip
Dallo zip `doodle-wheels-modificati` sono stati fusi nella versione corrente (senza conflitti): **salto** (Spazio, ↑, W, tocco sullo schermo o pulsante "Salta"; ricarica 0,65 s, rete `{type:'jump'}`), **lampeggio quando si va piano** (sotto 2,4 px/passo per 1,1 s il pulsante "Cambia forma" lampeggia e compare "Sei lento! Prova un'altra forma") e lo stile "poster" della scenografia. Sopra, tutto il gioco è stato ridisegnato nello stile dell'illustrazione di riferimento: forme piene, palette calda e limitata (crema, arancio sole, giallo, ocra, salmone, teal, menta, verde, ardesia), nessun contorno scuro, nessuna sfumatura.
- **Menu, lobby, disegno, risultati:** schede crema con bordino piatto sotto, pulsanti a pastiglia, codice stanza giallo, selettori (lunghezza, modalità) a pastiglie con la scelta in arancio, sfondo con sole, fasce a onde, colline e alberi.
- **Gara:** HUD in una scheda crema con minimappa a pastiglia (zone colorate, laghi, ponti, bandierina, pallini con anello crema), classifica a pillole (la propria riga arancio), bici e ruote con bordino crema al posto del contorno nero, etichetta del giocatore a badge, scritta del bioma in una pastiglia crema, cartelli piatti, scia a nastro pieno con filo crema, terreno a colore pieno per bioma con due fasce più scure, lava e acqua a campiture piatte, primo piano di erba/cristalli/rocce nei colori della palette. Nessuna icona (il pulsante Salta ha solo testo).
- **Mappa finale:** ridisegnata nello stesso stile (cielo crema, sole, tre fasce di colline, terreno per bioma, alberi piatti, laghi, ponti, traguardo con festoni, pastiglie dei biomi) e **animata**: le corse si dipingono da sinistra a destra, poi compaiono i numeri d'arrivo e dal traguardo escono i coriandoli (nessuna animazione se il sistema chiede movimento ridotto).
- **Tolta l'animazione iniziale con il pennello** (`intro.js` eliminato): la gara parte con la griglia già visibile e, dopo circa 1,5 s di attesa (la fisica finisce di prepararsi), il 3-2-1. Prima si aspettavano circa 10 s in tutto, ora circa 5.
- **Firma:** in fondo alla scheda del menu, "Ideato e sviluppato da Stefano Kolta" (in inglese "Designed & built by"), anche nei meta della pagina.
- Misurato (browser headless e bot, non dispositivi reali): salto funzionante da tastiera (contatore a 1 e poi 2), lampeggio e suggerimento che compaiono dopo ~3 s di bici quasi ferma e spariscono quando riparte, 144 gare simulate senza ribaltamenti (angolo massimo 1,02 rad), console senza errori.


## Ventottesimo giro: doppio salto che scavalca i portali, portali ridisegnati
- **Doppio salto:** dopo un salto da terra se ne può fare un secondo *in aria* (non prima di 0,22 s, potenza 95%), una sola volta; atterrando si ricarica. Da terra resta la pausa di 0,65 s. Lo stesso tasto/tocco/pulsante: due pressioni. Il secondo salto ha il suo effetto (anello di sbuffi crema sotto la bici, campo `ja` nello snapshot). Il suggerimento sui comandi lo dice ("due volte in aria = doppio salto").
- **Saltare un portale:** specchio e teletrasporto non scattano se il fondo delle ruote passa a 112 px dal suolo o più (`PORTAL_SKIP_H` in `physics.js`): il portale resta lì, intatto, per chi lo prende. Misurato (bot, cerchio, 2 piste pazze): un salto singolo ben tempestivo arriva a ~128 px (finestra stretta, circa 0,2 s), il doppio salto a ~225 px (finestra larga, circa 0,35 s); senza salto il portale scatta sempre. L'uscita dello specchio non si scavalca (riporta comunque in avanti) e gli anelli del gigante/normale restano un tratto continuo, non si saltano.
- **Portali nello stile dell'illustrazione:** anelli piatti con bordino crema (leggibili su qualunque sfondo), riempimento chiaro, anello interno tratteggiato che ruota, puntini che girano e **una pastiglia col nome** sopra. Colore e simbolo per ogni effetto: *Teletrasporto* verde acqua con freccia ↔ · *Specchio* ardesia con freccia a U (da qui si torna indietro) · *Uscita* ardesia tratteggiato con freccia ← (solo la propria è in evidenza) · *Gigante* arancio con cerchio piccolo → grande · *Taglia normale* arancio tratteggiato con cerchio grande → piccolo. Nomi in italiano e inglese (`portal.*` in `i18n.js`). L'anello standard è alto 2·`Terrain.PORTAL_RY`+3 = 179 px.
- **Mappa finale:** i segni dei portali hanno i nuovi colori con bordino crema.
- Controllato (browser headless e bot, non dispositivi reali): in gioco due pressioni di Spazio fanno 2 salti, la terza in aria è ignorata, dopo l'atterraggio un nuovo salto parte; console senza errori.


## Ventinovesimo giro: un solo stile "Paesaggio", freccia sul tasto salto
- **Un solo stile:** il look "poster" è stato sostituito (non c'è selettore) dallo stile dell'illustrazione a tre pannelli: cieli sfumati (rosso-arancio → pesca, salvia → menta), **sole enorme e pallido** dietro le montagne, **montagne a facce** (versante lontano dal sole in ombra viola, quello vicino chiaro), **nuvole pesca a strati**, alberi a **festoni** (chioma tonda con luce a sinistra e ombra a destra) e **cipressi** bordeaux/salmone e verde-menta, colline in primo piano **a fasce** (terreno → ocra → ruggine → marrone → blu notte, mescolate al colore del bioma). Palette dei biomi in `BIOME_DEFS` (`scenery.js`); l'interruttore `LAND` accende le parti nuove.
- **Menu:** sfondo rifatto nello stesso stile (cielo sfumato, sole grande, montagne a facce, colline a fasce, cipressi). **Mappa finale:** cielo a gradiente pesca e sole pallido, per coerenza.
- **Tasto salto:** al posto della scritta c'è una **freccia in su** disegnata (SVG; resta `aria-label` per l'accessibilità). Questo sostituisce la vecchia regola "niente icone" solo per questo tasto, su richiesta.
- Controllato (browser headless e bot, non dispositivi reali): tutti i biomi in desktop e telefono, menu, risultati, salto e doppio salto, bot di ribaltamento senza capovolgimenti; nessun errore in console.


## Trentesimo giro: più portali (mescolabili), burroni veri, ponte del vulcano raro
- **Portali più numerosi e che si mescolano** (`terrain.js`, `planPortals`): coppie uscita/specchio 5/7/9 (piste corta/media/lunga, scalate sul numero di giocatori), salti d'inchiostro 11/17/24, tratti giganti 2/3/4. Le famiglie sono indipendenti: un anello d'inchiostro può stare dentro una retromarcia, uno specchio dentro un tratto gigante (resta gigante: in `physics.js`, `growLogic` non rimpicciolisce chi è già dentro), e gli anelli d'inchiostro possono stare su rampe e dossi (col salto si scavalcano). Due anelli non stanno mai a meno di 300 px.
- **Burroni veri** (nuova patch `ravine`): rampa di lancio in legno/pietra con frecce arancio e cartello, poi un vuoto profondo (190–240 px) senza ponte e largo 140–190 px, con parete di arrivo ripida. Misurato con i bot: senza salto si cade sempre, col salto singolo a metà dei casi, col doppio salto sempre. Chi cade e resta sul fondo per 1,5 s viene riportato sul bordo opposto (in retromarcia, prima della rampa) da `ravineStep` in `physics.js`. Compaiono in colline, ghiaccio, canyon e ghiaia (circa 1–3 per pista); gli anelli di salto non atterrano nel vuoto (`landOk`).
- **Più rampe e dossi corti:** fino a due ostacoli corti per zona (trampolini, conche, gradini, dossi), probabilità più alte; più ponti sospesi sulla ghiaia e sull'acqua.
- **Vulcano:** il ponte di basalto sul lago di lava ora compare di rado (circa 7% invece del 34%).
- Controllato con bot headless (non dispositivi reali): 24/24 gare complete su piste casuali, crazy-bot 30/30, nessun ribaltamento irrecuperabile, schermate dei burroni.


## Trentunesimo giro: salto più reattivo e scavalco dei portali permissivo
- **Scavalco dei portali:** prima serviva passare sul portale con le ruote ad almeno 112 px da terra, cioè quasi solo al culmine del salto (finestra di pochi px). Ora basta essere in aria dopo un salto con le ruote ad almeno 34 px dal suolo (`PORTAL_SKIP_H`, `overPortal` in `physics.js`): il salto singolo scavalca il portale a qualsiasi distanza da 90 a 300 px dal salto (testato con cerchio e stella, anche col doppio salto). I lanci naturali da una rampa senza salto non scavalcano.
- **Doppio salto:** `DJ_MIN_MS` da 220 a 130 ms e, se il secondo tocco arriva troppo presto, viene **ricordato per 250 ms** e parte appena possibile. Sul client l'anti-rimbalzo passava da 180 ms: un doppio tocco veloce veniva scartato; ora è 45 ms (solo per evitare doppi eventi). Verificato in browser con secondo tocco dopo 60, 120, 200 e 300 ms: il doppio salto parte sempre.
- **Tocco:** sui telefoni c'è anche una breve vibrazione (8 ms) al salto, dove il browser la supporta.


## Trentaduesimo giro: doppio salto più reattivo, ingigantimento + teletrasporto sistemati
- **Salto con memoria (`jumpTry`, `JUMP_BUF_MS` 240 ms):** un tocco rifiutato perché troppo presto (pausa dopo un salto, secondo salto prematuro, atterraggio imminente) viene ricordato e parte appena possibile. Si può fare il primo salto anche pochi istanti dopo aver lasciato il suolo (`COYOTE_MS` 110 ms: dossi, bordi di rampa). Pausa fra due salti da terra 500 ms (prima 650).
- **Doppio salto non più "sommato":** la velocità verso l'alto del secondo salto diventa almeno quella del salto, senza aggiungersi a quella già presente. Con la nuova finestra più corta (130 ms) il vecchio calcolo avrebbe lanciato la bici altissima, soprattutto con le ruote giganti (misurato: fino a ~900 px di salita). Le ruote giganti saltano un po' più forte (taglia^0,4) ma non in proporzione.
- **Gigante + teletrasporto (risolto alla radice, i due effetti possono stare insieme):**
  - *Causa trovata nel browser:* durante l'effetto d'arrivo del teletrasporto l'anello veniva disegnato con un raggio negativo (`rx·pulse − 7` mentre l'anello si apre o si dissolve) → `IndexSizeError` nel ciclo di disegno. Siccome il fotogramma successivo veniva richiesto solo a fine funzione, l'eccezione fermava il disegno per sempre (schermo congelato mentre la fisica continuava).
  - *Correzioni:* raggio mai negativo; il ciclo di disegno (`renderRace`) ora cattura gli errori di un singolo fotogramma, ripristina il canvas e riparte comunque; gli eventi del portale gigante (`ge/gt/gi`) hanno un contatore a parte, così non vengono cancellati da un teletrasporto nello stesso istante (prima la nota «Gigante!», il suono e l'anello consumato potevano perdersi).
  - *Fisica:* il teletrasporto parte più in alto per le ruote giganti (`90·(sc−1)` px). Misurato in simulazione su 10 layout × 3 posizioni × 2 forme (60 prove) e su ~330 teletrasporti in gare complete: nessun affondamento oltre 2 px, nessun sblocco forzato, nessun ribaltamento; i portali possono tornare a comparire dentro o accanto ai tratti giganti (nessuna esclusione).

## Trentatreesimo giro: nomi delle zone a comparsa
- **Pista finale senza scritte:** le pastiglie colorate sotto il percorso non portano più il nome (non ci stava per tutte le zone). Colori invariati.
- **Nome al passaggio del mouse o al tocco:** sopra la pista (non solo sulla fascia) compare un'etichetta con il pallino del colore della zona e il suo nome (Prato, Colline, Ghiacciaio, Canyon, Laguna, Bosco d'autunno, Vulcano, Partenza, Traguardo; in italiano e in inglese), e la pastiglia corrispondente si evidenzia. Col dito basta toccare: l'etichetta resta ~3 s. Codice: `ftHover` in `game.js`, stile `.ft-tip`/`.ft-hl` in `style.css`.

## Trentaquattresimo giro: terreni di taglie diverse e salto migliorato
- **Rampe di lancio (`kicker`) a 3 altezze:** (superata dal giro successivo: ora sono rampe vere, vedi sotto).
- **Avvallamenti (`bowl`):** valli dolci di profondità da ~45 a ~135 px; più sono profonde, più sono lunghe (pendenza massima ≈ 0,5), così si risale sempre con la velocità accumulata.
- **Fossati:** trampolino + fossato basso (38-50 px) o medio (78-112 px, con risalita lunga; chi resta sul fondo viene riportato fuori come nei burroni); burroni da 130 a 270 px; gradini in discesa (`drop`) da 40 a 120 px.
- **Frequenza:** i terreni nuovi sono in testa alla tabella dei tratti extra: a pista lunga ~2 rampe, ~2 avvallamenti, ~1,6 fossati e ~2,7 burroni.
- **Salto:** un salto da terra mentre si sta già salendo (rampa) si somma alla spinta ma con un tetto di +4 px/tick (niente salti altissimi).
- **Misure (simulazione, nessun telefono vero):** 8 gare complete in modalità pazza con 4 forme, tutte arrivate, al più 3 sblocchi a gara; tutte le taglie di fossato/burrone/rampa attraversabili sia guidando sia saltando.

## Trentacinquesimo giro: rampe vere, integrate negli ambienti
- **Geometria vera:** raccordo concavo (arco) → piano inclinato a pendenza costante → labbro netto che cade su una sola colonna fisica da 20 px (il labbro è agganciato alla griglia, così disegno e fisica coincidono). Tre taglie: bassa (30-42 px, ~17°), media (60-84 px, ~29°), alta (100-132 px, ~32°); più sono alte, più sono lunghe. Il trampolino dei fossati e la rampa dei burroni usano la stessa costruzione.
- **Niente spinta artificiale:** il vecchio lancio con velocità aggiunta è stato tolto. Il problema vero era che, a ~7 px/tick, una bici lunga 160 px che esce da un labbro con la gravità normale cade di muso mentre la ruota dietro è ancora sulla rampa. Ora, dal labbro di una rampa (`rampFly`), la gravità extra diventa un piccolo sollevamento (~0,11 px/tick² invece di ~0,96) e finché la ruota dietro è sulla rampa il pilota tiene il muso (smorza la rotazione). Il volo finisce quando la ruota davanti tocca, dopo un salto o dopo 2,5 s; il lancio vale come primo salto (in volo il tocco è subito un doppio salto).
- **Misure (simulazione, nessun telefono vero):** aria libera sotto entrambe le ruote ≈ 22 / 50 / 80 px per le tre taglie con ruote tonde (la stella e l'ingranaggio ne fanno di più, fino a ~100 px), nessun ribaltamento; fossati e burroni di nuovo attraversabili con salto e doppio salto, e senza salto si scende e si risale (o si viene riportati sul bordo).
- **Ambienti:** ogni rampa è costruita con i materiali del bioma: impalcato di legno nei prati e nelle colline, blocchi di ghiaccio con neve nel ghiacciaio, muratura di arenaria nel canyon, canne di bambù legate con corda nella laguna, tronchi impilati (con foglie sul piano) nel bosco d'autunno, colonne di basalto con fessure di lava nel vulcano. Il labbro ha il bordo a strisce nei colori del bioma; sul piano ci sono frecce che seguono la pendenza (1, 2, 3 a seconda della taglia) e un cartello prima della rampa.
- **Fossati a tema:** sotto il labbro c'è una cavità con parete a strati e, sul fondo, un ruscello (colline), acqua gelata (ghiacciaio), una forra asciutta (canyon), un canale turchese (laguna), un letto di foglie (bosco) o un fiume di lava che illumina le pareti (vulcano). Il vulcano ora ha anche rampe e fossati di lava.
- **Dettagli:** i punti di atterraggio dei portali evitano le rampe.

## Trentaseiesimo giro: cinque rampe nuove e lo sprint ricaricabile
- **Nuove rampe (niente tabletop, come richiesto):** *mezzo tubo* (discesa, fondo piatto, curva concava fino a 52° e labbro: la discesa dà la velocità per risalire e volare), *salto con collina d'atterraggio* (rampa, vuoto, parete d'arrivo, cresta e discesa: si atterra sulla pendenza), *gemelle* (una rampa piccola e una grande a ~190 px di distanza), *due stadi* (rampa bassa, pianerottolo, rampa ripida) e *discesa e lancio* (si scende in una buca e si risale su una rampa).
- **Ambienti:** tutte usano i materiali del bioma (travi di legno, blocchi di ghiaccio, arenaria, bambù, tronchi, basalto) e i fossati a tema (ruscello, acqua gelata, forra, canale, foglie, lava). Il mezzo tubo ha una parete d'acciaio. Compaiono nei biomi dove stanno meglio: mezzo tubo su ghiaiato e ghiacciaio, collina d'atterraggio nel vulcano, gemelle su colline/ghiacciaio/rampe, due stadi su ghiaiato e laguna, discesa e lancio su colline e rampe.
- **Volo:** dal labbro di una rampa la bici vola con gravità ridotta e con la rotazione frenata finché la ruota dietro è ancora sul piano, così non si ribalta di muso.
- **Sprint (nuovo):** il mezzo tubo, alla velocità normale della bici (~7 px/tick, tetto del regolatore), non lancia davvero (uscita 4–6 px/tick, quasi nessuna aria). Con lo sprint (×1,55 su velocità massima e motore) l'uscita sale a 7,5–10 px/tick e il volo diventa di 120–200 px. Dura 1,7 s e si ricarica in 22 s (la barra ad anello intorno al pulsante mostra la carica). Tasti: Maiusc, E o →; su telefono il pulsante a fulmine sopra quello del salto. Va anche in rete (il client lo chiede all'host).
- **Misure (simulazione, nessun telefono vero):** con ruote tonde, a stella, ingranaggio e quadrate, 15 prove su 15 completate per ogni nuova rampa; a velocità normale: due stadi ~75 px di aria libera, gemelle ~108 px sulla grande, discesa e lancio 14–73 px, collina d'atterraggio 53–160 px (chi cade nel fossato viene riportato sul bordo lontano dopo 1,5 s). Mezzo tubo: serve lo sprint premuto ~250 px prima della discesa; premuto 500 px prima finisce prima del labbro e il lancio è corto, quindi conta il tempismo. Regressione: modalità pazza 24 gare su 24 finite, portali piazzati come prima, DNF delle gare normali uguali alla versione precedente (3 su 12 gare, sono i più lenti che sforano il tempo).
- **Frequenza:** per pista lunga ~0,2 mezzi tubi e ~0,3–0,5 colline d'atterraggio (sono pezzi rari, lunghi e vogliono molto spazio libero); le altre sono più comuni.
- **Limiti onesti:** tutto misurato in simulazione e Chromium headless, nessun telefono vero; sul ghiaiato e nel vulcano i pezzi lunghi a volte non trovano posto e saltano (limite già presente per forre e ponti).
- **Pulsante sprint ridisegnato:** stessa famiglia del pulsante salto (tondo piatto con bordo in rilievo), verde-acqua con fulmine crema quando è pronto; giallo con fulmine arancio mentre è attivo; beige spento mentre si ricarica. L'anello ocra esterno mostra la carica.

## Trentasettesimo giro: mappe sempre diverse, scatto spiegato, rampe che non bloccano
- **Mappe sempre diverse:** ogni gara pesca un "carattere" casuale. Il mix dei biomi cambia da pista a pista (acqua, canyon e vulcano possono mancare del tutto e i ponti non sono più garantiti), circa il 30% dei tipi di ostacolo viene spento, una gara su cinque non ha rampe, e ogni zona ha il suo carico (alcune quasi vuote). La scelta dell'ostacolo è pesata, non più in ordine fisso, quindi nessun elemento è "chiave" in ogni pista. Misurato su 150 piste da 15 zone: 13 ostacoli per pista (prima 22), un terzo delle zone libere, 6–7 tipi diversi per gara. Vulcano al massimo uno ogni cinque zone. **Modalità pazza:** resta ricca (18 ostacoli), con laghi, ponti e portali garantiti come prima.
- **Rampe:** niente più rampe alte (restano piccole e medie, anche in gemelle, due stadi, discesa e lancio, collina d'atterraggio; il mezzo tubo è più basso).
- **Bug "la rampa si blocca":** con la ruota molto sciolta dalla lava (spinta al 35%) la bici restava ferma a metà salita (4–9 prove su 10 bloccate in simulazione). Ora la **salita assistita** accompagna la bici fino a 3,4 px/tick sul tratto in salita di qualunque rampa (alla velocità normale non interviene), e se resta comunque ferma 1,6 s sulla rampa viene rimessa oltre il labbro. Dopo: 0 blocchi su ~200 prove con ruote sciolte (tonda, stella, triangolo, quadrata, ingranaggio) su tutte le rampe.
- **Scatto:** il numero dei secondi che mancano al prossimo scatto compare in trasparenza sul pulsante mentre si ricarica (22 s). A inizio gara compare una nuvoletta "SCATTO" accanto al pulsante e il suggerimento comandi ha una seconda riga (tasti Maiusc/E/→ su computer, "il fulmine" su telefono).
- **Suggerimento "sei lento, ridisegna la ruota":** rivisto. Prima scattava anche in fossati, su rampe e in salita ripida (dove la forma non c'entra). Ora compare solo su terreno pulito (niente ostacoli, vuoti o forti pendenze nei dintorni), mai nel vulcano, alla partenza o al traguardo, dopo 4,5 s dal via e 1,5 s di lentezza. In simulazione scatta soprattutto con ruote sciolte dalla lava, cioè quando ridisegnare serve davvero.
- **Misure e limiti onesti:** tutto in simulazione e Chromium headless (nessun telefono vero). Le gare normali con molta lava durano di più e qualche bici lenta sfora il tempo (DNF come prima). Il caso esatto che hai visto lo ho spiegato con la ruota sciolta: se capita ancora con ruota normale, dimmi su che rampa e in che bioma.
- **Suggerimento ridisegna all'inizio gara:** ora non compare mai nei primi 12 s dal VIA (prima 4,5 s) e mai nella zona di partenza, né al traguardo o nel vulcano. Provato in Chromium con la bici tenuta ferma: il suggerimento arriva solo dopo i 12 s e solo su terreno pulito (versione 20261109d).

## Trentottesimo giro: stagioni di gara e ritmo
- **Stagioni di gara:** ogni pista normale ha un tema, scelto dal generatore e ricavato dalla lista dei biomi (host e client arrivano alla stessa stagione senza scambiarsi altro): *classica* (~44%), *giornata di salti*, *pista tranquilla*, *palude*, *gelo*, *fuoco*, *canyon* (~8–11% ciascuna). Ogni stagione pesa i biomi (palude = tanta acqua, fuoco = più vulcani, gelo = niente lava), accentua alcuni ostacoli (fango e sabbia nella palude, burroni e scalinate nel canyon, rampe nei salti, creste e cavalletti nel gelo) e ne spegne altri; la pista tranquilla ha pochi ostacoli e niente lava. La modalità pazza resta com'era (stagione classica, tutto più ricco).
- **Ritmo:** ogni zona ha un budget di difficoltà (un burrone "costa" più di un gruppo di massi) che segue una curva: la prima zona è sempre morbida, l'ultima ha un pezzo forte (rampa lunga, burrone, mezzo tubo…) e in mezzo la curva può essere classica, in crescendo, a onde, a montagne russe o con un respiro a metà.
- **Schermo:** durante il conto alla rovescia compare una targhetta sotto il nome della zona con stagione e ritmo (es. "Palude · ritmo a onde"), che sfuma ~5 s dopo il VIA. Non c'è in modalità pazza.
- **Misure (simulazione, nessun telefono vero):** 600 piste da 15 zone: ~12 ostacoli a pista (palude e pista tranquilla ~8, salti ~16), difficoltà media per zona che sale dall'inizio morbido (0,4) al finale (1,35); stesse piste su due istanze indipendenti: 0 differenze su 300. 40 gare con 5 forme: solo 2 bici non arrivate, entrambe in piste con tre vulcani (come prima). Modalità pazza: tutte le bici di prova arrivano. Rampe: 60 prove, 0 bloccate.
- **Limiti onesti:** il tema si vede soprattutto nel mix di ostacoli e biomi, non in grafiche nuove; le percentuali delle stagioni sono approssimate (il generatore scarta e rigenera le piste finché la stagione coincide).

## Trentanovesimo giro: campionato
- **Formato in lobby (solo l'host):** gara singola, 🏆 3 gare o 🏆 5 gare. Nel campionato la prima gara è sempre la stagione classica (partenza tranquilla), le altre sono stagioni a tema tutte diverse; la pista e la stagione di ogni gara sono generate dall'host come sempre.
- **Punti:** 10-7-5-3-2 per chi arriva (chi non arriva fa 0); nell'ultima gara i punti valgono doppio. Ogni gara si ridisegna la ruota come di consueto (30 s).
- **Schermate:** nel disegno compare "Campionato · gara 2 di 5 · stagione"; nel conto alla rovescia la targhetta ha anche "2/5"; nei risultati sotto la gara c'è la classifica del campionato con i punti guadagnati (+N); dopo l'ultima gara compare "Vince il campionato!" e l'host può lanciare un nuovo campionato. Solo l'host vede "Prossima gara", gli altri vedono "Aspetta che l'host…". La modalità pazza funziona uguale (stessi punti, senza stagioni).
- **Rete:** i punti li calcola solo l'host e li manda con i risultati; i client mostrano la classifica ricevuta.
- **Misure (Chromium headless, nessun telefono vero, un solo giocatore reale):** campionato di 3 gare giocato fino in fondo: stagioni classica → canyon → tranquilla come da piano, punti 10 / 20 / 40 (ultima doppia), poi nuovo campionato ripartito da 1/3. La classifica a 4 giocatori e il lato client sono stati provati inviando i messaggi di rete simulati, non con quattro dispositivi veri.
- **Limiti onesti:** un giocatore che esce a metà campionato resta in classifica coi punti fatti; un giocatore che entra dopo la prima gara non è previsto. Sugli schermi bassi in orizzontale le righe sono compattate, ma la pagina scorre.
- **Firma nel menu (nuova):** due righe dritte, "Ideato e sviluppato da" in piccole maiuscole spaziate e "Stefano Kolta" in Pacifico (aggiunto ai font di Google Fonts), poi una pennellata arancio staccata sotto. Prima era in Kalam con un trattino arancio sopra.
- **Lobby su due colonne (fix dimensione):** con il formato campionato la scheda della lobby era diventata più alta della finestra. Ora, da 860 px di larghezza in su e sul telefono in orizzontale, è su due colonne: a sinistra codice, link e giocatori, a destra lunghezza, modalità, formato e avvio. Chi entra (non host) vede ancora la scheda stretta a una colonna. Sul telefono in verticale resta una colonna, compattata. Misure in Chromium headless con 5 giocatori simulati: card alta 603 px a 1105×870, 553 px a 1366×650, 339 px a 844×390; il pulsante di avvio è sempre dentro la finestra tranne che in verticale stretto, dove resta una colonna che scorre.
- **Pulsante di avvio più chiaro:** al posto di "In attesa di giocatori…" (che compariva anche a pulsante già attivo) ora dice cosa succede premendolo: "Inizia la gara · da solo", "Inizia la gara · 3 giocatori" o "Inizia il campionato · 3 giocatori"; il testo si aggiorna quando entra qualcuno o cambia il formato. Sotto c'è una riga: "Aspetta che entrino gli amici (codice o link), poi premi: tutti passano a disegnare la ruota e si parte." Provato in Chromium headless (1, 2 e 3 giocatori simulati, gara singola e campionato; il click porta alla schermata di disegno).

## Quarantesimo giro: salto dalle rampe più naturale
- **Problema:** dopo il labbro di una rampa la gravità era quasi azzerata (0,11 px/tick² invece di ~0,96) e nessuno governava l'assetto: la bici ruotava di muso senza smettere e atterrava sulla ruota anteriore (in simulazione 12–38° di muso in giù rispetto alla pista nelle rampe medie e grandi, 9–12 voli su 12).
- **Assetto da moto cross:** in volo, quando la ruota dietro ha lasciato la rampa, un regolatore smorzato porta la bici lungo la traiettoria (muso leggermente su in salita, livellato all'apice) e, nell'ultimo tratto, la allinea alla pendenza del punto d'atterraggio. È una rotazione rigida attorno al centro della bici: non aggiunge né toglie velocità, cambia solo l'assetto (`flightPitch` in physics.js, parametri `ctl*` in `TUNE`). Finché la ruota dietro è ancora sulla rampa vale il vecchio "il pilota tiene il muso".
- **Gravità e calcio del labbro:** la gravità extra in volo passa da −0,25 a −0,19 (gravità di volo ~0,17 px/tick² invece di ~0,11) e il labbro dà un piccolo calcio verso l'alto (`TUNE.pop` = 3,0, più piccolo sulle rampe piccole e proporzionale alla velocità di uscita: più veloce = salto più grande, come nelle moto vere, dove l'arco cresce col quadrato della velocità). Lo scatto sulle rampe dà quindi salti molto più grandi.
- **Misure in simulazione (forme: tonda, stella, ingranaggio, ovale; 3 rampe ciascuna):** velocità normale, rampa media: ~1,1 s di volo, apice ~73 px, ~360 px di distanza, atterraggio a 1° dalla pendenza (prima 28° di muso giù); two-stage: 1,3 s, 58 px, 0°; mezzo tubo: 0,67 s, 59 px, 7°. Con lo scatto: fino a 1,5 s, apici 53–137 px e 490–570 px di distanza. Nessuna bici ribaltata. Rampe bloccate: 0 su ~250 prove (anche con ruota sciolta dalla lava e forme a stella/quadrato/triangolo); gare complete di prova: tutte arrivate.
- **Limiti onesti:** misure solo in simulazione, mai su telefono vero; i salti con lo scatto possono arrivare oltre il tratto successivo, quindi saltare qualche ostacolo; la velocità massima di tutta la gara non è cambiata (cambierebbe ogni pista già tarata).


## Implementazione dei mondi

- Le probabilità sono centralizzate in `WORLD_CHANCES` in `js/game.js`: Classico 60%; Paradiso, Inferno, Atlantide, Bosco Incantato e Città Neon 8% ciascuno (40% complessivo di mondi speciali).
- I layout e gli eventi di gameplay sono generati in modo deterministico in `js/terrain.js`; la fisica autorevole resta in `js/physics.js`.
- Le illustrazioni panoramiche di Atlantide, Bosco Incantato e Città Neon sono in `img/worlds/`; `js/scenery.js` carica un fondale e un livello trasparente di primo piano per ciascun mondo e li disegna con parallasse differenziata. Pesci e meduse, lucciole e foglie, traffico volante e scie luminose sono animati via Canvas.
- Se un asset non è disponibile, il motore mantiene un fondale Canvas di riserva.

## Firma minimal (storico: v20261111)
La firma nel menu è ora una sola riga: «IDEATO E SVILUPPATO DA · STEFANO KOLTA» con un puntino arancio al centro (su telefono stretto resta su una riga con carattere più piccolo). Versione dei file portata a `?v=20261111` per forzare l'aggiornamento della cache.

## Mondi speciali: effetti e dettagli (v20261111)
- Nuovo file `js/worldfx.js`: dettagli sul terreno (dietro alle ruote) e particelle/luci in primo piano, con dissolvenza ai bordi del tratto speciale.
  - Atlantide: bolle con riflesso, neve marina, banchi di pesci, meduse luminose, alghe, stelle marine, conchiglie con perla, anemoni, coralli, piante bioluminescenti, sagome di alghe in primo piano.
  - Bosco Incantato: lucciole, foglie e petali che cadono, fasci di luce dalla chioma, nebbia al suolo, rampicanti con boccioli, funghi luminosi, campanule, felci, cerchio di fate, sassi con rune, fiori-lanterna.
  - Città Neon: pioggia inclinata con schizzi, pozzanghere con riflessi, vapore dai tombini, ologrammi, frecce al neon, bitte lampeggianti, droni, riflettori, flussi di dati, sfarfallio dei neon, pali in primo piano.
  - Paradiso: scintille dorate e uccelli lontani. Inferno: braci che salgono e alone di calore.
- Qualità grafica: qualità 1 dimezza le particelle, qualità 2 le spegne. Tutto è deterministico rispetto alla pista.
- Correzione in `scenery.js`: dentro il tratto speciale ora anche terreno, superficie, colline in primo piano, acqua e primo piano usano la tavolozza del mondo (prima restavano classici); la mezza zona finale torna classica dopo la fine del tratto. Il primo piano classico (canne/erba arancioni) è sostituito da sagome scure a tema.

### Ostacoli "skin" nei mondi speciali
Dentro il tratto speciale ostacoli (dossi, rampe, tronchi, buche…), rampe di zona e ponti vengono ridipinti con la tavolozza del mondo (stessa forma e stessa fisica): corallo e perla in Atlantide, muschio e viola in Bosco Incantato, tubi al neon in Città Neon. Inoltre ogni ostacolo ha una linea di bordo a tema, decorazioni lungo il profilo e due "portali" (corallo, lanterna, palo al neon) all'inizio e alla fine, riconoscibili da lontano. Il codice è in `worldfx.js` (`skinX`, `skinOff`, `trim`), agganciato in `props.js`.

## Aggiornamenti V19–V22 (12 novembre 2026)

Le sezioni precedenti registrano l'evoluzione storica del progetto; quando descrivono comportamenti o versioni ormai superati, fanno fede le note qui sotto e il codice della V22.

### V19 — Art direction dei mondi

- Modulo `js/world-art-v19.js` integrato in `js/scenery.js`.
- **Paradiso:** rosone e fasci di luce; **Inferno:** tempesta e saette; **Atlantide:** manta gigante e rifrazioni; **Bosco Incantato:** cervo-guardiano e archi di liane; **Città Neon:** insegne olografiche e pannelli luminosi.
- Effetti disegnati dietro al terreno e ridotti nelle modalità grafiche leggere. Nessuna nuova meccanica fisica in questa versione.

### V20 — Ostacoli solidi ed emote fuori campo

- Modulo `js/obstacles.js`: corpi mobili e collisioni Matter.js (rulli, blocchi di ghiaccio, assi, tronchi oscillanti, pendoli, meteoriti, conchiglie e pistoni), con forme ispirate ai mondi in cui compaiono.
- Generazione legata al layout, protezione di partenza/traguardo e delle zone incompatibili con la presenza di ostacoli.
- **Emote multiplayer:** emote grande sopra la propria bici e gli avversari visibili; emote piccola sul bordo corretto dello schermo con nome e freccia quando un avversario che la invia è fuori inquadratura. Il layout evita, per quanto possibile, minimappa e pulsanti touch (`js/emote-layout.js`).

### V21 — Bilanciamento degli ostacoli dinamici

- Migliorati gli spazi di reazione; collocazione più prudente vicino a rampe, ponti, voragini e rilievi forti.
- Movimenti più moderati e fisicamente coerenti, con velocità dei collider aggiornate nella simulazione. Superfici come ghiaccio e conchiglie hanno proprietà differenti.
- Questa versione aveva introdotto indicatori di attenzione progressivi: **la V22 rimuove gli indicatori «!»**, sostituendoli con segnali affidati alla forma e al movimento degli oggetti.

### V22 — Ostacoli interattivi e rework del Paradiso

**Obiettivo di design:** gli ostacoli non devono limitarsi a fermare la bici; devono poter essere **saltati, aggirati quando possibile o usati a proprio vantaggio**. La sagoma visibile deve essere coerente con il collider e chiarire l'interazione, anche sugli schermi piccoli.

**Nuovo modulo `js/interactive-obstacles.js`:**

| Ostacolo | Dimensioni di riferimento | Interazione |
|---|---:|---|
| **Massa / masso spingibile** (`boulder`) | raggio 49 unità | Corpo fisico mobile, può essere urtato e spinto oppure superato con un salto. |
| **Pedana basculante** (`tilt`) | 282 × 22 unità | Piattaforma che cambia inclinazione sotto il peso e può influenzare un atterraggio. |
| **Passerella cedevole** (`drop`) | 272 × 20 unità | Si abbassa in risposta al passaggio, quindi torna progressivamente disponibile. |
| **Trampolino elastico** (`spring`) | 152 × 22 unità | La superficie reagisce al contatto e imprime una spinta utile al salto. |

**Personalizzazione dei biomi:** le stesse famiglie di ostacoli assumono un aspetto riconoscibile e coerente con l'ambiente, evitando elementi grafici piccoli e scollegati dalla collisione. Nei tratti normali prevalgono legno, pietra, fieno o ghiaccio; nel Paradiso marmo, oro e nubi; nell'Inferno basalto, magma e catene; ad Atlantide perle, coralli e conchiglie; nel Bosco Incantato legno vivo, radici e funghi; nella Città Neon metallo, meccanismi e illuminazione tecnologica. Anche gli ostacoli mobili introdotti nella V20 hanno proporzioni e rappresentazioni migliorate.

**Paradiso riprogettato:**

- Più carattere architettonico: colonnati, rosoni, strutture celesti, luce avorio e oro, isole sospese.
- Nuove superfici interattive coerenti con il mondo, in particolare bilance celesti, passerelle e nubi elastiche.
- **Anelli boost rimossi:** non sono più usati come meccanica o segnaletica del Paradiso.
- **Indicatori con «!» rimossi** nel rework: la leggibilità si basa sulla dimensione, il contorno e l'animazione degli ostacoli.

**Multiplayer e sincronizzazione:**

- L'host resta autorevole per la fisica degli ostacoli e degli urti.
- Lo stato degli ostacoli interattivi è incluso nei messaggi di snapshot e i client ne interpolano posizione/stato per il disegno; la logica fisica non viene eseguita indipendentemente sui client.
- Le emote locali e fuori campo della V20 sono conservate.

**Anteprime incluse nel pacchetto:**

- `V22-Anteprima-Interattiva.html`: galleria per confrontare i design dei sei biomi e le famiglie di ostacoli, anche senza avviare una gara.
- `preview-ostacoli.html`: tavola di riferimento degli ostacoli dinamici.

**Verifica e limiti:** controlli automatici di sintassi, integrità del pacchetto, generazione e posizionamento degli ostacoli. Le simulazioni non dimostrano da sole che ogni forma di ruota possa affrontare tutti gli urti senza incastrarsi. Restano da svolgere collaudi multiplayer su 2–5 dispositivi reali e prove di FPS/bilanciamento su smartphone prima di considerare chiusa la fase di tuning.

**Distribuzione:** per GitHub Pages mantenere `index.html` nella radice del repository insieme alle cartelle `js/`, `img/` e `audio/`. Gli script V22 utilizzano il parametro cache `?v=20261112-v22-interactive-release`.
