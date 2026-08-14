# Generated Preview Deployment Contract

## Purpose

This contract prepares the deployment-only Cloudflare configuration for a generated AppBasis application without moving infrastructure details into `appbasis.app.json`.

The app manifest remains limited to app identity, modules, and declared platform services. Provider identifiers, public deployment origins, database addresses, credentials, and secret values remain deployment inputs.

## Rendered deployment artifact

`tooling/generated-preview-deploy-config.mjs` renders an ephemeral Wrangler JSON artifact from:

- `appId`, taken from an already verified app definition,
- the target preview HTTPS origin,
- the target Cloudflare Hyperdrive configuration id,
- the Worker compatibility date.

The rendered configuration declares:

- `worker/index.ts` as the Worker entrypoint,
- `nodejs_compat`,
- `APPBASIS_BASE_URL` as a deployment variable,
- `BETTER_AUTH_SECRET` as a required secret name only,
- `HYPERDRIVE` as the PostgreSQL binding.

No secret value or PostgreSQL connection string is written by this renderer. The generated deployment artifact is written with owner-only file permissions and is not an app-manifest input.

## Fail-closed behavior

The renderer rejects:

- invalid app identifiers,
- malformed Hyperdrive provider ids,
- non-HTTPS or non-canonical public origins,
- invalid compatibility dates,
- missing output paths for file rendering.

## Architecture boundaries

This contract does not:

- make `database` a manifest `platformService`,
- persist provider ids or database addresses in the app manifest,
- create or rotate secrets,
- create Cloudflare or Neon resources,
- deploy a Worker,
- run migrations or permission provisioning,
- add a permission administration API.

Resource creation, secret injection, migration/provisioning, deployment, and preview smoke remain explicit later orchestration steps.

## Rationale

Cloudflare currently recommends Hyperdrive for external PostgreSQL connections, `nodejs_compat` for database drivers, and Wrangler-generated binding types rather than hand-written Worker environment interfaces. The next integration slice can therefore combine this deployment artifact with the generated Worker entrypoint and `wrangler types --check` before any real preview deployment is attempted.
