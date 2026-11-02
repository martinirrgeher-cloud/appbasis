# Trainingsblöcke

AppBasis standard module for reusable training-block templates.

The module deliberately separates reusable training content from concrete
training sessions, attendance and later athlete/day planning.

## Contract

- Module ID: `training-blocks`
- Package: `@appbasis/training-blocks`
- Capabilities: `training-blocks:view`, `training-blocks:edit`
- Database owner: this module only
- Current schema version: 4

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
