import { describe, expect, it } from "vitest";

import type { IdentityPostgresProvisioningOwner } from "@appbasis/identity/postgres-runtime";
import {
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
} from "@appbasis/permissions";

import {
  createUlcLinzTrainerUserProvisioningService,
  UlcLinzTrainerUserProvisioningConflictError,
} from "../worker/trainer-user-provisioning";

function identityState(identityId = "identity-1") {
  return {
    identityId,
    username: "trainer.a",
    displayName: "Trainer A",
    contactEmail: null,
    personId: null,
    mustChangePassword: true,
    createdAt: new Date("2026-09-29T04:00:00.000Z"),
    updatedAt: new Date("2026-09-29T04:00:00.000Z"),
    passwordChangedAt: null,
    disabledAt: null,
    accountStatus: "active" as const,
  };
}

function permissionStore(
  roles: readonly string[] = [],
  grants: readonly string[] = [],
): PermissionStore {
  return {
    async findPrincipal(requestedPrincipalId) {
      return {
        principalId: requestedPrincipalId,
        roleIds: roles.map(roleId),
        grants: grants.map(capabilityId),
        revokes: [],
      };
    },
    async findRole() {
      return null;
    },
    async isKnownCapability() {
      return true;
    },
  };
}

describe("ULC trainer user provisioning", () => {
  it("creates an identity, binds the selected trainer and grants only Kindertraining access", async () => {
    let identityInput: unknown = null;
    let bindInput: unknown = null;
    let accessInput: unknown = null;
    const identityProvisioning: IdentityPostgresProvisioningOwner = {
      async createInitialUser(input, provisioningAudit) {
        identityInput = { input, provisioningAudit };
        return identityState();
      },
    };
    const sqlCalls: string[] = [];
    const sql = {
      async unsafe(query: string) {
        sqlCalls.push(query);
        if (query.includes("INSERT INTO ulc_linz_membership")) {
          return [
            {
              organization_id: "verein-1",
              subject_id: "ulc-unassigned-trainer:identity-1",
              source_role: "trainer",
              active: true,
            },
          ];
        }
        if (query.includes("INSERT INTO appbasis_permission_principal")) {
          return [];
        }
        throw new Error("unexpected SQL");
      },
    };
    const service = createUlcLinzTrainerUserProvisioningService({
      identityProvisioning,
      sql,
      permissions: permissionStore(),
      accessAdministration: {
        async replacePrincipalAccess(
          targetPrincipalId,
          roles,
          overrides,
          audit,
          constraints,
        ) {
          accessInput = {
            targetPrincipalId,
            roles,
            overrides,
            audit,
            constraints,
          };
          return {
            roleIds: roles,
            grants: overrides.grants,
            revokes: overrides.revokes,
          };
        },
      },
      trainerIdentityLinks: {
        async bindTrainer(input) {
          bindInput = input;
          return {
            identityId: input.identityId,
            username: "trainer.a",
            displayName: "Trainer A",
            trainerId: input.trainerId,
          };
        },
      },
    });

    await expect(
      service.createTrainerUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "trainer.a",
        displayName: "Trainer A",
        temporaryPassword: "temporary-value-123",
        trainerId: "trainer-1",
      }),
    ).resolves.toEqual({
      identityId: "identity-1",
      username: "trainer.a",
      displayName: "Trainer A",
      trainerId: "trainer-1",
      mustChangePassword: true,
    });

    expect(identityInput).toEqual({
      input: {
        username: "trainer.a",
        displayName: "Trainer A",
        temporaryPassword: "temporary-value-123",
      },
      provisioningAudit: {
        provisioningOwner: "ulc-linz:trainer-user",
        actorPrincipalId: "admin-1",
        reason: "ULC Linz trainer user provisioning",
      },
    });
    expect(bindInput).toEqual({
      organizationId: "verein-1",
      actorPrincipalId: "admin-1",
      identityId: "identity-1",
      trainerId: "trainer-1",
    });
    expect(accessInput).toEqual({
      targetPrincipalId: principalId("identity-1"),
      roles: [roleId("ulc-linz:trainer")],
      overrides: {
        grants: [
          capabilityId("ulc-linz:module:kindertraining:edit"),
          capabilityId("ulc-linz:module:kindertraining:view"),
        ],
        revokes: [],
      },
      audit: {
        actorPrincipalId: principalId("admin-1"),
        reason: "ULC Linz trainer user provisioning",
      },
      constraints: {
        expectedRoleIds: [],
        expectedGrants: [],
        expectedRevokes: [],
      },
    });
    expect(
      sqlCalls.some((query) =>
        query.includes("ON CONFLICT (identity_id) DO NOTHING"),
      ),
    ).toBe(true);
  });

  it("is idempotent after the trainer link and permission state already match", async () => {
    let bindCalls = 0;
    let accessCalls = 0;
    const service = createUlcLinzTrainerUserProvisioningService({
      identityProvisioning: {
        async createInitialUser() {
          return identityState();
        },
      },
      sql: {
        async unsafe(query: string) {
          if (query.includes("INSERT INTO ulc_linz_membership")) {
            return [];
          }
          if (query.includes("AS identity_exists")) {
            return [
              {
                identity_exists: true,
                trainer_exists: true,
                organization_id: "verein-1",
                subject_id: "trainer-1",
                source_role: "trainer",
                active: true,
              },
            ];
          }
          if (query.includes("INSERT INTO appbasis_permission_principal")) {
            return [];
          }
          throw new Error("unexpected SQL");
        },
      },
      permissions: permissionStore(
        ["ulc-linz:trainer"],
        [
          "ulc-linz:module:kindertraining:edit",
          "ulc-linz:module:kindertraining:view",
        ],
      ),
      accessAdministration: {
        async replacePrincipalAccess() {
          accessCalls += 1;
          throw new Error("matching access must not be rewritten");
        },
      },
      trainerIdentityLinks: {
        async bindTrainer() {
          bindCalls += 1;
          throw new Error("matching trainer link must not be rewritten");
        },
      },
    });

    await expect(
      service.createTrainerUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "trainer.a",
        displayName: "Trainer A",
        temporaryPassword: "temporary-value-123",
        trainerId: "trainer-1",
      }),
    ).resolves.toMatchObject({
      identityId: "identity-1",
      trainerId: "trainer-1",
    });
    expect(bindCalls).toBe(0);
    expect(accessCalls).toBe(0);
  });

  it("does not overwrite an existing non-trainer permission role", async () => {
    const service = createUlcLinzTrainerUserProvisioningService({
      identityProvisioning: {
        async createInitialUser() {
          return identityState();
        },
      },
      sql: {
        async unsafe(query: string) {
          if (query.includes("INSERT INTO ulc_linz_membership")) {
            return [];
          }
          if (query.includes("AS identity_exists")) {
            return [
              {
                identity_exists: true,
                trainer_exists: true,
                organization_id: "verein-1",
                subject_id: "trainer-1",
                source_role: "trainer",
                active: true,
              },
            ];
          }
          return [];
        },
      },
      permissions: permissionStore(["ulc-linz:admin"]),
      accessAdministration: {
        async replacePrincipalAccess() {
          throw new Error("conflicting access must not be overwritten");
        },
      },
      trainerIdentityLinks: {
        async bindTrainer(input) {
          return {
            identityId: input.identityId,
            username: "trainer.a",
            displayName: "Trainer A",
            trainerId: input.trainerId,
          };
        },
      },
    });

    await expect(
      service.createTrainerUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "trainer.a",
        displayName: "Trainer A",
        temporaryPassword: "temporary-value-123",
        trainerId: "trainer-1",
      }),
    ).rejects.toBeInstanceOf(UlcLinzTrainerUserProvisioningConflictError);
  });
});
