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

const EXERCISE_CATALOG_MODULE_ID = "exercise_catalog";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzExerciseCatalogAccessSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzExerciseCatalogAccessScope {
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly canEdit: boolean;
}

export interface UlcLinzExerciseCatalogAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzExerciseCatalogAccessScope>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzExerciseCatalogAccessScope>;
}

export function createUlcLinzExerciseCatalogAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzExerciseCatalogAccessSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzExerciseCatalogAccessService {
  assertExerciseCatalogCapabilityContract();

  async function assertAccess(
    current: UlcLinzCurrentIdentity,
    action: "view" | "edit",
  ): Promise<UlcLinzExerciseCatalogAccessScope> {
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
        targetId: EXERCISE_CATALOG_MODULE_ID,
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
        moduleKey: EXERCISE_CATALOG_MODULE_ID,
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
                EXERCISE_CATALOG_MODULE_ID +
                ":" +
                roleDataScope.principalPermissionMapping.editAction,
            ),
          });

    return Object.freeze({
      organizationId,
      actorPrincipalId: identityId,
      canEdit,
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

function assertExerciseCatalogCapabilityContract(): void {
  const template = roleDataScope.permissionTemplates.leistungstrainer;
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    template.sourceRole !== "trainer" ||
    !template.view.includes(EXERCISE_CATALOG_MODULE_ID) ||
    !template.edit.includes(EXERCISE_CATALOG_MODULE_ID) ||
    roleDataScope.permissionTemplates.kindertrainer.view.includes(
      EXERCISE_CATALOG_MODULE_ID,
    ) ||
    roleDataScope.permissionTemplates.kindertrainer.edit.includes(
      EXERCISE_CATALOG_MODULE_ID,
    ) ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit"
  ) {
    throw new Error("ULC Linz exercise catalog permission mapping drifted.");
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
    targetId: EXERCISE_CATALOG_MODULE_ID,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
