# Phase 2E9 — Reference Preview Root of Trust

Status: implementation slice for review; no external resource or live account creation is part of this pull request.

## Goal

Provide the narrow one-time composition needed to create the first technical Better Auth administrator for a freshly migrated Reference preview database. This account is technical authentication administration only and must never receive AppBasis business permissions or AppBasis identity state through this bootstrap.

## Preconditions

- the Reference preview database has already received the approved Reference migration manifest;
- the Better Auth `user` table contains zero users;
- the workflow is started manually from the protected `reference-preview` GitHub Environment;
- the operator explicitly confirms the one-time apply gate;
- the database URL, Better Auth secret and root credential are protected Environment secrets;
- the preview origin is the trusted Environment variable used by the other Reference preview workflows.

## Contract

The bootstrap:

1. validates configuration before opening PostgreSQL;
2. refuses any database with an existing Better Auth user;
3. creates the credential through Better Auth server-side APIs, initially without the technical admin role;
4. finalizes only when the created user is still the sole Better Auth user;
5. promotes exactly that account to Better Auth `admin`;
6. verifies that no `appbasis_identity_security_state` exists for the account;
7. returns only the identity id, normalized username and technical role;
8. refuses every later run;
9. serializes overlapping attempts so only one technical admin can remain;
10. emits no password, Better Auth secret, database URL or session token.

## Workflow boundary

`.github/workflows/reference-preview-root-admin.yml` is manual-only and uses `environment: reference-preview`. Repository checkout, toolchain setup, dependency installation and repository verification receive no preview database, Better Auth or root-password credentials. Those protected values are scoped only to the final bootstrap step and are masked before execution.

The workflow cannot create cloud infrastructure, cannot migrate the database, cannot deploy the Worker and cannot assign AppBasis business permissions.

## Acceptance

- configuration validation rejects malformed PostgreSQL URLs, insecure remote HTTP origins, invalid usernames and invalid secret/password lengths before DB access;
- real PostgreSQL E2E creates exactly one Better Auth user with technical `admin` role and zero AppBasis identity state;
- a second run is rejected without adding another user;
- overlapping first-run attempts leave exactly one technical administrator and no AppBasis identity state;
- existing Identity provisioning guardrails continue to reject technical administrators as AppBasis identity targets;
- frozen install, repository verification, typecheck, unit tests, PostgreSQL E2E, build and whitespace checks remain green;
- final Codex review is clean on the exact PR head before merge.

## Explicitly out of scope

- creating the real preview administrator;
- creating Neon, Cloudflare, Hyperdrive or GitHub Environment resources;
- changing migrations or schema;
- public HTTP/bootstrap endpoints;
- automatic deployment;
- automatic business roles or permissions;
- production root bootstrap;
- generic multi-environment administrator provisioning.
