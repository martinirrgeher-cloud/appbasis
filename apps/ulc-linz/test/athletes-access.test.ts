import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzAthletesAccessService,
  type UlcLinzAthletesAccessSqlClient,
} from "../worker/athletes-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const IDENTITY_ID = "identity-athletes-1";
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
    sessionToken: "appbasis.session=athletes-test",
    access: "full",
  };
}

function service(input: {
  sourceRole?: "admin" | "trainer" | "athlete" | "parent";
  active?: boolean;
  grants?: Array<ReturnType<typeof capabilityId>>;
  revokes?: Array<ReturnType<typeof capabilityId>>;
  roleCapabilities?: Array<ReturnType<typeof capabilityId>>;
  organizationRows?: readonly Record<string, unknown>[];
}) {
  const sourceRole = input.sourceRole ?? "trainer";
  const runtimeRoleId = roleId(`ulc-linz:${sourceRole}`);
  const view = capabilityId("ulc-linz:module:athletes:view");
  const edit = capabilityId("ulc-linz:module:athletes:edit");
  const sqlCalls: Array<{ query: string; parameters: readonly unknown[] | undefined }> = [];
  const sql: UlcLinzAthletesAccessSqlClient = {
    async unsafe(query, parameters) {
      sqlCalls.push({ query, parameters });
      return input.organizationRows ?? [{ organization_id: ORGANIZATION_ID }];
    },
  };

  return {
    sqlCalls,
    access: createUlcLinzAthletesAccessService({
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
    }),
  };
}

describe("ULC Linz Stammdaten access", () => {
  it("derives the organization from the authenticated membership before view authorization", async () => {
    const view = capabilityId("ulc-linz:module:athletes:view");
    const { access, sqlCalls } = service({ grants: [view] });

    await expect(access.assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
    });
    expect(sqlCalls).toHaveLength(1);
    expect(sqlCalls[0]?.query).toContain("WHERE identity_id = $1");
    expect(sqlCalls[0]?.parameters).toEqual([IDENTITY_ID]);
  });

  it("requires edit independently from view", async () => {
    const view = capabilityId("ulc-linz:module:athletes:view");
    const { access } = service({ grants: [view] });

    await expect(access.assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
    });
    await expect(access.assertEditAccess(currentIdentity())).rejects.toBeInstanceOf(
      UlcLinzAuthorizationDeniedError,
    );
  });

  it("fails closed for inactive membership and explicit capability revocation", async () => {
    const view = capabilityId("ulc-linz:module:athletes:view");

    const inactive = service({ grants: [view], active: false });
    await expect(
      inactive.access.assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    const revoked = service({ grants: [view], revokes: [view] });
    await expect(
      revoked.access.assertViewAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("keeps athlete and parent roles out of organization-wide Stammdaten", async () => {
    const view = capabilityId("ulc-linz:module:athletes:view");

    for (const sourceRole of ["athlete", "parent"] as const) {
      const { access } = service({ sourceRole, grants: [view] });
      await expect(access.assertViewAccess(currentIdentity())).rejects.toBeInstanceOf(
        UlcLinzAuthorizationDeniedError,
      );
    }
  });

  it("fails closed when membership organization cannot be resolved exactly once", async () => {
    const view = capabilityId("ulc-linz:module:athletes:view");
    for (const organizationRows of [
      [],
      [{ organization_id: "verein-1" }, { organization_id: "verein-2" }],
      [{ organization_id: " verein-1 " }],
    ]) {
      const { access } = service({ grants: [view], organizationRows });
      await expect(access.assertViewAccess(currentIdentity())).rejects.toBeInstanceOf(
        UlcLinzAuthorizationDeniedError,
      );
    }
  });

  it("allows canonical admin role capabilities without trusting client organization data", async () => {
    const edit = capabilityId("ulc-linz:module:athletes:edit");
    const { access } = service({
      sourceRole: "admin",
      roleCapabilities: [edit],
    });

    await expect(access.assertEditAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
    });
  });
});
