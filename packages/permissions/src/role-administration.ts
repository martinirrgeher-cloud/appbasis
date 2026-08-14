import {
  capabilityId,
  principalId,
  roleId,
  type CapabilityId,
  type PrincipalId,
  type RoleDetails,
  type RoleId,
  type RoleKind,
  type RoleState,
} from "./contracts";
import type { PermissionPostgresClient } from "./postgres-permission-store";

const ROLE_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,119}$/;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_AUDIT_REASON_LENGTH = 500;

export type RoleAdministrationErrorCode =
  | "INVALID_AUDIT_CONTEXT"
  | "INVALID_ROLE"
  | "PRINCIPAL_NOT_FOUND"
  | "ROLE_ACTIVE"
  | "ROLE_IN_USE"
  | "ROLE_NOT_FOUND"
  | "ROLE_PROTECTED"
  | "UNKNOWN_CAPABILITY";

export class RoleAdministrationError extends Error {
  readonly code: RoleAdministrationErrorCode;

  constructor(code: RoleAdministrationErrorCode, message: string) {
    super(message);
    this.name = "RoleAdministrationError";
    this.code = code;
  }
}

export interface RoleAdministrationAuditContext {
  readonly actorPrincipalId: PrincipalId;
  readonly reason: string;
}

export interface CreateManagedRoleInput {
  readonly roleId: RoleId;
  readonly displayName: string;
  readonly description?: string | null;
  readonly capabilities: readonly CapabilityId[];
}

export interface UpdateManagedRoleInput {
  readonly displayName: string;
  readonly description?: string | null;
  readonly capabilities: readonly CapabilityId[];
}

export interface RoleAdministrationPostgresClient extends PermissionPostgresClient {
  begin<T>(
    callback: (transaction: PermissionPostgresClient) => Promise<T>,
  ): Promise<T>;
}

interface NormalizedAuditContext {
  readonly actorPrincipalId: PrincipalId;
  readonly reason: string;
}

type AuditEventType =
  | "role.create"
  | "role.update"
  | "role.state"
  | "role.delete"
  | "principal.roles.replace";

type AuditTargetType = "role" | "principal";

export class PostgresRoleAdministration {
  readonly #client: RoleAdministrationPostgresClient;

  constructor(client: RoleAdministrationPostgresClient) {
    this.#client = client;
  }

  async listRoles(): Promise<readonly RoleDetails[]> {
    const rows = await this.#client.unsafe(
      `SELECT
         role.role_id,
         role.display_name,
         role.description,
         role.state,
         role.kind,
         (
           SELECT COUNT(*)::int
           FROM appbasis_permission_principal_role principal_role
           WHERE principal_role.role_id = role.role_id
         ) AS assigned_principal_count
       FROM appbasis_permission_role role
       ORDER BY COALESCE(role.display_name, role.role_id) ASC, role.role_id ASC`,
    );

    const roles = [];
    for (const row of rows) {
      roles.push(await roleDetailsFromRow(this.#client, row));
    }
    return roles;
  }

  async findRole(requestedRoleId: RoleId): Promise<RoleDetails | null> {
    return loadRoleDetails(this.#client, requestedRoleId, false);
  }

  async listKnownCapabilities(): Promise<readonly CapabilityId[]> {
    const rows = await this.#client.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_capability
       ORDER BY capability_id ASC`,
    );
    return rows.map((row) => capabilityId(requiredString(row, "capability_id")));
  }

  async createRole(
    input: CreateManagedRoleInput,
    auditContext: RoleAdministrationAuditContext,
  ): Promise<RoleDetails> {
    const normalized = normalizeManagedRoleInput(input.roleId, input);
    const audit = normalizeAuditContext(auditContext);

    return this.#client.begin(async (transaction) => {
      const existing = await transaction.unsafe(
        `SELECT role_id
         FROM appbasis_permission_role
         WHERE role_id = $1
         FOR UPDATE`,
        [normalized.roleId],
      );
      if (existing.length !== 0) {
        throw new RoleAdministrationError(
          "INVALID_ROLE",
          `Role ${normalized.roleId} already exists.`,
        );
      }

      await assertKnownCapabilities(transaction, normalized.capabilities);
      await transaction.unsafe(
        `INSERT INTO appbasis_permission_role (
           role_id,
           display_name,
           description,
           state,
           kind
         )
         VALUES ($1, $2, $3, 'active', 'managed')`,
        [normalized.roleId, normalized.displayName, normalized.description],
      );
      await replaceRoleCapabilities(
        transaction,
        normalized.roleId,
        normalized.capabilities,
      );

      const created = await requiredRoleDetails(transaction, normalized.roleId);
      await recordAdministrationAudit(transaction, {
        eventType: "role.create",
        targetType: "role",
        targetId: normalized.roleId,
        audit,
        previousValue: null,
        newValue: created,
      });
      return created;
    });
  }

  async updateRole(
    requestedRoleId: RoleId,
    input: UpdateManagedRoleInput,
    auditContext: RoleAdministrationAuditContext,
  ): Promise<RoleDetails> {
    const normalizedRoleId = validatedRoleId(requestedRoleId);
    const normalized = normalizeManagedRoleInput(normalizedRoleId, input);
    const audit = normalizeAuditContext(auditContext);

    return this.#client.begin(async (transaction) => {
      await requireManagedRoleForUpdate(transaction, normalizedRoleId);
      const previous = await requiredRoleDetails(transaction, normalizedRoleId);
      await assertKnownCapabilities(transaction, normalized.capabilities);

      await transaction.unsafe(
        `UPDATE appbasis_permission_role
         SET display_name = $2,
             description = $3
         WHERE role_id = $1`,
        [normalizedRoleId, normalized.displayName, normalized.description],
      );
      await replaceRoleCapabilities(
        transaction,
        normalizedRoleId,
        normalized.capabilities,
      );

      const updated = await requiredRoleDetails(transaction, normalizedRoleId);
      await recordAdministrationAudit(transaction, {
        eventType: "role.update",
        targetType: "role",
        targetId: normalizedRoleId,
        audit,
        previousValue: previous,
        newValue: updated,
      });
      return updated;
    });
  }

  async setRoleState(
    requestedRoleId: RoleId,
    state: RoleState,
    auditContext: RoleAdministrationAuditContext,
  ): Promise<RoleDetails> {
    const normalizedRoleId = validatedRoleId(requestedRoleId);
    const audit = normalizeAuditContext(auditContext);
    if (state !== "active" && state !== "inactive") {
      throw new RoleAdministrationError("INVALID_ROLE", "Role state is invalid.");
    }

    return this.#client.begin(async (transaction) => {
      await requireManagedRoleForUpdate(transaction, normalizedRoleId);
      const previous = await requiredRoleDetails(transaction, normalizedRoleId);
      await transaction.unsafe(
        `UPDATE appbasis_permission_role
         SET state = $2
         WHERE role_id = $1`,
        [normalizedRoleId, state],
      );
      const updated = await requiredRoleDetails(transaction, normalizedRoleId);
      await recordAdministrationAudit(transaction, {
        eventType: "role.state",
        targetType: "role",
        targetId: normalizedRoleId,
        audit,
        previousValue: previous,
        newValue: updated,
      });
      return updated;
    });
  }

  async deleteRole(
    requestedRoleId: RoleId,
    auditContext: RoleAdministrationAuditContext,
  ): Promise<void> {
    const normalizedRoleId = validatedRoleId(requestedRoleId);
    const audit = normalizeAuditContext(auditContext);

    await this.#client.begin(async (transaction) => {
      const role = await requireManagedRoleForUpdate(transaction, normalizedRoleId);
      if (role.state !== "inactive") {
        throw new RoleAdministrationError(
          "ROLE_ACTIVE",
          "Only inactive managed roles can be deleted.",
        );
      }

      const previous = await requiredRoleDetails(transaction, normalizedRoleId);
      const assignments = await transaction.unsafe(
        `SELECT COUNT(*)::int AS assignment_count
         FROM appbasis_permission_principal_role
         WHERE role_id = $1`,
        [normalizedRoleId],
      );
      if (requiredInteger(assignments[0], "assignment_count") !== 0) {
        throw new RoleAdministrationError(
          "ROLE_IN_USE",
          "Assigned roles cannot be deleted.",
        );
      }

      await transaction.unsafe(
        `DELETE FROM appbasis_permission_role
         WHERE role_id = $1`,
        [normalizedRoleId],
      );
      await recordAdministrationAudit(transaction, {
        eventType: "role.delete",
        targetType: "role",
        targetId: normalizedRoleId,
        audit,
        previousValue: previous,
        newValue: null,
      });
    });
  }

  async replacePrincipalRoles(
    requestedPrincipalId: PrincipalId,
    requestedRoleIds: readonly RoleId[],
    auditContext: RoleAdministrationAuditContext,
  ): Promise<readonly RoleId[]> {
    const normalizedPrincipalId = validatedPrincipalId(requestedPrincipalId);
    const normalizedRoleIds = sortedUniqueRoleIds(requestedRoleIds);
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
        throw new RoleAdministrationError(
          "PRINCIPAL_NOT_FOUND",
          "Permission principal does not exist.",
        );
      }

      const previousRoleRows = await transaction.unsafe(
        `SELECT role_id
         FROM appbasis_permission_principal_role
         WHERE principal_id = $1
         ORDER BY role_id ASC`,
        [normalizedPrincipalId],
      );
      const previousRoleIds = previousRoleRows.map((row) =>
        roleId(requiredString(row, "role_id")),
      );

      for (const assignedRoleId of normalizedRoleIds) {
        const roles = await transaction.unsafe(
          `SELECT role_id
           FROM appbasis_permission_role
           WHERE role_id = $1
             AND state = 'active'`,
          [assignedRoleId],
        );
        if (roles.length !== 1) {
          throw new RoleAdministrationError(
            "ROLE_NOT_FOUND",
            `Active role ${assignedRoleId} does not exist.`,
          );
        }
      }

      await transaction.unsafe(
        `DELETE FROM appbasis_permission_principal_role
         WHERE principal_id = $1`,
        [normalizedPrincipalId],
      );
      for (const assignedRoleId of normalizedRoleIds) {
        await transaction.unsafe(
          `INSERT INTO appbasis_permission_principal_role (principal_id, role_id)
           VALUES ($1, $2)`,
          [normalizedPrincipalId, assignedRoleId],
        );
      }

      await recordAdministrationAudit(transaction, {
        eventType: "principal.roles.replace",
        targetType: "principal",
        targetId: normalizedPrincipalId,
        audit,
        previousValue: { roleIds: previousRoleIds },
        newValue: { roleIds: normalizedRoleIds },
      });
      return normalizedRoleIds;
    });
  }
}

async function recordAdministrationAudit(
  client: PermissionPostgresClient,
  input: {
    readonly eventType: AuditEventType;
    readonly targetType: AuditTargetType;
    readonly targetId: string;
    readonly audit: NormalizedAuditContext;
    readonly previousValue: unknown | null;
    readonly newValue: unknown | null;
  },
): Promise<void> {
  await client.unsafe(
    `INSERT INTO appbasis_permission_administration_audit (
       event_type,
       actor_principal_id,
       reason,
       target_type,
       target_id,
       previous_value,
       new_value
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      input.eventType,
      input.audit.actorPrincipalId,
      input.audit.reason,
      input.targetType,
      input.targetId,
      jsonValue(input.previousValue),
      jsonValue(input.newValue),
    ],
  );
}

function jsonValue(value: unknown | null): string | null {
  return value === null ? null : JSON.stringify(value);
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
    throw new RoleAdministrationError(
      "INVALID_AUDIT_CONTEXT",
      `Audit reason must be trimmed and contain 1-${MAX_AUDIT_REASON_LENGTH} characters.`,
    );
  }
  return { actorPrincipalId, reason };
}

function validatedAuditPrincipalId(value: PrincipalId): PrincipalId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new RoleAdministrationError(
      "INVALID_AUDIT_CONTEXT",
      "Audit actor principal ID is invalid.",
    );
  }
  return principalId(raw);
}

async function requireManagedRoleForUpdate(
  client: PermissionPostgresClient,
  requestedRoleId: RoleId,
): Promise<{ readonly state: RoleState }> {
  const rows = await client.unsafe(
    `SELECT role_id, state, kind
     FROM appbasis_permission_role
     WHERE role_id = $1
     FOR UPDATE`,
    [requestedRoleId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new RoleAdministrationError("ROLE_NOT_FOUND", "Role does not exist.");
  }
  const kind = requiredRoleKind(row, "kind");
  if (kind !== "managed") {
    throw new RoleAdministrationError(
      "ROLE_PROTECTED",
      "System roles cannot be changed through managed role administration.",
    );
  }
  return { state: requiredRoleState(row, "state") };
}

async function requiredRoleDetails(
  client: PermissionPostgresClient,
  requestedRoleId: RoleId,
): Promise<RoleDetails> {
  const details = await loadRoleDetails(client, requestedRoleId, false);
  if (details === null) {
    throw new RoleAdministrationError("ROLE_NOT_FOUND", "Role does not exist.");
  }
  return details;
}

async function loadRoleDetails(
  client: PermissionPostgresClient,
  requestedRoleId: RoleId,
  activeOnly: boolean,
): Promise<RoleDetails | null> {
  const rows = await client.unsafe(
    `SELECT
       role.role_id,
       role.display_name,
       role.description,
       role.state,
       role.kind,
       (
         SELECT COUNT(*)::int
         FROM appbasis_permission_principal_role principal_role
         WHERE principal_role.role_id = role.role_id
       ) AS assigned_principal_count
     FROM appbasis_permission_role role
     WHERE role.role_id = $1
       ${activeOnly ? "AND role.state = 'active'" : ""}
     LIMIT 1`,
    [requestedRoleId],
  );
  const row = rows[0];
  return row === undefined ? null : roleDetailsFromRow(client, row);
}

async function roleDetailsFromRow(
  client: PermissionPostgresClient,
  row: Record<string, unknown>,
): Promise<RoleDetails> {
  const resolvedRoleId = roleId(requiredString(row, "role_id"));
  const capabilityRows = await client.unsafe(
    `SELECT capability_id
     FROM appbasis_permission_role_capability
     WHERE role_id = $1
     ORDER BY capability_id ASC`,
    [resolvedRoleId],
  );
  const storedDisplayName = nullableString(row, "display_name");

  return {
    roleId: resolvedRoleId,
    displayName: storedDisplayName ?? humanizeRoleId(resolvedRoleId),
    description: nullableString(row, "description"),
    state: requiredRoleState(row, "state"),
    kind: requiredRoleKind(row, "kind"),
    assignedPrincipalCount: requiredInteger(row, "assigned_principal_count"),
    capabilities: capabilityRows.map((capabilityRow) =>
      capabilityId(requiredString(capabilityRow, "capability_id")),
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
      throw new RoleAdministrationError(
        "UNKNOWN_CAPABILITY",
        `Unknown capability ${capability}.`,
      );
    }
  }
}

async function replaceRoleCapabilities(
  client: PermissionPostgresClient,
  requestedRoleId: RoleId,
  capabilities: readonly CapabilityId[],
): Promise<void> {
  await client.unsafe(
    `DELETE FROM appbasis_permission_role_capability
     WHERE role_id = $1`,
    [requestedRoleId],
  );
  for (const capability of capabilities) {
    await client.unsafe(
      `INSERT INTO appbasis_permission_role_capability (role_id, capability_id)
       VALUES ($1, $2)`,
      [requestedRoleId, capability],
    );
  }
}

function normalizeManagedRoleInput(
  requestedRoleId: RoleId,
  input: UpdateManagedRoleInput,
): {
  readonly roleId: RoleId;
  readonly displayName: string;
  readonly description: string | null;
  readonly capabilities: readonly CapabilityId[];
} {
  return {
    roleId: validatedRoleId(requestedRoleId),
    displayName: validatedDisplayName(input.displayName),
    description: validatedDescription(input.description ?? null),
    capabilities: sortedUniqueCapabilities(input.capabilities),
  };
}

function validatedRoleId(value: RoleId): RoleId {
  const raw = String(value);
  if (!ROLE_ID_PATTERN.test(raw)) {
    throw new RoleAdministrationError(
      "INVALID_ROLE",
      "Role ID must use lowercase letters, numbers, colon, underscore or hyphen.",
    );
  }
  return roleId(raw);
}

function validatedPrincipalId(value: PrincipalId): PrincipalId {
  const raw = String(value);
  if (raw.length === 0 || raw.length > 200 || raw !== raw.trim()) {
    throw new RoleAdministrationError(
      "INVALID_ROLE",
      "Principal ID is invalid.",
    );
  }
  return principalId(raw);
}

function validatedDisplayName(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_DISPLAY_NAME_LENGTH ||
    normalized !== value
  ) {
    throw new RoleAdministrationError(
      "INVALID_ROLE",
      `Display name must be trimmed and contain 1-${MAX_DISPLAY_NAME_LENGTH} characters.`,
    );
  }
  return normalized;
}

function validatedDescription(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > MAX_DESCRIPTION_LENGTH) {
    throw new RoleAdministrationError(
      "INVALID_ROLE",
      `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters.`,
    );
  }
  return normalized;
}

function sortedUniqueCapabilities(
  values: readonly CapabilityId[],
): readonly CapabilityId[] {
  return [...new Set(values.map(String))]
    .sort((left, right) => left.localeCompare(right))
    .map(capabilityId);
}

function sortedUniqueRoleIds(values: readonly RoleId[]): readonly RoleId[] {
  return [...new Set(values.map((value) => String(validatedRoleId(value))))]
    .sort((left, right) => left.localeCompare(right))
    .map(roleId);
}

function humanizeRoleId(value: RoleId): string {
  const technicalName = String(value).split(":").at(-1) ?? String(value);
  const displayName = technicalName
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
  return displayName.length === 0 ? String(value) : displayName;
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Permission role row has an invalid ${field}.`);
  }
  return value;
}

function nullableString(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Permission role row has an invalid ${field}.`);
  }
  return value;
}

function requiredInteger(
  row: Record<string, unknown> | undefined,
  field: string,
): number {
  const value = row?.[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Permission role row has an invalid ${field}.`);
  }
  return value;
}

function requiredRoleState(
  row: Record<string, unknown>,
  field: string,
): RoleState {
  const value = row[field];
  if (value !== "active" && value !== "inactive") {
    throw new Error(`Permission role row has an invalid ${field}.`);
  }
  return value;
}

function requiredRoleKind(
  row: Record<string, unknown>,
  field: string,
): RoleKind {
  const value = row[field];
  if (value !== "system" && value !== "managed") {
    throw new Error(`Permission role row has an invalid ${field}.`);
  }
  return value;
}
