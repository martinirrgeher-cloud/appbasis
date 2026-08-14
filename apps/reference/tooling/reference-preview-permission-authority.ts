import { pathToFileURL } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';
import {
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  type PermissionPostgresClient,
} from '@appbasis/permissions';

const TARGET = 'reference-preview';
const DEMO_USERNAME = 'demo.user';
const lifecycleColumns = ['display_name', 'description', 'state', 'kind'] as const;
const lifecycleConstraints = [
  'appbasis_permission_role_display_name_check',
  'appbasis_permission_role_description_check',
  'appbasis_permission_role_state_check',
  'appbasis_permission_role_kind_check',
] as const;
const lifecycleIndexes = [
  'appbasis_permission_role_state_idx',
  'appbasis_permission_role_kind_idx',
] as const;
const auditColumns = [
  'event_id',
  'event_type',
  'actor_principal_id',
  'reason',
  'target_type',
  'target_id',
  'previous_value',
  'new_value',
  'created_at',
] as const;
const auditConstraints = [
  'appbasis_permission_administration_audit_event_type_check',
  'appbasis_permission_administration_audit_actor_check',
  'appbasis_permission_administration_audit_reason_check',
  'appbasis_permission_administration_audit_target_type_check',
  'appbasis_permission_administration_audit_target_id_check',
  'appbasis_permission_administration_audit_values_check',
] as const;
const auditIndexes = [
  'appbasis_permission_administration_audit_target_idx',
  'appbasis_permission_administration_audit_actor_idx',
] as const;

export class ReferencePermissionAuthorityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePermissionAuthorityConfigurationError';
  }
}

export class ReferencePermissionAuthorityStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePermissionAuthorityStateError';
  }
}

export interface ReferencePermissionAuthorityVerificationInput {
  readonly connectionString: string;
}

export async function verifyReferencePreviewPermissionAuthority(
  input: ReferencePermissionAuthorityVerificationInput,
) {
  const connection = createPostgresDatabase(input.connectionString);
  try {
    await verifySchemaVersion3(connection.client);
    await verifySystemRoleBundles(connection.client);
    const demoPrincipalId = await verifyDemoPrincipal(connection.client);
    const assignmentCount = await verifyReferenceSystemAssignments(connection.client);
    await verifyAuthenticationIdentityBoundary(connection.client);
    return Object.freeze({
      schemaVersion: 3,
      assignmentCount,
      demoPrincipalId,
    });
  } finally {
    await connection.client.end();
  }
}

export function safeReferencePermissionAuthorityDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  switch (error.name) {
    case 'ReferencePermissionAuthorityConfigurationError':
      return 'authority-configuration';
    case 'ReferencePermissionAuthorityStateError':
      return 'authority-state';
    case 'TypeError':
      return 'input-validation';
    default:
      return 'unknown';
  }
}

async function runFromEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const target = env.APPBASIS_PERMISSION_AUTHORITY_TARGET?.trim();
  if (target !== TARGET) {
    throw new ReferencePermissionAuthorityConfigurationError(
      'Invalid Reference permission authority target.',
    );
  }
  const connectionString = requiredEnvironmentValue(
    env.APPBASIS_DATABASE_URL,
    'database connection',
  );
  return verifyReferencePreviewPermissionAuthority({ connectionString });
}

async function verifySchemaVersion3(client: PermissionPostgresClient): Promise<void> {
  const relations = await client.unsafe(
    `SELECT
       to_regclass('public.appbasis_permission_role')::text AS role_table,
       to_regclass('public.appbasis_permission_capability')::text AS capability_table,
       to_regclass('public.appbasis_permission_role_capability')::text AS role_capability_table,
       to_regclass('public.appbasis_permission_principal')::text AS principal_table,
       to_regclass('public.appbasis_permission_principal_role')::text AS principal_role_table,
       to_regclass('public.appbasis_permission_principal_grant')::text AS principal_grant_table,
       to_regclass('public.appbasis_permission_principal_revoke')::text AS principal_revoke_table,
       to_regclass('public.appbasis_permission_administration_audit')::text AS audit_table`,
  );
  const relationState = relations[0];
  if (
    relationState?.role_table !== 'appbasis_permission_role' ||
    relationState?.capability_table !== 'appbasis_permission_capability' ||
    relationState?.role_capability_table !== 'appbasis_permission_role_capability' ||
    relationState?.principal_table !== 'appbasis_permission_principal' ||
    relationState?.principal_role_table !== 'appbasis_permission_principal_role' ||
    relationState?.principal_grant_table !== 'appbasis_permission_principal_grant' ||
    relationState?.principal_revoke_table !== 'appbasis_permission_principal_revoke' ||
    relationState?.audit_table !== 'appbasis_permission_administration_audit'
  ) {
    throw new ReferencePermissionAuthorityStateError(
      'Reference permission authority schema is incomplete.',
    );
  }

  await requireFeature(
    client,
    'appbasis_permission_role',
    lifecycleColumns,
    lifecycleConstraints,
    lifecycleIndexes,
  );
  await requireFeature(
    client,
    'appbasis_permission_administration_audit',
    auditColumns,
    auditConstraints,
    auditIndexes,
  );
}

async function verifySystemRoleBundles(client: PermissionPostgresClient): Promise<void> {
  for (const bundle of DEMO_ROLE_BUNDLES) {
    const roleRows = await client.unsafe(
      `SELECT state, kind
       FROM appbasis_permission_role
       WHERE role_id = $1`,
      [bundle.roleId],
    );
    if (
      roleRows.length !== 1 ||
      roleRows[0]?.state !== 'active' ||
      roleRows[0]?.kind !== 'system'
    ) {
      throw new ReferencePermissionAuthorityStateError(
        'Reference system role is missing, inactive or not protected.',
      );
    }
    const capabilityRows = await client.unsafe(
      `SELECT capability_id
       FROM appbasis_permission_role_capability
       WHERE role_id = $1`,
      [bundle.roleId],
    );
    if (
      !sameStringSet(
        capabilityRows.map((row) => textColumn(row, 'capability_id')),
        bundle.capabilities,
      )
    ) {
      throw new ReferencePermissionAuthorityStateError(
        'Reference system role capabilities do not match the declared bundle.',
      );
    }
  }
}

async function verifyDemoPrincipal(client: PermissionPostgresClient): Promise<string> {
  const rows = await client.unsafe(
    `SELECT identity_user.id AS principal_id, security.identity_id
     FROM "user" identity_user
     LEFT JOIN appbasis_identity_security_state security
       ON security.identity_id = identity_user.id
     WHERE identity_user.username = $1`,
    [DEMO_USERNAME],
  );
  if (rows.length !== 1) {
    throw new ReferencePermissionAuthorityStateError(
      'Reference demo authentication identity is missing or ambiguous.',
    );
  }
  const principalId = textColumn(rows[0] ?? {}, 'principal_id');
  if (rows[0]?.identity_id !== principalId) {
    throw new ReferencePermissionAuthorityStateError(
      'Reference demo identity has no AppBasis application state.',
    );
  }

  const systemRoles = await client.unsafe(
    `SELECT role_id
     FROM appbasis_permission_principal_role
     WHERE principal_id = $1
       AND role_id IN ($2, $3)`,
    [principalId, DEMO_ROLES.member, DEMO_ROLES.admin],
  );
  if (
    !sameStringSet(
      systemRoles.map((row) => textColumn(row, 'role_id')),
      [DEMO_ROLES.member],
    )
  ) {
    throw new ReferencePermissionAuthorityStateError(
      'Reference demo identity does not have the required persistent member role.',
    );
  }
  return principalId;
}

async function verifyReferenceSystemAssignments(
  client: PermissionPostgresClient,
): Promise<number> {
  const rows = await client.unsafe(
    `SELECT assignment.principal_id, assignment.role_id, security.identity_id
     FROM appbasis_permission_principal_role assignment
     LEFT JOIN appbasis_identity_security_state security
       ON security.identity_id = assignment.principal_id
     WHERE assignment.role_id IN ($1, $2)
     ORDER BY assignment.principal_id ASC, assignment.role_id ASC`,
    [DEMO_ROLES.member, DEMO_ROLES.admin],
  );
  if (rows.length === 0) {
    throw new ReferencePermissionAuthorityStateError(
      'Reference permission authority contains no persistent application assignments.',
    );
  }
  for (const row of rows) {
    const principalId = textColumn(row, 'principal_id');
    if (row.identity_id !== principalId) {
      throw new ReferencePermissionAuthorityStateError(
        'Reference system role is assigned to a principal without AppBasis application state.',
      );
    }
  }
  return rows.length;
}

async function verifyAuthenticationIdentityBoundary(
  client: PermissionPostgresClient,
): Promise<void> {
  const rows = await client.unsafe(
    `SELECT
       identity_user.id AS principal_id,
       identity_user.role AS auth_role,
       security.identity_id,
       EXISTS(
         SELECT 1 FROM appbasis_permission_principal
         WHERE principal_id = identity_user.id
       ) AS principal_exists,
       EXISTS(
         SELECT 1 FROM appbasis_permission_principal_role
         WHERE principal_id = identity_user.id
       ) AS role_exists,
       EXISTS(
         SELECT 1 FROM appbasis_permission_principal_grant
         WHERE principal_id = identity_user.id
       ) AS grant_exists,
       EXISTS(
         SELECT 1 FROM appbasis_permission_principal_revoke
         WHERE principal_id = identity_user.id
       ) AS revoke_exists
     FROM "user" identity_user
     LEFT JOIN appbasis_identity_security_state security
       ON security.identity_id = identity_user.id`,
  );
  for (const row of rows) {
    const principalId = textColumn(row, 'principal_id');
    const hasPermissionState =
      row.principal_exists === true ||
      row.role_exists === true ||
      row.grant_exists === true ||
      row.revoke_exists === true;

    if (hasTechnicalAdminRole(row.auth_role)) {
      if (row.identity_id !== null && row.identity_id !== undefined) {
        throw new ReferencePermissionAuthorityStateError(
          'A technical Better Auth administrator has AppBasis application identity state.',
        );
      }
      if (hasPermissionState) {
        throw new ReferencePermissionAuthorityStateError(
          'A technical Better Auth administrator has persisted AppBasis permission state.',
        );
      }
      continue;
    }

    if (
      row.identity_id !== principalId &&
      row.identity_id !== null &&
      row.identity_id !== undefined
    ) {
      throw new ReferencePermissionAuthorityStateError(
        'An authentication identity resolved to invalid AppBasis application state.',
      );
    }
    if (
      (row.identity_id === null || row.identity_id === undefined) &&
      hasPermissionState
    ) {
      throw new ReferencePermissionAuthorityStateError(
        'An authentication-only identity has persisted AppBasis permission state.',
      );
    }
  }
}

async function requireFeature(
  client: PermissionPostgresClient,
  tableName: string,
  expectedColumns: readonly string[],
  expectedConstraints: readonly string[],
  expectedIndexes: readonly string[],
): Promise<void> {
  const columns = await client.unsafe(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = ANY($2::text[])`,
    [tableName, postgresArray(expectedColumns)],
  );
  const constraints = await client.unsafe(
    `SELECT constraint_name
     FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name = $1
       AND constraint_name = ANY($2::text[])`,
    [tableName, postgresArray(expectedConstraints)],
  );
  const indexes = await client.unsafe(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = $1
       AND indexname = ANY($2::text[])`,
    [tableName, postgresArray(expectedIndexes)],
  );
  if (
    columns.length !== expectedColumns.length ||
    constraints.length !== expectedConstraints.length ||
    indexes.length !== expectedIndexes.length
  ) {
    throw new ReferencePermissionAuthorityStateError(
      `Reference permission authority contains a partial ${tableName} schema.`,
    );
  }
}

function hasTechnicalAdminRole(role: unknown): boolean {
  return (
    typeof role === 'string' &&
    role
      .split(',')
      .map((value) => value.trim())
      .includes('admin')
  );
}

function postgresArray(values: readonly string[]): string {
  return `{${values
    .map((value) => `"${value.replaceAll('"', '\\"')}"`)
    .join(',')}}`;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function textColumn(row: Readonly<Record<string, unknown>>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') {
    throw new ReferencePermissionAuthorityStateError(
      'Reference permission authority read an invalid PostgreSQL row.',
    );
  }
  return value;
}

function requiredEnvironmentValue(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) {
    throw new ReferencePermissionAuthorityConfigurationError(`${label} is required.`);
  }
  return normalized;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runFromEnvironment();
    console.log(
      `Reference permission authority verify completed: schema v${result.schemaVersion}, ${result.assignmentCount} assignments verified.`,
    );
  } catch (error) {
    console.error(
      `Reference permission authority verify failed: ${safeReferencePermissionAuthorityDiagnostic(error)}.`,
    );
    process.exitCode = 1;
  }
}
