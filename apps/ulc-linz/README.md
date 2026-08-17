# ULC Linz

Generated AppBasis app skeleton.

- App ID: `ulc-linz`
- Modules: none
- Platform services: identity, permissions

This app includes the independently verified generated runtime and consumes declared AppBasis platform and module contracts without copying the Reference app.

## M5-B authorization boundary

The ULC runtime owns the canonical app-specific role/data-scope policy in `worker/role-data-scope.json` and exposes a server-side authorization guard from `worker/app.ts`.

The guard reuses the shared AppBasis permission store and requires an active membership in the exact organization, an exact ULC runtime role, the requested module capability and, for subject-scoped athlete/parent access, an explicit `self`/`managed` relation. Unknown or inconsistent state is denied. No public authorization-probe endpoint is exposed.

This boundary does not make M5 production-ready by itself; the remaining Security & Privacy evidence stays fail-closed.
