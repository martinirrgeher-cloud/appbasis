import { describe, expect, it, vi } from "vitest";

import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
import {
  deleteUlcLinzAthleteSubjectDependentsAfterRetention,
  type UlcLinzAthleteSubjectDeletionDependencies,
} from "../worker/lifecycle-service";
import type { UlcLinzCurrentIdentity } from "../worker/authorization";

const ORG = "ulc-linz";
const SUBJECT = "athlete-subject-1";
const ADMIN = "admin-identity-1";
const NOW = new Date("2026-11-03T05:00:00.000Z");
const COMPLETED = new Date("2026-11-01T05:00:00.000Z");

function current(access: UlcLinzCurrentIdentity["access"] = "full"): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: ADMIN,
      username: "ulc.admin",
      displayName: "Administrator",
      contactEmail: null,
      personId: null,
      mustChangePassword: access === "password-change-required",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "test-session",
    access,
  };
}

function authoritativeMarker() {
  return {
    entityType: "athlete" as const,
    entityId: SUBJECT,
    organizationId: ORG,
    completedAt: new Date(COMPLETED),
    purgeAfter: new Date(COMPLETED.getTime() + 35 * 24 * 60 * 60 * 1000),
  };
}

function harness(options: {
  sourceRole?: string;
  principalRole?: string;
  principalGrants?: string[];
  relation?: boolean;
  marker?: ReturnType<typeof authoritativeMarker> | null;
  now?: Date;
} = {}) {
  const events: string[] = [];
  const findPrincipal = vi.fn(async () => {
    events.push("principal");
    return {
      principalId: principalId(ADMIN),
      roleIds: [roleId(options.principalRole ?? "ulc-linz:admin")],
      grants: (options.principalGrants ?? []) as never[],
      revokes: [],
    };
  });
  const permissions: PermissionStore = {
    findPrincipal,
    async findRole() { return null; },
    async isKnownCapability() { return false; },
  };
  const resolveMembership = vi.fn(async () => {
    events.push("membership");
    return { organizationId: ORG, sourceRole: options.sourceRole ?? "admin", active: true };
  });
  const hasRelation = vi.fn(async () => {
    events.push("relation");
    return options.relation ?? false;
  });
  const findCurrentAthleteDeletionMarker = vi.fn(async () => {
    events.push("marker");
    return options.marker === undefined ? authoritativeMarker() : options.marker;
  });
  const deleteSubjectData = vi.fn(async () => {
    events.push("plans");
    return { deletedPlans: 2, deletedRevisions: 3, deletedItems: 4 };
  });
  const markSubjectDeletedAndRemoveAttributedUsage = vi.fn(async () => {
    events.push("usage");
    return { markerInserted: true, deletedUsageEvents: 5 };
  });
  const dependencies: UlcLinzAthleteSubjectDeletionDependencies = {
    permissions,
    scopes: { resolveMembership, hasRelation },
    athletes: { findCurrentAthleteDeletionMarker },
    plans: { deleteSubjectData },
    usage: { markSubjectDeletedAndRemoveAttributedUsage },
    now: () => options.now ?? new Date(NOW),
  };
  return {
    dependencies, events, findPrincipal, resolveMembership,
    hasRelation, findCurrentAthleteDeletionMarker,
    deleteSubjectData, markSubjectDeletedAndRemoveAttributedUsage,
  };
}

const request = { organizationId: ORG, subjectId: SUBJECT };

describe("ULC canonically authorized post-retention athlete subject cleanup", () => {
  it("only follows a completed athlete marker and passes exact subject, org and marker time to both owners", async () => {
    const h = harness();
    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), h.dependencies, request,
    )).resolves.toEqual({
      organizationId: ORG, subjectId: SUBJECT, completedAt: COMPLETED,
      deletedPlans: 2, deletedPlanRevisions: 3, deletedPlanItems: 4,
      usageMarkerInserted: true, deletedAttributedUsageEvents: 5,
    });
    expect(h.events).toEqual(["membership", "principal", "relation", "marker", "plans", "usage"]);
    expect(h.hasRelation).toHaveBeenCalledWith({
      identityId: ADMIN, organizationId: ORG, subjectId: SUBJECT, relationType: "self",
    });
    expect(h.findCurrentAthleteDeletionMarker).toHaveBeenCalledWith(
      ORG, SUBJECT, NOW,
    );
    expect(h.deleteSubjectData).toHaveBeenCalledWith(ORG, SUBJECT, COMPLETED);
    expect(h.markSubjectDeletedAndRemoveAttributedUsage)
      .toHaveBeenCalledWith(ORG, SUBJECT, COMPLETED);
  });

  it("rejects non-admin role, permission drift, own subject and incomplete actor session without any module writes", async () => {
    const cases = [
      { h: harness({ sourceRole: "trainer" }), actor: current() },
      { h: harness({ principalRole: "ulc-linz:trainer" }), actor: current() },
      { h: harness({ principalGrants: ["unexpected-grant"] }), actor: current() },
      { h: harness({ relation: true }), actor: current() },
      { h: harness(), actor: current("password-change-required") },
    ];
    for (const { h, actor } of cases) {
      await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
        actor, h.dependencies, request,
      )).rejects.toThrow();
      expect(h.deleteSubjectData).not.toHaveBeenCalled();
      expect(h.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();
    }
  });

  it("rejects cross-organization request or absent, wrong, future or expired marker before any delete", async () => {
    for (const marker of [
      null,
      { ...authoritativeMarker(), organizationId: "other-org" },
      { ...authoritativeMarker(), entityId: "another-athlete" },
      { ...authoritativeMarker(), entityType: "trainer" as never },
      { ...authoritativeMarker(), completedAt: new Date("2026-11-04T05:00:00Z") },
      { ...authoritativeMarker(), purgeAfter: new Date("2026-11-02T05:00:00Z") },
      { ...authoritativeMarker(), purgeAfter: new Date("2026-12-07T05:00:00Z") },
    ]) {
      const h = harness({ marker });
      await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
        current(), h.dependencies, request,
      )).rejects.toThrow();
      expect(h.deleteSubjectData).not.toHaveBeenCalled();
      expect(h.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();
    }
    const h = harness();
    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), h.dependencies,
      { organizationId: "other-org", subjectId: SUBJECT },
    )).rejects.toThrow();
    expect(h.deleteSubjectData).not.toHaveBeenCalled();
  });

  it("stops on failure from first owner and retries after a second-owner failure", async () => {
    const h = harness();
    h.deleteSubjectData.mockRejectedValueOnce(new Error("plan storage unavailable"));
    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), h.dependencies, request,
    )).rejects.toThrow(/plan storage unavailable/);
    expect(h.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();

    h.markSubjectDeletedAndRemoveAttributedUsage
      .mockRejectedValueOnce(new Error("training block storage unavailable"));
    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), h.dependencies, request,
    )).rejects.toThrow(/training block storage unavailable/);

    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), h.dependencies, request,
    )).resolves.toMatchObject({
      deletedPlans: 2, deletedAttributedUsageEvents: 5,
    });
    expect(h.deleteSubjectData).toHaveBeenCalledTimes(3);
    expect(h.markSubjectDeletedAndRemoveAttributedUsage).toHaveBeenCalledTimes(2);
    expect(h.deleteSubjectData.mock.calls[0]).toEqual([ORG, SUBJECT, COMPLETED]);
    expect(h.deleteSubjectData.mock.calls[1]).toEqual([ORG, SUBJECT, COMPLETED]);
    expect(h.deleteSubjectData.mock.calls[2]).toEqual([ORG, SUBJECT, COMPLETED]);
  });

  it("does not proceed after malformed module output or invalid authoritative clock", async () => {
    const a = harness();
    a.deleteSubjectData.mockResolvedValueOnce({
      deletedPlans: -1, deletedRevisions: 0, deletedItems: 0,
    });
    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), a.dependencies, request,
    )).rejects.toThrow();
    expect(a.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();

    const b = harness({ now: new Date(NaN) });
    await expect(deleteUlcLinzAthleteSubjectDependentsAfterRetention(
      current(), b.dependencies, request,
    )).rejects.toThrow();
    expect(b.findCurrentAthleteDeletionMarker).not.toHaveBeenCalled();
  });
});
