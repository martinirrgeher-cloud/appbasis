# Trainingsdokumentation

AppBasis standard module for documenting the actual execution of a planned
training session.

The module deliberately owns the documentation snapshot and its revision
history. Training plans, athletes and attendance systems remain external
sources. Their identifiers are stored only as opaque provenance; there are no
cross-module foreign keys.

## Contract

- Module ID: `training-documentation`
- Package: `@appbasis/training-documentation`
- Capabilities: `training-documentation:view`,
  `training-documentation:edit`
- Database owner: this module only
- Current schema version: 1

A documentation belongs to one opaque subject and one calendar day. At most
one current documentation exists for that target. Creation records the exact
source plan id and revision and copies the planned content into a
documentation-owned snapshot.

## V1 lifecycle

- `draft`: actual values, performed flags, notes and attendance snapshots can
  be edited.
- `completed`: the current documentation is read-only.
- `reopen`: appends a new draft revision without changing source-plan
  provenance.
- Every mutation uses optimistic revision matching.
- Historical revisions are immutable.

The module accepts generic attendance snapshots. It does not know ULC athlete,
group or training-session tables.

## ULC adapter

ULC Linz supplies:

- the plan-to-documentation mapping;
- the current attendance snapshot;
- role and subject-scope authorization;
- navigation and UI.

The ULC adapter maps the existing `training_documentation` permission. A
Leistungstrainer or admin can work in organization scope; an athlete is limited
to the explicitly linked own subject. Parent and Kindertrainer templates are
not widened.

V1 is a preview/product slice. Production lifecycle deletion/recovery evidence
must be completed before this module can be declared production-ready.
