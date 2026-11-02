# Trainingsblöcke

AppBasis standard module for reusable training-block templates.

The module deliberately separates reusable training content from concrete
training sessions, attendance and later athlete/day planning.

## Contract

- Module ID: `training-blocks`
- Package: `@appbasis/training-blocks`
- Capabilities: `training-blocks:view`, `training-blocks:edit`
- Database owner: this module only
- Current schema version: 5

The foundation is revision-ready from the first schema:

- one current block identity with active/inactive lifecycle;
- numbered immutable revision rows for block metadata with optimistic concurrency;
- zero, one or multiple opaque audience/group references per revision (zero means club-wide);
- optional duration;
- ordered exercise occurrences, including repeated use of the same exercise;
- ordered parameter overrides per exercise occurrence.

There are intentionally no foreign keys into `athletes` or
`exercise-catalog`. Apps resolve audience and exercise references through
their public module contracts. ULC Linz resolves every selected group at its adapter boundary; an empty audience set remains club-wide.

E7A2 adds the reusable persistence/service contract on that schema:

- atomic create and append-only content revisions;
- stable exercise-occurrence IDs across edits/reordering;
- optimistic concurrency against the caller's last-read revision;
- current-state reads separated from on-demand revision history;
- revision read/compare support;
- lifecycle deactivation without deleting history;
- equivalent in-memory and PostgreSQL repository behavior.

ULC adoption, audience/exercise resolution, UI autosave, preview migration and
provider/deployment work remain later slices.

## Personal metadata lifecycle (partial, not production-ready)

`TrainingBlockLifecycleService.deletePrincipalFavorites(organizationId, principalId)`
provides an idempotent, organization-scoped cleanup of only the named
principal's training-block favorites, implemented in both repositories.
**Only the application's authorized privacy/lifecycle caller may invoke it**.
This API does not delete training-block revisions, training-block usage or
other principals' preferences.

There is **no subject-deletion tombstone**, write/deletion synchronization,
restore reconciliation or approved usage retention/subject ownership contract
yet. Concurrent or later preference writes can recreate rows. These remain
required before activating deletion workflows or lifting the module's
`blocked` production contract. Never infer ownership of usage events from
opaque source references or free-text notes.

## Tombstone-protected subject favorite deletion (schema 5)

Authorized lifecycle callers should use
`TrainingBlockFavoriteDeletionService.deletePrincipalFavorites(org, principal)`.
It atomically creates a 35-day deletion marker and deletes the principal's
favorites. The PostgreSQL repository first checks whether the additive v5 tombstone
table exists. Before migration, favorite writes continue to work as before
and a deletion marker cannot be installed. After migration, writes obtain
the same transaction-scoped principal lock as the deletion operation,
rejecting new favorites for a marked principal. Deployment must finish the
schema upgrade before enabling privacy deletion callers. In-memory
behavior is equivalent for unit testing. Repeated deletion is idempotent.

**Important:** markers intentionally remain effective until an explicitly
reviewed purge removes them (including after their stated expiration).
The prior cleanup primitive still exists for compatible internal cleanup but
is not suitable as a subject-deletion workflow. There is still no
restore-reconciliation, usage-event subject ownership contract or application
authorization/retention integration. Production lifecycle remains blocked.

## Offline favorite restore reconciliation (repository evidence only)

`reconcileTrainingBlockFavoritesRestoredDatabase(source, target, now)` replays
a newer **authoritative** database's still-active subject-deletion decisions
into an offline older restored database. The PostgreSQL replay locks the same
(organization, principal) advisory transaction key as favorite writes and
requires exact matching marker timestamps; it removes any resurrected favorites
atomically and rejects conflicting older markers. A repeated replay is safe.

**This is not a production restore workflow.** The operator must independently
validate recovery-point ordering, completeness of the newer authority snapshot,
the 35-day backup/restore window, and all other owners' deletion ledgers;
freeze target writes and keep ingress closed until every owner has successfully
reconciled. An empty source list is not evidence that replay is unnecessary.
No automated application caller, promotion, marker purge or production access
is enabled. Schema v5 must exist on both endpoints. Module and app production
lifecycle contracts remain blocked.

## Expired favorite marker retention preflight (read-only)

`PostgresTrainingBlockRepository.inspectExpiredFavoriteDeletionMarkers(now, limit)`
returns a deterministic, at-most-200-item review page of **expired**
35-day markers. Use the returned `nextCursor` with the **same** `now`
value for successive keyset pages; `hasMore` signals more records.
Each item reports whether residual favorites exist in the same organization
and principal scope, indicating a data-integrity failure. The query runs in a
read-only repeatable-read transaction and never deletes markers or favorites.

**Expired is not authorized to purge.** Before a separate module-owned deletion
primitive may be wired into a retention job, the ULC app must prove that the
backup and restore window has closed, no older backup can be promoted without
full reconciliation, the principal can no longer write, and other owners have
completed their deletion lifecycle. This preflight alone never qualifies as
a production retention, restore, or authorization gate. No purge or runtime
caller is activated. Both production contracts remain blocked.
