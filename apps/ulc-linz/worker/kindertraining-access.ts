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
  type UlcLinzAuthorizationDenyReason,
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

export type UlcLinzKindertrainingAccessScope =
  | Readonly<{
      organizationId: string;
      actorPrincipalId: string;
      scope: "organization";
    }>
  | Readonly<{
      organizationId: string;
      actorPrincipalId: string;
      scope: "trainer";
      trainerId: string;
      groupIds: readonly string[];
    }>;

export interface UlcLinzKindertrainingAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzKindertrainingAccessScope>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzKindertrainingAccessScope>;
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
  ): Promise<UlcLinzKindertrainingAccessScope> {
    const identityId = optionalIdentifier(current.identity.identityId);
    if (identityId === null) {
      deny(securityEvents, null, null, action, "identity-access-denied");
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
      `SELECT membership.organization_id,
              membership.source_role,
              membership.active,
              trainer.id AS trainer_id,
              trainer_group.group_id
       FROM ulc_linz_membership AS membership
       LEFT JOIN appbasis_trainer AS trainer
         ON membership.source_role = 'trainer'
        AND trainer.id = membership.subject_id
        AND trainer.organization_id = membership.organization_id
        AND trainer.is_active = true
       LEFT JOIN appbasis_trainer_group_membership AS trainer_group
         ON trainer_group.organization_id = membership.organization_id
        AND trainer_group.trainer_id = trainer.id
       WHERE membership.identity_id = $1
       ORDER BY trainer_group.group_id ASC`,
      [identityId],
    );
    if (rows.length === 0) {
      deny(securityEvents, identityId, null, action, "membership-denied");
    }

    const first = rows[0];
    const organizationId = optionalIdentifier(first?.["organization_id"]);
    const sourceRole = first?.["source_role"];
    const membershipActive = first?.["active"];
    if (
      organizationId === null ||
      membershipActive !== true ||
      typeof sourceRole !== "string" ||
      rows.some(
        (row) =>
          row["organization_id"] !== organizationId ||
          row["source_role"] !== sourceRole ||
          row["active"] !== true,
      )
    ) {
      deny(
        securityEvents,
        identityId,
        organizationId,
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

    if (sourceRole === "admin") {
      return Object.freeze({
        organizationId,
        actorPrincipalId: identityId,
        scope: "organization",
      });
    }
    if (sourceRole !== "trainer") {
      deny(securityEvents, identityId, organizationId, action, "scope-denied");
    }

    const trainerId = optionalIdentifier(first?.["trainer_id"]);
    if (
      trainerId === null ||
      rows.some((row) => row["trainer_id"] !== trainerId)
    ) {
      deny(securityEvents, identityId, organizationId, action, "scope-denied");
    }

    const groupIds: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const rawGroupId = row["group_id"];
      if (rawGroupId === null) continue;
      const groupId = optionalIdentifier(rawGroupId);
      if (groupId === null || seen.has(groupId)) {
        deny(securityEvents, identityId, organizationId, action, "scope-denied");
      }
      seen.add(groupId);
      groupIds.push(groupId);
    }

    return Object.freeze({
      organizationId,
      actorPrincipalId: identityId,
      scope: "trainer",
      trainerId,
      groupIds: Object.freeze(groupIds),
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

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string | null,
  organizationId: string | null,
  action: "view" | "edit",
  reasonCode: UlcLinzAuthorizationDenyReason,
): never {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: identityId,
    organizationId,
    action,
    targetId: KINDERTRAINING_MODULE_ID,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
