# ADR-003 — Questionario proprietario come flusso principale

- Stato: accettata
- Data: 2026-07-15

## Contesto

L'MVP raccoglie circa 20 KPI dimostrativi da una rete di dealer durante una o due rilevazioni annuali. Dashboard, benchmark, note, report e audit esistono già nello stesso servizio Node.js/SQLite. L'integrazione Jotform precedente introdurrebbe una dipendenza esterna prima che questionario e KPI definitivi siano concordati.

## Decisione

`COLLECTION_MODE=proprietary` è il default. `/compila/:token` genera un questionario HTML dalla configurazione unica `config/kpi-questionnaire.js`; validazione, bozze, submission, formule e dashboard condividono backend e database.

I dealer non hanno account nella V1. Un token lungo, casuale, revocabile e associato a dealer/campagna limita la pagina pubblica alla singola rilevazione. Questa scelta riduce la complessità demo, ma non sostituisce l'autenticazione richiesta in produzione.

Il modello resta a campagne annuali perché il processo concordato confronta una o due rilevazioni, non dati operativi giornalieri. Ogni submission conserva `questionnaire_version`; confronti tra versioni incompatibili vengono segnalati.

Jotform non viene eliminato: resta dietro `COLLECTION_MODE=jotform`, senza iframe, sync o chiamate API nella modalità predefinita e senza credenziali obbligatorie all'avvio.

## Conseguenze

- Un'unica definizione alimenta questionario, validazioni, etichette, dettaglio, analisi ed export.
- Bozze e invii aggiornano immediatamente gli stessi dati letti dalla dashboard.
- JET può validare o riaprire; la vista demo SDF è realmente read-only lato UI e API, ma non è autenticazione.
- Le definizioni KPI legacy sono conservate come inattive e i dati non vengono cancellati.
- KPI, formule, accessi reali, provider reminder, database gestito, backup e privacy restano decisioni da finalizzare prima della produzione.
