import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import {
  can,
  capabilityId,
  principalId,
  type PermissionStore,
} from "@appbasis/permissions";
import { TRAINING_DOCUMENTATION_CAPABILITIES } from "@appbasis/training-documentation";

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

const MODULE_KEY = "training_documentation";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzTrainingDocumentationAccessSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzTrainingDocumentationAccessScope {
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly subjectId: string | null;
  readonly canEdit: boolean;
}

export interface UlcLinzTrainingDocumentationAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzTrainingDocumentationAccessScope>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzTrainingDocumentationAccessScope>;
}

export function createUlcLinzTrainingDocumentationAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzTrainingDocumentationAccessSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzTrainingDocumentationAccessService {
  assertCapabilityContract();

  async function assertAccess(
    current: UlcLinzCurrentIdentity,
    action: "view" | "edit",
  ): Promise<UlcLinzTrainingDocumentationAccessScope> {
    try {
      assertIdentityActionAllowed(current, "application");
    } catch (error) {
      deny(securityEvents, null, null, action, "identity-access-denied");
    }
    const identityId = requiredIdentifier(
      current.identity.identityId,
      securityEvents,
      null,
      action,
    );
    const rows = await sql.unsafe(
      `SELECT organization_id, source_role, subject_id, active
       FROM ulc_linz_membership
       WHERE identity_id = $1`,
      [identityId],
    );
    if (rows.length !== 1 || rows[0] === undefined) {
      deny(
        securityEvents,
        identityId,
        null,
        action,
        "membership-denied",
      );
    }

    const row = rows[0]!;
    const organizationId = requiredIdentifier(
      row.organization_id,
      securityEvents,
      identityId,
      action,
    );
    if (row.active !== true) {
      deny(
        securityEvents,
        identityId,
        organizationId,
        action,
        "membership-denied",
      );
    }

    const sourceRole = row.source_role;
    const subjectId =
      sourceRole === "athlete"
        ? requiredIdentifier(
            row.subject_id,
            securityEvents,
            identityId,
            action,
            organizationId,
          )
        : null;

    await assertUlcLinzModuleAccess(
      current,
      {
        permissions,
        memberships,
        subjectScopes,
        ...(securityEvents === undefined ? {} : { securityEvents }),
      },
      subjectId === null
        ? {
            organizationId,
            moduleKey: MODULE_KEY,
            action,
            scope: "organization",
          }
        : {
            organizationId,
            moduleKey: MODULE_KEY,
            action,
            scope: "subject",
            subjectId,
          },
    );

    const mapping = roleDataScope.principalPermissionMapping;
    const canEdit =
      action === "edit"
        ? true
        : await can(permissions, {
            principalId: principalId(identityId),
            capability: capabilityId(
              `${mapping.capabilityNamespace}:${MODULE_KEY}:${mapping.editAction}`,
            ),
          });

    return Object.freeze({
      organizationId,
      actorPrincipalId: identityId,
      subjectId,
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

function assertCapabilityContract(): void {
  const trainer = roleDataScope.permissionTemplates.leistungstrainer;
  const athlete = roleDataScope.permissionTemplates.athlete;
  const parent = roleDataScope.permissionTemplates.parent;
  const childTrainer = roleDataScope.permissionTemplates.kindertrainer;
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    TRAINING_DOCUMENTATION_CAPABILITIES.view !==
      "training-documentation:view" ||
    TRAINING_DOCUMENTATION_CAPABILITIES.edit !==
      "training-documentation:edit" ||
    !includesModule(trainer.view) ||
    !includesModule(trainer.edit) ||
    !includesModule(athlete.view) ||
    !includesModule(athlete.edit) ||
    includesModule(parent.view) ||
    includesModule(parent.edit) ||
    includesModule(childTrainer.view) ||
    includesModule(childTrainer.edit) ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit"
  ) {
    throw new Error(
      "ULC Linz training documentation permission mapping drifted.",
    );
  }
}

function includesModule(modules: readonly string[]): boolean {
  return modules.includes(MODULE_KEY);
}

function requiredIdentifier(
  value: unknown,
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string | null,
  action: "view" | "edit",
  organizationId: string | null = null,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    deny(
      securityEvents,
      identityId,
      organizationId,
      action,
      "scope-denied",
    );
  }
  return value as string;
}

function deny(
  securityEvents: UlcLinzSecurityEventLogger | undefined,
  identityId: string | null,
  organizationId: string | null,
  action: "view" | "edit",
  reasonCode:
    | "identity-access-denied"
    | "membership-denied"
    | "scope-denied",
): never {
  recordUlcLinzSecurityEvent(securityEvents, {
    eventType: "authorization.denied",
    actorPrincipalId: identityId,
    organizationId,
    action,
    targetId: MODULE_KEY,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
