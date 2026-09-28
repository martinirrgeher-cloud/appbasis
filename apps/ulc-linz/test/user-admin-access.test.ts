import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import {
  createUlcLinzUserAdminAccessService,
} from "../worker/user-admin-access";

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

function service(sourceRole: "admin" | "trainer") {
  const capability = capabilityId("ulc-linz:module:user_management:edit");
  const role = roleId("ulc-linz:" + sourceRole);
  return createUlcLinzUserAdminAccessService({
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
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [capability],
      roles: [{ roleId: role, capabilities: [capability] }],
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: [role],
          grants: [],
          revokes: [],
        },
      ],
    }),
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

describe("ULC user administration access", () => {
  it("allows an active own-organization admin with canonical user-management access", async () => {
    await expect(
      service("admin").assertAdminAccess(currentIdentity()),
    ).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
    });
  });

  it("denies a trainer even if a permission store were to expose user-management edit", async () => {
    await expect(
      service("trainer").assertAdminAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });
});
