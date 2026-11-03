# ULC Linz

ULC Linz AppBasis application with a mobile Vereins-App shell and the protected `countdown` and `athletes` (Stammdaten) modules.

- App ID: `ulc-linz`
- Modules: `countdown`, `athletes` (Stammdaten)
- Platform services: identity, permissions

This app includes the independently verified generated runtime and consumes declared AppBasis platform and module contracts without copying the Reference app.

## M5-B authorization boundary

The ULC runtime owns the canonical app-specific role/data-scope policy in `worker/role-data-scope.json` and exposes a server-side authorization guard from `worker/app.ts`.

The guard reuses the shared AppBasis permission store and requires an active membership in the exact organization, an exact ULC runtime role, the requested module capability and, for subject-scoped athlete/parent access, an explicit `self`/`managed` relation. Unknown or inconsistent state is denied. No public authorization-probe endpoint is exposed.

This boundary does not make M5 production-ready by itself; the remaining Security & Privacy evidence stays fail-closed.

## Prepared M6 training-block favorite deletion boundary

`worker/lifecycle-service.ts` exports
`deleteUlcLinzIdentityWithCanonicalFavoriteDeletion` as an **app-owned,
privileged, non-HTTP composition**. It shares the canonical M5-C admin,
organization and identity scope checks. Before the first module-owned write
it verifies the target's persisted permission principal against the
non-administrator source role; the module v5 tombstone transaction then
deletes personal favorites using the **identity ID** (never the athlete
person/subject ID). Only afterwards may Identity and permission owners
perform their existing canonical deletion. If the module transaction
fails, Identity deletion is not started. Replays are idempotent.

This does **not** replace the existing canonical entrypoint or automatically
alter retention, restore, user-administration, HTTP endpoints, or the
currently deployed app. Migration of `training-blocks` to schema v5,
operator-reviewed application lifecycle integration, all selected-module
lifecycle requirements, and M4/M5 backup/restore guarantees are separate
prerequisites for activation. No module/app production contract is ready.

## Read-only subject attribution for training-block usage

The internal `verifyUlcTrainingBlockUsageOwner` function can verify a
**current** training-plan-generated usage row against the real
`TrainingPlanRepository.findCurrent` contract. It requires exact
organization scope, the existing SHA-256 event identity, an unambiguous
`planId:itemId` reference, matching plan revision, precisely one matching
block item, and matching source block. Only then does it return the
authoritative `plan.subjectId` (an athlete/subject ID, **not** an
identity/principal ID). No private note text is returned.

All other events (including manually entered usage, ambiguous legacy IDs,
deleted/changed plans, and missing references) stay **unresolved** rather
than being assigned by heuristic string matching. A failed authoritative
database read propagates as a failure, never as a guessed mapping.

This read-only helper is **not** wired to HTTP, UI, the identity deletion
coordinator, an automatic background operation, or a migration. It does
not persist an owner, prove the full historical ownership of old rows,
or authorize erasure. Before a later production lifecycle step the
module owner must persist verified subject attribution at write time,
prevent post-delete writes, implement coordinated restore/retention
semantics, and prove authorization with real PostgreSQL tests.
Existing plan usage recording is intentionally unchanged.

## Deferred schema-v6 usage attribution integration

Training-blocks now exposes an opt-in transactional subject-usage insert
and deletion-marker boundary, independently of the current ULC plan writer.
Only the canonical app-plan proof from PR #493 may supply the subject,
source plan and item for a future caller. The existing plan booking path
does not change. Before activating schema v6, ULC must enforce same-org
admin/subject authorization, serialize cross-owner deletion with subject
writes, reconcile restored subject markers and ensure no unverified legacy
writer reintroduces attributed personal data. No deployment or public
endpoint is enabled by the repository changes alone.

## Opt-in verified training-plan usage booking adapter

The application now has a deliberately **unwired** adapter
`createUlcTrainingPlanVerifiedUsageBooking` for schema-v6 usage ownership.
It reads the current canonical training plan from the plan repository,
compares its organization, subject, version, timestamp and exact block
item with the just-saved snapshot, verifies the canonical SHA-256 event
identity via `verifyUlcTrainingBlockUsageOwner`, and calls the restricted
`recordVerifiedSubjectUsageOnce` repository method. It never derives
subject IDs from `sourceRef` or user notes. Errors and unconfirmed writes
fail closed.

`createUlcTrainingPlanService` accepts an optional
`verifiedUsageBooking` injection. If provided, only this path is used
for newly added saved source-block elements, with **no** silent fallback
to the legacy writer. The existing worker composition in
`worker/postgres.ts` does **not** supply this injection: ordinary users
retain existing behavior until an explicit operational cutover.

The saved-plan read and training-block insert cross separate owners and
are **not yet covered by one atomic subject-deletion transaction**.
A concurrent subject delete or plan edit must be coordinated and tested
with a closed legacy-writer boundary, marker replay after restore and
approved backup/retention before the optional path can be enabled.
This slice does not authorize migrations, deployment, API endpoints or
subject deletion.

## Unwired athlete post-retention dependent lifecycle

`deleteUlcLinzAthleteSubjectDependentsAfterRetention` is an internal
application coordinator, NOT an HTTP route, scheduler or active retention
handler. It reuses strict canonical ULC admin/permission/membership checks,
refuses the admin's own subject relation, and asks the athletes module for
a **current, completed, own-organization athlete deletion marker**. The
module independently rejects an extant live athlete and invalid marker.
Deactivating an athlete is not deletion: it must not remove saved plans.

Only after authoritative retention does the coordinator ask the
training-plans owner and then training-blocks owner to delete subject
plans and explicitly attributed subject usage. Both owners create their
own scoped, write-blocking subject markers and use the SAME athlete
deletion completedAt timestamp. The coordinator validates both return
values and does not claim success on partial failure. Retrying replays
both owners, but there is no durable scheduler or app-wide transaction.

**Never enable without a further gate:** Current athlete deletion marker
lookup works only within its 35-day retention window; no post-expiry
automatic cleanup is authorized. The two other owner marker timestamps
are not cross-owner atomically committed. Existing unowned/legacy usage,
attendance, trainer references, documentation, backups and restores
have separate privacy policies. No runtime wiring, migration or
production authorization is added here.

## Privileged athlete dependent-deletion preflight (unwired)

`inspectUlcLinzAthleteSubjectDeletionFollowUp` is a **read-only**,
non-runtime ULC admin operation. It repeats the strict canonical app-admin
permission/membership and self-subject checks, then checks the still-valid
athletes-owner 35-day deletion marker. Only with that marker does it
inspect exact organization+subject-owned status in the training-plans
and training-blocks repositories. Each owner uses a repeatable-read
read-only transaction to inspect its own deletion marker and remaining
subject-bound plan roots or explicitly attributed usage events, without
exposing source refs or free-text notes.

The result distinguishes `source-unverifiable` (no current source marker,
including possible expiry/purge), `follow-up-pending` (owner marker missing
or residuals remain), `owner-marker-conflict` (owner completedAt/purgeAfter
disagrees) and `owner-markers-match` (both markers match and both measured
residual counts are zero). `owner-markers-match` is **not** full privacy
completion or permission to promote a restore. These observations are not
one app-wide transaction and cannot account for ambiguous legacy events,
documentation, attendance, external backups or other lifecycle owners.

Post-expiry retry is NOT authorized: a missing source marker must be treated
as unverifiable, never inferred from empty owner tables. A durable app-owned
decision, retention/restore policy, write freeze and cross-owner evidence
must be designed separately before any automatic follow-up is deployed.
