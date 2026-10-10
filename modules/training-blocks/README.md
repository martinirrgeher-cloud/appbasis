# Trainingsblöcke

AppBasis standard module for reusable training-block templates.

The module deliberately separates reusable training content from concrete
training sessions, attendance and later athlete/day planning.

## Contract

- Module ID: `training-blocks`
- Package: `@appbasis/training-blocks`
- Capabilities: `training-blocks:view`, `training-blocks:edit`
- Database owner: this module only
- Current schema version: 1

The foundation is revision-ready from the first schema:

- one current block identity with active/inactive lifecycle;
- numbered immutable revision rows for block metadata with optimistic concurrency;
- one opaque audience/group reference per revision;
- optional duration;
- ordered exercise occurrences, including repeated use of the same exercise;
- ordered parameter overrides per exercise occurrence.

There are intentionally no foreign keys into `athletes` or
`exercise-catalog`. Apps resolve audience and exercise references through
their public module contracts. ULC Linz will require one valid training group
per block at its adapter boundary.

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
