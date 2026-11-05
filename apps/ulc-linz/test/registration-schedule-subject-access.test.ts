import { describe, expect, it, vi } from "vitest";
import { principalId, roleId } from "@appbasis/permissions";
import {
  inspectUlcRegistrationScheduleActorData,
  UlcRegistrationScheduleSubjectAccessBlockedError,
  type UlcRegistrationScheduleSubjectAccessDependencies,
} from "../worker/registration-schedule-subject-access";

const ORG = "verein-a02-privacy";
const ADMIN = "active-admin";
const SUBJECT = "subject-actor";
const NOW = new Date("2026-11-05T18:20:00.000Z");
const RECORD = Object.freeze({
  referenceKind: "extra-day-change" as const,
  groupId: "training-group-1",
  sessionDate: "2026-11-20",
  revision: 2,
  approved: false,
  occurredAt: NOW.toISOString(),
});

function fixture(options: {
  actor?: string;
  role?: string;
  targetOrganizationId?: string | null;
  targetIdentityId?: string;
  authorized?: boolean;
  readError?: Error;
  auditError?: Error;
  auditReceipt?: unknown;
} = {}) {
  const actor = options.actor ?? ADMIN;
  const order: string[] = [];
  const membership = options.authorized === false ? null : {
    organizationId: ORG, sourceRole: options.role ?? "admin", active: true,
  };
  const principal = {
    principalId: principalId(actor),
    roleIds: [roleId(options.role === "trainer" ? "ulc-linz:trainer" : "ulc-linz:admin")],
    grants: [], revokes: [],
  };
  const reader = vi.fn(async () => {
    order.push("reader");
    if (options.readError) throw options.readError;
    return [RECORD];
  });
  const recordAccessAudit = vi.fn(async () => {
    order.push("audit");
    if (options.auditError) throw options.auditError;
    return options.auditReceipt === undefined
      ? { persisted: true as const, eventId: "audit:1001" }
      : options.auditReceipt;
  });
  const scopes = {
    resolveMembership: vi.fn(async () => {
      order.push("membership");
      return membership;
    }),
    findLifecycleTarget: vi.fn(async () => {
      order.push("subject");
      return options.targetOrganizationId === null ? null : {
        identityId: options.targetIdentityId ?? SUBJECT,
        organizationId: options.targetOrganizationId ?? ORG,
        subjectId: "trainer-subject",
        sourceRole: "trainer", active: false, endedAt: NOW,
      };
    }),
    findDeletionMarker: vi.fn(async () => null),
  };
  const deps = {
    scopes,
    permissions: {
      findPrincipal: vi.fn(async () => {
        order.push("admin-principal");
        return principal;
      }),
    },
    reader: { readActorReferences: reader },
    recordAccessAudit,
    now: () => NOW,
  } as unknown as UlcRegistrationScheduleSubjectAccessDependencies;
  const current = {
    access: "full",
    identity: { identityId: actor },
  } as unknown as Parameters<typeof inspectUlcRegistrationScheduleActorData>[0];
  return { deps, current, scopes, reader, recordAccessAudit, order };
}

describe("A02.4 offline subject access authorization and audit", () => {
  it("permits only same-org active self access, without admin privilege", async () => {
    const t = fixture({ actor: SUBJECT, role: "trainer" });
    const result = await inspectUlcRegistrationScheduleActorData(
      t.current, t.deps,
      { organizationId: ORG, targetIdentityId: SUBJECT, scope: "self" },
    );
    expect(result).toEqual({
      schemaVersion: 1, organizationId: ORG, targetIdentityId: SUBJECT,
      accessedAt: NOW.toISOString(), records: [RECORD],
    });
    expect(t.order).toEqual(["membership", "reader", "audit"]);
    expect(t.scopes.findLifecycleTarget).not.toHaveBeenCalled();
    expect(t.deps.permissions.findPrincipal).not.toHaveBeenCalled();
    expect(t.reader).toHaveBeenCalledExactlyOnceWith(ORG, SUBJECT);
  });

  it("denies other-identity or wrong-organization self access before any data read", async () => {
    const t = fixture({ actor: SUBJECT, role: "trainer" });
    await expect(inspectUlcRegistrationScheduleActorData(
      t.current, t.deps,
      { organizationId: ORG, targetIdentityId: ADMIN, scope: "self" },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    await expect(inspectUlcRegistrationScheduleActorData(
      t.current, t.deps,
      { organizationId: "another-org", targetIdentityId: SUBJECT, scope: "self" },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    expect(t.reader).not.toHaveBeenCalled();
    expect(t.recordAccessAudit).not.toHaveBeenCalled();
  });

  it("requires canonical admin role and target ownership before third-party access", async () => {
    const t = fixture();
    const result = await inspectUlcRegistrationScheduleActorData(
      t.current, t.deps,
      { organizationId: ORG, targetIdentityId: SUBJECT,
        scope: "organization-admin" },
    );
    expect(result.records).toEqual([RECORD]);
    expect(t.order).toEqual([
      "membership", "admin-principal", "subject", "reader", "audit",
    ]);
    expect(t.recordAccessAudit).toHaveBeenCalledExactlyOnceWith({
      actorIdentityId: ADMIN, organizationId: ORG, targetIdentityId: SUBJECT,
      scope: "organization-admin", recordCount: 1, accessedAt: NOW.toISOString(),
    });

    const trainer = fixture({ role: "trainer" });
    await expect(inspectUlcRegistrationScheduleActorData(
      trainer.current, trainer.deps,
      { organizationId: ORG, targetIdentityId: SUBJECT,
        scope: "organization-admin" },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    expect(trainer.reader).not.toHaveBeenCalled();

    const foreign = fixture({ targetOrganizationId: "foreign-org" });
    await expect(inspectUlcRegistrationScheduleActorData(
      foreign.current, foreign.deps,
      { organizationId: ORG, targetIdentityId: SUBJECT,
        scope: "organization-admin" },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    expect(foreign.reader).not.toHaveBeenCalled();
  });

  it("accepts a still-valid same-organization completed-deletion marker", async () => {
    const t = fixture({ targetOrganizationId: null });
    t.scopes.findDeletionMarker.mockResolvedValueOnce({
      identityId: SUBJECT, organizationId: ORG,
      completedAt: new Date("2026-11-03T18:20:00.000Z"),
      purgeAfter: new Date("2026-12-08T18:20:00.000Z"),
    } as never);
    const result = await inspectUlcRegistrationScheduleActorData(
      t.current, t.deps, {
        organizationId: ORG, targetIdentityId: SUBJECT,
        scope: "organization-admin",
      },
    );
    expect(result.records).toEqual([RECORD]);
    expect(t.reader).toHaveBeenCalledOnce();
  });

  it("requires a verifiable persisted audit receipt, not an in-memory callback", async () => {
    for (const badReceipt of [null, false, {}, { persisted: false, eventId: "audit:1" },
      { persisted: true }, { persisted: true, eventId: "wrong event id" },
      { persisted: true, eventId: "" }]) {
      const t = fixture({ auditReceipt: badReceipt });
      await expect(inspectUlcRegistrationScheduleActorData(
        t.current, t.deps,
        { organizationId: ORG, targetIdentityId: SUBJECT,
          scope: "organization-admin" },
      )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
      expect(t.reader).toHaveBeenCalledOnce();
      expect(t.recordAccessAudit).toHaveBeenCalledOnce();
    }
  });

  it("rejects a wrong-identity subject lookup even from the correct organization", async () => {
    const t = fixture({ targetIdentityId: "wrong-person" });
    await expect(inspectUlcRegistrationScheduleActorData(
      t.current, t.deps, { organizationId: ORG,
        targetIdentityId: SUBJECT, scope: "organization-admin" },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    expect(t.reader).not.toHaveBeenCalled();
  });

  it("rejects deletion markers for another identity and invalid marker chronology", async () => {
    const badMarkers = [
      { identityId: "wrong-person", organizationId: ORG,
        completedAt: new Date("2026-11-01T18:20:00Z"),
        purgeAfter: new Date("2026-12-01T18:20:00Z") },
      { identityId: SUBJECT, organizationId: ORG,
        completedAt: new Date("2026-11-01T18:20:00Z"),
        purgeAfter: new Date("2026-10-01T18:20:00Z") },
      { identityId: SUBJECT, organizationId: ORG,
        completedAt: new Date(NaN),
        purgeAfter: new Date("2026-12-01T18:20:00Z") },
    ];
    for (const marker of badMarkers) {
      const t = fixture({ targetOrganizationId: null });
      t.scopes.findDeletionMarker.mockResolvedValueOnce(marker as never);
      await expect(inspectUlcRegistrationScheduleActorData(
        t.current, t.deps,
        { organizationId: ORG, targetIdentityId: SUBJECT,
          scope: "organization-admin" },
      )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
      expect(t.reader).not.toHaveBeenCalled();
      expect(t.recordAccessAudit).not.toHaveBeenCalled();
    }
  });

  it("rejects all unexpected personal fields and malformed reader records BEFORE audit", async () => {
    const malicious = [
      { ...RECORD, actorIdentityId: "other-user-secret" },
      { ...RECORD, note: "personal health information" },
      { ...RECORD, referenceKind: "unknown" },
      { ...RECORD, groupId: " bad " },
      { ...RECORD, revision: -2 },
      { ...RECORD, sessionDate: "2026-02-31" },
      { ...RECORD, approved: "false" },
      { ...RECORD, occurredAt: "not-a-date" },
      { ...RECORD, referenceKind: "extra-day-approved", approved: false },
      { ...RECORD, referenceKind: "group-policy-updated" },
    ];
    for (const entry of malicious) {
      const t = fixture();
      t.deps.reader.readActorReferences = vi.fn(async () => [entry]) as never;
      await expect(inspectUlcRegistrationScheduleActorData(
        t.current, t.deps,
        { organizationId: ORG, targetIdentityId: SUBJECT,
          scope: "organization-admin" },
      )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
      expect(t.recordAccessAudit).not.toHaveBeenCalled();
    }
  });

  it("blocks incomplete audit before releasing personal records", async () => {
    const t = fixture({ auditError: new Error("audit unavailable") });
    await expect(inspectUlcRegistrationScheduleActorData(
      t.current, t.deps, {
        organizationId: ORG, targetIdentityId: SUBJECT,
        scope: "organization-admin",
      },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    expect(t.reader).toHaveBeenCalledOnce();
    expect(t.recordAccessAudit).toHaveBeenCalledOnce();
  });

  it("refuses unverified actor membership and fails before reading subject data", async () => {
    const t = fixture({ authorized: false });
    await expect(inspectUlcRegistrationScheduleActorData(
      t.current, t.deps,
      { organizationId: ORG, targetIdentityId: SUBJECT, scope: "self" },
    )).rejects.toBeInstanceOf(UlcRegistrationScheduleSubjectAccessBlockedError);
    expect(t.reader).not.toHaveBeenCalled();
  });
});
