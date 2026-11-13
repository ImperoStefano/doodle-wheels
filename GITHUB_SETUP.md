# Proteggere la repository GitHub di Doodle Wheels

Questo pacchetto comprende file pronti da caricare; **le impostazioni dell’account e i ruleset GitHub non possono essere attivati tramite ZIP**.

## Operazioni da fare una sola volta su GitHub

1. Apri **Settings → Rules → Rulesets → New branch ruleset** nella repository di Doodle Wheels.
2. Assegna un nome come `Protect main` e imposta **Enforcement status: Active**.
3. Scegli il branch di destinazione `main` (oppure il nome effettivo del branch di pubblicazione).
4. **Blocca la cancellazione del branch** e i **force push**. Valuta la richiesta di pull request prima del merge se lavori con collaboratori.
5. Se vuoi usare `CODEOWNERS`, abilita la revisione del proprietario all'interno della protezione del branch **solo** se il tuo flusso di approvazione lo permette. Se sei l'unico autore, imporre l'approvazione delle tue stesse pull request può bloccarti.
6. Attiva **2FA/passkey** per l’account, limita gli accessi di terzi e conserva backup locali del sorgente.
7. Se possibile, usa una repository **privata** per il codice di sviluppo e un processo di pubblicazione dedicato per la versione giocabile. Controlla il tuo piano GitHub e le impostazioni Pages prima di cambiare visibilità.

## Pubblicazione GitHub Pages

Il gioco usa JavaScript nel browser: **ogni file distribuito da GitHub Pages è accessibile al browser**. Anche usando una repository privata, la pagina distribuita può restare pubblica e il JavaScript distribuito consultabile. I file di copyright non sostituiscono misure tecniche, un contratto o una consulenza legale.

Il file `.github/CODEOWNERS` presente nello ZIP indica il proprietario degli elementi nella repository. L'effettivo controllo delle modifiche dipende da permessi e ruleset GitHub.

## In caso di copia non autorizzata

Conserva cronologia Git, screenshot delle pubblicazioni e prove di creazione. Se qualcuno ripubblica il tuo codice o le tue grafiche originali, valuta una richiesta di rimozione motivata e, se necessario, assistenza legale. Non dare per scontato che un copyright notice registri un marchio.
