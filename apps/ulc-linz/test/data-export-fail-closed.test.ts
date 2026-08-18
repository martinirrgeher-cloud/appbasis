import { describe, expect, it, vi } from "vitest";

import {
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import type { UlcLinzCurrentIdentity } from "../worker/authorization";
import type { UlcLinzExportAuditInput } from "../worker/data-export";
import {
  exportUlcLinzDataWithCanonicalAuthorization,
  type UlcLinzCanonicalDataExportDependencies,
} from "../worker/data-export-service";

const IDENTITY_ID = "identity-1";
const ORGANIZATION_ID = "verein-1";
const SUBJECT_ID = "athlete-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "athlete.user",
      displayName: "Athlete User",
      contactEmail: "athlete@example.test",
      personId: "person-1",
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=never-export-this",
    access: "full",
  };
}

function permissionStore(activeRolePresent = true) {
  return new InMemoryPermissionStore({
    knownCapabilities: [],
    roles: activeRolePresent
      ? [{ roleId: roleId("ulc-linz:athlete"), capabilities: [] }]
      : [],
    principals: [
      {
        principalId: principalId(IDENTITY_ID),
        roleIds: [roleId("ulc-linz:athlete")],
        grants: [],
        revokes: [],
      },
    ],
  });
}

function baseDependencies(): UlcLinzCanonicalDataExportDependencies {
  return {
    permissions: permissionStore(),
    memberships: {
      async resolveMembership() {
        return {
          organizationId: ORGANIZATION_ID,
          sourceRole: "athlete",
          active: true,
        };
      },
    },
    subjectScopes: {
      async hasRelation() {
        return true;
      },
    },
    async readDatasets() {
      return [
        {
          id: "member-contact",
          records: [
            {
              organizationId: ORGANIZATION_ID,
              subjectId: SUBJECT_ID,
              data: {
                username: "athlete.user",
                displayName: "Athlete User",
                contactEmail: "athlete@example.test",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-06-01T00:00:00.000Z",
              },
            },
          ],
        },
      ];
    },
    async recordExportAudit(_input: UlcLinzExportAuditInput) {},
    now: () => new Date("2026-08-18T05:00:00.000Z"),
  };
}

const REQUEST = {
  organizationId: ORGANIZATION_ID,
  scope: "self" as const,
  subjectId: SUBJECT_ID,
};

describe("ULC Linz M5-E fail-closed resolver boundaries", () => {
  it("does not read datasets when membership resolution fails", async () => {
    const base = baseDependencies();
    const readDatasets = vi.fn(base.readDatasets);
    const dependencies: UlcLinzCanonicalDataExportDependencies = {
      ...base,
      memberships: {
        async resolveMembership() {
          throw new Error("membership unavailable");
        },
      },
      readDatasets,
    };

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity(),
        dependencies,
        REQUEST,
      ),
    ).rejects.toThrow("membership unavailable");
    expect(readDatasets).not.toHaveBeenCalled();
  });

  it("does not read datasets when self relation resolution fails", async () => {
    const base = baseDependencies();
    const readDatasets = vi.fn(base.readDatasets);
    const dependencies: UlcLinzCanonicalDataExportDependencies = {
      ...base,
      subjectScopes: {
        async hasRelation() {
          throw new Error("subject scope unavailable");
        },
      },
      readDatasets,
    };

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity(),
        dependencies,
        REQUEST,
      ),
    ).rejects.toThrow("subject scope unavailable");
    expect(readDatasets).not.toHaveBeenCalled();
  });

  it("blocks an assigned but inactive or missing runtime role before dataset read", async () => {
    const base = baseDependencies();
    const readDatasets = vi.fn(base.readDatasets);
    const dependencies: UlcLinzCanonicalDataExportDependencies = {
      ...base,
      permissions: permissionStore(false),
      readDatasets,
    };

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity(),
        dependencies,
        REQUEST,
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_MISMATCH" });
    expect(readDatasets).not.toHaveBeenCalled();
  });

  it("does not audit or return a partial export when dataset reading fails", async () => {
    const base = baseDependencies();
    const recordExportAudit = vi.fn(base.recordExportAudit);
    const dependencies: UlcLinzCanonicalDataExportDependencies = {
      ...base,
      async readDatasets() {
        throw new Error("dataset read failed");
      },
      recordExportAudit,
    };

    await expect(
      exportUlcLinzDataWithCanonicalAuthorization(
        currentIdentity(),
        dependencies,
        REQUEST,
      ),
    ).rejects.toThrow("dataset read failed");
    expect(recordExportAudit).not.toHaveBeenCalled();
  });
});
