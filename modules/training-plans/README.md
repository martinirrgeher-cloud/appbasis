# Trainingsplanung

AppBasis standard module for athlete/day training plans.

E7B1 establishes the reusable planning contract only. ULC adoption, week UI,
attendance presentation and preview deployment remain later slices.

## Contract

- Module ID: `training-plans`
- Package: `@appbasis/training-plans`
- Capabilities: `training-plans:view`, `training-plans:edit`
- Database owner: this module only
- Current schema version: 1

The foundation deliberately separates planning from ULC training-session
attendance. A plan belongs to one opaque subject and one calendar day. Its
content is revision-ready and stores plan-owned snapshots:

- top-level plan blocks and standalone exercises;
- exercises nested below a plan block;
- optional provenance to a training-block id/revision;
- optional provenance to a catalog exercise id;
- copied names, notes, duration and planning values owned by the plan;
- sets, repetitions, amount, unit and comment per exercise.

Source ids are provenance only. There are no foreign keys into athletes,
training-blocks or exercise-catalog, so later source edits cannot silently
change an existing plan.
