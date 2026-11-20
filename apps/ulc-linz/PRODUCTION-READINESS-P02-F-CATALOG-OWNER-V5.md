# P2-F – Exercise catalog module-owned v5 protected subject lifecycle (candidate)

**Status 20.11.2026: DRAFT / unregistered / not active.** This is an isolated technical candidate, **not** a privacy or production approval.

## What changes

A single module-owned **v5 proposal** `modules/exercise-catalog/test/fixtures/0004_appbasis_exercise_catalog_subject_lifecycle.candidate.sql` now contains the exact two tested P02-G and P02-H guard relations:

1. `appbasis_exercise_catalog_favorite_deletion`: organization/principal-bound 35-day source marker. The marker is not automatically expired or purged; ordinary application sessions must not mutate it.
2. `appbasis_exercise_catalog_usage_subject`: explicit organization-bound attribution to usage event, principal and `verified_by` from trusted identity/athletes context; no inference from `source_ref`, notes or old usage events.

The original unregistered test fixtures remain in place and a new required test ensures the proposed module SQL contains **exactly their three SQL statements**. This does not insert v5 into `modules/exercise-catalog/appbasis.module.json` or `apps/ulc-linz/appbasis.database.json`. Both owner declarations remain v4. No SQL, grants, roles, provider calls, UI changes, worker activation, deletion timers or merges/deployments are performed.

## Real isolated regression

`tooling/ulc-linz-p02-catalog-owner-v5.postgres.test.mjs` uses **only** local PostgreSQL 18 with `DATABASE_URL=postgres://postgres:postgres@localhost:5432/appbasis_identity_e2e`. It creates and drops a random disposable DB and synthetic NOLOGIN role, with no personal data.

It verifies:

- existing 8-table module schema with old item, favorite and unattributed usage records;
- a deliberate SQL transaction failure rolls back the entire proposed expansion;
- real module-owned v5 statements expand the schema **8→10 tables** without destroying old rows or heuristically populating usage attribution;
- a composite foreign key denies cross-organization usage attribution and validation rejects unsupported sources and malformed marker lifetimes;
- the synthetic app role can read the marker and insert explicitly attributed usage but **cannot INSERT/UPDATE/DELETE markers**, using real PostgreSQL SQL permission-denial checks.

The Quality gate runs a separate source/owner/manifest test. The PostgreSQL gate executes the actual draft statements on its disposable test DB. A skipped PostgreSQL test without `DATABASE_URL` is **not** accepted as SQL evidence.

## Why this is not a direct 51→68 Production migration

The current Production installation has 51 public tables, Preview has 66, the currently declared v16 manifest yields 64 and v17 calendar rules are **separately unregistered**. The proposed catalog v5 adds only the two final guard relations to a future vetted 66-table installation (68). These counts are not proof that an arbitrary installed Production migration has run.

In particular `apps/ulc-linz/migrations/0010_ulc_linz_registration_notes.sql` alters the two registration tables created by `0008_ulc_linz_session_registration.sql`; Production currently lacks those tables. **Never blindly replay all 41 migrations, assume table count proves a complete ledger, or run the new catalog migration against a partially installed application database.**

## Next release-relevant package (separate operator approval)

1. Inspect authoritative migration ledger and schema metadata of a **genuinely isolated and access-controlled copy of a current Production backup**, not by modifying Production or Preview. Validate existing data, constraints, functions, pending `0008→0010` ordering, grants and blockers before any apply. A synthetic empty-database CI run is not an in-place upgrade proof.
2. On that approved isolated clone only, test the explicit staged 51→64 registered-owner upgrade, calendar v17 and the v5 module draft with rollback and historic registration data checks. Exact step ownership, backups and recovery evidence must be recorded.
3. Separately reconcile the app role's missing block-usage subject SELECT/INSERT and deletion-marker SELECT as minimal, revocable privileges. No blanket table/marker DML grants.
4. Complete authorized P01/D2 retention, subject erasure and all-owner No-Resurrection after restore; private R2 media, app-owned attendance/registration/trainer audit and historic third-party references remain separate blockers.
5. Review the runtime's protected opt-in, perform focused mobile acceptance, and only then consider owner version/manifest registration, approvals, migration and private go-live.

## Decision

**P2-F technical candidate may be accepted for further review following exact-head CI. Production readiness remains BLOCKED.** Existing exercised mobile functionality is unchanged. Related: #607, #659, #660, #661.
