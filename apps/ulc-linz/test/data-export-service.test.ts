import { describe, expect, it, vi } from "vitest";

import {
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import type { UlcLinzCurrentIdentity } from "../worker/authorization";
import type {
  UlcLinzDataExportRequest,
  UlcLinzExportAuditInput,
  UlcLinzExportDataset,
} from "../worker/data-export";
import {
  exportUlcLinzDataWithCanonicalAuthorization,
  type UlcLinzCanonicalDataExportDependencies,
} from "../worker/data-export-service";

const IDENTITY_ID = "identity-1";
const ORGANIZATION_ID = "verein-1";
const SUBJECT_ID = "athlete-1";
const GENERATED_AT = new Date("2026-08-18T05:00:00.000Z");
const SOURCE_ROLES = ["admin", "trainer", "athlete", "parent"] as const;

function currentIdentity(
  access: UlcLinzCurrentIdentity["access"] = "full",
): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "athlete.user",
      displayName: "Athlete User",
      contactEmail: "athlete@example.test",
      personId: "person-1",
      mustChangePassword: access === "password-change-required",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=never-export-this",
    access,
  };
}

function memberRow() {
  return {
    username: "athlete.user",
    displayName: "Athlete User",
    contactEmail: "athlete@example.test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function datasetsFor(request: UlcLinzDataExportRequest): UlcLinzExportDataset[] {
  const subjectId = request.scope === "organization" ? "member-1" : request.subjectId;
  return [{
    id: "member-contact",
    records: [{ organizationId: request.organizationId, subjectId, data: memberRow() }],
  }];
}

function dependencies(input: {
  request: UlcLinzDataExportRequest;
  sourceRole?: string;
  membershipActive?: boolean;
  membershipOrganizationId?: string;
  principalRole?: string | null;
  related?: boolean;
  auditError?: Error;
  datasets?: readonly UlcLinzExportDataset[];
}) {
  const sourceRole = input.sourceRole ?? "athlete";
  const principalRole = input.principalRole === undefined ? `ulc-linz:${sourceRole}` : input.principalRole;
  const permissions = new InMemoryPermissionStore({
    knownCapabilities: [],
    roles: SOURCE_ROLES.map((role) => ({ roleId: roleId(`ulc-linz:${role}`), capabilities: [] })),
    principals: principalRole === null ? [] : [{
      principalId: principalId(IDENTITY_ID),
      roleIds: [roleId(principalRole)],
      grants: [],
      revokes: [],
    }],
  });
  const resolveMembership = vi.fn(async () => ({
    organizationId: input.membershipOrganizationId ?? input.request.organizationId,
    sourceRole,
    active: input.membershipActive ?? true,
  }));
  const hasRelation = vi.fn(async () => input.related ?? true);
  const readDatasets = vi.fn(async () => input.datasets ?? datasetsFor(input.request));
  const recordExportAudit = vi.fn(async (_audit: UlcLinzExportAuditInput) => {
    if (input.auditError !== undefined) throw input.auditError;
  });
  const value: UlcLinzCanonicalDataExportDependencies = {
    permissions,
    memberships: { resolveMembership },
    subjectScopes: { hasRelation },
    readDatasets,
    recordExportAudit,
    now: () => GENERATED_AT,
  };
  return { value, resolveMembership, hasRelation, readDatasets, recordExportAudit };
}

async function expectBlocked(run: () => Promise<unknown>, code: string) {
  await expect(run()).rejects.toMatchObject({ code });
}

describe("ULC Linz canonical M5-E data export service", () => {
  it("proves active membership, active canonical role and self relation before reading data", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "self" as const, subjectId: SUBJECT_ID };
    const deps = dependencies({ request, sourceRole: "athlete" });
    const result = await exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request);
    expect(deps.resolveMembership).toHaveBeenCalledWith({ identityId: IDENTITY_ID, organizationId: ORGANIZATION_ID });
    expect(deps.hasRelation).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      organizationId: ORGANIZATION_ID,
      subjectId: SUBJECT_ID,
      relationType: "self",
    });
    expect(deps.readDatasets).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID, scope: "self", subjectId: SUBJECT_ID });
    expect(deps.recordExportAudit).toHaveBeenCalledTimes(1);
    expect(result.json.datasets["member-contact"]).toEqual([memberRow()]);
  });

  it("permits managed export only for parent with an explicit relation", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "managed" as const, subjectId: "child-1" };
    const parent = dependencies({ request, sourceRole: "parent" });
    await expect(exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), parent.value, request)).resolves.toMatchObject({ json: { scope: "managed", subjectId: "child-1" } });
    const trainer = dependencies({ request, sourceRole: "trainer" });
    await expectBlocked(() => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), trainer.value, request), "AUTHORIZATION_MISMATCH");
    expect(trainer.readDatasets).not.toHaveBeenCalled();
  });

  it("permits organization export only for canonical admin", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "organization" as const };
    const admin = dependencies({ request, sourceRole: "admin" });
    await expect(exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), admin.value, request)).resolves.toMatchObject({ json: { scope: "organization", subjectId: null } });
    expect(admin.hasRelation).not.toHaveBeenCalled();
    const trainer = dependencies({ request, sourceRole: "trainer" });
    await expectBlocked(() => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), trainer.value, request), "AUTHORIZATION_MISMATCH");
    expect(trainer.readDatasets).not.toHaveBeenCalled();
  });

  it("blocks inactive/cross-org memberships, role drift and missing relations before reads", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "self" as const, subjectId: SUBJECT_ID };
    for (const deps of [
      dependencies({ request, membershipActive: false }),
      dependencies({ request, membershipOrganizationId: "verein-2" }),
      dependencies({ request, sourceRole: "athlete", principalRole: "ulc-linz:parent" }),
      dependencies({ request, sourceRole: "athlete", related: false }),
      dependencies({ request, sourceRole: "athlete", principalRole: null }),
    ]) {
      await expectBlocked(() => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request), "AUTHORIZATION_MISMATCH");
      expect(deps.readDatasets).not.toHaveBeenCalled();
    }
  });

  it("blocks password-change-required before membership resolution", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "self" as const, subjectId: SUBJECT_ID };
    const deps = dependencies({ request });
    await expect(exportUlcLinzDataWithCanonicalAuthorization(currentIdentity("password-change-required"), deps.value, request)).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    expect(deps.resolveMembership).not.toHaveBeenCalled();
    expect(deps.readDatasets).not.toHaveBeenCalled();
  });

  it("does not return an export when mandatory audit fails", async () => {
    const request = { organizationId: ORGANIZATION_ID, scope: "self" as const, subjectId: SUBJECT_ID };
    const deps = dependencies({ request, auditError: new Error("audit unavailable") });
    await expectBlocked(() => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request), "AUDIT_FAILED");
  });
});
