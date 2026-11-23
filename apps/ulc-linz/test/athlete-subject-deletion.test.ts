import { describe, expect, it, vi } from "vitest";

import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
import {
  deleteUlcLinzAthleteSubjectDependentsAfterRetention,
  deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention,
  inspectUlcLinzAthleteSubjectDeletionFollowUp,
  type UlcLinzAthleteSubjectDeletionDependencies,
  type UlcLinzAthleteSubjectDeletionPreflightDependencies,
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
function ownerMarker() {
  return {
    organizationId: ORG, subjectId: SUBJECT,
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
  planMarker?: ReturnType<typeof ownerMarker> | null;
  usageMarker?: ReturnType<typeof ownerMarker> | null;
  remainingPlans?: number;
  remainingUsage?: number;
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
  const inspectSubjectDeletion = vi.fn(async () => {
    events.push("inspect-plans");
    return {
      organizationId: ORG, subjectId: SUBJECT,
      marker: options.planMarker === undefined ? ownerMarker() : options.planMarker,
      remainingPlans: options.remainingPlans ?? 0,
    };
  });
  const inspectSubjectUsageDeletion = vi.fn(async () => {
    events.push("inspect-usage");
    return {
      organizationId: ORG, subjectId: SUBJECT,
      marker: options.usageMarker === undefined ? ownerMarker() : options.usageMarker,
      remainingAttributedUsageEvents: options.remainingUsage ?? 0,
    };
  });
  const preflightDependencies: UlcLinzAthleteSubjectDeletionPreflightDependencies = {
    permissions, scopes: { resolveMembership, hasRelation },
    athletes: { findCurrentAthleteDeletionMarker },
    plans: { inspectSubjectDeletion },
    usage: { inspectSubjectUsageDeletion },
    now: () => options.now ?? new Date(NOW),
  };
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
    preflightDependencies, inspectSubjectDeletion, inspectSubjectUsageDeletion,
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
  it("reports missing and partially completed owner steps without any writes", async () => {
    const ready = harness({ planMarker: null, usageMarker: null, remainingPlans: 2, remainingUsage: 3 });
    await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
      current(), ready.preflightDependencies, request,
    )).resolves.toEqual({
      organizationId: ORG, subjectId: SUBJECT,
      status: "follow-up-pending", completedAt: COMPLETED,
      planMarkerPresent: false, usageMarkerPresent: false,
      remainingPlans: 2, remainingAttributedUsageEvents: 3,
    });
    const partial = harness({ usageMarker: null, remainingUsage: 1 });
    await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
      current(), partial.preflightDependencies, request,
    )).resolves.toMatchObject({
      status: "follow-up-pending", planMarkerPresent: true,
      usageMarkerPresent: false, remainingPlans: 0,
      remainingAttributedUsageEvents: 1,
    });
    expect(ready.deleteSubjectData).not.toHaveBeenCalled();
    expect(ready.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();
    expect(partial.deleteSubjectData).not.toHaveBeenCalled();
    expect(partial.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();
  });

  it("labels matching owner markers only as a snapshot, not a lifecycle-complete guarantee", async () => {
    const h = harness();
    await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
      current(), h.preflightDependencies, request,
    )).resolves.toMatchObject({
      status: "owner-markers-match", planMarkerPresent: true,
      usageMarkerPresent: true, remainingPlans: 0,
      remainingAttributedUsageEvents: 0,
    });
    expect(h.events).toEqual([
      "membership", "principal", "relation", "marker", "inspect-plans", "inspect-usage",
    ]);
    expect(h.deleteSubjectData).not.toHaveBeenCalled();
    expect(h.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();
  });

  it("flags owner tombstone mismatch before declaring matching state", async () => {
    const wrong = { ...ownerMarker(), completedAt: new Date(COMPLETED.getTime() - 86400000) };
    const h = harness({ usageMarker: wrong });
    await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
      current(), h.preflightDependencies, request,
    )).resolves.toMatchObject({
      status: "owner-marker-conflict", planMarkerPresent: true,
      usageMarkerPresent: true,
    });
  });

  it("refuses to infer deletion from an expired, absent or foreign source marker", async () => {
    for (const options of [
      { marker: null },
      { marker: null, remainingUsage: 6 },
    ]) {
      const h = harness(options);
      await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
        current(), h.preflightDependencies, request,
      )).resolves.toEqual({
        organizationId: ORG, subjectId: SUBJECT,
        status: "source-unverifiable", completedAt: null,
        planMarkerPresent: null, usageMarkerPresent: null,
        remainingPlans: null, remainingAttributedUsageEvents: null,
      });
      expect(h.inspectSubjectDeletion).not.toHaveBeenCalled();
      expect(h.inspectSubjectUsageDeletion).not.toHaveBeenCalled();
    }
    const wrong = harness({ marker: { ...authoritativeMarker(), organizationId: "foreign-org" } });
    await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
      current(), wrong.preflightDependencies, request,
    )).rejects.toThrow();
    expect(wrong.inspectSubjectDeletion).not.toHaveBeenCalled();
  });

  it("uses canonical admin authorization for inspection and rejects malformed owner evidence", async () => {
    for (const options of [
      { sourceRole: "trainer" }, { principalRole: "ulc-linz:trainer" },
      { relation: true }, { principalGrants: ["unexpected"] },
    ]) {
      const h = harness(options);
      await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
        current(), h.preflightDependencies, request,
      )).rejects.toThrow();
      expect(h.inspectSubjectDeletion).not.toHaveBeenCalled();
    }
    const h = harness();
    h.inspectSubjectDeletion.mockResolvedValueOnce({
      organizationId: ORG, subjectId: SUBJECT, marker: ownerMarker(),
      remainingPlans: -1,
    });
    await expect(inspectUlcLinzAthleteSubjectDeletionFollowUp(
      current(), h.preflightDependencies, request,
    )).rejects.toThrow();
    expect(h.deleteSubjectData).not.toHaveBeenCalled();
  });

});


describe("ULC coordinated three-owner post-retention documentation deletion", () => {
  function completeHarness(options: Parameters<typeof harness>[0] = {}) {
    const h = harness(options);
    const removeSubjectDataAfterVerifiedDeletion = vi.fn(async () => {
      h.events.push("documentation");
      return {
        markerInserted: true,
        deletedDocuments: 2,
        deletedRevisions: 3,
        redactedOtherSubjectRevisions: 4,
      };
    });
    return {
      ...h,
      removeSubjectDataAfterVerifiedDeletion,
      completeDependencies: {
        ...h.dependencies,
        documentation: { removeSubjectDataAfterVerifiedDeletion },
      },
    };
  }

  it("runs only after canonical authorization and valid athlete tombstone, passes the exact source marker", async () => {
    const h = completeHarness();
    const result = await deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention(
      current(), h.completeDependencies, request,
    );
    expect(result).toEqual({
      organizationId: ORG, subjectId: SUBJECT, completedAt: COMPLETED,
      deletedPlans: 2, deletedPlanRevisions: 3, deletedPlanItems: 4,
      usageMarkerInserted: true, deletedAttributedUsageEvents: 5,
      documentationMarkerInserted: true,
      deletedDocuments: 2,
      deletedDocumentationRevisions: 3,
      redactedOtherSubjectRevisions: 4,
    });
    expect(h.events).toEqual([
      "membership", "principal", "relation", "marker", "plans", "usage", "documentation",
    ]);
    expect(h.removeSubjectDataAfterVerifiedDeletion).toHaveBeenCalledTimes(1);
    expect(h.removeSubjectDataAfterVerifiedDeletion).toHaveBeenCalledWith(
      ORG, SUBJECT, COMPLETED,
    );
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("refuses a missing documentation owner BEFORE any write; refuses admin/marker failures without touching documentation", async () => {
    const noDocs = completeHarness();
    await expect(deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention(
      current(),
      { ...noDocs.completeDependencies, documentation: {} } as never,
      request,
    )).rejects.toThrow();
    expect(noDocs.deleteSubjectData).not.toHaveBeenCalled();
    expect(noDocs.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();

    for (const options of [
      { sourceRole: "trainer" },
      { relation: true },
      { marker: null },
      { marker: { ...authoritativeMarker(), entityId: "another-athlete" } },
    ]) {
      const h = completeHarness(options);
      await expect(deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention(
        current(), h.completeDependencies, request,
      )).rejects.toThrow();
      expect(h.deleteSubjectData).not.toHaveBeenCalled();
      expect(h.markSubjectDeletedAndRemoveAttributedUsage).not.toHaveBeenCalled();
      expect(h.removeSubjectDataAfterVerifiedDeletion).not.toHaveBeenCalled();
    }
  });

  it("propagates the last owner's failure; replay is explicit and uses the same authoritative marker", async () => {
    const h = completeHarness();
    h.removeSubjectDataAfterVerifiedDeletion.mockRejectedValueOnce(
      new Error("documentation owner unavailable"),
    );
    await expect(deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention(
      current(), h.completeDependencies, request,
    )).rejects.toThrow(/documentation owner unavailable/);
    expect(h.events).toContain("plans");
    expect(h.events).toContain("usage");
    expect(h.removeSubjectDataAfterVerifiedDeletion).toHaveBeenCalledTimes(1);
    await expect(deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention(
      current(), h.completeDependencies, request,
    )).resolves.toMatchObject({
      documentationMarkerInserted: true, deletedDocuments: 2,
    });
    expect(h.deleteSubjectData).toHaveBeenCalledTimes(2);
    expect(h.markSubjectDeletedAndRemoveAttributedUsage).toHaveBeenCalledTimes(2);
    expect(h.removeSubjectDataAfterVerifiedDeletion).toHaveBeenCalledTimes(2);
    expect(h.findCurrentAthleteDeletionMarker).toHaveBeenCalledTimes(2);
  });

  it("does not label invalid documentation owner totals as successful", async () => {
    for (const invalid of [
      { markerInserted: true, deletedDocuments: -1, deletedRevisions: 1, redactedOtherSubjectRevisions: 0 },
      { markerInserted: true, deletedDocuments: 2, deletedRevisions: 1, redactedOtherSubjectRevisions: 0 },
      { markerInserted: "yes", deletedDocuments: 1, deletedRevisions: 1, redactedOtherSubjectRevisions: 0 },
      { markerInserted: true, deletedDocuments: 1, deletedRevisions: 1, redactedOtherSubjectRevisions: -4 },
    ]) {
      const h = completeHarness();
      h.removeSubjectDataAfterVerifiedDeletion.mockResolvedValueOnce(invalid as never);
      await expect(deleteUlcLinzAthleteSubjectDependentsIncludingDocumentationAfterRetention(
        current(), h.completeDependencies, request,
      )).rejects.toThrow();
    }
  });
});
