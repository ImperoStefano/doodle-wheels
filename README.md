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

Parametri in `physics.js`: `GRIP` (fango/ghiaccio/strade), `ROLL_GAIN`, `ACCEL_SPIKE`, `V_CAP`; in `terrain.js`: `PATCH_TABLE`.

**Studio** (simulatore Node, 9 forme normalizzate a raggio 80 come nel gioco, 40 piste casuali da 11 zone, ogni forma da sola
sulla stessa pista, tarate): vittorie ovale 12, tonda 11, quadrato 5, blob 5, esagono 4, triangolo 2, dentata 1; 0 salti/ritiri.
Pentagono e stella non vincono mai l'intera gara. Risultati molto sensibili ai parametri e misurati solo in headless (da verificare su telefoni veri).
Nota: la griglia di partenza è sfalsata di 200 px a testa e il tempo si misura al traguardo, quindi chi parte più avanti ha un piccolo vantaggio.

**Cambi forma in gara:** dipendono dalla lunghezza — corta 2, media 4, lunga 6 (`redrawsForTrack` in `game.js`). Ogni cambio viene ritarato in automatico.

**Telecamera** (`updateCamera` in `game.js`): morbidezza indipendente dagli fps, "guarda avanti" in base alla velocità, inseguimento verticale
(la bici resta tra il 30% e il 72% dell'altezza su rampe e salite), e dopo il traguardo segue il primo ancora in gara.
