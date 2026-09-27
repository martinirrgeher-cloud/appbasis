import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzKindertrainingAccessService,
  type UlcLinzKindertrainingAccessSqlClient,
} from "../worker/kindertraining-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const IDENTITY_ID = "identity-kindertraining-1";
const ORGANIZATION_ID = "verein-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "trainer.user",
      displayName: "Trainer User",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=kindertraining-test",
    access: "full",
  };
}

function service(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  active?: boolean;
  grants?: Array<ReturnType<typeof capabilityId>>;
  revokes?: Array<ReturnType<typeof capabilityId>>;
  roleCapabilities?: Array<ReturnType<typeof capabilityId>>;
}) {
  const sourceRole = input.sourceRole ?? "trainer";
  const runtimeRoleId = roleId(`ulc-linz:${sourceRole}`);
  const view = capabilityId("ulc-linz:module:kindertraining:view");
  const edit = capabilityId("ulc-linz:module:kindertraining:edit");
  const sql: UlcLinzKindertrainingAccessSqlClient = {
    async unsafe() {
      return [{ organization_id: ORGANIZATION_ID }];
    },
  };

  return createUlcLinzKindertrainingAccessService({
    sql,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [view, edit],
      roles: [
        {
          roleId: runtimeRoleId,
          capabilities: input.roleCapabilities ?? [],
        },
      ],
      principals: [
        {
          principalId: principalId(IDENTITY_ID),
          roleIds: [runtimeRoleId],
          grants: input.grants ?? [],
          revokes: input.revokes ?? [],
        },
      ],
    }),
    memberships: {
      async resolveMembership({ organizationId }) {
        return {
          organizationId,
          sourceRole,
          active: input.active ?? true,
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

describe("ULC Linz Kindertraining access", () => {
  it("requires Kindertraining view and edit independently", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");
    const access = service({ grants: [view] });

    await expect(access.assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
    });
    await expect(access.assertEditAccess(currentIdentity())).rejects.toBeInstanceOf(
      UlcLinzAuthorizationDeniedError,
    );
  });

  it("keeps parent and athlete roles out of the organization-wide participant snapshot", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");

    for (const sourceRole of ["athlete", "parent"] as const) {
      const access = service({ sourceRole, grants: [view] });
      await expect(access.assertViewAccess(currentIdentity())).rejects.toBeInstanceOf(
        UlcLinzAuthorizationDeniedError,
      );
    }
  });

  it("allows a canonical admin role to edit Kindertraining", async () => {
    const edit = capabilityId("ulc-linz:module:kindertraining:edit");
    const access = service({
      sourceRole: "admin",
      roleCapabilities: [edit],
    });

    await expect(access.assertEditAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
    });
  });

  it("fails closed for inactive memberships and explicit revocation", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");

    await expect(
      service({ grants: [view], active: false }).assertViewAccess(
        currentIdentity(),
      ),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    await expect(
      service({ grants: [view], revokes: [view] }).assertViewAccess(
        currentIdentity(),
      ),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });
});
