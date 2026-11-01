import { describe, expect, it, vi } from "vitest";
import type { IdentityPostgresProvisioningOwner } from "@appbasis/identity/postgres-runtime";
import type { PermissionStore, PostgresPrincipalAccessAdministration } from "@appbasis/permissions";
import {
  createUlcFunctionaryUserProvisioningService,
  type UlcFunctionarySql,
} from "../worker/functionary-user-provisioning";

const ORG = "ulc-linz-preview";
const ADMIN = "identity-admin";
const USER = "identity-functionary";

function setup({ ready = true, membership = true } = {}) {
  const sqlCalls: { sql: string; params: unknown[] | undefined }[] = [];
  const sql: UlcFunctionarySql = {
    async unsafe(query, params) {
      sqlCalls.push({ sql: query, params });
      if (query.includes("role_ready")) return [{
        role_ready: ready,
        membership_ready: ready,
      }];
      if (query.includes("INSERT INTO ulc_linz_membership")) {
        return membership ? [{
          identity_id: USER,
          organization_id: ORG,
          subject_id: "ulc-functionary:" + USER,
          source_role: "functionary",
          active: true,
        }] : [];
      }
      if (query.includes("INSERT INTO appbasis_permission_principal")) {
        return [{ principal_id: USER }];
      }
      throw new Error("Unexpected SQL: " + query);
    },
  };
  const createInitialUser = vi.fn(async () => ({
    identityId: USER,
    username: "verein.funktionaer",
    displayName: "Test Funktionär",
    accountStatus: "active",
    mustChangePassword: true,
  }));
  const permissions = {
    findPrincipal: vi.fn(async () => ({
      principalId: USER,
      roleIds: [],
      grants: [],
      revokes: [],
    })),
  } as unknown as PermissionStore;
  const replacePrincipalAccess = vi.fn(async (
    _principal: unknown, roles: readonly string[],
    overrides: { grants: readonly string[]; revokes: readonly string[] },
    _audit: { actorPrincipalId: string; reason: string },
    _constraints: {
      expectedRoleIds: readonly string[];
      expectedGrants: readonly string[];
      expectedRevokes: readonly string[];
    },
  ) => ({ roleIds: roles, grants: overrides.grants, revokes: overrides.revokes }));
  const svc = createUlcFunctionaryUserProvisioningService({
    identityProvisioning: { createInitialUser } as unknown as IdentityPostgresProvisioningOwner,
    sql, permissions,
    accessAdministration: { replacePrincipalAccess } as unknown as Pick<
      PostgresPrincipalAccessAdministration, "replacePrincipalAccess"
    >,
  });
  return { svc, createInitialUser, replacePrincipalAccess, sqlCalls };
}

const input = {
  organizationId: ORG,
  actorPrincipalId: ADMIN,
  username: "verein.funktionaer",
  displayName: "Test Funktionär",
  temporaryPassword: "Temporary-Password-2026",
};

describe("ULC independent native functionary account", () => {
  it("fails closed before creating credentials when preview migration or role is missing", async () => {
    const { svc, createInitialUser, replacePrincipalAccess, sqlCalls } = setup({ ready: false });
    await expect(svc.createFunctionaryUser(input)).rejects.toMatchObject({ code: "NOT_READY" });
    expect(createInitialUser).not.toHaveBeenCalled();
    expect(replacePrincipalAccess).not.toHaveBeenCalled();
    expect(sqlCalls).toHaveLength(1);
    expect(sqlCalls[0]!.sql).toContain("pg_catalog.pg_constraint");
  });

  it("creates a separate functionary membership and grants only bounded view capabilities", async () => {
    const { svc, createInitialUser, replacePrincipalAccess, sqlCalls } = setup();
    await expect(svc.createFunctionaryUser(input)).resolves.toMatchObject({
      identityId: USER,
      username: "verein.funktionaer",
      mustChangePassword: true,
    });
    expect(createInitialUser).toHaveBeenCalledWith(
      expect.objectContaining({ username: input.username, temporaryPassword: input.temporaryPassword }),
      expect.objectContaining({
        provisioningOwner: "ulc-linz:functionary-user",
        actorPrincipalId: ADMIN,
      }),
    );
    const membership = sqlCalls.find(x => x.sql.includes("INSERT INTO ulc_linz_membership"));
    expect(membership?.params).toEqual([USER, ORG, "ulc-functionary:" + USER]);
    expect(membership?.sql).toContain("'functionary', true");
    expect(membership?.sql).not.toContain("appbasis_trainer");
    expect(replacePrincipalAccess).toHaveBeenCalledOnce();
    const [principal, roles, overrides, audit, constraints] = replacePrincipalAccess.mock.calls[0]!;
    expect(principal).toBe(USER);
    expect(roles).toEqual(["ulc-linz:functionary"]);
    expect(overrides.revokes).toEqual([]);
    expect(overrides.grants).toContain("ulc-linz:module:athletes:view");
    expect(overrides.grants).toContain("ulc-linz:module:training_blocks:view");
    expect(overrides.grants.every((cap: string) => cap.endsWith(":view"))).toBe(true);
    expect(JSON.stringify(overrides)).not.toContain("user_management");
    expect(JSON.stringify(overrides)).not.toContain("admin");
    expect(audit).toMatchObject({ actorPrincipalId: ADMIN });
    expect(constraints).toMatchObject({ expectedRoleIds: [], expectedGrants: [], expectedRevokes: [] });
    expect(JSON.stringify(sqlCalls)).not.toContain(input.temporaryPassword);
  });

  it("rejects inconsistent membership rather than granting an unscoped role", async () => {
    const { svc, replacePrincipalAccess } = setup({ membership: false });
    await expect(svc.createFunctionaryUser(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(replacePrincipalAccess).not.toHaveBeenCalled();
  });

  it("uses only source-controlled permission templates for functionaries", async () => {
    const { ULC_PERMISSION_PRESETS, ULC_PERMISSION_EDITABLE_BY_ROLE } =
      await import("../worker/user-admin-permission-profiles");
    const profiles = ULC_PERMISSION_PRESETS.filter(p => p.sourceRole === "functionary");
    expect(profiles.map(x => x.name)).toEqual(["Funktionär"]);
    expect(profiles[0]?.modules.filter(x => x.level === "edit")).toEqual([]);
    expect(ULC_PERMISSION_EDITABLE_BY_ROLE.functionary).not.toContain("kindertraining");
    expect(ULC_PERMISSION_EDITABLE_BY_ROLE.functionary).not.toContain("u12");
  });
});
