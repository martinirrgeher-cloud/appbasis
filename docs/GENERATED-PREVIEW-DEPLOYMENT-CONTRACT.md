# Generated Preview Deployment Contract

## Purpose

This contract prepares deployment-only Cloudflare configuration for a generated AppBasis application without moving infrastructure details into `appbasis.app.json`.

The app manifest remains limited to app identity, modules, and declared platform services. Provider identifiers, public deployment origins, database addresses, credentials, and secret values remain deployment inputs.

## Rendered deployment artifact

`tooling/generated-preview-deploy-config.mjs` renders an ephemeral Wrangler JSON artifact from:

- `appId`, taken from an already verified app definition,
- the target preview HTTPS origin,
- the target Cloudflare Hyperdrive configuration id,
- the Worker compatibility date.

The normal rendered configuration declares:

- `worker/index.ts` as the Worker entrypoint,
- `nodejs_compat`,
- an explicit `workers.dev` route for the isolated generated Worker,
- version preview URLs disabled,
- `APPBASIS_BASE_URL` as a deployment variable,
- `BETTER_AUTH_SECRET` as a required secret name only,
- `HYPERDRIVE` as the PostgreSQL binding.

No secret value or PostgreSQL connection string is written by this renderer. Generated deployment artifacts are written with owner-only file permissions and are not app-manifest inputs.

## First-Worker bootstrap artifact

A new Worker cannot satisfy the normal `secrets.required` contract before the required secret exists on that Worker. The same renderer therefore exposes a dedicated bootstrap artifact for first creation only.

The bootstrap artifact is identical to the normal deployment artifact except that it does not declare required secrets. It exists solely so the generated Worker can be created once in its already fail-closed state. The separate bootstrap workflow then installs `BETTER_AUTH_SECRET` through Wrangler from a protected GitHub environment secret. Normal generated deployments always return to the required-secret artifact.

The bootstrap path does not run migrations, seed permissions, create Hyperdrive or Neon resources, or expose administration through the Worker runtime.

## Fail-closed behavior

The renderer rejects:

- invalid app identifiers,
- malformed Hyperdrive provider ids,
- non-HTTPS or non-canonical public origins,
- invalid compatibility dates,
- missing output paths for file rendering.

The generated Worker itself keeps all non-health requests fail-closed while `BETTER_AUTH_SECRET`, `APPBASIS_BASE_URL`, or `HYPERDRIVE.connectionString` are unavailable.

## Architecture boundaries

This contract does not:

- make `database` a manifest `platformService`,
- persist provider ids or database addresses in the app manifest,
- persist secret values in generated files,
- create or rotate Cloudflare account resources,
- create Neon resources,
- run migrations or permission provisioning,
- add a permission administration API.

Worker/secret bootstrap, database migration, permission provisioning, normal deployment, and smoke verification remain explicit orchestration steps with separate responsibilities.

## Current first deployment consumer

Phase 3N deliberately uses the already generated `apps/tasks-minimal` application as the first deployment consumer instead of introducing a generic deployment selector before a second real deployment proves that abstraction necessary.
