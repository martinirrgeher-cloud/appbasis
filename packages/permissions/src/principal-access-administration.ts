import type { CapabilityId, PrincipalId, RoleId } from "./contracts";
import {
  PostgresPrincipalPermissionAdministration,
  type PrincipalPermissionOverrides,
} from "./principal-permission-administration";
import type { PermissionPostgresClient } from "./postgres-permission-store";
import {
  PostgresRoleAdministration,
  type RoleAdministrationAuditContext,
  type RoleAdministrationPostgresClient,
} from "./role-administration";

export type PrincipalAccessAdministrationErrorCode =
  | "LAST_REQUIRED_ROLE_HOLDER"
  | "REQUIRED_ROLE_NOT_ACTIVE";

export class PrincipalAccessAdministrationError extends Error {
  readonly code: PrincipalAccessAdministrationErrorCode;

  constructor(code: PrincipalAccessAdministrationErrorCode, message: string) {
    super(message);
    this.name = "PrincipalAccessAdministrationError";
    this.code = code;
  }
}

export interface ReplacePrincipalAccessConstraints {
  readonly expectedRoleIds?: readonly RoleId[];
  readonly expectedGrants?: readonly CapabilityId[];
  readonly expectedRevokes?: readonly CapabilityId[];
  readonly requiredRemainingCapabilities?: readonly CapabilityId[];
  readonly requiredRemainingRoleIds?: readonly RoleId[];
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
    principalId: PrincipalId,
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
        principalId,
        roleIds,
        auditContext,
        {
          expectedRoleIds: constraints.expectedRoleIds,
          requiredRemainingCapabilities: constraints.requiredRemainingCapabilities,
        },
      );
      await assertRequiredRoleHoldersRemain(
        transaction,
        constraints.requiredRemainingRoleIds ?? [],
      );
      const replacedOverrides =
        await permissionAdministration.replacePrincipalPermissions(
          principalId,
          overrides,
          auditContext,
          {
            expectedGrants: constraints.expectedGrants,
            expectedRevokes: constraints.expectedRevokes,
          },
        );

      return Object.freeze({
        roleIds: Object.freeze([...replacedRoleIds]),
        grants: Object.freeze([...replacedOverrides.grants]),
        revokes: Object.freeze([...replacedOverrides.revokes]),
      });
    });
  }
}

async function assertRequiredRoleHoldersRemain(
  transaction: PermissionPostgresClient,
  requiredRoleIds: readonly RoleId[],
): Promise<void> {
  const uniqueRoleIds = [...new Set(requiredRoleIds.map(String))].sort((left, right) =>
    left.localeCompare(right),
  );

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

    const holderRows = await transaction.unsafe(
      `SELECT EXISTS (
         SELECT 1
         FROM appbasis_permission_principal_role
         WHERE role_id = $1
       ) AS exists`,
      [requiredRoleId],
    );
    if (holderRows[0]?.exists !== true) {
      throw new PrincipalAccessAdministrationError(
        "LAST_REQUIRED_ROLE_HOLDER",
        `At least one principal must retain required role ${requiredRoleId}.`,
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
