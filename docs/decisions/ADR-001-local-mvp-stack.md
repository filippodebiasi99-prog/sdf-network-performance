# ADR-001: Native Node.js and SQLite for the local MVP

## Status

Accepted

## Date

2026-07-15

## Context

The approved visual preview must become a working MVP without an existing backend, package configuration or deployment environment. The product needs relational data, validation, persistent drafts, aggregates and exports. It must remain easy to demonstrate locally while preserving a clean migration path to an enterprise stack.

## Decision

Use the native Node.js HTTP server and `node:sqlite` for the MVP. Expose data through REST JSON and serve the existing HTML/CSS/JavaScript frontend from the same process. Dealer data entry uses campaign-specific opaque tokens during the pilot.

## Alternatives considered

### Jotform as the only backend

- Faster for form creation.
- Does not prove the independent data model or complete portal workflow.
- Rejected for this MVP because the dashboard must be able to survive a future Jotform replacement.

### Express plus an ORM

- Familiar ecosystem and richer middleware.
- Requires dependency installation and additional supply-chain surface for a small local MVP.
- Deferred until deployment requirements are known.

### PostgreSQL immediately

- Better production concurrency and managed hosting options.
- Requires infrastructure choices the client has not made yet.
- Deferred; REST and relational schema keep migration straightforward.

## Consequences

- The MVP runs with one command and no package installation.
- SQLite is suitable for the pilot but not claimed as the final multi-tenant production database.
- Production must add SSO or account authentication, authorization, CSRF protection, rate limiting, encrypted secrets, backups and managed hosting.
- KPI definitions remain data-driven and can be migrated independently of the UI.
