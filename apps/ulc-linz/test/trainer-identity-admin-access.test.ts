import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzTrainerIdentityAdminAccessService,
} from "../worker/trainer-identity-admin-access";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";

const IDENTITY_ID = "admin-1";
const ORGANIZATION_ID = "verein-1";

function currentIdentity() {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "admin.user",
      displayName: "Admin User",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active" as const,
    },
    sessionToken: "appbasis.session=test",
    access: "full" as const,
  };
}

function permissionStore(sourceRole: "admin" | "trainer") {
  const capability = capabilityId("ulc-linz:module:athletes:edit");
  return new InMemoryPermissionStore({
    knownCapabilities: [capability],
    roles: [
      {
        roleId: roleId(`ulc-linz:${sourceRole}`),
        capabilities: [capability],
      },
    ],
    principals: [
      {
        principalId: principalId(IDENTITY_ID),
        roleIds: [roleId(`ulc-linz:${sourceRole}`)],
        grants: [],
        revokes: [],
      },
    ],
  });
}

function service(sourceRole: "admin" | "trainer") {
  return createUlcLinzTrainerIdentityAdminAccessService({
    sql: {
      async unsafe() {
        return [
          {
            organization_id: ORGANIZATION_ID,
            source_role: sourceRole,
            active: true,
          },
        ];
      },
    },
    permissions: permissionStore(sourceRole),
    memberships: {
      async resolveMembership() {
        return {
          organizationId: ORGANIZATION_ID,
          sourceRole,
          active: true,
        };
      },
    },
    subjectScopes: {
      async hasRelation() {
        return false;
      },
    },
  });
}

describe("ULC trainer identity administration access", () => {
  it("allows only an active own-organization admin", async () => {
    await expect(
      service("admin").assertAdminAccess(currentIdentity()),
    ).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
    });
  });

  it("denies a trainer even when that trainer has athletes edit capability", async () => {
    await expect(
      service("trainer").assertAdminAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });
});
