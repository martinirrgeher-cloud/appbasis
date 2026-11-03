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

## Read-only, subject-scoped privacy exposure inspection (not activated)

`PostgresTrainingDocumentationRepository.inspectSubjectPrivacy(org, subject)`
returns aggregate counts for subject-owned documentation roots and **all**
their immutable historical revisions. It also counts historical revisions
where `attendance_json` contains a matching structured `participantId`
inside a *different* athlete's documentation in the same organization.
The number of distinct other-owner documentation roots is reported
separately from the number of affected historical revisions.

This distinction is critical: removing only documents with a matching
`subject_id` cannot erase a person's `participantId` and `displayName`
copied into other subjects' attendance snapshots. The inventory reads
one SQL statement snapshot, returns no names, notes, JSON or document
identifiers, and does not change stored data. Free-text identity mentions
in notes, exercise contents or display names with incorrect/missing IDs
cannot be safely attributed from this query. A zero count is NOT a
complete erasure certificate.

Future data lifecycle policy must separately decide how immutable
revision history should be redacted or deleted when a participant
rather than the root subject is erased, and must coordinate backup
and restore with the app's documented 35-day source-marker limit.
The module remains production `blocked`; no new migration or
runtime writer is activated by this diagnostic.
