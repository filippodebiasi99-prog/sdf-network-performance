# ADR-002: Jotform as collection channel, portal as system of analysis

## Status

Accepted

## Date

2026-07-15

## Context

The portal already owns dealers, campaigns, manual submissions, KPI definitions, notes, reports and audit events. Dealers need a branded, campaign-specific entry point while Jotform should manage only form presentation, field validation, submission and the original response.

## Decision

- Keep the existing SQLite/domain model as the source for dashboards and analysis.
- Add one opaque dealer/campaign link per pair. Store its SHA-256 hash and a nonce; reconstruct the public token with a server-side HMAC secret so plaintext tokens are not persisted.
- Preserve the proprietary questionnaire as `MANUAL_DEMO`; add `JOTFORM` as a separate source.
- Store Jotform originals and normalized payloads in `jotform_submissions`, linked to the existing internal `submissions` row.
- Centralize field mapping and Jotform URL/API handling under `config/` and `integrations/jotform/`.
- Use a webhook for immediate ingestion and an idempotent manual sync for recovery.
- Verify hidden metadata against the token association and, in live mode, retrieve the submission from Jotform's API before persisting.
- Use iframe embedding. Styling inside the form remains a Jotform responsibility.

## Alternatives considered

### Separate Jotform form per dealer

Rejected because it multiplies mappings, versions and webhook configuration.

### Direct link to Jotform

Rejected because it bypasses the personalized portal, makes revocation harder and exposes the collection provider as the primary application.

### Replace manual submissions

Rejected. Existing data and the fallback flow must remain available during integration verification.

## Consequences

- Dashboard, benchmark and export continue to read one normalized KPI model.
- Webhook retries and manual sync are safe because the external submission ID is unique.
- Rotating `DEALER_LINK_SECRET` invalidates reconstructable public links and therefore requires an explicit migration/regeneration plan.
- The MVP has only an administrative UI boundary, not real authorization. Production still requires authentication, roles, SSO, managed storage, backups, privacy controls and fuller audit coverage.

