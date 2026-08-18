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
  return [
    {
      id: "member-contact",
      records: [
        {
          organizationId: request.organizationId,
          subjectId,
          data: memberRow(),
        },
      ],
    },
  ];
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
}): {
  value: UlcLinzCanonicalDataExportDependencies;
  resolveMembership: ReturnType<typeof vi.fn>;
  hasRelation: ReturnType<typeof vi.fn>;
  readDatasets: ReturnType<typeof vi.fn>;
  recordExportAudit: ReturnType<typeof vi.fn>;
} {
  const sourceRole = input.sourceRole ?? "athlete";
  const principalRole =
    input.principalRole === undefined
      ? `ulc-linz:${sourceRole}`
      : input.principalRole;
  const permissions = new InMemoryPermissionStore({
    knownCapabilities: [],
    roles: SOURCE_ROLES.map((role) => ({
      roleId: roleId(`ulc-linz:${role}`),
      capabilities: [],
    })),
    principals:
      principalRole === null
        ? []
        : [
            {
              principalId: principalId(IDENTITY_ID),
              roleIds: [roleId(principalRole)],
              grants: [],
              revokes: [],
            },
          ],
  });
  const resolveMembership = vi.fn(
    async (_request: { identityId: string; organizationId: string }) => ({
      organizationId:
        input.membershipOrganizationId ?? input.request.organizationId,
      sourceRole,
      active: input.membershipActive ?? true,
    }),
  );
  const hasRelation = vi.fn(
    async (_request: {
      identityId: string;
      organizationId: string;
      subjectId: string;
      relationType: "self" | "managed";
    }) => input.related ?? true,
  );
  const readDatasets = vi.fn(
    async (_request: {
      organizationId: string;
      scope: "self" | "managed" | "organization";
      subjectId: string | null;
    }) => input.datasets ?? datasetsFor(input.request),
  );
  const recordExportAudit = vi.fn(
    async (_audit: UlcLinzExportAuditInput) => {
      if (input.auditError !== undefined) throw input.auditError;
    },
  );

  return {
    value: {
      permissions,
      memberships: { resolveMembership },
      subjectScopes: { hasRelation },
      readDatasets,
      recordExportAudit,
      now: () => GENERATED_AT,
    },
    resolveMembership,
    hasRelation,
    readDatasets,
    recordExportAudit,
  };
}

async function expectBlocked(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({ code });
}

describe("ULC Linz canonical M5-E data export service", () => {
  it("proves active membership, active canonical role and self relation before reading data", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const deps = dependencies({ request, sourceRole: "athlete" });

    const result = await exportUlcLinzDataWithCanonicalAuthorization(
      currentIdentity(),
      deps.value,
      request,
    );

    expect(deps.resolveMembership).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      organizationId: ORGANIZATION_ID,
    });
    expect(deps.hasRelation).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      organizationId: ORGANIZATION_ID,
      subjectId: SUBJECT_ID,
      relationType: "self",
    });
    expect(deps.readDatasets).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      scope: "self",
      subjectId: SUBJECT_ID,
    });
    expect(deps.recordExportAudit).toHaveBeenCalledTimes(1);
    expect(result.json.datasets["member-contact"]).toEqual([memberRow()]);
  });

  it("permits managed export only for a parent with an explicit managed relation", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "managed" as const,
      subjectId: "child-1",
    };
    const deps = dependencies({ request, sourceRole: "parent" });

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity(),
        deps.value,
        request,
      ),
    ).resolves.toMatchObject({
      json: { scope: "managed", subjectId: "child-1" },
    });
    expect(deps.hasRelation).toHaveBeenCalledWith(
      expect.objectContaining({ relationType: "managed", subjectId: "child-1" }),
    );
  });

  it("permits organization export only for the canonical admin role", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "organization" as const,
    };
    const deps = dependencies({ request, sourceRole: "admin" });

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity(),
        deps.value,
        request,
      ),
    ).resolves.toMatchObject({
      json: { scope: "organization", subjectId: null },
    });
    expect(deps.hasRelation).not.toHaveBeenCalled();
    expect(deps.readDatasets).toHaveBeenCalledTimes(1);
  });

  it("blocks managed export for a non-parent before relation lookup or dataset read", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "managed" as const,
      subjectId: "child-1",
    };
    const deps = dependencies({ request, sourceRole: "trainer" });

    await expectBlocked(
      () => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request),
      "AUTHORIZATION_MISMATCH",
    );
    expect(deps.hasRelation).not.toHaveBeenCalled();
    expect(deps.readDatasets).not.toHaveBeenCalled();
  });

  it("blocks organization export for a non-admin before dataset read", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "organization" as const,
    };
    const deps = dependencies({ request, sourceRole: "trainer" });

    await expectBlocked(
      () => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request),
      "AUTHORIZATION_MISMATCH",
    );
    expect(deps.readDatasets).not.toHaveBeenCalled();
  });

  it("blocks inactive or cross-organization membership before dataset read", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };

    const inactive = dependencies({ request, sourceRole: "athlete", membershipActive: false });
    await expectBlocked(
      () => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), inactive.value, request),
      "AUTHORIZATION_MISMATCH",
    );
    expect(inactive.readDatasets).not.toHaveBeenCalled();

    const crossOrganization = dependencies({
      request,
      sourceRole: "athlete",
      membershipOrganizationId: "verein-2",
    });
    await expectBlocked(
      () =>
        exportUlcLinzDataWithCanonicalAuthorization(
          currentIdentity(),
          crossOrganization.value,
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );
    expect(crossOrganization.readDatasets).not.toHaveBeenCalled();
  });

  it("blocks principal-role drift instead of trusting the membership role alone", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const deps = dependencies({
      request,
      sourceRole: "athlete",
      principalRole: "ulc-linz:parent",
    });

    await expectBlocked(
      () => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request),
      "AUTHORIZATION_MISMATCH",
    );
    expect(deps.hasRelation).not.toHaveBeenCalled();
    expect(deps.readDatasets).not.toHaveBeenCalled();
  });

  it("blocks missing self or managed relations before dataset read", async () => {
    const selfRequest = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const selfDeps = dependencies({ request: selfRequest, sourceRole: "athlete", related: false });
    await expectBlocked(
      () =>
        exportUlcLinzDataWithCanonicalAuthorization(
          currentIdentity(),
          selfDeps.value,
          selfRequest,
        ),
      "AUTHORIZATION_MISMATCH",
    );
    expect(selfDeps.readDatasets).not.toHaveBeenCalled();

    const managedRequest = {
      organizationId: ORGANIZATION_ID,
      scope: "managed" as const,
      subjectId: "child-1",
    };
    const managedDeps = dependencies({
      request: managedRequest,
      sourceRole: "parent",
      related: false,
    });
    await expectBlocked(
      () =>
        exportUlcLinzDataWithCanonicalAuthorization(
          currentIdentity(),
          managedDeps.value,
          managedRequest,
        ),
      "AUTHORIZATION_MISMATCH",
    );
    expect(managedDeps.readDatasets).not.toHaveBeenCalled();
  });

  it("blocks unknown source roles and missing principals fail-closed", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const unknownRole = dependencies({
      request,
      sourceRole: "unknown-role",
      principalRole: "ulc-linz:athlete",
    });
    await expectBlocked(
      () =>
        exportUlcLinzDataWithCanonicalAuthorization(
          currentIdentity(),
          unknownRole.value,
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );

    const missingPrincipal = dependencies({
      request,
      sourceRole: "athlete",
      principalRole: null,
    });
    await expectBlocked(
      () =>
        exportUlcLinzDataWithCanonicalAuthorization(
          currentIdentity(),
          missingPrincipal.value,
          request,
        ),
      "AUTHORIZATION_MISMATCH",
    );
    expect(missingPrincipal.readDatasets).not.toHaveBeenCalled();
  });

  it("keeps password-change-required identities out before membership resolution", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const deps = dependencies({ request, sourceRole: "athlete" });

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity("password-change-required"),
        deps.value,
        request,
      ),
    ).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
    expect(deps.resolveMembership).not.toHaveBeenCalled();
    expect(deps.readDatasets).not.toHaveBeenCalled();
  });

  it("still blocks result delivery when the required audit sink fails", async () => {
    const request = {
      organizationId: ORGANIZATION_ID,
      scope: "self" as const,
      subjectId: SUBJECT_ID,
    };
    const deps = dependencies({
      request,
      sourceRole: "athlete",
      auditError: new Error("audit unavailable"),
    });

    await expectBlocked(
      () => exportUlcLinzDataWithCanonicalAuthorization(currentIdentity(), deps.value, request),
      "AUDIT_FAILED",
    );
  });
});
