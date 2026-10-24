import { describe, expect, it } from "vitest";

import type { IdentityPostgresProvisioningOwner } from "@appbasis/identity/postgres-runtime";
import {
  capabilityId,
  InMemoryPermissionStore,
  principalId,
  roleId,
  type PermissionStore,
} from "@appbasis/permissions";

import {
  createUlcLinzAthleteUserProvisioningService,
  UlcLinzAthleteUserProvisioningConflictError,
} from "../worker/athlete-user-provisioning";
import { createUlcLinzSelfRegistrationAccessService } from "../worker/self-registration-access";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

function identityState(identityId = "identity-athlete-1") {
  return {
    identityId,
    username: "athlete.a",
    displayName: "Athlete A",
    contactEmail: null,
    personId: null,
    mustChangePassword: true,
    createdAt: new Date("2026-10-24T00:00:00.000Z"),
    updatedAt: new Date("2026-10-24T00:00:00.000Z"),
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

describe("ULC athlete user provisioning", () => {
  it("creates an athlete identity, binds exactly that athlete and grants only self-registration access", async () => {
    let identityInput: unknown = null;
    let accessInput: unknown = null;
    const identityProvisioning: IdentityPostgresProvisioningOwner = {
      async createInitialUser(input, provisioningAudit) {
        identityInput = { input, provisioningAudit };
        return identityState();
      },
    };
    let selfRelationPresent = false;
    const sql = {
      async unsafe(query: string) {
        if (query.includes("INSERT INTO ulc_linz_membership")) {
          return [
            {
              organization_id: "verein-1",
              subject_id: "athlete-1",
              source_role: "athlete",
              active: true,
            },
          ];
        }
        if (query.includes("INSERT INTO ulc_linz_subject_scope")) {
          selfRelationPresent = true;
          return [];
        }
        if (
          query.includes(
            "SELECT organization_id, subject_id, relation_type",
          )
        ) {
          return selfRelationPresent
            ? [
                {
                  organization_id: "verein-1",
                  subject_id: "athlete-1",
                  relation_type: "self",
                },
              ]
            : [];
        }
        if (query.includes("INSERT INTO appbasis_permission_principal")) {
          return [];
        }
        if (
          query.includes("membership.subject_id AS athlete_id") &&
          query.includes("athlete.is_active AS athlete_active")
        ) {
          return [
            {
              organization_id: "verein-1",
              athlete_id: "athlete-1",
              source_role: "athlete",
              active: true,
              athlete_active: true,
            },
          ];
        }
        if (
          query.includes(
            "SELECT organization_id, source_role, active",
          )
        ) {
          return [
            {
              organization_id: "verein-1",
              source_role: "athlete",
              active: true,
            },
          ];
        }
        if (query.includes("SELECT 1 AS present")) {
          return selfRelationPresent ? [{ present: 1 }] : [];
        }
        throw new Error("unexpected SQL");
      },
    };
    const service = createUlcLinzAthleteUserProvisioningService({
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
    });

    await expect(
      service.createAthleteUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "athlete.a",
        displayName: "Athlete A",
        temporaryPassword: "temporary-value-123",
        athleteId: "athlete-1",
      }),
    ).resolves.toEqual({
      identityId: "identity-athlete-1",
      username: "athlete.a",
      displayName: "Athlete A",
      athleteId: "athlete-1",
      mustChangePassword: true,
    });

    expect(identityInput).toEqual({
      input: {
        username: "athlete.a",
        displayName: "Athlete A",
        temporaryPassword: "temporary-value-123",
      },
      provisioningAudit: {
        provisioningOwner: "ulc-linz:athlete-user",
        actorPrincipalId: "admin-1",
        reason: "ULC Linz athlete user provisioning",
      },
    });
    expect(accessInput).toEqual({
      targetPrincipalId: principalId("identity-athlete-1"),
      roles: [roleId("ulc-linz:athlete")],
      overrides: {
        grants: [
          capabilityId("ulc-linz:module:kindertraining:edit"),
          capabilityId("ulc-linz:module:kindertraining:view"),
        ],
        revokes: [],
      },
      audit: {
        actorPrincipalId: principalId("admin-1"),
        reason: "ULC Linz athlete user provisioning",
      },
      constraints: {
        expectedRoleIds: [],
        expectedGrants: [],
        expectedRevokes: [],
      },
    });

    const view = capabilityId("ulc-linz:module:kindertraining:view");
    const edit = capabilityId("ulc-linz:module:kindertraining:edit");
    const scopePersistence = new PostgresUlcLinzScopePersistence(sql);
    const selfRegistrationAccess =
      createUlcLinzSelfRegistrationAccessService({
        sql,
        permissions: new InMemoryPermissionStore({
          knownCapabilities: [view, edit],
          roles: [
            {
              roleId: roleId("ulc-linz:athlete"),
              capabilities: [],
            },
          ],
          principals: [
            {
              principalId: principalId("identity-athlete-1"),
              roleIds: [roleId("ulc-linz:athlete")],
              grants: [view, edit],
              revokes: [],
            },
          ],
        }),
        memberships: scopePersistence,
        subjectScopes: scopePersistence,
      });

    const current = {
      identity: {
        identityId: "identity-athlete-1",
        username: "athlete.a",
        displayName: "Athlete A",
        contactEmail: null,
        personId: null,
        mustChangePassword: false,
        createdAt: new Date("2026-10-24T00:00:00.000Z"),
        updatedAt: new Date("2026-10-24T00:00:00.000Z"),
        passwordChangedAt: new Date("2026-10-24T00:05:00.000Z"),
        disabledAt: null,
        accountStatus: "active" as const,
      },
      sessionToken: "session-athlete-1",
      access: "full" as const,
    };

    await expect(
      selfRegistrationAccess.assertViewAccess(current),
    ).resolves.toEqual({
      organizationId: "verein-1",
      actorPrincipalId: "identity-athlete-1",
      athleteId: "athlete-1",
    });
      },
    });
  });

  it("fails closed when the athlete is already linked to another identity", async () => {
    const service = createUlcLinzAthleteUserProvisioningService({
      identityProvisioning: {
        async createInitialUser() {
          return identityState();
        },
      },
      sql: {
        async unsafe(query: string) {
          if (query.includes("INSERT INTO ulc_linz_membership")) {
            throw {
              code: "23505",
              constraint_name: "ulc_linz_membership_subject_id_unique",
            };
          }
          return [];
        },
      },
      permissions: permissionStore(),
      accessAdministration: {
        async replacePrincipalAccess() {
          throw new Error("must not reach permissions");
        },
      },
    });

    await expect(
      service.createAthleteUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "athlete.a",
        displayName: "Athlete A",
        temporaryPassword: "temporary-value-123",
        athleteId: "athlete-1",
      }),
    ).rejects.toBeInstanceOf(UlcLinzAthleteUserProvisioningConflictError);
  });

  it("does not overwrite an existing non-athlete permission role", async () => {
    const service = createUlcLinzAthleteUserProvisioningService({
      identityProvisioning: {
        async createInitialUser() {
          return identityState();
        },
      },
      sql: {
        async unsafe(query: string) {
          if (query.includes("INSERT INTO ulc_linz_membership")) {
            return [
              {
                organization_id: "verein-1",
                subject_id: "athlete-1",
                source_role: "athlete",
                active: true,
              },
            ];
          }
          if (query.includes("INSERT INTO ulc_linz_subject_scope")) {
            return [];
          }
          if (
            query.includes(
              "SELECT organization_id, subject_id, relation_type",
            )
          ) {
            return [
              {
                organization_id: "verein-1",
                subject_id: "athlete-1",
                relation_type: "self",
              },
            ];
          }
          if (query.includes("INSERT INTO appbasis_permission_principal")) {
            return [];
          }
          throw new Error("unexpected SQL");
        },
      },
      permissions: permissionStore(["ulc-linz:admin"]),
      accessAdministration: {
        async replacePrincipalAccess() {
          throw new Error("conflicting access must not be overwritten");
        },
      },
    });

    await expect(
      service.createAthleteUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "athlete.a",
        displayName: "Athlete A",
        temporaryPassword: "temporary-value-123",
        athleteId: "athlete-1",
      }),
    ).rejects.toBeInstanceOf(UlcLinzAthleteUserProvisioningConflictError);
  });
});
