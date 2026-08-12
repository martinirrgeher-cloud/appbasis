import type {
  CapabilityId,
  PermissionStore,
  PrincipalId,
  PrincipalPermissions,
  RoleBundle,
  RoleId,
} from "./contracts";

export interface InMemoryPermissionStoreInput {
  knownCapabilities: readonly CapabilityId[];
  roles?: readonly RoleBundle[];
  principals?: readonly PrincipalPermissions[];
}

export class InMemoryPermissionStore implements PermissionStore {
  private readonly knownCapabilities: Set<CapabilityId>;
  private readonly roles: Map<RoleId, RoleBundle>;
  private readonly principals: Map<PrincipalId, PrincipalPermissions>;

  constructor(input: InMemoryPermissionStoreInput) {
    this.knownCapabilities = new Set(input.knownCapabilities);
    this.roles = new Map(
      (input.roles ?? []).map((role) => [role.roleId, copyRole(role)]),
    );
    this.principals = new Map(
      (input.principals ?? []).map((principal) => [
        principal.principalId,
        copyPrincipal(principal),
      ]),
    );
  }

  async findPrincipal(id: PrincipalId): Promise<PrincipalPermissions | null> {
    const principal = this.principals.get(id);
    return principal === undefined ? null : copyPrincipal(principal);
  }

  async findRole(id: RoleId): Promise<RoleBundle | null> {
    const role = this.roles.get(id);
    return role === undefined ? null : copyRole(role);
  }

  async isKnownCapability(capability: CapabilityId): Promise<boolean> {
    return this.knownCapabilities.has(capability);
  }
}

function copyRole(role: RoleBundle): RoleBundle {
  return {
    roleId: role.roleId,
    capabilities: [...role.capabilities],
  };
}

function copyPrincipal(principal: PrincipalPermissions): PrincipalPermissions {
  return {
    principalId: principal.principalId,
    roleIds: [...principal.roleIds],
    grants: [...principal.grants],
    revokes: [...principal.revokes],
  };
}
