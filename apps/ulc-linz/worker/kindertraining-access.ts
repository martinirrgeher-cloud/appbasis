import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import type { PermissionStore } from "@appbasis/permissions";

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

const KINDERTRAINING_MODULE_ID = "kindertraining";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzKindertrainingAccessSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzKindertrainingAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<Readonly<{ organizationId: string }>>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<Readonly<{ organizationId: string }>>;
}

export function createUlcLinzKindertrainingAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzKindertrainingAccessSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzKindertrainingAccessService {
  assertKindertrainingCapabilityContract();

  async function assertAccess(
    current: UlcLinzCurrentIdentity,
    action: "view" | "edit",
  ): Promise<Readonly<{ organizationId: string }>> {
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
        targetId: KINDERTRAINING_MODULE_ID,
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
        moduleKey: KINDERTRAINING_MODULE_ID,
        action,
        scope: "organization",
      },
    );

    return Object.freeze({ organizationId });
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

function assertKindertrainingCapabilityContract(): void {
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    !roleDataScope.permissionTemplates.kindertrainer.view.includes(
      KINDERTRAINING_MODULE_ID,
    ) ||
    !roleDataScope.permissionTemplates.kindertrainer.edit.includes(
      KINDERTRAINING_MODULE_ID,
    ) ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit"
  ) {
    throw new Error("ULC Linz Kindertraining permission mapping drifted.");
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
    targetId: KINDERTRAINING_MODULE_ID,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
