# Trainingsblöcke

AppBasis standard module for reusable training-block templates.

The module deliberately separates reusable training content from concrete
training sessions, attendance and later athlete/day planning.

## Contract

- Module ID: `training-blocks`
- Package: `@appbasis/training-blocks`
- Capabilities: `training-blocks:view`, `training-blocks:edit`
- Database owner: this module only
- Current schema version: 6

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

## Usage lifecycle ownership gap: read-only inventory

`PostgresTrainingBlockRepository.inspectUsagePrivacy(organizationId)` is
a privileged, organization-scoped, **read-only** report. It returns only
counts: total usage, training-plan source kind, missing training-plan
references, other kinds, free-text notes, and events with source references.
Neither note text nor opaque source references are returned. The query is
performed in a repeatable-read, read-only PostgreSQL transaction and does
not modify usage, favorites or revisions.

**No deletion may be inferred from this report.** Current usage rows store
`source_kind`, optional `source_ref` and optional `note`, but no
authoritative `subject_id` or `principal_id`. The ULC training-plan
writer currently creates `training_plan` references formatted
`planId:itemId`; these are not independently authoritative subject
ownership proofs. Legacy events can omit the reference entirely and notes
can contain personal information. Deleting usage by matching a substring
of a plan or person identifier would be unsafe. A future app/module
lifecycle must establish owner evidence, write blocking, restore replay,
retention rules and full regression tests before targeted erasure or
anonymization is enabled. No production/runtime activation is implied.

## Opt-in schema v6: atomic subject usage attribution (not deployed)

The module-owned schema v6 adds `appbasis_training_block_usage_subject`
with an exact organization/usage foreign key and a subject-scoped persistent
deletion marker. Neither table is populated by a migration or automatically
inferred from historic `sourceRef` values.

The restricted PostgreSQL `recordVerifiedSubjectUsageOnce` method writes
the complete usage event and its canonical subject/plan/item attribution in
**one transaction**, guarded by a per-organization-and-subject advisory lock.
The ULC application **must first verify** the current authoritative plan,
subject, item, block and deterministic event ID (PR #493). Attempts to claim
legacy unattributed events, reassign an event to a different subject, reuse
an event ID with modified data or write following a deletion marker fail
closed. Normal usage interfaces stay unchanged.

The restricted `markSubjectDeletedAndRemoveAttributedUsage` method
atomically inserts a 35-day deletion marker and erases **only** usage events
that are explicitly attributed to that organization and subject. Retries
are safe and the same advisory lock serializes writes against deletion.
The marker is NOT purged automatically, including after 35 days, and
subject ownership is different from principal/identity ownership.

**Not production ready:** This is a separate, unused module primitive:
no application calling path, no HTTP/UI, no automatic subject-delete
composition, no runtime migration, no historical backfill and no operator
restore/purge flow. Existing legacy writes can still create unattributed
events and must not be mistaken for subject-scoped writes. Before wiring
the app, prove the source-plan-to-subject mapping and authorization,
disable unsafe legacy writes for subject bookings, and reconcile subject
tombstones across restored backups. Free-text notes and unowned legacy
events still require an independent privacy policy. `training-blocks`
and `ulc-linz` production gates remain blocked.

## Offline subject-usage restore reconciliation (schema v6, not activated)

The module's privileged `listSubjectUsageDeletionMarkers(now)` returns
the **complete** authoritative schema-v6 subject-deletion marker inventory
in a read-only repeatable-read transaction. Crucially it also includes
expired markers: none can be considered ineffective merely because the
35-day retention clock has elapsed. The privileged
`reconcileSubjectUsageDeletionMarker(marker)` atomically inserts a missing
marker and deletes only `(organization, subject)` usage rows that were
explicitly attributed. It uses the SAME scoped advisory transaction lock
as verified subject writes and the original subject-deletion method.
Conflicting timestamps abort without mutating the restored target; identical
replay is idempotent. Unattributed legacy events and other subjects/orgs
are never deleted by an inferred plan reference or free-text match.

`reconcileTrainingBlockSubjectUsageRestoredDatabase(source, target, now)`
checks the entire authority snapshot, rejects duplicates/invalid dates
and retention intervals BEFORE writing any marker to an older offline
target, then replays only validated markers. Real PostgreSQL E2E verifies
older backup resurrection, expired marker carry-over, repeated replay,
cross-tenant isolation, legacy row preservation, and timestamp conflicts.

**This cannot authorize a restore promotion.** An operator must independently
prove the authoritative source is newer and its deletion inventory complete,
keep target writes and public ingress disabled, reconcile all other owners,
and separately investigate any unattributed/legacy personal events. An
empty marker inventory cannot prove no historical deletions occurred.
Schema v6 must already exist on both recovery endpoints. Backup retention,
restore promotion, marker purge and cross-owner subject-deletion integration
remain production blockers. Neither the app nor any automatic job calls
these recovery primitives.
