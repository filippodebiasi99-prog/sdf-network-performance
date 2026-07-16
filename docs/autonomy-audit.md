# Audit di autonomia operativa JET

Data audit: 16 luglio 2026. Ambito: normale gestione del portale dimostrativo con `COLLECTION_MODE=proprietary`.

## Matrice

| Operazione | Ruolo | Interfaccia | API | Stato | Dipendenza dallo sviluppatore |
|---|---|---|---|---|---|
| Creare un concessionario | JET | Concessionari → Nuovo concessionario | `POST /api/dealers` | Completa | Nessuna |
| Modificare Dealer ID, anagrafica, referente ed email | JET | Dettaglio → Modifica anagrafica | `PUT /api/dealers/:id` | Completa | Nessuna |
| Disattivare conservando lo storico | JET | Dettaglio → Modifica anagrafica | `PUT /api/dealers/:id` | Completa | Nessuna |
| Cercare e filtrare concessionari | JET, SDF | Concessionari | `GET /api/dealers` | Completa | Nessuna |
| Controllare CSV prima dell'import | JET | Concessionari → Importa anagrafica | `POST /api/dealers/import/preview` | Completa | Nessuna |
| Importare anagrafica CSV | JET | Concessionari → Importa anagrafica | `POST /api/dealers/import` | Completa | Nessuna |
| Creare una rilevazione | JET | Rilevazioni → Nuova rilevazione | `POST /api/campaigns` | Completa | Nessuna |
| Modificare nome, periodo e scadenza | JET | Rilevazioni → Modifica | `PUT /api/campaigns/:id` | Completa | Nessuna |
| Scegliere dealer prima dell'apertura | JET | Dialogo rilevazione | `PUT /api/campaigns/:id/dealers` | Completa | Nessuna |
| Aprire, chiudere e archiviare | JET | Azioni rilevazione | `POST /api/campaigns/:id/status` | Completa | Nessuna |
| Duplicare o collegare una seconda rilevazione | JET | Rilevazioni | `POST /api/campaigns/:id/duplicate` | Completa | Nessuna |
| Generare link alla prima associazione | JET | Automatico | associazione rilevazione + link | Completa | Nessuna |
| Copiare/aprire/revocare/rigenerare link | JET | Concessionari e dettaglio | `/api/dealers/:id/collection-link/*` | Completa | Nessuna |
| Vedere/scaricare/stampare QR | JET | Concessionari e dettaglio | `GET /api/collection-links/:id/qr.svg` | Completa | Nessuna |
| Vedere aperture e stato compilazione | JET | Dettaglio concessionario | `GET /api/dealers/:id` | Completa | Nessuna |
| Salvare bozza e inviare | Dealer | `/compila/:token` | `/api/compila/:token/draft|submit` | Completa | Nessuna |
| Riaprire, modificare e validare | JET | Dettaglio concessionario | submission status/values | Completa | Nessuna |
| Inserire note interne | JET | Dettaglio concessionario | `POST /api/dealers/:id/notes` | Completa | Nessuna |
| Verificare destinatari, email, duplicati e link | JET | Concessionari → Prepara comunicazioni | `GET /api/campaigns/:id/distribution` | Completa | Nessuna |
| Modificare testo reminder e firma | JET | Prepara comunicazioni | `POST /api/campaigns/:id/distribution` | Completa | Nessuna |
| Registrare comunicazioni preparate | JET | Prepara comunicazioni | audit `communications_prepared` | Completa | Nessuna; nessun invio reale |
| Esportare dati KPI e stato rete | JET, SDF | Concessionari, Analisi KPI, Report | `GET /api/reports/csv` | Completa | Nessuna |
| Consultare dashboard/KPI/report | JET, SDF | Overview, Analisi KPI, Report | API GET | Completa | Nessuna |
| Impedire scritture in vista SDF | SDF | Azioni nascoste | `requireJet` → HTTP 403 | Completa per demo | Autenticazione reale necessaria in produzione |
| Accedere alla sola rilevazione assegnata | Dealer | `/compila/:token` | token opaco | Completa per demo | Gestione segreti production necessaria |

## Regole operative

- L'associazione dealer–rilevazione è persistita in `campaign_dealers`; i link vengono creati per le sole associazioni.
- Dealer e associazioni possono essere rimossi da una rilevazione solo mentre è in bozza, per evitare di separare dati già raccolti dalla loro campagna.
- Un dealer creato o importato durante una rilevazione aperta viene associato alla rilevazione aperta per compatibilità con il flusso esistente; le nuove rilevazioni in bozza richiedono una selezione esplicita.
- “Archiviata” usa lo stato chiuso già compatibile con il progetto e conserva `archived_at` per distinguerla da una semplice chiusura.
- Testo reminder e firma sono in `operational_settings`, non nel codice. Segreti, chiavi e formule restano intenzionalmente fuori dalla UI.
- La preparazione delle comunicazioni salva un audit con `sent: false`: non esiste alcuna simulazione di consegna email.

## Dipendenze ancora di produzione

Non sono operazioni quotidiane JET, ma restano necessarie prima di utilizzare dati reali: autenticazione e ruoli verificati lato server, SSO, database gestito, backup, storage persistente, provider email, privacy, gestione dei segreti e monitoraggio dell'hosting. Le formule KPI nuove o incompatibili richiedono sviluppo e versionamento.
