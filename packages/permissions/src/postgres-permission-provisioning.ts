import type {
  CapabilityId,
  PrincipalId,
  RoleBundle,
  RoleId,
} from "./contracts";
import type { PermissionPostgresClient } from "./postgres-permission-store";

export interface PrincipalRoleAssignment {
  readonly principalId: PrincipalId;
  readonly roleIds: readonly RoleId[];
}

export interface PermissionProvisioningBundle {
  readonly knownCapabilities: readonly CapabilityId[];
  readonly roles: readonly RoleBundle[];
  readonly principalRoleAssignments: readonly PrincipalRoleAssignment[];
}

export interface PermissionProvisioningResult {
  readonly capabilitiesCreated: number;
  readonly rolesCreated: number;
  readonly roleCapabilitiesCreated: number;
  readonly principalsCreated: number;
  readonly principalRolesCreated: number;
}

export interface PermissionProvisioningPostgresClient
  extends PermissionPostgresClient {
  begin<T>(
    callback: (transaction: PermissionPostgresClient) => Promise<T>,
  ): Promise<T>;
}

export class PermissionProvisioningConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionProvisioningConfigurationError";
  }
}

export class PermissionProvisioningStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionProvisioningStateError";
  }
}

export async function provisionPostgresPermissions(
  client: PermissionProvisioningPostgresClient,
  bundle: PermissionProvisioningBundle,
): Promise<PermissionProvisioningResult> {
  const normalized = normalizeBundle(bundle);

  return client.begin(async (transaction) => {
    await transaction.unsafe(
      `LOCK TABLE
         appbasis_permission_capability,
         appbasis_permission_role,
         appbasis_permission_role_capability,
         appbasis_permission_principal,
         appbasis_permission_principal_role,
         appbasis_permission_principal_grant,
         appbasis_permission_principal_revoke
       IN SHARE ROW EXCLUSIVE MODE`,
    );

    await assertExistingRoleDefinitionsMatch(transaction, normalized.roles);
    await assertExistingPrincipalAssignmentsMatch(
      transaction,
      normalized.principalRoleAssignments,
    );

    let capabilitiesCreated = 0;
    let rolesCreated = 0;
    let roleCapabilitiesCreated = 0;
    let principalsCreated = 0;
    let principalRolesCreated = 0;

    for (const capability of normalized.knownCapabilities) {
      const rows = await transaction.unsafe(
        `INSERT INTO appbasis_permission_capability (capability_id)
         VALUES ($1)
         ON CONFLICT (capability_id) DO NOTHING
         RETURNING capability_id`,
        [capability],
      );
      capabilitiesCreated += rows.length;
    }

    for (const role of normalized.roles) {
      const roleRows = await transaction.unsafe(
        `INSERT INTO appbasis_permission_role (role_id)
         VALUES ($1)
         ON CONFLICT (role_id) DO NOTHING
         RETURNING role_id`,
        [role.roleId],
      );
      rolesCreated += roleRows.length;

      for (const capability of role.capabilities) {
        const rows = await transaction.unsafe(
          `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
           VALUES ($1, $2)
           ON CONFLICT (role_id, capability_id) DO NOTHING
           RETURNING role_id`,
          [role.roleId, capability],
        );
        roleCapabilitiesCreated += rows.length;
      }
    }

    for (const assignment of normalized.principalRoleAssignments) {
      const principalRows = await transaction.unsafe(
        `INSERT INTO appbasis_permission_principal (principal_id)
         VALUES ($1)
         ON CONFLICT (principal_id) DO NOTHING
         RETURNING principal_id`,
        [assignment.principalId],
      );
      principalsCreated += principalRows.length;

      for (const assignedRoleId of assignment.roleIds) {
        const rows = await transaction.unsafe(
          `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (principal_id, role_id) DO NOTHING
           RETURNING principal_id`,
          [assignment.principalId, assignedRoleId],
        );
        principalRolesCreated += rows.length;
      }
    }

    return Object.freeze({
      capabilitiesCreated,
      rolesCreated,
      roleCapabilitiesCreated,
      principalsCreated,
      principalRolesCreated,
    });
  });
}

async function assertExistingRoleDefinitionsMatch(
  transaction: PermissionPostgresClient,
  roles: readonly RoleBundle[],
): Promise<void> {
  for (const role of roles) {
    const existingRoleRows = await transaction.unsafe(
      `SELECT role_id
       FROM appbasis_permission_role
       WHERE role_id = $1`,
      [role.roleId],
    );
    if (existingRoleRows.length === 0) continue;
    if (
      existingRoleRows.length !== 1 ||
      textColumn(existingRoleRows[0], "role_id") !== role.roleId
    ) {
      throw new PermissionProvisioningStateError(
        "Existing permission role state is invalid.",
      );
    }

    const capabilityRows = await transaction.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_role_capability
       WHERE role_id = $1
       ORDER BY capability_id ASC`,
      [role.roleId],
    );
    const existingCapabilities = capabilityRows.map((row) =>
      textColumn(row, "capability_id"),
    );
    if (!sameStrings(existingCapabilities, role.capabilities)) {
      throw new PermissionProvisioningStateError(
        `Existing permission role ${role.roleId} conflicts with the provisioning bundle.`,
      );
    }
  }
}

async function assertExistingPrincipalAssignmentsMatch(
  transaction: PermissionPostgresClient,
  assignments: readonly PrincipalRoleAssignment[],
): Promise<void> {
  for (const assignment of assignments) {
    const principalRows = await transaction.unsafe(
      `SELECT principal_id
       FROM appbasis_permission_principal
       WHERE principal_id = $1`,
      [assignment.principalId],
    );
    if (principalRows.length === 0) continue;
    if (
      principalRows.length !== 1 ||
      textColumn(principalRows[0], "principal_id") !== assignment.principalId
    ) {
      throw new PermissionProvisioningStateError(
        "Existing permission principal state is invalid.",
      );
    }

    const roleRows = await transaction.unsafe(
      `SELECT role_id
       FROM appbasis_permission_principal_role
       WHERE principal_id = $1
       ORDER BY role_id ASC`,
      [assignment.principalId],
    );
    const existingRoleIds = roleRows.map((row) => textColumn(row, "role_id"));
    if (!sameStrings(existingRoleIds, assignment.roleIds)) {
      throw new PermissionProvisioningStateError(
        "Existing principal role assignments conflict with the provisioning bundle.",
      );
    }
  }
}

function normalizeBundle(
  bundle: PermissionProvisioningBundle,
): PermissionProvisioningBundle {
  const knownCapabilities = sortedUniqueIds(
    bundle.knownCapabilities,
    "knownCapabilities",
  );
  const knownCapabilitySet = new Set<string>(knownCapabilities);

  const roleIds = sortedUniqueIds(
    bundle.roles.map((role) => role.roleId),
    "roles",
  );
  const knownRoleSet = new Set<string>(roleIds);
  const roles = [...bundle.roles]
    .map((role) => {
      const capabilities = sortedUniqueIds(
        role.capabilities,
        `role ${role.roleId} capabilities`,
      );
      for (const capability of capabilities) {
        if (!knownCapabilitySet.has(capability)) {
          throw new PermissionProvisioningConfigurationError(
            `Role ${role.roleId} references an unknown provisioning capability.`,
          );
        }
      }
      return Object.freeze({
        roleId: role.roleId,
        capabilities,
      });
    })
    .sort((left, right) => left.roleId.localeCompare(right.roleId));

  const principalIds = sortedUniqueIds(
    bundle.principalRoleAssignments.map((assignment) => assignment.principalId),
    "principalRoleAssignments",
  );
  const principalSet = new Set<string>(principalIds);
  if (principalSet.size !== bundle.principalRoleAssignments.length) {
    throw new PermissionProvisioningConfigurationError(
      "principalRoleAssignments contains duplicate principals.",
    );
  }

  const principalRoleAssignments = [...bundle.principalRoleAssignments]
    .map((assignment) => {
      const assignedRoleIds = sortedUniqueIds(
        assignment.roleIds,
        "principal roleIds",
      );
      for (const assignedRoleId of assignedRoleIds) {
        if (!knownRoleSet.has(assignedRoleId)) {
          throw new PermissionProvisioningConfigurationError(
            "A principal role assignment references an unknown provisioning role.",
          );
        }
      }
      return Object.freeze({
        principalId: assignment.principalId,
        roleIds: assignedRoleIds,
      });
    })
    .sort((left, right) => left.principalId.localeCompare(right.principalId));

  return Object.freeze({
    knownCapabilities,
    roles,
    principalRoleAssignments,
  });
}

function sortedUniqueIds<T extends string>(
  values: readonly T[],
  field: string,
): readonly T[] {
  const normalized = [...values];
  const seen = new Set<string>();
  for (const value of normalized) {
    if (value.length === 0 || value.trim() !== value) {
      throw new PermissionProvisioningConfigurationError(
        `${field} contains an invalid identifier.`,
      );
    }
    if (seen.has(value)) {
      throw new PermissionProvisioningConfigurationError(
        `${field} contains duplicate identifiers.`,
      );
    }
    seen.add(value);
  }
  normalized.sort((left, right) => left.localeCompare(right));
  return Object.freeze(normalized);
}

function sameStrings(
  existing: readonly string[],
  expected: readonly string[],
): boolean {
  if (existing.length !== expected.length) return false;
  return existing.every((value, index) => value === expected[index]);
}

function textColumn(
  row: Readonly<Record<string, unknown>> | undefined,
  column: string,
): string {
  const value = row?.[column];
  if (typeof value !== "string") {
    throw new PermissionProvisioningStateError(
      "Permission provisioning read an invalid PostgreSQL row.",
    );
  }
  return value;
}
