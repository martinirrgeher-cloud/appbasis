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

const MODULE_ID = "kindertraining";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzSelfRegistrationAccessSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzSelfRegistrationAccessScope {
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly athleteId: string;
}

export interface UlcLinzSelfRegistrationAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzSelfRegistrationAccessScope>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzSelfRegistrationAccessScope>;
}

export function createUlcLinzSelfRegistrationAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzSelfRegistrationAccessSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzSelfRegistrationAccessService {
  assertPolicy();

  async function assertAccess(
    current: UlcLinzCurrentIdentity,
    action: "view" | "edit",
  ): Promise<UlcLinzSelfRegistrationAccessScope> {
    assertIdentityActionAllowed(current, "application");
    const identityId = requiredIdentifier(current.identity.identityId);
    const rows = await sql.unsafe(
      `SELECT membership.organization_id,
              membership.subject_id AS athlete_id,
              membership.source_role,
              membership.active,
              athlete.is_active AS athlete_active
       FROM ulc_linz_membership AS membership
       INNER JOIN appbasis_athlete AS athlete
         ON athlete.id = membership.subject_id
        AND athlete.organization_id = membership.organization_id
       WHERE membership.identity_id = $1`,
      [identityId],
    );
    if (rows.length !== 1 || rows[0] === undefined) {
      deny(securityEvents, identityId, null, action);
    }
    const row = rows[0];
    const organizationId = requiredIdentifier(row.organization_id);
    const athleteId = requiredIdentifier(row.athlete_id);
    if (
      row.source_role !== "athlete" ||
      row.active !== true ||
      row.athlete_active !== true
    ) {
      deny(securityEvents, identityId, organizationId, action);
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
        moduleKey: MODULE_ID,
        action,
        scope: "subject",
        subjectId: athleteId,
      },
    );

    return Object.freeze({
      organizationId,
      actorPrincipalId: identityId,
      athleteId,
    });
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

function assertPolicy(): void {
  const athlete = roleDataScope.permissionTemplates.athlete;
  if (
    athlete.sourceRole !== "athlete" ||
    !athlete.view.includes(MODULE_ID) ||
    !athlete.edit.includes(MODULE_ID)
  ) {
    throw new Error("ULC Linz athlete self-registration policy drifted.");
  }
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    throw new UlcLinzAuthorizationDeniedError();
  }
  return value;
}

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string | null,
  organizationId: string | null,
  action: "view" | "edit",
): never {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: identityId,
    organizationId,
    action,
    targetId: MODULE_ID,
    reasonCode: "scope-denied",
  });
  throw new UlcLinzAuthorizationDeniedError();
}
