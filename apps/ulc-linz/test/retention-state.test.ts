import { describe, expect, it } from "vitest";

import { runUlcLinzRetention } from "../worker/retention";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const now = new Date("2026-08-18T10:30:00.000Z");

function fakeSql(rows: readonly Record<string, unknown>[]) {
  return {
    async unsafe() {
      return [...rows];
    },
  } as unknown as ConstructorParameters<typeof PostgresUlcLinzScopePersistence>[0];
}

describe("ULC Linz deterministic retention state", () => {
  it("keeps the exact 12-month boundary, deletes overdue records and re-evaluates expired exceptions", async () => {
    const persistence = new PostgresUlcLinzScopePersistence(
      fakeSql([
        {
          identity_id: "active-member",
          organization_id: "ulc-linz",
          subject_id: "subject-active",
          source_role: "trainer",
          active: true,
          ended_at: null,
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_exception_created_at: null,
          retention_review_at: null,
        },
        {
          identity_id: "exact-boundary",
          organization_id: "ulc-linz",
          subject_id: "subject-boundary",
          source_role: "athlete",
          active: false,
          ended_at: "2025-08-18T10:30:00.000Z",
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_exception_created_at: null,
          retention_review_at: null,
        },
        {
          identity_id: "overdue",
          organization_id: "ulc-linz",
          subject_id: "subject-overdue",
          source_role: "parent",
          active: false,
          ended_at: "2025-08-17T10:30:00.000Z",
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_exception_created_at: null,
          retention_review_at: null,
        },
        {
          identity_id: "future-review",
          organization_id: "ulc-linz",
          subject_id: "subject-future-review",
          source_role: "parent",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: "legal-hold",
          retention_exception_actor: "ulc-admin",
          retention_exception_created_at: "2026-08-18T10:00:00.000Z",
          retention_review_at: "2026-10-18T10:30:00.000Z",
        },
        {
          identity_id: "expired-review",
          organization_id: "ulc-linz",
          subject_id: "subject-expired-review",
          source_role: "parent",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: "legal-hold",
          retention_exception_actor: "ulc-admin",
          retention_exception_created_at: "2026-08-17T10:30:00.000Z",
          retention_review_at: "2026-08-18T10:29:59.999Z",
        },
      ]),
      () => now,
    );

    const states = await persistence.evaluateRetention();
    expect(states.map((state) => [state.target.identityId, state.status])).toEqual([
      ["active-member", "active"],
      ["exact-boundary", "active"],
      ["overdue", "due"],
      ["future-review", "exception"],
      ["expired-review", "due"],
    ]);
    expect(
      states.find((state) => state.target.identityId === "future-review"),
    ).toMatchObject({
      status: "exception",
      actor: "ulc-admin",
      reason: "legal-hold",
      createdAt: new Date("2026-08-18T10:00:00.000Z"),
      reviewAt: new Date("2026-10-18T10:30:00.000Z"),
    });
  });

  it("revalidates a due identity before destructive owner operations", async () => {
    const target = Object.freeze({
      identityId: "race-target",
      organizationId: "ulc-linz",
      subjectId: "subject-race",
      sourceRole: "trainer" as const,
      active: false,
      endedAt: new Date("2025-07-18T10:30:00.000Z"),
    });
    let retentionReads = 0;
    let destructiveOwnerCalls = 0;
    const dependencies = {
      scopes: {
        async evaluateRetention() {
          retentionReads += 1;
          if (retentionReads === 1) {
            return [Object.freeze({ status: "due" as const, target })];
          }
          return [
            Object.freeze({
              status: "exception" as const,
              target,
              reason: "legal-hold",
              actor: "ulc-admin",
              createdAt: new Date("2026-08-18T10:00:00.000Z"),
              reviewAt: new Date("2026-10-18T10:30:00.000Z"),
            }),
          ];
        },
        async completeIdentityDeletion() {
          destructiveOwnerCalls += 1;
          throw new Error("must not complete deletion");
        },
        async purgeExpiredDeletionMarkers() {
          return 0;
        },
        async purgeExpiredLifecycleAuditEvents() {
          return 0;
        },
      },
      identity: {
        async disableIdentity() {
          destructiveOwnerCalls += 1;
        },
      },
      identityDeletion: {
        async isDeletionCompleted() {
          destructiveOwnerCalls += 1;
          return false;
        },
        async deleteDisabledIdentity() {
          destructiveOwnerCalls += 1;
          return { identityId: target.identityId, alreadyDeleted: false };
        },
      },
      permissions: {
        async findPrincipal() {
          destructiveOwnerCalls += 1;
          return null;
        },
      },
      accessAdministration: {
        async replacePrincipalAccess() {
          destructiveOwnerCalls += 1;
        },
      },
      principalLifecycle: {
        async deleteQuarantinedPrincipal() {
          destructiveOwnerCalls += 1;
          return true;
        },
      },
      identityDeletionRetention: {
        async purgeExpiredCompletedDeletions() {
          return 0;
        },
      },
    } as unknown as Parameters<typeof runUlcLinzRetention>[0];

    await expect(runUlcLinzRetention(dependencies)).rejects.toMatchObject({
      code: "UNKNOWN_PERMISSION_STATE",
    });
    expect(retentionReads).toBe(2);
    expect(destructiveOwnerCalls).toBe(0);
  });

  it("rejects retention-exception review horizons beyond the 12-month audit lifetime before writing", async () => {
    let sqlCalls = 0;
    const persistence = new PostgresUlcLinzScopePersistence(
      {
        async unsafe() {
          sqlCalls += 1;
          return [];
        },
      } as unknown as ConstructorParameters<typeof PostgresUlcLinzScopePersistence>[0],
      () => now,
    );

    await expect(
      persistence.setRetentionException({
        identityId: "exception-target",
        organizationId: "ulc-linz",
        actor: "ulc-admin",
        reason: "legal-hold",
        reviewAt: new Date("2027-08-18T10:30:00.001Z"),
      }),
    ).rejects.toMatchObject({
      code: "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED",
    });
    expect(sqlCalls).toBe(0);
  });

  it("fails closed when persisted exception state outlives its 12-month audit lifetime", async () => {
    const persistence = new PostgresUlcLinzScopePersistence(
      fakeSql([
        {
          identity_id: "overlong-exception",
          organization_id: "ulc-linz",
          subject_id: "subject-overlong",
          source_role: "parent",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: "legal-hold",
          retention_exception_actor: "ulc-admin",
          retention_exception_created_at: "2026-08-18T10:00:00.000Z",
          retention_review_at: "2027-08-18T10:00:00.001Z",
        },
      ]),
      () => now,
    );

    await expect(persistence.evaluateRetention()).rejects.toMatchObject({
      code: "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED",
    });
  });

  it("fails closed on an impossible inactive admin lifecycle row", async () => {
    const persistence = new PostgresUlcLinzScopePersistence(
      fakeSql([
        {
          identity_id: "invalid-admin",
          organization_id: "ulc-linz",
          subject_id: "subject-admin",
          source_role: "admin",
          active: false,
          ended_at: "2025-07-18T10:30:00.000Z",
          retention_exception_reason: null,
          retention_exception_actor: null,
          retention_exception_created_at: null,
          retention_review_at: null,
        },
      ]),
      () => now,
    );

    await expect(persistence.evaluateRetention()).rejects.toMatchObject({
      code: "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED",
    });
  });
});
