import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzExerciseCatalogAccessService,
  type UlcLinzExerciseCatalogAccessSqlClient,
} from "../worker/exercise-catalog-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const IDENTITY_ID = "identity-exercise-1";
const ORGANIZATION_ID = "verein-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "trainer.exercise",
      displayName: "Exercise Trainer",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=exercise-catalog-test",
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
  const view = capabilityId("ulc-linz:module:exercise_catalog:view");
  const edit = capabilityId("ulc-linz:module:exercise_catalog:edit");
  const sqlCalls: Array<{
    query: string;
    parameters: readonly unknown[] | undefined;
  }> = [];
  const sql: UlcLinzExerciseCatalogAccessSqlClient = {
    async unsafe(query, parameters) {
      sqlCalls.push({ query, parameters });
      return input.organizationRows ?? [{ organization_id: ORGANIZATION_ID }];
    },
  };

  return {
    sqlCalls,
    access: createUlcLinzExerciseCatalogAccessService({
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

describe("ULC Linz exercise catalog access", () => {
  it("derives organization and actor exclusively from the authenticated membership", async () => {
    const view = capabilityId("ulc-linz:module:exercise_catalog:view");
    const { access, sqlCalls } = service({ grants: [view] });

    await expect(access.assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      canEdit: false,
    });
    expect(sqlCalls).toHaveLength(1);
    expect(sqlCalls[0]?.query).toContain("WHERE identity_id = $1");
    expect(sqlCalls[0]?.parameters).toEqual([IDENTITY_ID]);
  });

  it("reports edit availability independently from view without denying the view", async () => {
    const view = capabilityId("ulc-linz:module:exercise_catalog:view");
    const edit = capabilityId("ulc-linz:module:exercise_catalog:edit");

    await expect(
      service({ grants: [view] }).access.assertViewAccess(currentIdentity()),
    ).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      canEdit: false,
    });

    await expect(
      service({ grants: [view, edit] }).access.assertViewAccess(currentIdentity()),
    ).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      canEdit: true,
    });

    await expect(
      service({ grants: [view] }).access.assertEditAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("allows the canonical admin role through its role capability", async () => {
    const edit = capabilityId("ulc-linz:module:exercise_catalog:edit");
    const { access } = service({
      sourceRole: "admin",
      roleCapabilities: [edit],
    });

    await expect(access.assertEditAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      canEdit: true,
    });
  });

  it("denies inactive membership, explicit revocation and non-trainer member roles", async () => {
    const view = capabilityId("ulc-linz:module:exercise_catalog:view");

    await expect(
      service({ grants: [view], active: false }).access.assertViewAccess(
        currentIdentity(),
      ),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    await expect(
      service({ grants: [view], revokes: [view] }).access.assertViewAccess(
        currentIdentity(),
      ),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);

    for (const sourceRole of ["athlete", "parent"] as const) {
      await expect(
        service({ sourceRole, grants: [view] }).access.assertViewAccess(
          currentIdentity(),
        ),
      ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }
  });

  it("fails closed when organization cannot be resolved exactly once", async () => {
    const view = capabilityId("ulc-linz:module:exercise_catalog:view");

    for (const organizationRows of [
      [],
      [{ organization_id: "verein-1" }, { organization_id: "verein-2" }],
      [{ organization_id: " verein-1 " }],
    ]) {
      await expect(
        service({ grants: [view], organizationRows }).access.assertViewAccess(
          currentIdentity(),
        ),
      ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }
  });
});
