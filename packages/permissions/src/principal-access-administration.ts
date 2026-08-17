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

export interface ReplacePrincipalAccessConstraints {
  readonly expectedRoleIds?: readonly RoleId[];
  readonly expectedGrants?: readonly CapabilityId[];
  readonly expectedRevokes?: readonly CapabilityId[];
  readonly requiredRemainingCapabilities?: readonly CapabilityId[];
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
