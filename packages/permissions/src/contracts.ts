declare const principalIdBrand: unique symbol;
declare const capabilityIdBrand: unique symbol;
declare const roleIdBrand: unique symbol;

export type PrincipalId = string & { readonly [principalIdBrand]: "PrincipalId" };
export type CapabilityId = string & { readonly [capabilityIdBrand]: "CapabilityId" };
export type RoleId = string & { readonly [roleIdBrand]: "RoleId" };
export type RoleState = "active" | "inactive";
export type RoleKind = "system" | "managed";

export const principalId = (value: string): PrincipalId => value as PrincipalId;
export const capabilityId = (value: string): CapabilityId => value as CapabilityId;
export const roleId = (value: string): RoleId => value as RoleId;

export interface RoleBundle {
  roleId: RoleId;
  capabilities: readonly CapabilityId[];
}

export interface RoleDetails extends RoleBundle {
  displayName: string;
  description: string | null;
  state: RoleState;
  kind: RoleKind;
  assignedPrincipalCount: number;
}

export interface PrincipalPermissions {
  principalId: PrincipalId;
  roleIds: readonly RoleId[];
  grants: readonly CapabilityId[];
  revokes: readonly CapabilityId[];
}

export interface PermissionRequest {
  principalId: PrincipalId;
  capability: CapabilityId;
}

export interface PermissionStore {
  findPrincipal(principalId: PrincipalId): Promise<PrincipalPermissions | null>;
  findRole(roleId: RoleId): Promise<RoleBundle | null>;
  isKnownCapability(capability: CapabilityId): Promise<boolean>;
  evaluatePermission?(request: PermissionRequest): Promise<boolean>;
}
