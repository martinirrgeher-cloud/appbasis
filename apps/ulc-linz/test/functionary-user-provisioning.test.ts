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

function setup({
  ready = true, membership = true, existingMembership = null, principalState = null,
}: {
  ready?: boolean;
  membership?: boolean;
  existingMembership?: Readonly<{
    organization_id: string; subject_id: string;
    source_role: string; active: boolean;
  }> | null;
  principalState?: Readonly<{
    roleIds: readonly string[]; grants: readonly string[]; revokes: readonly string[];
  }> | null;
} = {}) {
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
      if (query.includes("FROM ulc_linz_membership AS membership")) {
        return existingMembership === null ? [] : [{
          identity_id: USER, ...existingMembership,
        }];
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
      roleIds: principalState?.roleIds ?? [],
      grants: principalState?.grants ?? [],
      revokes: principalState?.revokes ?? [],
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

  it("reconciles a valid existing membership after an interrupted permission write", async () => {
    const { svc, replacePrincipalAccess, sqlCalls, createInitialUser } = setup({
      membership: false,
      existingMembership: {
        organization_id: ORG, subject_id: "ulc-functionary:" + USER,
        source_role: "functionary", active: true,
      },
    });
    await expect(svc.createFunctionaryUser(input)).resolves.toMatchObject({
      identityId: USER, mustChangePassword: true,
    });
    expect(createInitialUser).toHaveBeenCalledOnce();
    expect(sqlCalls.some(x => x.sql.includes("FROM ulc_linz_membership AS membership"))).toBe(true);
    expect(replacePrincipalAccess).toHaveBeenCalledOnce();
  });

  it("refuses existing memberships with a different organization, identity scope, role or lifecycle state", async () => {
    const canonical = {
      organization_id: ORG, subject_id: "ulc-functionary:" + USER,
      source_role: "functionary", active: true,
    };
    for (const invalid of [
      { ...canonical, organization_id: "other-organization" },
      { ...canonical, subject_id: "athlete-other" },
      { ...canonical, source_role: "trainer" },
      { ...canonical, active: false },
    ]) {
      const { svc, replacePrincipalAccess } = setup({
        membership: false, existingMembership: invalid,
      });
      await expect(svc.createFunctionaryUser(input)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(replacePrincipalAccess).not.toHaveBeenCalled();
    }
  });

  it("accepts exactly provisioned role state on idempotent retry without another write", async () => {
    const { default: roleDataScope } = await import("../worker/role-data-scope.json");
    const expectedGrants = roleDataScope.permissionTemplates.functionary.view.map(
      key => "ulc-linz:module:" + key + ":view",
    );
    const { svc, replacePrincipalAccess } = setup({
      membership: false,
      existingMembership: {
        organization_id: ORG, subject_id: "ulc-functionary:" + USER,
        source_role: "functionary", active: true,
      },
      principalState: {
        roleIds: ["ulc-linz:functionary"],
        grants: expectedGrants,
        revokes: [],
      },
    });
    await expect(svc.createFunctionaryUser(input)).resolves.toMatchObject({
      identityId: USER,
    });
    expect(replacePrincipalAccess).not.toHaveBeenCalled();
  });

  it("refuses pre-existing privileged or extra module access during retry", async () => {
    for (const principalState of [
      { roleIds: ["ulc-linz:admin"], grants: [], revokes: [] },
      { roleIds: ["ulc-linz:functionary"], grants: ["ulc-linz:module:user_management:edit"], revokes: [] },
      { roleIds: ["ulc-linz:functionary"], grants: [], revokes: ["ulc-linz:module:athletes:view"] },
    ]) {
      const { svc, replacePrincipalAccess } = setup({
        principalState,
        membership: false,
        existingMembership: {
          organization_id: ORG, subject_id: "ulc-functionary:" + USER,
          source_role: "functionary", active: true,
        },
      });
      await expect(svc.createFunctionaryUser(input)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(replacePrincipalAccess).not.toHaveBeenCalled();
    }
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
