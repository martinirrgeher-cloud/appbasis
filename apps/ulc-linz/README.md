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
