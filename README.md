# 🖊️ Doodle Wheels

Corsa online per 2–5 giocatori: **disegni a mano libera la forma della tua ruota**, poi la fisica fa il resto. Una forma tonda rotola liscia, una spigolosa fa saltare tutto. Ispirato al meccanismo di gioco tipo "Pocket Champs".

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

## Come si gioca

1. Un giocatore crea la gara (**host**) e ottiene un codice a 4 lettere.
2. Gli altri (fino a 4: il massimo è 5 giocatori in tutto) lo inseriscono per unirsi.
3. Tutti disegnano la propria ruota entro 30 secondi, dentro il cerchio guida.
4. Countdown 3-2-1, via! Le ruote rotolano con un motore costante — solo la forma determina chi va più veloce.
5. Classifica finale, si può rigiocare con le stesse persone.

## Architettura in breve

- **Rete a stella**: l'host è l'unico che parla con tutti (`js/peer.js`). I client non comunicano mai tra loro direttamente — più semplice e robusto di una mesh completa per 5 giocatori.
- **Host autoritativo**: solo l'host esegue la simulazione fisica (`js/physics.js`, Matter.js) e trasmette ~20 volte al secondo la posizione di tutti (`{type:'snap', racers:[...]}`). I client si limitano a renderizzare l'ultimo stato ricevuto — niente calcoli di fisica duplicati, niente rischio di desync.
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

## Idee per estenderlo (TODO)

- **Boost a tocco**: invece del motore costante, far pedalare più forte tappando ritmicamente (tipo QWOP).
- **Terreno con dossi**: al momento il rettilineo è piatto; una sequenza di piccole colline renderebbe le ruote spigolose ancora più rischiose.
- **Sincronizzazione più precisa**: il countdown parte in locale su ogni client, con qualche centinaio di ms di scarto dovuto alla latenza — per una gara "esport" servirebbe un vero lockstep con timestamp condiviso.
- **Riconnessione**: se un client perde la connessione a metà gara, al momento non c'è un modo per rientrare.
- **Tuning fisico**: il motore imposta la velocità angolare in modo "rigido" ad ogni istante, invece di applicare una coppia realistica — funziona, ma su rampe/colline ripide potrebbe servire un aggiustamento dopo qualche prova sul campo (ampiezza delle zone in `js/terrain.js`, `MOTOR_SPEED` in `js/physics.js`).
- **Tracciati diversi**: `js/terrain.js` è puro e deterministico apposta — basta cambiare le `ZONES` (o aggiungere un seed casuale trasmesso dall'host) per avere percorsi diversi ogni gara.
- **i18n IT/EN**: stesso pattern già usato in Tris Svanente, qui non ancora implementato.
- **Suoni**: Web Audio API per il rumore delle ruote spigolose che sbattono (come in Probability Casino).
- **Spettatori**: chi arriva a gara già iniziata potrebbe entrare in sola visione.

## Struttura del progetto

```
doodle-wheels/
├── index.html          schermate (menu, lobby, disegno, gara, risultati)
├── style.css            estetica "quaderno a quadretti / pennarello"
├── js/
│   ├── peer.js          rete PeerJS, host autoritativo
│   ├── draw.js           canvas di disegno → poligono normalizzato
│   ├── terrain.js        tracciato deterministico (zone, altezza, attrito)
│   ├── physics.js        simulazione Matter.js (solo host)
│   └── game.js           macchina a stati, rendering, HUD
└── README.md
```

## Novità: percorso lungo, biomi, ponti, fiori vivi

- **Lunghezza gara** (scelta in lobby): corta ~16.000 px (≈40 s), media ~25.000 px (≈1 min), lunga ~33.000 px (≈1:30). Tempo massimo e "ultima chiamata" dopo il primo arrivo si adattano alla pista.
- **Biomi** (`js/scenery.js`): prato fiorito, colline, ghiacciaio, canyon, laguna, bosco d'autunno, traguardo. Sole che percorre il cielo da alba a tramonto, nuvole, uccelli, lucciole, farfalle, neve e foglie.
- **Ponti** (`js/props.js`): ponte di pietra ad arco sulla laguna, ponte di corda sul canyon; almeno uno per gara, di media 2–4 nelle piste lunghe.
- **Fiori** (`js/terrain.js` + `js/flora.js`): posizione e specie derivano solo dalla coordinata x e dal bioma (uguali per tutti i giocatori, nessun dato in rete). Margherite, tulipani, rose, girasoli (campi da 4), bucaneve, cristalli di ghiaccio, funghi, cactus. Fanno piccoli dossi fisici; l'animazione è solo visiva: ondeggiano col vento, si piegano al passaggio, sbocciano di giorno e si chiudono di notte, i girasoli seguono il sole, le api volano attorno.
- Cache: gli script in `index.html` hanno `?v=20261021`; se il sito pubblicato sembra vecchio, ricarica forzando (Ctrl+Shift+R) e verifica che anche `style.css` sia stato caricato.

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
