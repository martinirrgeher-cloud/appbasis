import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import {
  can,
  capabilityId,
  principalId,
  roleId,
  type PermissionStore,
} from "@appbasis/permissions";

import roleDataScope from "./role-data-scope.json";
import {
  recordUlcLinzSecurityEvent,
  type UlcLinzAuthorizationDenyReason,
  type UlcLinzSecurityEventLogger,
} from "./security-events";

type UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;
export type UlcLinzCurrentIdentity = Parameters<typeof assertIdentityActionAllowed>[0];
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
  securityEvents?: UlcLinzSecurityEventLogger;
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
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzAuthorizationDependencies,
  request: UlcLinzModuleAccessRequest,
): Promise<void> {
  assertCanonicalRuntimePolicy();
  try {
    assertIdentityActionAllowed(current, "application");
  } catch (error) {
    recordAuthorizationDenial(
      dependencies.securityEvents,
      current,
      "identity-access-denied",
    );
    throw error;
  }

  const identityId = requiredIdentifier(current.identity.identityId, () =>
    deny(dependencies.securityEvents, current, "invalid-request"),
  );
  const organizationId = requiredIdentifier(request.organizationId, () =>
    deny(dependencies.securityEvents, current, "invalid-request"),
  );
  const moduleKey = requiredIdentifier(request.moduleKey, () =>
    deny(dependencies.securityEvents, current, "invalid-request"),
  );
  if (request.action !== "view" && request.action !== "edit") {
    deny(dependencies.securityEvents, current, "invalid-request");
  }

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
    deny(dependencies.securityEvents, current, "membership-denied");
  }

  const expectedRoleId = roleDataScope.runtimeRoleIds[membership.sourceRole];
  const currentPrincipalId = principalId(identityId);
  const principal = await dependencies.permissions.findPrincipal(currentPrincipalId);
  if (
    principal === null ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== roleId(expectedRoleId)
  ) {
    deny(dependencies.securityEvents, current, "role-mismatch");
  }

  const mapping = roleDataScope.principalPermissionMapping;
  const action = request.action === "view" ? mapping.viewAction : mapping.editAction;
  const allowed = await can(dependencies.permissions, {
    principalId: currentPrincipalId,
    capability: capabilityId(`${mapping.capabilityNamespace}:${moduleKey}:${action}`),
  });
  if (!allowed) {
    deny(dependencies.securityEvents, current, "capability-denied");
  }

  if (request.scope === "organization") {
    if (membership.sourceRole === "athlete" || membership.sourceRole === "parent") {
      deny(dependencies.securityEvents, current, "scope-denied");
    }
    return;
  }

  const subjectId = requiredIdentifier(request.subjectId, () =>
    deny(dependencies.securityEvents, current, "invalid-request"),
  );
  if (membership.sourceRole === "athlete") {
    const related = await dependencies.subjectScopes.hasRelation({
      identityId,
      organizationId,
      subjectId,
      relationType: "self",
    });
    if (!related) {
      deny(dependencies.securityEvents, current, "subject-relation-denied");
    }
  } else if (membership.sourceRole === "parent") {
    const related = await dependencies.subjectScopes.hasRelation({
      identityId,
      organizationId,
      subjectId,
      relationType: "managed",
    });
    if (!related) {
      deny(dependencies.securityEvents, current, "subject-relation-denied");
    }
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

function requiredIdentifier(value: string, onInvalid: () => never): string {
  if (typeof value !== "string" || value.trim().length === 0) onInvalid();
  return value;
}

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  current: UlcLinzCurrentIdentity,
  reasonCode: UlcLinzAuthorizationDenyReason,
): never {
  recordAuthorizationDenial(securityEvents, current, reasonCode);
  throw new UlcLinzAuthorizationDeniedError();
}

function recordAuthorizationDenial(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  current: UlcLinzCurrentIdentity,
  reasonCode: UlcLinzAuthorizationDenyReason,
): void {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: safeIdentifier(current.identity.identityId),
    reasonCode,
  });
}

function safeIdentifier(value: unknown): string | null {
  return typeof value === "string" && value.trim().length !== 0 ? value : null;
}
