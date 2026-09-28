import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import type { PermissionStore } from "@appbasis/permissions";

import {
  assertUlcLinzModuleAccess,
  UlcLinzAuthorizationDeniedError,
  type UlcLinzCurrentIdentity,
  type UlcLinzMembershipResolver,
  type UlcLinzSubjectScopeResolver,
} from "./authorization";
import {
  recordUlcLinzSecurityEvent,
  type UlcLinzSecurityEventLogger,
} from "./security-events";

const TARGET_ID = "trainer-identity-admin";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzTrainerIdentityAdminSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzTrainerIdentityAdminAccessService {
  assertAdminAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<Readonly<{ organizationId: string; actorPrincipalId: string }>>;
}

export function createUlcLinzTrainerIdentityAdminAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzTrainerIdentityAdminSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzTrainerIdentityAdminAccessService {
  return Object.freeze({
    async assertAdminAccess(
      current: UlcLinzCurrentIdentity,
    ): Promise<Readonly<{ organizationId: string; actorPrincipalId: string }>> {
      const identityId = optionalIdentifier(current.identity.identityId);
      if (identityId === null) {
        deny(securityEvents, null, null, "identity-access-denied");
      }

      try {
        assertIdentityActionAllowed(current, "application");
      } catch (error) {
        recordUlcLinzSecurityEvent(securityEvents, {
          eventType: "authorization.denied",
          actorPrincipalId: identityId,
          organizationId: null,
          action: "edit",
          targetId: TARGET_ID,
          reasonCode: "identity-access-denied",
        });
        throw error;
      }

      const rows = await sql.unsafe(
        `SELECT organization_id, source_role, active
         FROM ulc_linz_membership
         WHERE identity_id = $1`,
        [identityId],
      );
      if (rows.length !== 1 || rows[0] === undefined) {
        deny(securityEvents, identityId, null, "membership-denied");
      }

      const organizationId = optionalIdentifier(rows[0].organization_id);
      if (
        organizationId === null ||
        rows[0].source_role !== "admin" ||
        rows[0].active !== true
      ) {
        deny(
          securityEvents,
          identityId,
          organizationId,
          "scope-denied",
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
          moduleKey: "athletes",
          action: "edit",
          scope: "organization",
        },
      );

      return Object.freeze({ organizationId, actorPrincipalId: identityId });
    },
  });
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

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string | null,
  organizationId: string | null,
  reasonCode:
    | "identity-access-denied"
    | "membership-denied"
    | "scope-denied",
): never {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: identityId,
    organizationId,
    action: "edit",
    targetId: TARGET_ID,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
