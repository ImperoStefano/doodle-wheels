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
2. Gli altri (fino a 4) lo inseriscono per unirsi.
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


**Studio** (9 forme perfette, 2 serie da 60 piste, ognuna da sola e tarata → 120 piste): pentagono 32, ovale 21, esagono 16, triangolo 15, quadrato 14, tonda 11, stella 8, dentata 3, blob 0. Ritardo medio: pentagono ~1.4%, tonda 2.4%, quadrato 2.2%, esagono 2.3%, ovale 2.7%, triangolo 3%, dentata 3%, stella 3.2%, blob 6%. Da una serie all'altra una forma varia di ±5–8 vittorie (rumore).
Con forme disegnate a mano (rumore + rotazione, 60 piste): quadrato 24, pentagono 18, esagono 7, dentata 4, blob 2, tonda 2, stella 2, ovale 1, triangolo 0.
Tempi per tipo di terreno: strada a 3 archi → triangolo (o blob), a 4 → quadrato, a 5 → pentagono/stella, a 6 → esagono; dentiera (anche sul ghiaccio) → stella (-25% sulla tonda); fango → stella; buche/gradoni → ovale/tonda; rampe → tonda/quadrato.

**Limiti noti:** le differenze fra forme sui terreni "normali" restano ±2–3% (la fisica è caotica: un rimbalzo diverso cambia il tempo), e le nicchie dei terreni a tema pesano circa quanto questo scarto; per questo il vincitore dell'intera gara cambia a ogni piccola modifica dei parametri. La stella perde ancora sulle rampe/buche/gradoni, la tonda quasi non vince mai l'intera gara, il triangolo disegnato a mano è lento sulle rampe (+9%), e tutto è misurato solo in headless.
Nota: la griglia di partenza è sfalsata di 200 px a testa; chi parte più avanti ha un piccolo vantaggio.

### Fluidità di visualizzazione
- **Interpolazione degli snapshot** (`interpolateRacers` in `game.js`): prima bici e ruote venivano disegnate con l'ultimo snapshot, che cambiava solo 20 volte al secondo, quindi si vedevano "a scatti" anche su schermi a 60/120 Hz (la telecamera era già morbida, i mezzi no). Ora si tengono gli ultimi 16 snapshot e si disegna un istante nel passato (host 45 ms, client 130 ms) interpolando posizioni e angoli (angoli sul percorso più corto); un salto grande (rimessa in pista) non viene interpolato. Non c'è controllo del giocatore, quindi il ritardo non si nota.
- **Host**: la fisica gira ogni ~16 ms (prima 50 ms, 3 passi alla volta) e gli snapshot di rete restano a ~20/s.
- **Taratura in anticipo:** parte appena l'host riceve ogni ruota (`receiveWheel`), durante i 30 s di disegno degli altri; al conto alla rovescia il risultato è già in cache.
- Non misurabile qui: il Chromium headless senza GPU fa 4–5 fps, quindi la verifica va fatta su dispositivi veri.
