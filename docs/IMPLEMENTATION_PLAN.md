# Implementation Plan: SDF KPI Portal MVP

## Overview

Trasformare la preview statica in un MVP locale realmente funzionante. Il portale userà un database SQLite, API HTTP native Node.js e la UI esistente. Il flusso principale sarà: link concessionario → bozza questionario → invio → aggiornamento dashboard JET/SDF → analisi ed export.

## Architecture decisions

- Node.js senza dipendenze esterne per ridurre l'attrito di avvio.
- SQLite tramite `node:sqlite` per persistenza locale e transazioni.
- REST JSON per separare raccolta dati e dashboard.
- Link concessionario con token non prevedibile per il pilota; autenticazione aziendale e SSO restano requisiti di produzione.
- I KPI sono definiti nel database, non nel frontend, così possono cambiare senza ricostruire l'interfaccia.

## Task list

### Phase 1: Foundation

#### Task 1: Server, schema and seed — completato

Acceptance criteria:

- `npm start` serves the existing UI and `/api/health`.
- SQLite contains dealers, campaigns, KPI definitions, submissions, values, notes and audit events.
- Re-running initialization does not duplicate seed data.

Verification: health request returns 200; schema integration tests pass.

#### Task 2: Read-only dashboard API — completato

Acceptance criteria:

- Overview metrics are calculated from stored submissions.
- Dealer list supports search, region and status filters.
- Dealer detail and KPI analysis return stored aggregates.

Verification: API integration tests cover each endpoint.

### Checkpoint: Foundation

- Server starts without dependencies.
- Existing dashboard loads data from SQLite.

### Phase 2: Data collection

#### Task 3: Dealer questionnaire — completato

Acceptance criteria:

- A dealer link opens the correct campaign and KPI fields.
- Draft saves persist and can be reopened.
- Submission validates required fields and changes dashboard status.

Verification: end-to-end API test performs draft → submit → overview update.

#### Task 4: Operational management — completato

Acceptance criteria:

- JET can add internal notes.
- Campaign list exposes dates, state and progress.
- Audit events record draft, submit and note operations.

Verification: persistence tests and manual UI check.

### Phase 3: Reporting and polish

#### Task 5: Reports and exports — completato

Acceptance criteria:

- CSV export contains dealer metadata, status and KPI values.
- Reports page links to a real downloadable export.
- Invalid requests return structured errors.

Verification: CSV response headers and content are tested.

#### Task 6: Browser verification and documentation — completato

Acceptance criteria:

- Desktop and mobile flows render without overflow or console errors.
- README documents commands, demo links and production boundaries.
- Architecture decision is recorded in an ADR.

Verification: screenshots at 390 and 1440 px; full test suite passes.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Token links are insufficient for production security | High | Explicitly restrict MVP to pilot/local use; design API so SSO can replace token lookup |
| KPI definitions may change | Medium | Store definitions and validation rules in SQLite |
| Concurrent multi-user writes outgrow SQLite | Medium | Keep REST boundary and documented migration path to PostgreSQL |
| Demo data is mistaken for real data | Medium | Label seeded records and document reset behavior |
