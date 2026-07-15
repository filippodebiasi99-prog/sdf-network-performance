# SDF KPI Portal MVP

Portale locale funzionante per raccogliere, monitorare e analizzare i KPI della rete concessionari SDF.

## Avvio rapido

Requisito: Node.js 22.5 o successivo.

```bash
npm start
```

Aprire `http://127.0.0.1:4173`. Al primo avvio il server crea e popola automaticamente `data/sdf-kpi.sqlite`.

Non aprire `index.html` direttamente: la dashboard usa le API del server.

## Deploy gratuito su Render

Il repository include `render.yaml`. Collegando il repository a Render come Blueprint, il servizio viene creato con piano Free, avvio `npm start` e health check `/api/health`.

Il filesystem dei servizi Render Free è effimero: SQLite viene ricreato con i dati demo dopo alcuni riavvii o sospensioni. Per conservare dati aziendali reali serve un database persistente o un piano con disco persistente.

## Flussi disponibili

- Overview calcolata dal database.
- Elenco concessionari con ricerca e filtri.
- Dettaglio dealer, benchmark e note JET.
- Analisi KPI con aggregazioni e ranking.
- Gestione visuale delle campagne.
- Importazione o aggiornamento dell'anagrafica concessionari da CSV.
- Preparazione dell'elenco reminder per dealer non compilati o in bozza.
- Export CSV reale.
- Questionario concessionario tramite link univoco.
- Salvataggio bozza, validazione e invio definitivo.
- Aggiornamento immediato della dashboard dopo l'invio.

Per trovare un link di compilazione demo, aprire un concessionario dalla dashboard e selezionare **Apri compilazione**.

## Come inserisce i dati l'azienda

1. JET scarica il tracciato da **Report → Scarica template CSV**.
2. Compila il file in Excel con Dealer ID, ragione sociale, regione, area, area manager ed email.
3. Salva in CSV e lo carica da **Concessionari → Importa CSV**.
4. Apre il dettaglio del concessionario e condivide il link **Apri compilazione**.
5. Il concessionario salva una bozza o invia tutti i KPI; overview, analisi e report si aggiornano dal database.

Il comando **Prepara reminder** genera e registra l'elenco dei destinatari. Per spedire email vere occorre collegare un provider aziendale.

## Comandi

| Comando | Descrizione |
|---|---|
| `npm start` | Avvia server, API e frontend |
| `npm run dev` | Avvia con riavvio automatico |
| `npm test` | Esegue i test API end-to-end |
| `npm run reset` | Elimina e ricrea il database demo |

## API principali

| Metodo | Endpoint | Funzione |
|---|---|---|
| GET | `/api/overview` | Avanzamento e dati operativi |
| GET | `/api/dealers` | Elenco filtrabile dealer |
| GET | `/api/dealers/:id` | Dettaglio e benchmark |
| POST | `/api/dealers/import` | Import anagrafica da CSV |
| POST | `/api/dealers/:id/notes` | Inserimento nota JET |
| POST | `/api/reminders/prepare` | Elenco reminder da inviare |
| GET | `/api/analysis` | Statistiche per KPI |
| GET | `/api/campaigns` | Campagne e avanzamento |
| GET | `/api/survey/:token` | Questionario concessionario |
| PUT | `/api/survey/:token/draft` | Salvataggio bozza |
| POST | `/api/survey/:token/submit` | Invio definitivo validato |
| GET | `/api/reports/csv` | Export completo CSV |
| GET | `/api/dealers/template.csv` | Template anagrafica dealer |

## Architettura

Il server usa solo moduli nativi Node.js e SQLite. Le definizioni KPI, i dati inseriti, le campagne e le note sono persistenti. La decisione è documentata in [ADR-001](docs/decisions/ADR-001-local-mvp-stack.md).

## Confini del MVP

Il link token è adatto a una dimostrazione o a un pilota controllato, non alla produzione pubblica. Prima del deploy aziendale servono:

- autenticazione SSO o account gestiti;
- autorizzazione per ruoli JET/SDF/dealer;
- CSRF protection, rate limiting e gestione sicura dei segreti;
- hosting e backup gestiti;
- privacy assessment e informative;
- migrazione eventuale a PostgreSQL per concorrenza elevata;
- email provider per reminder reali;
- generazione PDF lato server.
