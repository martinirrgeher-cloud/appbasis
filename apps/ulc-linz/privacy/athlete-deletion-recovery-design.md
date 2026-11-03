# ULC athlete dependent-deletion recovery — blocked architecture decision

## Decision as of 2026-11-03

**Not approved for deployment or automatic deletion.** The present athletes
repository deletes inactive masterdata after its existing 12-month retention
period and stores an organization-bound deletion marker for **35 days**. The
training-plans and training-blocks repositories have separate 35-day owner
markers. PRs #497 and #498 supply a canonical-admin-scoped follow-up and
read-only owner-state inspection. None of those operations are cross-owner
atomic or activated in the running ULC application.

The new pure helper `assessUlcAthleteDeletionRecovery` classifies a verified
inspection for manual attention. It highlights pending work in the final
seven days before the source marker expires. It **cannot extend or replace**
that source of authority. In particular, a previously consistent inspection
may be stale or restored from an older database and grants no later rights.

## Why a long-lived database queue is NOT yet justified

A persistent queue with `organizationId` and raw `athleteId` is itself
personal data. Retaining it beyond 35 days is a **new purpose and retention
decision**. Deleting the identifiers at the existing 35-day deadline would
prevent the queue from targeting a later retry; retaining them indefinitely
would violate the existing bounded-marker design. A plain SHA-256 subject
hash is **not anonymity** where identifiers may be guessable, and it cannot
by itself authorize or route a future deletion.

Creating an application-owned row *after* the athletes owner commits its
deletion also leaves a crash gap: the owner may have deleted the athlete
while the app queue has not yet recorded the decision. An application
cannot fix that gap by blindly inserting a marker based on a user-supplied
identifier. Moreover, persisting a successful plan step before a failed
training-block step does not make the two commits atomic.

## Required next design/approval before adding schema

1. **Owner-atomic provenance:** an athletes-owner-issued, immutable deletion
   decision or transactional outbox must be committed in the *same* owner
   transaction as the original athlete purge. Application code may consume
   it through an explicit owner contract, never directly mutate another
   module's tables.
2. **Approved bounded privacy policy:** determine whether unresolved
   follow-up cases may retain organization and subject identifiers beyond
   the current 35 days, for exactly what maximum period, with what legal
   purpose, reviewer, and deletion/anonymization rule. Define what happens
   to cases still incomplete at that deadline. No unlimited legal hold by
   default.
3. **Authenticity and authorization:** authenticate the decision and
   organization/subject scope at the server, bind the original
   `completedAt` and source owner to the decision, reject duplicates and
   conflicting payloads, check the caller's canonical admin permissions
   before any manual escalation, and never accept free-text claims as proof.
4. **Per-owner progress evidence:** durable, idempotent checkpoints from
   the training-plans and training-blocks owners, including conflict,
   partial failure, and stale/late callbacks. An acknowledged owner
   action must not be interpreted as proof that every other module is
   purged.
5. **Restore and backup ordering:** prove which newer immutable source is
   authoritative, retain deletion decisions beyond the backup recovery
   horizon when approved, replay against an inaccessible restored target,
   compare owner timestamps, and block promotion if the source is
   incomplete or the replay fails.
6. **Concurrency and live writer cutoff:** prevent the old un-attributed
   training-block writer and any concurrent training-plan edit from
   reintroducing the subject. Separate owner-local advisory locks do not
   make an application-wide transaction.
7. **Privacy inventory and deployment gates:** classify any new table
   and its audit/backup copies, exclude it from normal user export, add a
   versioned app-owned schema migration with real isolated PostgreSQL E2E,
   and leave all preview/production migrations and runtime wiring blocked
   until explicit operator permission.

## What is delivered now

- A reviewed, machine-readable **blocked** policy:
  `privacy/athlete-deletion-recovery-policy.json`.
- A read-only, non-wired urgency assessment: `worker/athlete-subject-deletion-recovery.ts`.
- Tests for urgent pending/expired/missing/conflicting cases, malformed
  input, zero automatic writes, and continued production-policy freeze.

This work is **not a durable deletion authority**, does **not** create
database tables, and cannot detect or retry a deletion whose only evidence
has already expired. It establishes the precise safety boundary that
the next explicitly authorized durable-ledger implementation must satisfy.
