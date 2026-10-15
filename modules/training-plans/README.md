# Trainingsplanung

AppBasis standard module for athlete/day training plans.

E7B1 established the reusable planning contract. E7B2 adds the standard
repository/service layer with PostgreSQL persistence, immutable revisions,
optimistic concurrency, subject/date-range reads and protected independent
copies. ULC adoption, attendance presentation, week UI and preview deployment
remain later slices.

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


## E7B2 service contract

- `TrainingPlanService.create()` creates one plan for one subject/day.
- `update(..., expectedRevision, ...)` appends immutable revisions and rejects
  stale saves.
- `listForSubjectDateRange()` is the backend read model for week/range views.
- `copyCurrentTo()` copies the current snapshot to a new target using new
  plan/item identities while preserving source provenance.
- Existing targets are fail-closed; E7B2 never overwrites another plan.
- PostgreSQL reads that combine plan/revision/items use repeatable-read
  transactions and writes lock the plan row before appending a revision.

## Production lifecycle primitive

The standard module now exposes a separate privileged
`TrainingPlanLifecycleService` for subject-owned plan data:

- authorization and retention timing remain application-owned;
- the lifecycle boundary accepts only organization + opaque subject id;
- deletion is physical and removes every plan, immutable revision and revision
  item for that subject inside exactly one organization;
- the operation is idempotent and returns explicit plan/revision/item counts;
- PostgreSQL serializes the rare lifecycle purge against concurrent plan writes
  before deleting the subject scope;
- no public training-plans HTTP route calls this lifecycle service;
- recovery/deletion-marker policy remains app-owned, so an app can replay the
  same module purge from its authoritative lifecycle marker after restore.

This closes the module-local lifecycle capability without embedding a ULC
retention period or cross-owner foreign key in the reusable standard module.

