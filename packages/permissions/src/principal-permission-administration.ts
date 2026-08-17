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
    const expected =
      constraints.expectedGrants === undefined &&
      constraints.expectedRevokes === undefined
        ? null
        : normalizeOverrides({
            grants: constraints.expectedGrants ?? [],
            revokes: constraints.expectedRevokes ?? [],
          });
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

      const previous = await loadDirectOverrides(
        transaction,
        normalizedPrincipalId,
      );
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
    grants: grantRows.map((row) =>
      capabilityId(requiredString(row, "capability_id")),
    ),
    revokes: revokeRows.map((row) =>
      capabilityId(requiredString(row, "capability_id")),
    ),
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
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== left.length || rightSet.size !== right.length) return false;
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Permission principal row has an invalid ${field}.`);
  }
  return value;
}
