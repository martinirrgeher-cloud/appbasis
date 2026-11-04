import { describe, expect, it, vi } from "vitest";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";

import type { UlcLinzCurrentIdentity } from "../worker/authorization";
import {
  eraseUlcLinzAthleteTrainingHistoryOnFrozenStore,
  type UlcLinzAthleteTrainingHistoryDeletionDependencies,
} from "../worker/lifecycle-service";

const ORG = "org-attendance-cleanup";
const SUBJECT = "athlete-deleted";
const ADMIN = "admin-actor";
const NOW = new Date("2026-11-04T10:00:00.000Z");
const COMPLETED = new Date("2026-11-01T10:00:00.000Z");
const request = { organizationId: ORG, subjectId: SUBJECT };

function current(access: UlcLinzCurrentIdentity["access"] = "full"): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: ADMIN, username: "admin", displayName: "Admin",
      contactEmail: null, personId: null,
      mustChangePassword: access !== "full",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00Z"),
      disabledAt: null, accountStatus: "active",
    },
    access, sessionToken: "test",
  };
}
function originalMarker() {
  return {
    entityType: "athlete" as const, entityId: SUBJECT,
    organizationId: ORG, completedAt: new Date(COMPLETED),
    purgeAfter: new Date(COMPLETED.getTime() + 35 * 24 * 60 * 60 * 1000),
  };
}

function harness(options: {
  membership?: string;
  role?: string;
  self?: boolean;
  marker?: ReturnType<typeof originalMarker> | null;
  frozen?: boolean;
  now?: Date;
} = {}) {
  const calls: string[] = [];
  const permissions: PermissionStore = {
    async findPrincipal() {
      calls.push("principal");
      return {
        principalId: principalId(ADMIN),
        roleIds: [roleId(options.role ?? "ulc-linz:admin")],
        grants: [], revokes: [],
      };
    },
    async findRole() { return null; },
    async isKnownCapability() { return false; },
  };
  const resolveMembership = vi.fn(async () => {
    calls.push("membership");
    return {
      organizationId: ORG,
      sourceRole: options.membership ?? "admin",
      active: true,
    };
  });
  const hasRelation = vi.fn(async () => {
    calls.push("relation");
    return options.self ?? false;
  });
  const findCurrentAthleteDeletionMarker = vi.fn(async () => {
    calls.push("athlete-marker");
    return options.marker === undefined ? originalMarker() : options.marker;
  });
  const requireFrozenIsolatedStore = vi.fn(async () => {
    calls.push("freeze");
    return options.frozen ?? true;
  });
  const eraseSubjectHistoryOnFrozenStore = vi.fn(async () => {
    calls.push("erase");
    return {
      deletedAttendanceRows: 1,
      deletedRegistrationRows: 2,
      deletedRegistrationHistoryRows: 3,
    };
  });
  const dependencies: UlcLinzAthleteTrainingHistoryDeletionDependencies = {
    permissions,
    scopes: { resolveMembership, hasRelation },
    athletes: { findCurrentAthleteDeletionMarker },
    training: { eraseSubjectHistoryOnFrozenStore },
    requireFrozenIsolatedStore,
    now: () => options.now ?? new Date(NOW),
  };
  return {
    dependencies, calls, requireFrozenIsolatedStore,
    eraseSubjectHistoryOnFrozenStore, findCurrentAthleteDeletionMarker,
  };
}

describe("ULC frozen training history cleanup – strict app authorization", () => {
  it("checks admin, athlete source decision and quarantine before all owner writes", async () => {
    const h = harness();
    await expect(eraseUlcLinzAthleteTrainingHistoryOnFrozenStore(
      current(), h.dependencies, request,
    )).resolves.toEqual({
      organizationId: ORG, subjectId: SUBJECT, completedAt: COMPLETED,
      deletedAttendanceRows: 1, deletedRegistrationRows: 2,
      deletedRegistrationHistoryRows: 3,
    });
    expect(h.calls).toEqual([
      "membership", "principal", "relation", "athlete-marker", "freeze", "erase",
    ]);
    expect(h.findCurrentAthleteDeletionMarker).toHaveBeenCalledWith(
      ORG, SUBJECT, NOW,
    );
    expect(h.requireFrozenIsolatedStore).toHaveBeenCalledWith(ORG, SUBJECT);
    expect(h.eraseSubjectHistoryOnFrozenStore).toHaveBeenCalledWith(ORG, SUBJECT);
  });

  it("rejects unauthorized roles, self, incomplete sessions, source drift and missing freeze", async () => {
    const cases = [
      { h: harness({ membership: "trainer" }), actor: current() },
      { h: harness({ role: "ulc-linz:trainer" }), actor: current() },
      { h: harness({ self: true }), actor: current() },
      { h: harness(), actor: current("password-change-required") },
      { h: harness({ marker: null }), actor: current() },
      { h: harness({ marker: { ...originalMarker(), entityId: "another" } }), actor: current() },
      { h: harness({ marker: { ...originalMarker(), organizationId: "foreign" } }), actor: current() },
      { h: harness({ marker: { ...originalMarker(), completedAt: new Date("2026-11-05T10:00:00Z") } }), actor: current() },
      { h: harness({ marker: { ...originalMarker(), purgeAfter: new Date("2026-11-02T10:00:00Z") } }), actor: current() },
      { h: harness({ frozen: false }), actor: current() },
      { h: harness({ now: new Date(NaN) }), actor: current() },
    ];
    for (const { h, actor } of cases) {
      await expect(eraseUlcLinzAthleteTrainingHistoryOnFrozenStore(
        actor, h.dependencies, request,
      )).rejects.toThrow();
      expect(h.eraseSubjectHistoryOnFrozenStore).not.toHaveBeenCalled();
    }
    const foreign = harness();
    await expect(eraseUlcLinzAthleteTrainingHistoryOnFrozenStore(
      current(), foreign.dependencies,
      { organizationId: "foreign", subjectId: SUBJECT },
    )).rejects.toThrow();
    expect(foreign.eraseSubjectHistoryOnFrozenStore).not.toHaveBeenCalled();
  });

  it("requires the injected quarantine proof and validates owner results", async () => {
    const absent = harness();
    await expect(eraseUlcLinzAthleteTrainingHistoryOnFrozenStore(
      current(),
      { ...absent.dependencies, requireFrozenIsolatedStore: undefined } as never,
      request,
    )).rejects.toThrow();
    expect(absent.eraseSubjectHistoryOnFrozenStore).not.toHaveBeenCalled();

    const malformed = harness();
    malformed.eraseSubjectHistoryOnFrozenStore.mockResolvedValueOnce({
      deletedAttendanceRows: 1,
      deletedRegistrationRows: -1,
      deletedRegistrationHistoryRows: 0,
    });
    await expect(eraseUlcLinzAthleteTrainingHistoryOnFrozenStore(
      current(), malformed.dependencies, request,
    )).rejects.toThrow();
  });

  it("propagates owner storage failure; never returns partial success", async () => {
    const h = harness();
    h.eraseSubjectHistoryOnFrozenStore.mockRejectedValueOnce(
      new Error("training attendance database unavailable"),
    );
    await expect(eraseUlcLinzAthleteTrainingHistoryOnFrozenStore(
      current(), h.dependencies, request,
    )).rejects.toThrow(/database unavailable/);
  });
});
