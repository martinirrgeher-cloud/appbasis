import {
  capabilityId,
  principalId,
  roleId,
  type CapabilityId,
  type PermissionRequest,
  type PermissionStore,
  type PrincipalId,
  type PrincipalPermissions,
  type RoleBundle,
  type RoleId,
} from "./contracts";

export type PermissionSqlParameter = string | number | boolean | null;

export interface PermissionPostgresClient {
  unsafe(
    query: string,
    parameters?: PermissionSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export class PostgresPermissionStore implements PermissionStore {
  readonly #client: PermissionPostgresClient;

  constructor(client: PermissionPostgresClient) {
    this.#client = client;
  }

  async evaluatePermission(request: PermissionRequest): Promise<boolean> {
    const rows = await this.#client.unsafe(
      `SELECT (
         EXISTS (
           SELECT 1
           FROM appbasis_permission_capability
           WHERE capability_id = $2
         )
         AND EXISTS (
           SELECT 1
           FROM appbasis_permission_principal
           WHERE principal_id = $1
         )
         AND NOT EXISTS (
           SELECT 1
           FROM appbasis_permission_principal_revoke
           WHERE principal_id = $1 AND capability_id = $2
         )
         AND (
           EXISTS (
             SELECT 1
             FROM appbasis_permission_principal_grant
             WHERE principal_id = $1 AND capability_id = $2
           )
           OR EXISTS (
             SELECT 1
             FROM appbasis_permission_principal_role principal_role
             INNER JOIN appbasis_permission_role_capability role_capability
               ON role_capability.role_id = principal_role.role_id
             WHERE principal_role.principal_id = $1
               AND role_capability.capability_id = $2
           )
         )
       ) AS allowed`,
      [request.principalId, request.capability],
    );

    const allowed = rows[0]?.allowed;
    if (typeof allowed !== "boolean") {
      throw new Error("Permission decision row has an invalid allowed value.");
    }
    return allowed;
  }

  async findPrincipal(
    requestedPrincipalId: PrincipalId,
  ): Promise<PrincipalPermissions | null> {
    const principals = await this.#client.unsafe(
      `SELECT principal_id
       FROM appbasis_permission_principal
       WHERE principal_id = $1
       LIMIT 1`,
      [requestedPrincipalId],
    );
    if (principals[0] === undefined) return null;

    const [roles, grants, revokes] = await Promise.all([
      this.#client.unsafe(
        `SELECT role_id
         FROM appbasis_permission_principal_role
         WHERE principal_id = $1
         ORDER BY role_id ASC`,
        [requestedPrincipalId],
      ),
      this.#client.unsafe(
        `SELECT capability_id
         FROM appbasis_permission_principal_grant
         WHERE principal_id = $1
         ORDER BY capability_id ASC`,
        [requestedPrincipalId],
      ),
      this.#client.unsafe(
        `SELECT capability_id
         FROM appbasis_permission_principal_revoke
         WHERE principal_id = $1
         ORDER BY capability_id ASC`,
        [requestedPrincipalId],
      ),
    ]);

    return {
      principalId: principalId(requiredString(principals[0], "principal_id")),
      roleIds: roles.map((row) => roleId(requiredString(row, "role_id"))),
      grants: grants.map((row) =>
        capabilityId(requiredString(row, "capability_id")),
      ),
      revokes: revokes.map((row) =>
        capabilityId(requiredString(row, "capability_id")),
      ),
    };
  }

  async findRole(requestedRoleId: RoleId): Promise<RoleBundle | null> {
    const roles = await this.#client.unsafe(
      `SELECT role_id
       FROM appbasis_permission_role
       WHERE role_id = $1
       LIMIT 1`,
      [requestedRoleId],
    );
    const role = roles[0];
    if (role === undefined) return null;

    const capabilities = await this.#client.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_role_capability
       WHERE role_id = $1
       ORDER BY capability_id ASC`,
      [requestedRoleId],
    );

    return {
      roleId: roleId(requiredString(role, "role_id")),
      capabilities: capabilities.map((row) =>
        capabilityId(requiredString(row, "capability_id")),
      ),
    };
  }

  async isKnownCapability(requestedCapability: CapabilityId): Promise<boolean> {
    const rows = await this.#client.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_capability
       WHERE capability_id = $1
       LIMIT 1`,
      [requestedCapability],
    );
    return rows[0] !== undefined;
  }
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Permission row has an invalid ${field}.`);
  }
  return value;
}
