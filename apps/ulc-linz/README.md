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
