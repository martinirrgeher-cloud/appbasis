import { describe, expect, it } from "vitest";
import { principalId, roleId, type PrincipalPermissions } from "@appbasis/permissions";
import { runUlcLinzRetention } from "../worker/retention";
import type { UlcLinzRetentionState } from "../worker/scope-persistence";

function due(role: "athlete" | "trainer", identityId: string): UlcLinzRetentionState {
  return { status: "due", target: {
    identityId, organizationId: "ulc-linz", subjectId: `subject-${identityId}`,
    sourceRole: role, active: false, endedAt: new Date("2025-01-01T00:00:00.000Z"),
  } };
}

function harness(states: readonly UlcLinzRetentionState[]) {
  const calls: string[] = [];
  let principal: PrincipalPermissions | null = {
    principalId: principalId("trainer-1"), roleIds: [roleId("ulc-linz:trainer")],
    grants: [], revokes: [],
  };
  const deps = {
    scopes: {
      async evaluateRetention() { calls.push("evaluate"); return states; },
      async claimDueRetentionDeletion(target: { identityId: string }) {
        calls.push(`claim:${target.identityId}`);
        if (target.identityId !== "trainer-1") throw Error("athlete claim forbidden");
      },
      async completeIdentityDeletion(input: { identityId: string }) {
        calls.push(`complete:${input.identityId}`);
        if (input.identityId !== "trainer-1") throw Error("athlete completion forbidden");
      },
      async purgeExpiredDeletionMarkers() { calls.push("purge-app"); return 1; },
      async purgeExpiredLifecycleAuditEvents() { calls.push("purge-audit"); return 2; },
    },
    identity: {
      async disableIdentity(id: string) {
        calls.push(`disable:${id}`);
        if (id !== "trainer-1") throw Error("athlete identity forbidden");
      },
    },
    identityDeletion: {
      async isDeletionCompleted(id: string) { calls.push(`completed?:${id}`); return false; },
      async deleteDisabledIdentity(id: string) {
        calls.push(`delete:${id}`);
        if (id !== "trainer-1") throw Error("athlete identity forbidden");
        return { identityId: id, alreadyDeleted: false };
      },
    },
    permissions: {
      async findPrincipal(id: string) { calls.push(`principal:${String(id)}`); return principal; },
    },
    accessAdministration: {
      async replacePrincipalAccess(id: string) {
        calls.push(`quarantine:${String(id)}`);
        principal = { principalId: principalId("trainer-1"), roleIds: [], grants: [], revokes: [] };
        return { roleIds: [], grants: [], revokes: [] };
      },
    },
    principalLifecycle: {
      async deleteQuarantinedPrincipal(id: string) {
        calls.push(`remove-principal:${String(id)}`); principal = null; return true;
      },
    },
    identityDeletionRetention: {
      async purgeExpiredCompletedDeletions() { calls.push("purge-identity"); return 3; },
    },
  } as unknown as Parameters<typeof runUlcLinzRetention>[0];
  return { deps, calls };
}

describe("T07 athlete retention isolation", () => {
  it("defers a due athlete, still runs ordinary audit/marker retention", async () => {
    const h = harness([due("athlete", "athlete-1")]);
    const result = await runUlcLinzRetention(h.deps);
    expect(result).toEqual({
      deletedIdentityIds: [], exceptionIdentityIds: [],
      deferredAthleteIdentityIds: ["athlete-1"],
      purgedAppDeletionMarkers: 1,
      purgedIdentityDeletionTombstones: 3,
      purgedLifecycleAuditEvents: 2,
    });
    expect(h.calls).toEqual(["evaluate", "purge-app", "purge-identity", "purge-audit"]);
  });

  it.each(["athlete-first", "trainer-first"] as const)(
    "deletes independent trainer and defers athlete: %s", async (order) => {
      const athlete = due("athlete", "athlete-1");
      const trainer = due("trainer", "trainer-1");
      const h = harness(order === "athlete-first" ? [athlete, trainer] : [trainer, athlete]);
      const result = await runUlcLinzRetention(h.deps);
      expect(result.deletedIdentityIds).toEqual(["trainer-1"]);
      expect(result.deferredAthleteIdentityIds).toEqual(["athlete-1"]);
      expect(result.exceptionIdentityIds).toEqual([]);
      expect(h.calls).toContain("claim:trainer-1");
      expect(h.calls).toContain("complete:trainer-1");
      expect(h.calls).toContain("delete:trainer-1");
      expect(h.calls).not.toContain("claim:athlete-1");
      expect(h.calls).not.toContain("complete:athlete-1");
      expect(h.calls).not.toContain("delete:athlete-1");
    },
  );
});
