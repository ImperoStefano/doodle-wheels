# Sicurezza — Doodle Wheels

## Segnalazioni di vulnerabilità

Per segnalare problemi di sicurezza non pubblicare credenziali, token, dati personali o dettagli di exploit in issue pubbliche. Usa **GitHub → Security → Report a vulnerability**, se disponibile e abilitato, oppure contatta privatamente il manutentore tramite un canale concordato.

Le segnalazioni dovrebbero indicare versioni interessate, passaggi di riproduzione e impatto, senza dati sensibili reali.

## Principi di protezione

- Nessun segreto, password o token deve essere committato nella repository o incorporato nel JavaScript pubblico.
- Non inserire API key private, credenziali o configurazioni di produzione nei file di GitHub Pages.
- Mantieni aggiornate le dipendenze esterne e verifica i permessi di quelle utilizzate.
- Usa l'autenticazione a due fattori sul tuo account GitHub.

Il file `SECURITY.md` è una policy informativa: non configura automaticamente controlli di accesso o alert.
