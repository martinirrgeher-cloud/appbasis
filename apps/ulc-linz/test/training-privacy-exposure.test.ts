import { describe, expect, it, vi } from "vitest";
import { principalId, roleId, type PermissionStore } from "@appbasis/permissions";
import {
  inspectUlcLinzAthleteTrainingPrivacyExposure,
  type UlcLinzAthleteTrainingPrivacyInspectionDependencies,
} from "../worker/lifecycle-service";
import type { UlcLinzCurrentIdentity } from "../worker/authorization";

const ORG = "org-ulc";
const SUBJECT = "athlete-private";
const ADMIN = "admin-person";

function current(access: UlcLinzCurrentIdentity["access"] = "full"): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: ADMIN, username: "admin",
      displayName: "Admin", contactEmail: null, personId: null,
      mustChangePassword: access !== "full",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null, accountStatus: "active",
    },
    access, sessionToken: "test",
  };
}

function harness(input: {
  role?: string; principalRole?: string; grants?: string[];
  isSelf?: boolean;
  documentationRows?: number; embeddedRows?: number;
  attendanceRows?: number; registrations?: number; history?: number;
} = {}) {
  const events: string[] = [];
  const permissions: PermissionStore = {
    async findPrincipal(id) {
      events.push("principal");
      return {
        principalId: principalId(ADMIN),
        roleIds: [roleId(input.principalRole ?? "ulc-linz:admin")],
        grants: (input.grants ?? []) as never[], revokes: [],
      };
    },
    async findRole() { return null; },
    async isKnownCapability() { return false; },
  };
  const resolveMembership = vi.fn(async () => {
    events.push("membership");
    return {
      organizationId: ORG, sourceRole: input.role ?? "admin", active: true,
    };
  });
  const hasRelation = vi.fn(async () => {
    events.push("self-relation");
    return input.isSelf ?? false;
  });
  const docs = vi.fn(async () => {
    events.push("documentation");
    return {
      organizationId: ORG, subjectId: SUBJECT,
      ownedDocuments: input.documentationRows ?? 1,
      ownedRevisions: input.documentationRows ?? 1,
      otherSubjectDocumentsWithParticipant: input.embeddedRows ?? 2,
      otherSubjectRevisionsWithParticipant: input.embeddedRows ?? 2,
    };
  });
  const training = vi.fn(async () => {
    events.push("training");
    return {
      organizationId: ORG, subjectId: SUBJECT,
      attendanceRows: input.attendanceRows ?? 3,
      registrationRows: input.registrations ?? 1,
      registrationHistoryRows: input.history ?? 2,
    };
  });
  const dependencies: UlcLinzAthleteTrainingPrivacyInspectionDependencies = {
    permissions, scopes: { resolveMembership, hasRelation },
    documentation: { inspectSubjectPrivacy: docs },
    training: { inspectSubjectPrivacy: training },
  };
  return { events, docs, training, dependencies };
}

const request = { organizationId: ORG, subjectId: SUBJECT };

describe("ULC training privacy inventory authorization and fail-closed contracts", () => {
  it("reports cross-document and ULC attendance exposure with only aggregate data", async () => {
    const h = harness();
    const result = await inspectUlcLinzAthleteTrainingPrivacyExposure(
      current(), h.dependencies, request,
    );
    expect(result).toEqual({
      organizationId: ORG, subjectId: SUBJECT,
      risk: "structured-subject-rows-present",
      documentation: {
        ownedDocuments: 1, ownedRevisions: 1,
        otherSubjectDocumentsWithParticipant: 2,
        otherSubjectRevisionsWithParticipant: 2,
      },
      training: {
        attendanceRows: 3, registrationRows: 1, registrationHistoryRows: 2,
      },
    });
    expect(h.events).toEqual([
      "membership", "principal", "self-relation", "documentation", "training",
    ]);
    expect(h.docs).toHaveBeenCalledWith(ORG, SUBJECT);
    expect(h.training).toHaveBeenCalledWith(ORG, SUBJECT);
    expect(JSON.stringify(result)).not.toContain("displayName");
    expect(JSON.stringify(result)).not.toContain("note");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("does not declare zero counts to be full privacy deletion proof", async () => {
    const h = harness({
      documentationRows: 0, embeddedRows: 0,
      attendanceRows: 0, registrations: 0, history: 0,
    });
    await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
      current(), h.dependencies, request,
    )).resolves.toMatchObject({
      risk: "no-structured-subject-rows-found",
      documentation: { ownedDocuments: 0, otherSubjectRevisionsWithParticipant: 0 },
      training: { attendanceRows: 0 },
    });
  });

  it("prevents trainer, principal drift, self-scope and incomplete login probing owners", async () => {
    const cases = [
      { h: harness({ role: "trainer" }), actor: current() },
      { h: harness({ principalRole: "ulc-linz:trainer" }), actor: current() },
      { h: harness({ grants: ["unexpected"] }), actor: current() },
      { h: harness({ isSelf: true }), actor: current() },
      { h: harness(), actor: current("password-change-required") },
    ];
    for (const { h, actor } of cases) {
      await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
        actor, h.dependencies, request,
      )).rejects.toThrow();
      expect(h.docs).not.toHaveBeenCalled();
      expect(h.training).not.toHaveBeenCalled();
    }
  });

  it("rejects cross-tenant or contradictory owner result and negative counts", async () => {
    const foreign = harness();
    foreign.docs.mockResolvedValueOnce({
      organizationId: "foreign-org", subjectId: SUBJECT,
      ownedDocuments: 0, ownedRevisions: 0,
      otherSubjectDocumentsWithParticipant: 0,
      otherSubjectRevisionsWithParticipant: 0,
    });
    await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
      current(), foreign.dependencies, request,
    )).rejects.toThrow();

    const invalid = harness();
    invalid.training.mockResolvedValueOnce({
      organizationId: ORG, subjectId: SUBJECT,
      attendanceRows: -1, registrationRows: 1, registrationHistoryRows: 2,
    });
    await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
      current(), invalid.dependencies, request,
    )).rejects.toThrow();

    const malformed = harness({ documentationRows: 0, embeddedRows: 1 });
    malformed.docs.mockResolvedValueOnce({
      organizationId: ORG, subjectId: SUBJECT,
      ownedDocuments: 0, ownedRevisions: 0,
      otherSubjectDocumentsWithParticipant: 2,
      otherSubjectRevisionsWithParticipant: 1,
    });
    await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
      current(), malformed.dependencies, request,
    )).rejects.toThrow();
  });

  it("never probes another tenant with a mismatched request", async () => {
    const h = harness();
    await expect(inspectUlcLinzAthleteTrainingPrivacyExposure(
      current(), h.dependencies,
      { organizationId: "foreign-org", subjectId: SUBJECT },
    )).rejects.toThrow();
    expect(h.docs).not.toHaveBeenCalled();
    expect(h.training).not.toHaveBeenCalled();
  });
});
