# ULC Linz Production Backup & Restore Contract

Status: canonical M5/M6 operational contract for `ulc-linz` production.

## Scope

This contract applies only to the dedicated ULC Linz production PostgreSQL database and its isolated restore rehearsal target. It does not authorize a production release, a public route, or a database mutation by itself.

## Managed backup history

The production evidence run MUST resolve the exact Neon production project through the provider API and MUST fail closed unless `history_retention_seconds > 0`. The observed provider value is the source for `automaticBackupsEnabled` and `retentionDefined`; repository documentation alone never satisfies those claims.

## Pre-migration backup rule

Before every future ULC Linz production schema migration that can affect existing production data, the protected migration procedure MUST verify a non-zero Neon recovery history immediately before the migration and MUST record the pre-migration UTC timestamp as the recovery point. A migration MUST NOT proceed when that recovery history is unavailable or cannot be bound to the exact production project and branch.

For the initial production schema materialization, this requirement is satisfied only when the database was independently verified empty before the first migration. It does not waive the rule for later migrations.

## Controlled restore rehearsal

M5 High-Privacy evidence MUST come from a fresh controlled restore of the exact current ULC Linz production database into a different isolated restore database. The source is read-only. The target MUST be proven empty before restore. Restore uses a custom PostgreSQL dump, a single-transaction `pg_restore`, and no public runtime or route.

The rehearsal MUST verify all of the following before emitting evidence:

- source and restore target are distinct encrypted PostgreSQL endpoints;
- the restore target was empty before the write;
- the restore completed successfully;
- source and restored schema fingerprints match;
- source and restored per-table row-count inventories match without exporting row values;
- ULC PostgreSQL identity/auth, deny-by-default permissions, lifecycle, export, retention and security-event tests pass against the restore environment;
- restore reconciliation behavior is covered by the same current lifecycle contract digest;
- temporary dumps and evidence workspaces are removed even after failure.

## Evidence boundary

The production evidence bundle may contain opaque provider/resource identifiers, timestamps, booleans, hashes and criterion states. It MUST NOT contain database URLs, credentials, cookies, authorization headers, secrets, request/response bodies, row values or personal data.

The restore rehearsal and provider observation MUST occur inside one short-lived M5 evidence window and MUST bind to one resource-binding fingerprint. Any provider, runtime, database, lifecycle or time-window drift keeps M5 fail-closed.
