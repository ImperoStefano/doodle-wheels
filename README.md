# Doodle Wheels

**Multiplayer 2D browser game** — disegna le ruote della tua bici, affronta rampe e ostacoli, gareggia con gli amici attraverso mondi diversi.

Questa è la versione **Doodle Wheels V33 — Natural Flight**. Mantiene il nome **Doodle Wheels**, la grafica egiziana approvata, le funzioni multiplayer e le probabilità dei biomi (Classico 35%, Egitto 15%, altri speciali 10% ciascuno). Migliora le rampe, l’interazione tra rampa e Salto, il recupero dalle voragini e la fusione delle ruote triangolari nel Vulcano. La gara non viene rallentata.

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
