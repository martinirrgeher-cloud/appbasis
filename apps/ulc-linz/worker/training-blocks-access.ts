import { assertIdentityActionAllowed } from "@appbasis/identity/access";
import {
  can,
  capabilityId,
  principalId,
  type PermissionStore,
} from "@appbasis/permissions";
import { TRAINING_BLOCK_CAPABILITIES } from "@appbasis/training-blocks";

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

const ULC_TRAINING_BLOCKS_MODULE_KEY = "training_blocks";

type SqlParameter = string | number | boolean | null;

export interface UlcLinzTrainingBlocksAccessSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcLinzTrainingBlocksAccessScope {
  readonly organizationId: string;
  readonly actorPrincipalId: string;
  readonly canEdit: boolean;
}

export interface UlcLinzTrainingBlocksAccessService {
  assertViewAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzTrainingBlocksAccessScope>;
  assertEditAccess(
    current: UlcLinzCurrentIdentity,
  ): Promise<UlcLinzTrainingBlocksAccessScope>;
}

export function createUlcLinzTrainingBlocksAccessService({
  sql,
  permissions,
  memberships,
  subjectScopes,
  securityEvents,
}: {
  sql: UlcLinzTrainingBlocksAccessSqlClient;
  permissions: PermissionStore;
  memberships: UlcLinzMembershipResolver;
  subjectScopes: UlcLinzSubjectScopeResolver;
  securityEvents?: UlcLinzSecurityEventLogger;
}): UlcLinzTrainingBlocksAccessService {
  assertTrainingBlocksCapabilityContract();

  async function assertAccess(
    current: UlcLinzCurrentIdentity,
    action: "view" | "edit",
  ): Promise<UlcLinzTrainingBlocksAccessScope> {
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
        targetId: ULC_TRAINING_BLOCKS_MODULE_KEY,
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
        moduleKey: ULC_TRAINING_BLOCKS_MODULE_KEY,
        action,
        scope: "organization",
      },
    );

    const mapping = roleDataScope.principalPermissionMapping;
    const canEdit =
      action === "edit"
        ? true
        : await can(permissions, {
            principalId: principalId(identityId),
            capability: capabilityId(
              `${mapping.capabilityNamespace}:${ULC_TRAINING_BLOCKS_MODULE_KEY}:${mapping.editAction}`,
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

function assertTrainingBlocksCapabilityContract(): void {
  const template = roleDataScope.permissionTemplates.leistungstrainer;
  const mapping = roleDataScope.principalPermissionMapping;
  if (
    TRAINING_BLOCK_CAPABILITIES.view !== "training-blocks:view" ||
    TRAINING_BLOCK_CAPABILITIES.edit !== "training-blocks:edit" ||
    template.sourceRole !== "trainer" ||
    !template.view.includes(ULC_TRAINING_BLOCKS_MODULE_KEY) ||
    !template.edit.includes(ULC_TRAINING_BLOCKS_MODULE_KEY) ||
    roleDataScope.permissionTemplates.kindertrainer.view.includes(
      ULC_TRAINING_BLOCKS_MODULE_KEY,
    ) ||
    roleDataScope.permissionTemplates.kindertrainer.edit.includes(
      ULC_TRAINING_BLOCKS_MODULE_KEY,
    ) ||
    mapping.capabilityNamespace !== "ulc-linz:module" ||
    mapping.viewAction !== "view" ||
    mapping.editAction !== "edit"
  ) {
    throw new Error("ULC Linz training blocks permission mapping drifted.");
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
    targetId: ULC_TRAINING_BLOCKS_MODULE_KEY,
    reasonCode,
  });
  throw new UlcLinzAuthorizationDeniedError();
}
