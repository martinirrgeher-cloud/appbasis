import {
  assertIdentityActionAllowed,
  type CurrentIdentity,
} from "@appbasis/identity";
import {
  can,
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";

type UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;
export type UlcLinzModuleAction = "view" | "edit";
export type UlcLinzSubjectRelation = "self" | "managed";

export interface UlcLinzMembershipResolution {
  organizationId: string;
  sourceRole: string;
  active: boolean;
}

export interface UlcLinzMembershipResolver {
  resolveMembership(input: {
    identityId: string;
    organizationId: string;
  }): Promise<UlcLinzMembershipResolution | null>;
}

export interface UlcLinzSubjectScopeResolver {
  hasRelation(input: {
    identityId: string;
    organizationId: string;
    subjectId: string;
    relationType: UlcLinzSubjectRelation;
  }): Promise<boolean>;
}

export interface UlcLinzAuthorizationDependencies {
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
}

export type UlcLinzModuleAccessRequest = {
  organizationId: string;
  moduleKey: string;
  action: UlcLinzModuleAction;
} & (
  | { scope: "organization" }
  | { scope: "subject"; subjectId: string }
);

export class UlcLinzAuthorizationDeniedError extends Error {
  readonly code = "ULC_LINZ_ACCESS_DENIED";

  constructor() {
    super("ULC Linz access denied.");
    this.name = "UlcLinzAuthorizationDeniedError";
  }
}

export async function assertUlcLinzModuleAccess(
  current: CurrentIdentity,
  dependencies: UlcLinzAuthorizationDependencies,
  request: UlcLinzModuleAccessRequest,
): Promise<void> {
  assertCanonicalRuntimePolicy();
  assertIdentityActionAllowed(current, "application");

  const identityId = requiredIdentifier(current.identity.identityId);
  const organizationId = requiredIdentifier(request.organizationId);
  const moduleKey = requiredIdentifier(request.moduleKey);
  if (request.action !== "view" && request.action !== "edit") deny();

  const membership = await dependencies.memberships.resolveMembership({
    identityId,
    organizationId,
  });
  if (
    membership === null ||
    membership.active !== true ||
    membership.organizationId !== organizationId ||
    !isSourceRole(membership.sourceRole)
  ) {
    deny();
  }

  const expectedRoleId = roleDataScope.runtimeRoleIds[membership.sourceRole];
  const currentPrincipalId = principalId(identityId);
  const principal = await dependencies.permissions.findPrincipal(currentPrincipalId);
  if (
    principal === null ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== roleId(expectedRoleId)
  ) {
    deny();
  }

  const mapping = roleDataScope.principalPermissionMapping;
  const action = request.action === "view" ? mapping.viewAction : mapping.editAction;
  const allowed = await can(dependencies.permissions, {
    principalId: currentPrincipalId,
    capability: capabilityId(`${mapping.capabilityNamespace}:${moduleKey}:${action}`),
  });
  if (!allowed) deny();

  if (request.scope === "organization") {
    if (membership.sourceRole === "athlete" || membership.sourceRole === "parent") {
      deny();
    }
    return;
  }

  const subjectId = requiredIdentifier(request.subjectId);
  if (membership.sourceRole === "athlete") {
    const related = await dependencies.subjectScopes.hasRelation({
      identityId,
      organizationId,
      subjectId,
      relationType: "self",
    });
    if (!related) deny();
  } else if (membership.sourceRole === "parent") {
    const related = await dependencies.subjectScopes.hasRelation({
      identityId,
      organizationId,
      subjectId,
      relationType: "managed",
    });
    if (!related) deny();
  }
}

function assertCanonicalRuntimePolicy(): void {
  if (
    roleDataScope.id !== "ulc-linz-role-data-scope-v0.1" ||
    roleDataScope.dataScopes.organizationBoundary !== "same-organization-only" ||
    roleDataScope.dataScopes.inactiveMembership !== "deny" ||
    roleDataScope.dataScopes.unknownCapability !== "deny" ||
    roleDataScope.dataScopes.athleteLink.relationType !== "self" ||
    roleDataScope.dataScopes.athleteLink.explicitLinksOnly !== true ||
    roleDataScope.dataScopes.parentLink.relationType !== "managed" ||
    roleDataScope.dataScopes.parentLink.explicitLinksOnly !== true ||
    roleDataScope.principalPermissionMapping.targetMechanism !==
      "principal-grants-revokes" ||
    roleDataScope.principalPermissionMapping.unknownModule !== "deny"
  ) {
    throw new Error("ULC Linz runtime authorization policy is not canonical.");
  }
}

function isSourceRole(value: string): value is UlcLinzSourceRole {
  return Object.hasOwn(roleDataScope.runtimeRoleIds, value);
}

function requiredIdentifier(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) deny();
  return value;
}

function deny(): never {
  throw new UlcLinzAuthorizationDeniedError();
}
