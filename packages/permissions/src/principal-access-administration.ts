import {
  capabilityId,
  principalId,
  roleId,
  type CapabilityId,
  type PrincipalId,
  type RoleId,
} from "./contracts";
import {
  PostgresPrincipalPermissionAdministration,
  type PrincipalPermissionOverrides,
  type ReplacePrincipalPermissionsConstraints,
} from "./principal-permission-administration";
import type { PermissionPostgresClient } from "./postgres-permission-store";
import {
  PostgresRoleAdministration,
  RoleAdministrationError,
  type ReplacePrincipalRolesConstraints,
  type RoleAdministrationAuditContext,
  type RoleAdministrationPostgresClient,
} from "./role-administration";

export type PrincipalAccessAdministrationErrorCode =
  | "LAST_REQUIRED_ROLE_HOLDER"
  | "REQUIRED_ROLE_HOLDER_SCOPE_REQUIRED"
  | "REQUIRED_ROLE_NOT_ACTIVE"
  | "TARGET_PRINCIPAL_OUTSIDE_REQUIRED_ROLE_SCOPE";

export class PrincipalAccessAdministrationError extends Error {
  readonly code: PrincipalAccessAdministrationErrorCode;

  constructor(code: PrincipalAccessAdministrationErrorCode, message: string) {
    super(message);
    this.name = "PrincipalAccessAdministrationError";
    this.code = code;
  }
}

export interface RequiredRoleHolderPrincipalScopeContext {
  readonly transaction: PermissionPostgresClient;
  readonly targetPrincipalId: PrincipalId;
  readonly requiredRoleIds: readonly RoleId[];
}

/**
 * Resolves the principals that are eligible to satisfy a required-role-holder
 * guard for the target principal's application scope. The resolver runs inside
 * the same outer transaction as the role/override replacement. Consumers with
 * mutable membership data must read and lock their authoritative scope rows in
 * this callback so a concurrent membership change cannot make the guard stale.
 */
export type RequiredRoleHolderPrincipalScopeResolver = (
  context: RequiredRoleHolderPrincipalScopeContext,
) => Promise<readonly PrincipalId[]>;

export interface ReplacePrincipalAccessConstraints {
  readonly expectedRoleIds?: readonly RoleId[];
  readonly expectedGrants?: readonly CapabilityId[];
  readonly expectedRevokes?: readonly CapabilityId[];
  readonly requiredRemainingCapabilities?: readonly CapabilityId[];
  readonly requiredRemainingRoleIds?: readonly RoleId[];
  readonly resolveRequiredRoleHolderPrincipalScope?: RequiredRoleHolderPrincipalScopeResolver;
}

export interface PrincipalAccessState extends PrincipalPermissionOverrides {
  readonly roleIds: readonly RoleId[];
}

export class PostgresPrincipalAccessAdministration {
  readonly #client: RoleAdministrationPostgresClient;

  constructor(client: RoleAdministrationPostgresClient) {
    this.#client = client;
  }

  async replacePrincipalAccess(
    requestedPrincipalId: PrincipalId,
    roleIds: readonly RoleId[],
    overrides: PrincipalPermissionOverrides,
    auditContext: RoleAdministrationAuditContext,
    constraints: ReplacePrincipalAccessConstraints = {},
  ): Promise<PrincipalAccessState> {
    return this.#client.begin(async (transaction) => {
      const transactionClient = transactionAdministrationClient(transaction);
      const roleAdministration = new PostgresRoleAdministration(transactionClient);
      const permissionAdministration =
        new PostgresPrincipalPermissionAdministration(transactionClient);

      const replacedRoleIds = await roleAdministration.replacePrincipalRoles(
        requestedPrincipalId,
        roleIds,
        auditContext,
        roleConstraints(constraints),
      );
      await assertRequiredRoleHoldersRemain(
        transaction,
        requestedPrincipalId,
        constraints.requiredRemainingRoleIds ?? [],
        constraints.resolveRequiredRoleHolderPrincipalScope,
      );
      const replacedOverrides =
        await permissionAdministration.replacePrincipalPermissions(
          requestedPrincipalId,
          overrides,
          auditContext,
          permissionConstraints(constraints),
        );
      await assertRequiredCapabilityHoldersRemain(
        transaction,
        constraints.requiredRemainingCapabilities ?? [],
      );

      return Object.freeze({
        roleIds: Object.freeze([...replacedRoleIds]),
        grants: Object.freeze([...replacedOverrides.grants]),
        revokes: Object.freeze([...replacedOverrides.revokes]),
      });
    });
  }
}

function roleConstraints(
  constraints: ReplacePrincipalAccessConstraints,
): ReplacePrincipalRolesConstraints {
  return {
    ...(constraints.expectedRoleIds === undefined
      ? {}
      : { expectedRoleIds: constraints.expectedRoleIds }),
  };
}

function permissionConstraints(
  constraints: ReplacePrincipalAccessConstraints,
): ReplacePrincipalPermissionsConstraints {
  return {
    ...(constraints.expectedGrants === undefined
      ? {}
      : { expectedGrants: constraints.expectedGrants }),
    ...(constraints.expectedRevokes === undefined
      ? {}
      : { expectedRevokes: constraints.expectedRevokes }),
  };
}

async function assertRequiredCapabilityHoldersRemain(
  transaction: PermissionPostgresClient,
  requiredCapabilities: readonly CapabilityId[],
): Promise<void> {
  const capabilities = [...new Set(requiredCapabilities.map(String))]
    .sort((left, right) => left.localeCompare(right))
    .map(capabilityId);
  if (capabilities.length === 0) return;

  const capabilityPlaceholders = capabilities
    .map((_, index) => `$${index + 1}`)
    .join(", ");
  const capabilityRows = await transaction.unsafe(
    `SELECT capability_id
     FROM appbasis_permission_capability
     WHERE capability_id IN (${capabilityPlaceholders})
     ORDER BY capability_id ASC
     FOR UPDATE`,
    [...capabilities],
  );
  const lockedCapabilities = capabilityRows.map((row) => {
    const value = row.capability_id;
    if (typeof value !== "string") {
      throw new RoleAdministrationError(
        "UNKNOWN_CAPABILITY",
        "At least one required capability is unknown.",
      );
    }
    return capabilityId(value);
  });
  const lockedCapabilitySet = new Set(lockedCapabilities);
  if (
    lockedCapabilitySet.size !== capabilities.length ||
    !capabilities.every((value) => lockedCapabilitySet.has(value))
  ) {
    throw new RoleAdministrationError(
      "UNKNOWN_CAPABILITY",
      "At least one required capability is unknown.",
    );
  }

  const requiredCapabilityValues = capabilities
    .map((_, index) => `($${index + 1})`)
    .join(", ");
  const holderRows = await transaction.unsafe(
    `WITH required_capability(capability_id) AS (
       VALUES ${requiredCapabilityValues}
     )
     SELECT EXISTS (
       SELECT 1
       FROM appbasis_permission_principal principal
       WHERE NOT EXISTS (
         SELECT 1
         FROM required_capability required
         WHERE EXISTS (
           SELECT 1
           FROM appbasis_permission_principal_revoke revoke
           WHERE revoke.principal_id = principal.principal_id
             AND revoke.capability_id = required.capability_id
         )
         OR NOT (
           EXISTS (
             SELECT 1
             FROM appbasis_permission_principal_grant grant_row
             WHERE grant_row.principal_id = principal.principal_id
               AND grant_row.capability_id = required.capability_id
           )
           OR EXISTS (
             SELECT 1
             FROM appbasis_permission_principal_role principal_role
             JOIN appbasis_permission_role role
               ON role.role_id = principal_role.role_id
              AND role.state = 'active'
             JOIN appbasis_permission_role_capability role_capability
               ON role_capability.role_id = role.role_id
              AND role_capability.capability_id = required.capability_id
             WHERE principal_role.principal_id = principal.principal_id
           )
         )
       )
     ) AS exists`,
    [...capabilities],
  );
  if (holderRows[0]?.exists !== true) {
    throw new RoleAdministrationError(
      "LAST_CAPABILITY_HOLDER",
      `At least one principal must retain all required capabilities: ${capabilities.join(", ")}.`,
    );
  }
}

async function assertRequiredRoleHoldersRemain(
  transaction: PermissionPostgresClient,
  targetPrincipalId: PrincipalId,
  requiredRoleIds: readonly RoleId[],
  resolvePrincipalScope: RequiredRoleHolderPrincipalScopeResolver | undefined,
): Promise<void> {
  const uniqueRoleIds = [...new Set(requiredRoleIds.map(String))]
    .sort((left, right) => left.localeCompare(right))
    .map(roleId);
  if (uniqueRoleIds.length === 0) return;

  for (const requiredRoleId of uniqueRoleIds) {
    const roles = await transaction.unsafe(
      `SELECT role_id
       FROM appbasis_permission_role
       WHERE role_id = $1
         AND state = 'active'
       FOR UPDATE`,
      [requiredRoleId],
    );
    if (roles.length !== 1) {
      throw new PrincipalAccessAdministrationError(
        "REQUIRED_ROLE_NOT_ACTIVE",
        `Required active role ${requiredRoleId} does not exist.`,
      );
    }
  }

  if (resolvePrincipalScope === undefined) {
    throw new PrincipalAccessAdministrationError(
      "REQUIRED_ROLE_HOLDER_SCOPE_REQUIRED",
      "Required role-holder checks need a transactional application-scope resolver.",
    );
  }

  const resolvedPrincipalIds = await resolvePrincipalScope({
    transaction,
    targetPrincipalId,
    requiredRoleIds: Object.freeze([...uniqueRoleIds]),
  });
  const scopedPrincipalIds = [...new Set(resolvedPrincipalIds.map(String))]
    .sort((left, right) => left.localeCompare(right))
    .map(principalId);
  if (!scopedPrincipalIds.includes(targetPrincipalId)) {
    throw new PrincipalAccessAdministrationError(
      "TARGET_PRINCIPAL_OUTSIDE_REQUIRED_ROLE_SCOPE",
      "The required role-holder scope must contain the target principal.",
    );
  }

  const principalPlaceholders = scopedPrincipalIds
    .map((_, index) => `$${index + 2}`)
    .join(", ");
  for (const requiredRoleId of uniqueRoleIds) {
    const holderRows = await transaction.unsafe(
      `SELECT EXISTS (
         SELECT 1
         FROM appbasis_permission_principal_role
         WHERE role_id = $1
           AND principal_id IN (${principalPlaceholders})
       ) AS exists`,
      [requiredRoleId, ...scopedPrincipalIds],
    );
    if (holderRows[0]?.exists !== true) {
      throw new PrincipalAccessAdministrationError(
        "LAST_REQUIRED_ROLE_HOLDER",
        `At least one in-scope principal must retain required role ${requiredRoleId}.`,
      );
    }
  }
}

function transactionAdministrationClient(
  transaction: PermissionPostgresClient,
): RoleAdministrationPostgresClient {
  return {
    unsafe(query, parameters) {
      return transaction.unsafe(query, parameters);
    },
    async begin(callback) {
      return callback(transaction);
    },
  };
}
