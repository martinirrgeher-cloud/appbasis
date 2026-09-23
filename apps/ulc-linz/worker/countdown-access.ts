import { COUNTDOWN_CAPABILITIES } from "@appbasis/countdown";
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
import type { UlcLinzCurrentIdentity } from "./authorization";

type UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;

export interface UlcLinzCountdownMembership {
  readonly organizationId: string;
  readonly sourceRole: string;
  readonly active: boolean;
}

export interface UlcLinzCountdownMembershipResolver {
  resolveMembershipForIdentity(
    identityId: string,
  ): Promise<UlcLinzCountdownMembership | null>;
}

export interface UlcLinzCountdownAccessDependencies {
  readonly permissions: PermissionStore;
  readonly memberships: UlcLinzCountdownMembershipResolver;
  readonly securityEvents?: UlcLinzSecurityEventLogger;
}

const COUNTDOWN_CONTRACT = countdownCapabilityContract();

export const ULC_LINZ_COUNTDOWN_MODULE_ID = COUNTDOWN_CONTRACT.moduleId;

export class UlcLinzCountdownAccessDeniedError extends Error {
  readonly code = "ULC_LINZ_COUNTDOWN_ACCESS_DENIED";

  constructor() {
    super("ULC Linz countdown access denied.");
    this.name = "UlcLinzCountdownAccessDeniedError";
  }
}

export async function assertUlcLinzCountdownAccess(
  current: UlcLinzCurrentIdentity,
  dependencies: UlcLinzCountdownAccessDependencies,
): Promise<void> {
  const contract = COUNTDOWN_CONTRACT;
  try {
    assertIdentityActionAllowed(current, "application");
  } catch (error) {
    recordDenial(
      dependencies.securityEvents,
      current.identity.identityId,
      null,
      contract.moduleId,
      "identity-access-denied",
    );
    throw error;
  }

  const identityId = requiredIdentifier(current.identity.identityId, () =>
    deny(
      dependencies.securityEvents,
      null,
      null,
      contract.moduleId,
      "invalid-request",
    ),
  );

  const membership =
    await dependencies.memberships.resolveMembershipForIdentity(identityId);
  if (
    membership === null ||
    membership.active !== true ||
    !isSourceRole(membership.sourceRole) ||
    !isValidIdentifier(membership.organizationId)
  ) {
    deny(
      dependencies.securityEvents,
      identityId,
      null,
      contract.moduleId,
      "membership-denied",
    );
  }

  const organizationId = membership.organizationId;
  const currentPrincipalId = principalId(identityId);
  const principal = await dependencies.permissions.findPrincipal(currentPrincipalId);
  const expectedRoleId = roleId(
    roleDataScope.runtimeRoleIds[membership.sourceRole],
  );
  if (
    principal === null ||
    principal.roleIds.length !== 1 ||
    principal.roleIds[0] !== expectedRoleId
  ) {
    deny(
      dependencies.securityEvents,
      identityId,
      organizationId,
      contract.moduleId,
      "role-mismatch",
    );
  }

  const allowed = await can(dependencies.permissions, {
    principalId: currentPrincipalId,
    capability: capabilityId(contract.runtimeCapability),
  });
  if (!allowed) {
    deny(
      dependencies.securityEvents,
      identityId,
      organizationId,
      contract.moduleId,
      "capability-denied",
    );
  }
}

function countdownCapabilityContract(): {
  readonly moduleId: string;
  readonly runtimeCapability: string;
} {
  const moduleCapability = COUNTDOWN_CAPABILITIES.view;
  const parts = moduleCapability.split(":");
  if (
    parts.length !== 2 ||
    parts[0] === undefined ||
    parts[1] === undefined ||
    !isValidIdentifier(parts[0]) ||
    parts[1] !== roleDataScope.principalPermissionMapping.viewAction ||
    roleDataScope.principalPermissionMapping.capabilityNamespace !==
      "ulc-linz:module"
  ) {
    throw new Error("Countdown capability contract is not compatible with ULC Linz.");
  }
  return Object.freeze({
    moduleId: parts[0],
    runtimeCapability:
      `${roleDataScope.principalPermissionMapping.capabilityNamespace}:${moduleCapability}`,
  });
}

function isSourceRole(value: string): value is UlcLinzSourceRole {
  return Object.hasOwn(roleDataScope.runtimeRoleIds, value);
}

function isValidIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 200 &&
    value === value.trim()
  );
}

function requiredIdentifier(value: unknown, onInvalid: () => never): string {
  if (!isValidIdentifier(value)) onInvalid();
  return value;
}

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  actorPrincipalId: string | null,
  organizationId: string | null,
  moduleId: string,
  reasonCode: UlcLinzAuthorizationDenyReason,
): never {
  recordDenial(
    securityEvents,
    actorPrincipalId,
    organizationId,
    moduleId,
    reasonCode,
  );
  throw new UlcLinzCountdownAccessDeniedError();
}

function recordDenial(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  actorPrincipalId: string | null,
  organizationId: string | null,
  moduleId: string,
  reasonCode: UlcLinzAuthorizationDenyReason,
): void {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId,
    organizationId,
    action: "view",
    targetId: moduleId,
    reasonCode,
  });
}
