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
- Current schema version: 2 (migration available, not deployed)

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

## V2 privileged structured subject erasure (not activated)

ULC's repository manifests request **schema v2**, but the migration is
not applied to its preview/production environments and all activation
and restore gates remain blocked. Schema v2 adds `appbasis_training_documentation_subject_deletion` with
the existing 35-day marker interval (no automated marker purge). SQL
triggers on document root insert/owner reassignment and revision
insert/attendance update serialize source subjects/participants using
per-organization advisory transaction locks and forbid any matching
deletion-marked subject. The migration also explicitly revokes PostgreSQL's default PUBLIC EXECUTE grants on all three guard functions; M5 backup and restore tests verify those rights stay revoked. The two trigger functions run with the migration-owner privileges and an
explicit `pg_catalog, pg_temp` search path; their helper remains non-executable
by PUBLIC and requires no direct application-role grant. The repository
acquires an organization-scoped transaction lock **before** root inserts,
revision row locks or erasure subject locks; SQL triggers independently
enforce that lock for direct DML. This deliberately serializes concurrent
documentation writes within one organization to prevent cross-participant
deadlocks. Other organizations remain independent, subject to advisory
hash collisions that can only over-serialize. Direct application SQL
`UPDATE` of revision attendance/identity is **not a supported writer path**:
the privileged triggers reject it *before* seeking the organization lock,
because PostgreSQL would already have acquired the row lock. Even a no-op
direct root ownership-column UPDATE is rejected before that lock. Only
the authenticated migration-owner transaction can use a transaction-local
erasure marker to update historical revision attendance; the normal
application login cannot bypass the guard by setting the marker. Direct
migration-owner history updates outside the module erasure contract are
unsupported. The independent preview drift verifier checks these trigger
routines' `SECURITY DEFINER` and `search_path` attributes as well as their
body hashes.

Even the current v1 editor path is covered once v2 is installed. The
ordinary documentation service does **not** expose an erasure API.

`PostgresTrainingDocumentationRepository.removeSubjectDataAfterVerifiedDeletion`
is a **privileged, module-owned, unwired** primitive that requires the
application to independently verify the original athletes-owner completed
deletion marker. Within the same module-owned SQL transaction it creates
or validates the identical `(org,subject,completedAt,purgeAfter)` marker,
deletes the root subject's documents **and all their revisions**, and
removes the exact structured participant entry from every historical
revision of other athletes' documents. It preserves other participants,
their order, documentation notes, exercises, and source-plan metadata.
The operation validates zero structured residual references before commit,
fails on conflicting markers and can be repeated idempotently.

Historical revision JSON is normally immutable; **privacy erasure is an
explicit narrowly scoped exception**. No synthetic anonymized participant
or guess from display names is inserted. The deliberate removal of an
attendance element from another athlete's historic record must be covered
by a separately approved data-retention policy before activation.

**Remaining blockers:** Writer/read-only diagnostics do not prove removal
of embedded personal names in free text, missing/incorrect participant
IDs, backup copies or externally held records. There is no public caller,
canonical app authorization binding, source-marker capture/restore replay,
marker purge job or approved production migration. The 35-day source
authority expires; after that the app must fail closed. `status=blocked`
remains mandatory for this module and ULC until those gates are resolved.
