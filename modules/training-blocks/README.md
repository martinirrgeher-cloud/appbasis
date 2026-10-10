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
- immutable numbered revisions for block metadata;
- one opaque audience/group reference per revision;
- optional duration;
- ordered exercise occurrences, including repeated use of the same exercise;
- ordered parameter overrides per exercise occurrence.

There are intentionally no foreign keys into `athletes` or
`exercise-catalog`. Apps resolve audience and exercise references through
their public module contracts. ULC Linz will require one valid training group
per block at its adapter boundary.

Favorites, usage metadata, UI autosave, revision comparison and planning
integration are follow-up slices on this stable foundation.
