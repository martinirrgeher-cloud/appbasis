import {
  capabilityId,
  principalId,
  type CapabilityId,
  type PrincipalId,
} from "./contracts";
import type { PermissionPostgresClient } from "./postgres-permission-store";
import type {
  RoleAdministrationAuditContext,
  RoleAdministrationPostgresClient,
} from "./role-administration";

const MAX_AUDIT_REASON_LENGTH = 500;

export type PrincipalPermissionAdministrationErrorCode =
  | "INVALID_AUDIT_CONTEXT"
  | "INVALID_OVERRIDES"
  | "LAST_CAPABILITY_HOLDER"
  | "PRINCIPAL_NOT_FOUND"
  | "STALE_PRINCIPAL_PERMISSIONS"
  | "UNKNOWN_CAPABILITY";

export class PrincipalPermissionAdministrationError extends Error {
  readonly code: PrincipalPermissionAdministrationErrorCode;

  constructor(code: PrincipalPermissionAdministrationErrorCode, message: string) {
    super(message);
    this.name = "PrincipalPermissionAdministrationError";
    this.code = code;
  }
}

export interface PrincipalPermissionOverrides {
  readonly grants: readonly CapabilityId[];
  readonly revokes: readonly CapabilityId[];
}

export interface ReplacePrincipalPermissionsConstraints {
  readonly expectedGrants?: readonly CapabilityId[];
  readonly expectedRevokes?: readonly CapabilityId[];
  readonly requiredRemainingCapabilities?: readonly CapabilityId[];
}

interface NormalizedAuditContext {
  readonly actorPrincipalId: PrincipalId;
  readonly reason: string;
}

export class PostgresPrincipalPermissionAdministration {
  readonly #client: RoleAdministrationPostgresClient;

  constructor(client: RoleAdministrationPostgresClient) {
    this.#client = client;
  }

  async replacePrincipalPermissions(
    requestedPrincipalId: PrincipalId,
    requestedOverrides: PrincipalPermissionOverrides,
    auditContext: RoleAdministrationAuditContext,
    constraints: ReplacePrincipalPermissionsConstraints = {},
  ): Promise<PrincipalPermissionOverrides> {
    const normalizedPrincipalId = validatedPrincipalId(requestedPrincipalId);
    const normalized = normalizeOverrides(requestedOverrides);
    const expected = constraints.expectedGrants === undefined && constraints.expectedRevokes === undefined
      ? null
      : normalizeOverrides({
          grants: constraints.expectedGrants ?? [],
          revokes: constraints.expectedRevokes ?? [],
        });
    const requiredRemainingCapabilities = sortedUniqueCapabilities(
      constraints.requiredRemainingCapabilities ?? [],
    );
    const audit = normalizeAuditContext(auditContext);

    return this.#client.begin(async (transaction) => {
      const principals = await transaction.unsafe(
        `SELECT principal_id
         FROM appbasis_permission_principal
         WHERE principal_id = $1
         FOR UPDATE`,
        [normalizedPrincipalId],
      );
      if (principals.length !== 1) {
        throw new PrincipalPermissionAdministrationError(
          "PRINCIPAL_NOT_FOUND",
          "Permission principal does not exist.",
        );
      }

      const previous = await loadDirectOverrides(transaction, normalizedPrincipalId);
      if (
        expected !== null &&
        (!sameCapabilities(previous.grants, expected.grants) ||
          !sameCapabilities(previous.revokes, expected.revokes))
      ) {
        throw new PrincipalPermissionAdministrationError(
          "STALE_PRINCIPAL_PERMISSIONS",
          "Principal permission overrides changed after the caller loaded them.",
        );
      }

      await assertKnownCapabilities(transaction, [
        ...normalized.grants,
        ...normalized.revokes,
      ]);

      if (requiredRemainingCapabilities.length !== 0) {
        await assertRequiredCapabilitySetHolderRemains(
          transaction,
          normalizedPrincipalId,
          normalized,
          requiredRemainingCapabilities,
        );
      }

      await transaction.unsafe(
        `DELETE FROM appbasis_permission_principal_grant
         WHERE principal_id = $1`,
        [normalizedPrincipalId],
      );
      await transaction.unsafe(
        `DELETE FROM appbasis_permission_principal_revoke
         WHERE principal_id = $1`,
        [normalizedPrincipalId],
      );

      for (const capability of normalized.grants) {
        await transaction.unsafe(
          `INSERT INTO appbasis_permission_principal_grant (principal_id, capability_id)
           VALUES ($1, $2)`,
          [normalizedPrincipalId, capability],
        );
      }
      for (const capability of normalized.revokes) {
        await transaction.unsafe(
          `INSERT INTO appbasis_permission_principal_revoke (principal_id, capability_id)
           VALUES ($1, $2)`,
          [normalizedPrincipalId, capability],
        );
      }

      await transaction.unsafe(
        `INSERT INTO appbasis_permission_administration_audit (
           event_type,
           actor_principal_id,
           reason,
           target_type,
           target_id,
           previous_value,
           new_value
         )
         VALUES ('principal.permissions.replace', $1, $2, 'principal', $3, $4::jsonb, $5::jsonb)`,
        [
          audit.actorPrincipalId,
          audit.reason,
          normalizedPrincipalId,
          JSON.stringify(previous),
          JSON.stringify(normalized),
        ],
      );

      return normalized;
    });
  }
}

async function loadDirectOverrides(
  client: PermissionPostgresClient,
  requestedPrincipalId: PrincipalId,
): Promise<PrincipalPermissionOverrides> {
  const grantRows = await client.unsafe(
    `SELECT capability_id
     FROM appbasis_permission_principal_grant
     WHERE principal_id = $1
     ORDER BY capability_id ASC`,
    [requestedPrincipalId],
  );
  const revokeRows = await client.unsafe(
    `SELECT capability_id
     FROM appbasis_permission_principal_revoke
     WHERE principal_id = $1
     ORDER BY capability_id ASC`,
    [requestedPrincipalId],
  );
  return {
    grants: grantRows.map((row) => capabilityId(requiredString(row, "capability_id"))),
    revokes: revokeRows.map((row) => capabilityId(requiredString(row, "capability_id"))),
  };
}

async function assertKnownCapabilities(
  client: PermissionPostgresClient,
  capabilities: readonly CapabilityId[],
): Promise<void> {
  for (const capability of capabilities) {
    const rows = await client.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_capability
       WHERE capability_id = $1`,
      [capability],
    );
    if (rows.length !== 1) {
      throw new PrincipalPermissionAdministrationError(
        "UNKNOWN_CAPABILITY",
        `Unknown capability ${capability}.`,
      );
    }
  }
}

async function assertRequiredCapabilitySetHolderRemains(
  client: PermissionPostgresClient,
  targetPrincipalId: PrincipalId,
  requestedOverrides: PrincipalPermissionOverrides,
  capabilities: readonly CapabilityId[],
): Promise<void> {
  const capabilityPlaceholders = capabilities
    .map((_, index) => `$${index + 1}`)
    .join(", ");
  const capabilityRows = await client.unsafe(
    `SELECT capability_id
     FROM appbasis_permission_capability
     WHERE capability_id IN (${capabilityPlaceholders})
     ORDER BY capability_id ASC
     FOR UPDATE`,
    [...capabilities],
  );
  const lockedCapabilities = capabilityRows.map((row) =>
    capabilityId(requiredString(row, "capability_id")),
  );
  if (!sameCapabilities(lockedCapabilities, capabilities)) {
    throw new PrincipalPermissionAdministrationError(
      "UNKNOWN_CAPABILITY",
      "At least one required capability is unknown.",
    );
  }

  if (
    await principalWouldHaveCapabilities(
      client,
      targetPrincipalId,
      requestedOverrides,
      capabilities,
    )
  ) {
    return;
  }

  const requiredCapabilityValues = capabilities
    .map((_, index) => `($${index + 2})`)
    .join(", ");
  const rows = await client.unsafe(
    `WITH required_capability(capability_id) AS (
       VALUES ${requiredCapabilityValues}
     )
     SELECT EXISTS (
       SELECT 1
       FROM appbasis_permission_principal principal
       WHERE principal.principal_id <> $1
         AND NOT EXISTS (
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
    [targetPrincipalId, ...capabilities],
  );
  if (!requiredBoolean(rows[0], "exists")) {
    throw new PrincipalPermissionAdministrationError(
      "LAST_CAPABILITY_HOLDER",
      `At least one principal must retain all required capabilities: ${capabilities.join(", ")}.`,
    );
  }
}

async function principalWouldHaveCapabilities(
  client: PermissionPostgresClient,
  principal: PrincipalId,
  overrides: PrincipalPermissionOverrides,
  capabilities: readonly CapabilityId[],
): Promise<boolean> {
  const grantSet = new Set(overrides.grants);
  const revokeSet = new Set(overrides.revokes);
  for (const capability of capabilities) {
    if (revokeSet.has(capability)) return false;
    if (grantSet.has(capability)) continue;

    const rows = await client.unsafe(
      `SELECT EXISTS (
         SELECT 1
         FROM appbasis_permission_principal_role principal_role
         JOIN appbasis_permission_role role
           ON role.role_id = principal_role.role_id
          AND role.state = 'active'
         JOIN appbasis_permission_role_capability role_capability
           ON role_capability.role_id = role.role_id
         WHERE principal_role.principal_id = $1
           AND role_capability.capability_id = $2
       ) AS allowed`,
      [principal, capability],
    );
    if (!requiredBoolean(rows[0], "allowed")) return false;
  }
  return true;
}

function normalizeOverrides(
  input: PrincipalPermissionOverrides,
): PrincipalPermissionOverrides {
  const grants = sortedUniqueCapabilities(input.grants);
  const revokes = sortedUniqueCapabilities(input.revokes);
  const revokeSet = new Set(revokes);
  const overlap = grants.find((capability) => revokeSet.has(capability));
  if (overlap !== undefined) {
    throw new PrincipalPermissionAdministrationError(
      "INVALID_OVERRIDES",
      `Capability ${overlap} cannot be both granted and revoked.`,
    );
  }
  return { grants, revokes };
}

function sortedUniqueCapabilities(
  values: readonly CapabilityId[],
): readonly CapabilityId[] {
  const normalized = values.map((value) => validatedCapabilityId(value));
  return [...new Set(normalized.map(String))]
    .sort((left, right) => left.localeCompare(right))
    .map(capabilityId);
}

function validatedCapabilityId(value: CapabilityId): CapabilityId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new PrincipalPermissionAdministrationError(
      "INVALID_OVERRIDES",
      "Capability ID is invalid.",
    );
  }
  return capabilityId(raw);
}

function validatedPrincipalId(value: PrincipalId): PrincipalId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new PrincipalPermissionAdministrationError(
      "PRINCIPAL_NOT_FOUND",
      "Principal ID is invalid.",
    );
  }
  return principalId(raw);
}

function normalizeAuditContext(
  context: RoleAdministrationAuditContext,
): NormalizedAuditContext {
  const actorPrincipalId = validatedAuditPrincipalId(context.actorPrincipalId);
  const reason = context.reason.trim();
  if (
    reason.length === 0 ||
    reason.length > MAX_AUDIT_REASON_LENGTH ||
    reason !== context.reason
  ) {
    throw new PrincipalPermissionAdministrationError(
      "INVALID_AUDIT_CONTEXT",
      `Audit reason must be trimmed and contain 1-${MAX_AUDIT_REASON_LENGTH} characters.`,
    );
  }
  return { actorPrincipalId, reason };
}

function validatedAuditPrincipalId(value: PrincipalId): PrincipalId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new PrincipalPermissionAdministrationError(
      "INVALID_AUDIT_CONTEXT",
      "Audit actor principal ID is invalid.",
    );
  }
  return principalId(raw);
}

function sameCapabilities(
  left: readonly CapabilityId[],
  right: readonly CapabilityId[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Permission principal row has an invalid ${field}.`);
  }
  return value;
}

function requiredBoolean(
  row: Record<string, unknown> | undefined,
  field: string,
): boolean {
  const value = row?.[field];
  if (typeof value !== "boolean") {
    throw new Error(`Permission principal row has an invalid ${field}.`);
  }
  return value;
}
