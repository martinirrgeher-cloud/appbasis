# M6 Neon Region Verification Contract

Status: accepted for the ULC Linz M6 production-preparation path.

## Context

The ULC Linz production database remains pinned to Neon region `aws-eu-central-1` (EU / Frankfurt). The selected create mechanism must pass that region explicitly and must never rely on the provider default.

The read-only M6 provider preflight successfully authenticates against Neon and can read the organization-scoped project inventory. In the real target account, the documented `GET /api/v2/regions?org_id=...` request returns HTTP 404 while the project, user-organization, and organization requests return HTTP 200.

A provider-specific 404 from the region-inventory endpoint must therefore not be treated as proof that Frankfurt is unavailable. It also must not be converted into a positive region assertion.

## Decision

1. The complete organization-scoped Neon project inventory remains authoritative before the first provider write. Any existing or ambiguous ULC Linz production candidate blocks fail-closed.
2. The first Neon production project create remains pinned to `aws-eu-central-1`; explicit region selection is mandatory and provider-default region selection remains forbidden.
3. A successful `/regions` response remains useful evidence. If it explicitly omits Frankfurt, the preflight blocks fail-closed.
4. HTTP 404 from `/regions` is the only accepted reason to defer the region-availability assertion. Authentication, transport, JSON, shape, or other HTTP failures still block fail-closed.
5. A deferred region assertion does not authorize a provider write. Existing M6 preparation gates and explicit per-step approval remain unchanged.
6. Immediately after an explicitly approved Neon create, the created project must be read back and its provider field `region_id` must equal `aws-eu-central-1` before any later production-preparation step may continue.
7. Missing, malformed, or non-Frankfurt `region_id` blocks fail-closed. No migration, binding, deployment, public exposure, or release may continue from that resource.

## Security properties preserved

- deny-by-default / fail-closed
- no provider write in the read-only preflight
- no provider-default region
- no silent fallback to another region
- complete pre-create project collision inventory
- explicit approval still required for every mutating production-preparation step
- post-create region verification is mandatory even when pre-create `/regions` succeeds
- no secrets, connection strings, response bodies, or provider IDs are emitted as workflow evidence

## Implementation binding

The executable contracts are:

- `tooling/ulc-linz-m6-first-provider-write-preflight.mjs`
- `tooling/ulc-linz-m6-provider-state-preflight.mjs`
- `.github/workflows/m6-ulc-provider-state-preflight.yml`

The pure post-create verifier is `verifyUlcLinzM6CreatedNeonProjectRegion()`. A future mutating Neon-create consumer must call or equivalently enforce this verifier against the read-back provider project before permitting continuation.

This document does not authorize the Neon create itself. Production/provider writes still require the operator's explicit approval under the existing M6 execution contract.
