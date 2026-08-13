# Phase 2E9 — Reference Preview Root of Trust

Status: implementation slice for review; no external resource or live account creation is part of this pull request.

## Goal

Provide the narrow one-time composition needed to create the first technical Better Auth administrator for a freshly migrated Reference preview database. This account is technical authentication administration only and must never receive AppBasis business permissions or AppBasis identity state through this bootstrap.

## Preconditions

- the Reference preview database has already received the approved Reference migration manifest;
- the normal initial state contains zero Better Auth users; the only accepted non-zero exception is an exact, non-admin candidate left by an interrupted earlier attempt for the same normalized username and deterministic technical email;
- the workflow is started manually from the protected `reference-preview` GitHub Environment;
- the operator explicitly confirms the one-time apply gate;
- the database URL, Better Auth secret and root credential are protected Environment secrets;
- the preview origin is the trusted Environment variable used by the other Reference preview workflows.

## Contract

The bootstrap:

1. validates configuration before opening PostgreSQL;
2. refuses every existing Better Auth user set except a narrowly recoverable exact candidate from an interrupted attempt;
3. removes an exact orphan candidate only when it has no credential account and no AppBasis identity state, then recreates the credential through Better Auth;
4. resumes an exact credentialed non-admin candidate only after the supplied username/password authenticates to that same identity;
5. creates new credentials through Better Auth server-side APIs, initially without the technical admin role;
6. finalizes only while the candidate remains the sole Better Auth user and has exactly one password credential;
7. clears bootstrap-time sessions before promotion and promotes exactly that account to Better Auth `admin`;
8. verifies that no `appbasis_identity_security_state` exists for the account;
9. returns only the identity id, normalized username and technical role;
10. refuses every later run after successful promotion;
11. serializes overlapping attempts so only one technical admin can remain;
12. emits no password, Better Auth secret, database URL or session token.

The security-critical bootstrap implementation is strict TypeScript. The Node runtime consumes that same implementation directly; no handwritten declaration facade or separate untyped implementation may drift from the checked code.

## Workflow boundary

`.github/workflows/reference-preview-root-admin.yml` is manual-only and uses `environment: reference-preview`. Repository checkout, toolchain setup, dependency installation and repository verification receive no preview database, Better Auth or root-password credentials. Those protected values are scoped only to the final bootstrap step and are masked before execution.

The workflow cannot create cloud infrastructure, cannot migrate the database, cannot deploy the Worker and cannot assign AppBasis business permissions.

## Acceptance

- configuration validation rejects malformed PostgreSQL URLs, insecure remote HTTP origins, invalid usernames and invalid secret/password lengths before DB access;
- real PostgreSQL E2E creates exactly one Better Auth user with technical `admin` role, one password credential, zero bootstrap sessions and zero AppBasis identity state;
- an exact orphan user from a partial Better Auth create is safely removed and recreated instead of permanently blocking the database;
- an exact credentialed candidate from an interrupted pre-promotion state can be resumed only with its matching credential;
- a second run after completed promotion is rejected without adding another user;
- overlapping first-run attempts leave exactly one technical administrator and no AppBasis identity state;
- the workflow target/apply contract test runs inside the checked CI quality gate;
- the actual bootstrap implementation is covered by strict TypeScript;
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
