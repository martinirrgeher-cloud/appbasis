import { describe, expect, it } from "vitest";
import { runUlcLinzRetention } from "../worker/retention";

describe("T07 athlete retention source fence", () => {
  it("stops a due athlete before any destructive identity or app-owner operation", async () => {
    let writes = 0;
    const forbidden = async () => { writes++; throw new Error("unexpected mutation"); };
    const target = {
      identityId: "athlete-1", organizationId: "ulc-linz",
      subjectId: "subject-1", sourceRole: "athlete" as const,
      active: false, endedAt: new Date("2025-01-01"),
    };
    const deps = {
      scopes: {
        evaluateRetention: async () => [{ status: "due" as const, target }],
        claimDueRetentionDeletion: forbidden,
        completeIdentityDeletion: forbidden,
        purgeExpiredDeletionMarkers: forbidden,
        purgeExpiredLifecycleAuditEvents: forbidden,
      },
      identity: { disableIdentity: forbidden },
      identityDeletion: {
        isDeletionCompleted: forbidden,
        deleteDisabledIdentity: forbidden,
      },
      permissions: { findPrincipal: forbidden },
      accessAdministration: { replacePrincipalAccess: forbidden },
      principalLifecycle: { deleteQuarantinedPrincipal: forbidden },
      identityDeletionRetention: { purgeExpiredCompletedDeletions: forbidden },
    } as unknown as Parameters<typeof runUlcLinzRetention>[0];

    await expect(runUlcLinzRetention(deps)).rejects.toMatchObject({
      code: "ADMIN_LIFECYCLE_SCOPE_UNBOUND",
    });
    expect(writes).toBe(0);
  });
});
