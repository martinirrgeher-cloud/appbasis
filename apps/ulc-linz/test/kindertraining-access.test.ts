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
const TRAINER_ID = "trainer-1";

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
  linkedTrainerId?: string | null;
  trainerActive?: boolean;
  groupIds?: readonly string[];
}) {
  const sourceRole = input.sourceRole ?? "trainer";
  const runtimeRoleId = roleId(`ulc-linz:${sourceRole}`);
  const view = capabilityId("ulc-linz:module:kindertraining:view");
  const edit = capabilityId("ulc-linz:module:kindertraining:edit");
  const groupIds = input.groupIds ?? ["group-1", "group-2"];
  const linkedTrainerId =
    input.linkedTrainerId === undefined ? TRAINER_ID : input.linkedTrainerId;
  const trainerId =
    sourceRole === "trainer" &&
    linkedTrainerId !== null &&
    input.trainerActive !== false
      ? linkedTrainerId
      : null;
  const sql: UlcLinzKindertrainingAccessSqlClient = {
    async unsafe(query, parameters) {
      expect(query).toContain("LEFT JOIN appbasis_trainer AS trainer");
      expect(query).toContain(
        "LEFT JOIN appbasis_trainer_group_membership AS trainer_group",
      );
      expect(query).toContain("trainer.is_active = true");
      expect(parameters).toEqual([IDENTITY_ID]);
      const base = {
        organization_id: ORGANIZATION_ID,
        source_role: sourceRole,
        active: input.active ?? true,
        trainer_id: trainerId,
      };
      if (sourceRole !== "trainer" || groupIds.length === 0) {
        return [{ ...base, group_id: null }];
      }
      return groupIds.map((groupId) => ({ ...base, group_id: groupId }));
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
  it("resolves an active linked trainer to exactly the assigned groups", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");
    const access = service({ grants: [view], groupIds: ["group-1", "group-2"] });

    await expect(access.assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      scope: "trainer",
      trainerId: TRAINER_ID,
      groupIds: ["group-1", "group-2"],
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

  it("keeps a canonical admin organization-wide", async () => {
    const edit = capabilityId("ulc-linz:module:kindertraining:edit");
    const access = service({
      sourceRole: "admin",
      roleCapabilities: [edit],
    });

    await expect(access.assertEditAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      scope: "organization",
    });
  });

  it("denies a trainer without a valid active trainer identity link", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");

    for (const input of [
      { linkedTrainerId: null },
      { linkedTrainerId: TRAINER_ID, trainerActive: false },
    ]) {
      const access = service({ grants: [view], ...input });
      await expect(access.assertViewAccess(currentIdentity())).rejects.toBeInstanceOf(
        UlcLinzAuthorizationDeniedError,
      );
    }
  });

  it("allows a linked trainer with no assigned group but resolves an empty scope", async () => {
    const view = capabilityId("ulc-linz:module:kindertraining:view");
    const access = service({ grants: [view], groupIds: [] });

    await expect(access.assertViewAccess(currentIdentity())).resolves.toEqual({
      organizationId: ORGANIZATION_ID,
      actorPrincipalId: IDENTITY_ID,
      scope: "trainer",
      trainerId: TRAINER_ID,
      groupIds: [],
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
