# SDF Network Performance Portal

Portale demo Node.js/SQLite per concessionari, campagne annuali, questionario KPI proprietario, bozze, submission, benchmark, note, report e audit.

## Workflow MVP

JET → crea o importa i dealer → crea una rilevazione → condivide link o QR → il dealer compila e può salvare una bozza → invia definitivamente → dashboard e Analisi KPI leggono gli stessi dati SQLite → SDF consulta in sola lettura.

Il dealer non ha un account: il link opaco `/compila/:token` identifica dealer e campagna. Il questionario proprietario è il flusso predefinito; Jotform resta un'integrazione opzionale disattivata.

## Avvio e test

Richiede Node.js 22.5 o successivo.

```bash
npm install
npm start
npm test
npm run build
npm run seed:demo
```

Aprire `http://127.0.0.1:4173`. Il database demo viene creato/migrato in `data/sdf-kpi.sqlite`.

### Ripristino della demo cliente

`npm run seed:demo` cancella esclusivamente i dati marcati come dimostrativi e ricrea in modo idempotente lo stesso scenario:

- 64 concessionari fittizi, distribuiti tra 8 regioni, 4 aree e 5 area manager fittizi;
- campagna attiva “Rilevazione 1 — 2026” con 32 validati, 12 inviati, 4 da verificare, 6 bozze e 10 non iniziati;
- 48 compilazioni ricevute, 16 non inviate e 75% di completamento;
- campagna storica chiusa “Rilevazione 2 — 2025” con dati per 15 concessionari;
- KPI, formule derivate, note, audit, link e QR della demo.

Il comando non modifica schema o configurazioni e si interrompe se rileva concessionari non marcati come demo. È destinato esclusivamente all’ambiente dimostrativo. Il vecchio `npm run reset` ricrea invece il file SQLite da zero e non va usato su dati da conservare.

Configurazione minima:

```dotenv
COLLECTION_MODE=proprietary
DEMO_VIEW_SWITCHER=true
APP_PUBLIC_URL=http://127.0.0.1:4173
DEALER_LINK_SECRET=
```

Non servono credenziali Jotform. Il selettore “Vista JET / Vista SDF” è dimostrativo e modifica sia le azioni UI sia le autorizzazioni delle API di scrittura; non sostituisce autenticazione e ruoli reali.

## Questionario e KPI

La fonte unica è [`config/kpi-questionnaire.js`](config/kpi-questionnaire.js). Definisce 20 campi dimostrativi, metadati, sezioni, limiti, decimali, ordine e versione `demo-v1`. La stessa configurazione alimenta UI, validazione client/server, dettaglio dealer, Analisi KPI ed export.

Sono calcolati otto KPI derivati documentati nel modulo: totale unità, conversione preventivi, raggiungimento target fatturato/ricambi, utilizzo ed efficienza officina, ricavo per unità e per ordine di lavoro. Con denominatore zero o dati mancanti il risultato non viene salvato: niente `NaN` o `Infinity`; la UI mostra “Non calcolabile”.

Il dealer può salvare manualmente o con autosalvataggio debounced (1,8 secondi), riaprire la bozza dallo stesso link, rivedere un riepilogo e inviare. Dopo l'invio il form è bloccato; JET può impostare `NEEDS_REVIEW`, `VALIDATED` o `REOPENED`. Gli stati gestiti sono `NOT_STARTED`, `DRAFT`, `SUBMITTED`, `NEEDS_REVIEW`, `VALIDATED`, `REOPENED`.

## API principali

| Metodo | Endpoint | Funzione |
|---|---|---|
| GET | `/api/overview` | Avanzamento reale da SQLite |
| GET | `/api/dealers` | Dealer e stati raccolta |
| GET | `/api/dealers/:id` | KPI, storico e raccolta |
| POST | `/api/dealers/import` | Import anagrafica CSV, non KPI |
| GET/POST | `/api/dealers/:id/collection-link/*` | Link, revoca e rigenerazione JET |
| POST | `/api/dealers/:id/submission/status` | Validazione o riapertura JET |
| GET | `/api/collection-links/:id/qr.svg` | QR verso il portale |
| GET | `/api/compila/:token` | Questionario dealer |
| PUT/POST | `/api/compila/:token/draft\|submit` | Bozza o invio definitivo |
| GET | `/api/analysis` | Media, mediana, min, max, ranking |
| GET | `/api/reports/csv` | Export rete |

Gli endpoint legacy `/api/survey/:token` e il modulo Jotform restano disponibili per compatibilità. Con `COLLECTION_MODE=proprietary`, webhook, sync, iframe e chiamate API Jotform sono disattivati. La configurazione opzionale è descritta in [`docs/jotform-setup.md`](docs/jotform-setup.md).

## Migrazione database

L'avvio aggiunge in modo non distruttivo metadati del questionario alle definizioni KPI e `questionnaire_version`, issue e revisione alle submission. I KPI legacy sono conservati ma marcati inattivi; i dati demo compatibili vengono migrati e completati per `demo-v1`. Non vengono eliminate compilazioni, note o audit esistenti.

Decisioni: [ADR-001](docs/decisions/ADR-001-local-mvp-stack.md), [ADR-002](docs/decisions/ADR-002-jotform-collection-integration.md), [ADR-003](docs/decisions/ADR-003-proprietary-questionnaire.md).

## Limiti

- I 20 KPI e le formule sono dimostrativi e devono essere definiti con il cliente.
- Le rilevazioni sono una o due campagne annuali, non raccolte giornaliere o mensili.
- Reminder preparati e auditati, ma nessuna email viene realmente spedita.
- Il selettore ruoli non è autenticazione; mancano login, SSO e autorizzazioni production-grade.
- SQLite sul piano Free di Render può essere effimero; mancano database gestito, backup, privacy e hosting definitivo.
- Su Render Free il reset e le modifiche al dataset non costituiscono persistenza garantita: un nuovo deploy o riavvio può ricreare il database demo.
- Jotform è opzionale e richiede configurazione separata solo se riattivato.

Il sistema non è pronto per dati aziendali reali.
