import { ATHLETE_CAPABILITIES } from "@appbasis/athletes";
import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import {
  can,
  capabilityId,
  principalId,
  type PermissionStore,
} from "@appbasis/permissions";

import {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
  type UlcLinzMembershipResolver,
  type UlcLinzSubjectScopeResolver,
} from "./authorization";
import roleDataScope from "./role-data-scope.json";
import {
  recordUlcLinzSecurityEvent,
  type UlcLinzSecurityEventLogger,
} from "./security-events";

const ATHLETES_MODULE_ID = "athletes";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzAthletesAccessSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzAthletesAccessScope {
  readonly organizationId: string;
  readonly canEdit: boolean;
}

export interface UlcLinzAthletesAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzAthletesAccessScope>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzAthletesAccessScope>;
}

export function createUlcLinzAthletesAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzAthletesAccessSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzAthletesAccessService {
  assertAthletesCapabilityContract();

  async function assertAccess(
    current: UlcLinzCurrentIdentity,
    action: "view" | "edit",
  ): Promise<UlcLinzAthletesAccessScope> {
    const identityId = optionalIdentifier(current.identity.identityId);
    if (identityId === null) {
      denyBeforeOrganization(
        securityEvents,
        null,
        action,
        "identity-access-denied",
      );
    }

    try {
      assertIdentityActionAllowed(current, "application");
    } catch (error) {
      recordUlcLinzSecurityEvent(securityEvents, {
        eventType: "authorization.denied",
        actorPrincipalId: identityId,
        organizationId: null,
        action,
        targetId: ATHLETES_MODULE_ID,
        reasonCode: "identity-access-denied",
      });
      throw error;
    }

    const rows = await sql.unsafe(
      `SELECT organization_id
       FROM ulc_linz_membership
       WHERE identity_id = $1`,
      [identityId],
    );
    if (rows.length !== 1) {
      denyBeforeOrganization(
        securityEvents,
        identityId,
        action,
        "membership-denied",
      );
    }

    const organizationId = optionalIdentifier(rows[0]?.["organization_id"]);
    if (organizationId === null) {
      denyBeforeOrganization(
        securityEvents,
        identityId,
        action,
        "membership-denied",
      );
    }

    await assertUlcLinzModuleAccess(
      current,
      {
        permissions,
        memberships,
        subjectScopes,
        ...(securityEvents === undefined ? {} : { securityEvents }),
      },
      {
        organizationId,
        moduleKey: ATHLETES_MODULE_ID,
        action,
        scope: "organization",
      },
    );

    const canEdit =
      action === "edit"
        ? true
        : await can(permissions, {
            principalId: principalId(identityId),
            capability: capabilityId(
              roleDataScope.principalPermissionMapping.capabilityNamespace +
                ":" +
                ATHLETES_MODULE_ID +
                ":" +
                roleDataScope.principalPermissionMapping.editAction,
            ),
          });

    return Object.freeze({ organizationId, canEdit });
  }

  return Object.freeze({
    assertViewAccess(current: UlcLinzCurrentIdentity) {
      return assertAccess(current, "view");
    },
    assertEditAccess(current: UlcLinzCurrentIdentity) {
      return assertAccess(current, "edit");
    },
  });
}

function assertAthletesCapabilityContract(): void {
  if (
    ATHLETE_CAPABILITIES.view !== "athletes:view" ||
    ATHLETE_CAPABILITIES.edit !== "athletes:edit" ||
    roleDataScope.principalPermissionMapping.capabilityNamespace !==
      "ulc-linz:module" ||
    roleDataScope.principalPermissionMapping.viewAction !== "view" ||
    roleDataScope.principalPermissionMapping.editAction !== "edit"
  ) {
    throw new Error("ULC Linz athletes permission mapping drifted.");
  }
}

function optionalIdentifier(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    return null;
  }
  return value;
}

function denyBeforeOrganization(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string | null,
  action: "view" | "edit",
  reasonCode: "identity-access-denied" | "membership-denied",
): never {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: identityId,
    organizationId: null,
    action,
    targetId: ATHLETES_MODULE_ID,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
