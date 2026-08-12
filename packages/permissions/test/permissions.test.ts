import { describe, expect, it } from "vitest";

import {
  DEMO_CAPABILITIES,
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  InMemoryPermissionStore,
  PermissionDeniedError,
  assert,
  can,
  capabilityId,
  principalId,
  roleId,
  type PrincipalPermissions,
} from "../src";

const memberId = principalId("principal:member");
const adminId = principalId("principal:admin");

function principal(
  input: Partial<Omit<PrincipalPermissions, "principalId">> & {
    principalId: PrincipalPermissions["principalId"];
  },
): PrincipalPermissions {
  return {
    principalId: input.principalId,
    roleIds: input.roleIds ?? [],
    grants: input.grants ?? [],
    revokes: input.revokes ?? [],
  };
}

function storeWith(principals: readonly PrincipalPermissions[]) {
  return new InMemoryPermissionStore({
    knownCapabilities: DEMO_KNOWN_CAPABILITIES,
    roles: DEMO_ROLE_BUNDLES,
    principals,
  });
}

describe("minimal permissions core", () => {
  it("expresses member and admin demo access with AppBasis-owned roles", async () => {
    const store = storeWith([
      principal({ principalId: memberId, roleIds: [DEMO_ROLES.member] }),
      principal({ principalId: adminId, roleIds: [DEMO_ROLES.admin] }),
    ]);

    await expect(
      can(store, { principalId: memberId, capability: DEMO_CAPABILITIES.tasksManage }),
    ).resolves.toBe(true);
    await expect(
      can(store, { principalId: memberId, capability: DEMO_CAPABILITIES.usersManage }),
    ).resolves.toBe(false);
    await expect(
      can(store, { principalId: adminId, capability: DEMO_CAPABILITIES.usersManage }),
    ).resolves.toBe(true);
  });

  it("denies unknown principals, capabilities and roles by default", async () => {
    const unknownRolePrincipal = principalId("principal:unknown-role");
    const store = storeWith([
      principal({ principalId: unknownRolePrincipal, roleIds: [roleId("role:unknown")] }),
    ]);

    await expect(
      can(store, {
        principalId: principalId("principal:missing"),
        capability: DEMO_CAPABILITIES.appUse,
      }),
    ).resolves.toBe(false);
    await expect(
      can(store, {
        principalId: unknownRolePrincipal,
        capability: capabilityId("capability:unknown"),
      }),
    ).resolves.toBe(false);
    await expect(
      can(store, {
        principalId: unknownRolePrincipal,
        capability: DEMO_CAPABILITIES.appUse,
      }),
    ).resolves.toBe(false);
  });

  it("allows an explicit grant for a known capability", async () => {
    const store = storeWith([
      principal({
        principalId: memberId,
        roleIds: [DEMO_ROLES.member],
        grants: [DEMO_CAPABILITIES.usersManage],
      }),
    ]);

    await expect(
      can(store, { principalId: memberId, capability: DEMO_CAPABILITIES.usersManage }),
    ).resolves.toBe(true);
  });

  it("treats an explicit revoke as authoritative over roles and grants", async () => {
    const store = storeWith([
      principal({
        principalId: adminId,
        roleIds: [DEMO_ROLES.admin],
        grants: [DEMO_CAPABILITIES.usersManage],
        revokes: [DEMO_CAPABILITIES.usersManage],
      }),
    ]);

    await expect(
      can(store, { principalId: adminId, capability: DEMO_CAPABILITIES.usersManage }),
    ).resolves.toBe(false);
  });

  it("assert throws a focused PermissionDeniedError", async () => {
    const store = storeWith([
      principal({ principalId: memberId, roleIds: [DEMO_ROLES.member] }),
    ]);

    await expect(
      assert(store, { principalId: memberId, capability: DEMO_CAPABILITIES.usersManage }),
    ).rejects.toMatchObject({
      name: "PermissionDeniedError",
      code: "PERMISSION_DENIED",
      principalId: memberId,
      capability: DEMO_CAPABILITIES.usersManage,
    } satisfies Partial<PermissionDeniedError>);
  });
});
