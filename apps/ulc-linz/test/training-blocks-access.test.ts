import { describe, expect, it } from "vitest";

import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
} from "@appbasis/permissions";

import {
  createUlcLinzTrainingBlocksAccessService,
  type UlcLinzTrainingBlocksAccessSqlClient,
} from "../worker/training-blocks-access";
import {
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
} from "../worker/authorization";

const IDENTITY_ID = "identity-training-blocks-1";
const ORGANIZATION_ID = "verein-1";

function currentIdentity(): UlcLinzCurrentIdentity {
  return {
    identity: {
      identityId: IDENTITY_ID,
      username: "trainer.blocks",
      displayName: "Training Blocks Trainer",
      contactEmail: null,
      personId: null,
      mustChangePassword: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      accountStatus: "active",
    },
    sessionToken: "appbasis.session=training-blocks-test",
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
  const view = capabilityId("ulc-linz:module:training_blocks:view");
  const edit = capabilityId("ulc-linz:module:training_blocks:edit");
  const sqlCalls: Array<{
    query: string;
    parameters: readonly unknown[] | undefined;
  }> = [];
  const sql: UlcLinzTrainingBlocksAccessSqlClient = {
    async unsafe(query, parameters) {
      sqlCalls.push({ query, parameters });
      return input.organizationRows ?? [{ organization_id: ORGANIZATION_ID }];
    },
  };

  return {
    sqlCalls,
    access: createUlcLinzTrainingBlocksAccessService({
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

describe("ULC Linz training blocks access", () => {
  it("derives organization and actor only from the authenticated membership", async () => {
    const view = capabilityId("ulc-linz:module:training_blocks:view");
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

  it("maps trainer view/edit independently and keeps view read-only when edit is absent", async () => {
    const view = capabilityId("ulc-linz:module:training_blocks:view");
    const edit = capabilityId("ulc-linz:module:training_blocks:edit");

    await expect(
      service({ grants: [view] }).access.assertViewAccess(currentIdentity()),
    ).resolves.toMatchObject({ canEdit: false });

    await expect(
      service({ grants: [view, edit] }).access.assertViewAccess(currentIdentity()),
    ).resolves.toMatchObject({ canEdit: true });

    await expect(
      service({ grants: [view] }).access.assertEditAccess(currentIdentity()),
    ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
  });

  it("allows the canonical admin role through role capability and denies member-only roles", async () => {
    const edit = capabilityId("ulc-linz:module:training_blocks:edit");
    await expect(
      service({
        sourceRole: "admin",
        roleCapabilities: [edit],
      }).access.assertEditAccess(currentIdentity()),
    ).resolves.toMatchObject({
      organizationId: ORGANIZATION_ID,
      canEdit: true,
    });

    const view = capabilityId("ulc-linz:module:training_blocks:view");
    for (const sourceRole of ["athlete", "parent"] as const) {
      await expect(
        service({ sourceRole, grants: [view] }).access.assertViewAccess(
          currentIdentity(),
        ),
      ).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    }
  });

  it("fails closed for inactive membership, revocation or ambiguous organization", async () => {
    const view = capabilityId("ulc-linz:module:training_blocks:view");

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
