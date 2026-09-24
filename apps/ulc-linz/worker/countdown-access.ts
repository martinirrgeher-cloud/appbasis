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
  type UlcLinzSecurityEventLogger,
} from "./security-events";

const COUNTDOWN_MODULE_ID = "countdown";
const COUNTDOWN_ULC_CAPABILITY = countdownUlcCapability();

type UlcLinzSourceRole = keyof typeof roleDataScope.runtimeRoleIds;
type UlcLinzCurrentIdentity = Parameters<typeof assertIdentityActionAllowed>[0];
type SqlParameter = string | number | boolean | null;

export interface UlcLinzCountdownSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzCountdownAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<Readonly<{ organizationId: string }>>;
}

export class UlcLinzCountdownAccessDeniedError extends Error {
  readonly code = "ULC_LINZ_COUNTDOWN_ACCESS_DENIED";

  constructor() {
    super("ULC Linz countdown access denied.");
    this.name = "UlcLinzCountdownAccessDeniedError";
  }
}

export function createUlcLinzCountdownAccessService({
  sql,
  permissions,
  securityEvents,
}: {
  sql: UlcLinzCountdownSqlClient;
  permissions: PermissionStore;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzCountdownAccessService {
  return Object.freeze({
    async assertViewAccess(current: UlcLinzCurrentIdentity) {
      const identityId = optionalIdentifier(current.identity.identityId);
      if (identityId === null) {
        recordUlcLinzSecurityEvent(securityEvents, {
          eventType: "authorization.denied",
          actorPrincipalId: null,
          organizationId: null,
          action: "view",
          targetId: COUNTDOWN_MODULE_ID,
          reasonCode: "identity-access-denied",
        });
        throw new UlcLinzCountdownAccessDeniedError();
      }

      try {
        assertIdentityActionAllowed(current, "application");
      } catch (error) {
        recordDenial(securityEvents, identityId, null, "identity-access-denied");
        throw error;
      }

      const rows = await sql.unsafe(
        `SELECT organization_id, source_role, active
         FROM ulc_linz_membership
         WHERE identity_id = $1`,
        [identityId],
      );
      if (rows.length !== 1) {
        deny(securityEvents, identityId, null, "membership-denied");
      }

      const row = rows[0];
      if (row === undefined) {
        deny(securityEvents, identityId, null, "membership-denied");
      }
      const organizationId = optionalIdentifier(row["organization_id"]);
      const sourceRole = optionalIdentifier(row["source_role"]);
      if (
        organizationId === null ||
        sourceRole === null ||
        row.active !== true ||
        !isSourceRole(sourceRole)
      ) {
        deny(
          securityEvents,
          identityId,
          organizationId,
          "membership-denied",
        );
      }

      const currentPrincipalId = principalId(identityId);
      const principal = await permissions.findPrincipal(currentPrincipalId);
      const expectedRole = roleId(roleDataScope.runtimeRoleIds[sourceRole]);
      if (
        principal === null ||
        principal.roleIds.length !== 1 ||
        principal.roleIds[0] !== expectedRole
      ) {
        deny(securityEvents, identityId, organizationId, "role-mismatch");
      }

      const allowed = await can(permissions, {
        principalId: currentPrincipalId,
        capability: capabilityId(COUNTDOWN_ULC_CAPABILITY),
      });
      if (!allowed) {
        deny(securityEvents, identityId, organizationId, "capability-denied");
      }

      return Object.freeze({ organizationId });
    },
  });
}

function countdownUlcCapability(): string {
  const publicCapability = COUNTDOWN_CAPABILITIES.view;
  if (publicCapability !== "countdown:view") {
    throw new Error("Countdown public capability contract drifted.");
  }
  const [moduleId, action, extra] = publicCapability.split(":");
  if (
    moduleId !== COUNTDOWN_MODULE_ID ||
    action !== "view" ||
    extra !== undefined
  ) {
    throw new Error("Countdown public capability contract is invalid.");
  }
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== action
  ) {
    throw new Error("ULC Linz countdown permission mapping drifted.");
  }
  return `${mapping.capabilityNamespace}:${moduleId}:${action}`;
}

function isSourceRole(value: string): value is UlcLinzSourceRole {
  return Object.hasOwn(roleDataScope.runtimeRoleIds, value);
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcLinzCountdownAccessDeniedError();
  }
  return value;
}

function optionalIdentifier(value: unknown): string | null {
  try {
    return requiredIdentifier(value);
  } catch {
    return null;
  }
}

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string,
  organizationId: string | null,
  reasonCode: "membership-denied" | "role-mismatch" | "capability-denied",
): never {
  recordDenial(securityEvents, identityId, organizationId, reasonCode);
  throw new UlcLinzCountdownAccessDeniedError();
}

function recordDenial(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string,
  organizationId: string | null,
  reasonCode:
    | "identity-access-denied"
    | "membership-denied"
    | "role-mismatch"
    | "capability-denied",
): void {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: identityId,
    organizationId,
    action: "view",
    targetId: COUNTDOWN_MODULE_ID,
    reasonCode,
  });
}
