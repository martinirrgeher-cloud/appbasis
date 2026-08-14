import { access, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createPostgresDatabase } from '@appbasis/database/postgres-provisioning';
import {
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  principalId,
  type PermissionPostgresClient,
  type PrincipalId,
  type RoleId,
} from '@appbasis/permissions';
import {
  provisionPostgresPermissions,
  type PermissionProvisioningPostgresClient,
} from '@appbasis/permissions/provisioning';

const MEMBER_BINDING = 'APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS';
const ADMIN_BINDING = 'APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS';
const TARGET = 'reference-preview';
const LIFECYCLE_MIGRATION_PATH =
  'packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql';
const AUDIT_MIGRATION_PATH =
  'packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql';
const lifecycleColumns = [
  'display_name',
  'description',
  'state',
  'kind',
] as const;
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

export class ReferencePermissionCutoverConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePermissionCutoverConfigurationError';
  }
}

export class ReferencePermissionCutoverStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReferencePermissionCutoverStateError';
  }
}

export interface LegacyPermissionAssignment {
  readonly principalId: PrincipalId;
  readonly roleId: RoleId;
}

export interface ReferencePermissionCutoverInput {
  readonly connectionString: string;
  readonly workerSettings: unknown;
}

export function legacyPermissionAssignmentsFromWorkerSettings(
  workerSettings: unknown,
): readonly LegacyPermissionAssignment[] {
  const bindings = workerBindings(workerSettings);
  const members = identityIdsFromBinding(bindings, MEMBER_BINDING);
  const admins = identityIdsFromBinding(bindings, ADMIN_BINDING);
  const assignments = new Map<string, LegacyPermissionAssignment>();

  for (const id of members) {
    assignments.set(id, {
      principalId: principalId(id),
      roleId: DEMO_ROLES.member,
    });
  }
  for (const id of admins) {
    assignments.set(id, {
      principalId: principalId(id),
      roleId: DEMO_ROLES.admin,
    });
  }

  if (assignments.size === 0) {
    throw new ReferencePermissionCutoverConfigurationError(
      'Existing Reference Worker contains no legacy permission assignments.',
    );
  }

  return Object.freeze(
    [...assignments.values()].sort((left, right) =>
      String(left.principalId).localeCompare(String(right.principalId)),
    ),
  );
}

export async function applyReferencePreviewPermissionCutover(
  input: ReferencePermissionCutoverInput,
) {
  const assignments = legacyPermissionAssignmentsFromWorkerSettings(input.workerSettings);
  const connection = createPostgresDatabase(input.connectionString);
  try {
    await assertLegacyIdentitiesExist(connection.client, assignments);
    let version = await detectReferencePermissionSchemaVersion(connection.client);
    if (version === 1) {
      await applyVersionedMigration(connection, LIFECYCLE_MIGRATION_PATH);
      version = await detectReferencePermissionSchemaVersion(connection.client);
      if (version !== 2) {
        throw new ReferencePermissionCutoverStateError(
          'Permission lifecycle migration did not produce schema version 2.',
        );
      }
    }
    if (version === 2) {
      await applyVersionedMigration(connection, AUDIT_MIGRATION_PATH);
      version = await detectReferencePermissionSchemaVersion(connection.client);
      if (version !== 3) {
        throw new ReferencePermissionCutoverStateError(
          'Permission audit migration did not produce schema version 3.',
        );
      }
    }
    if (version !== 3) {
      throw new ReferencePermissionCutoverStateError(
        'Reference permission schema is not upgradeable to version 3.',
      );
    }

    await provisionPostgresPermissions(provisioningClient(connection.client), {
      knownCapabilities: DEMO_KNOWN_CAPABILITIES,
      roles: DEMO_ROLE_BUNDLES,
      principalRoleAssignments: assignments.map((assignment) => ({
        principalId: assignment.principalId,
        roleIds: [assignment.roleId],
      })),
    });

    await verifyCutoverState(connection.client, assignments);
    return Object.freeze({ schemaVersion: 3, assignmentCount: assignments.length });
  } finally {
    await connection.client.end();
  }
}

export async function verifyReferencePreviewPermissionCutover(
  input: ReferencePermissionCutoverInput,
) {
  const assignments = legacyPermissionAssignmentsFromWorkerSettings(input.workerSettings);
  const connection = createPostgresDatabase(input.connectionString);
  try {
    await assertLegacyIdentitiesExist(connection.client, assignments);
    const version = await detectReferencePermissionSchemaVersion(connection.client);
    if (version !== 3) {
      throw new ReferencePermissionCutoverStateError(
        'Reference permission cutover requires schema version 3 before deployment.',
      );
    }
    await verifyCutoverState(connection.client, assignments);
    return Object.freeze({ schemaVersion: version, assignmentCount: assignments.length });
  } finally {
    await connection.client.end();
  }
}

export async function detectReferencePermissionSchemaVersion(
  client: PermissionPostgresClient,
): Promise<1 | 2 | 3> {
  const foundation = await client.unsafe(
    `SELECT to_regclass('public.appbasis_permission_role')::text AS relation_name`,
  );
  if (foundation[0]?.relation_name !== 'appbasis_permission_role') {
    throw new ReferencePermissionCutoverStateError(
      'Reference permission foundation schema is missing.',
    );
  }

  const lifecyclePresent = await featurePresent(
    client,
    'appbasis_permission_role',
    lifecycleColumns,
    lifecycleConstraints,
    lifecycleIndexes,
  );
  const auditRelation = await client.unsafe(
    `SELECT to_regclass('public.appbasis_permission_administration_audit')::text AS relation_name`,
  );
  const auditTablePresent =
    auditRelation[0]?.relation_name === 'appbasis_permission_administration_audit';

  if (!lifecyclePresent && auditTablePresent) {
    throw new ReferencePermissionCutoverStateError(
      'Permission audit schema exists without the lifecycle schema.',
    );
  }
  if (!lifecyclePresent) return 1;
  if (!auditTablePresent) return 2;

  await featurePresent(
    client,
    'appbasis_permission_administration_audit',
    auditColumns,
    auditConstraints,
    auditIndexes,
    true,
  );
  return 3;
}

export async function resolveReferencePermissionMigrationPath(
  relativePath: string,
  startDirectory = process.cwd(),
): Promise<string> {
  if (
    relativePath.length === 0 ||
    relativePath.startsWith('/') ||
    relativePath.includes('..') ||
    !relativePath.endsWith('.sql')
  ) {
    throw new ReferencePermissionCutoverStateError(
      'Reference permission migration path is invalid.',
    );
  }

  let current = resolve(startDirectory);
  for (let depth = 0; depth < 10; depth += 1) {
    try {
      await access(join(current, 'pnpm-workspace.yaml'));
      const candidate = join(current, ...relativePath.split('/'));
      await access(candidate);
      return candidate;
    } catch {
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  throw new ReferencePermissionCutoverStateError(
    'Reference permission migration source could not be located.',
  );
}

export function safeReferencePermissionCutoverDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  switch (error.name) {
    case 'ReferencePermissionCutoverConfigurationError':
      return 'cutover-configuration';
    case 'ReferencePermissionCutoverStateError':
      return 'cutover-state';
    case 'PermissionProvisioningConfigurationError':
    case 'PermissionProvisioningStateError':
      return 'permission-provisioning';
    case 'TypeError':
      return 'input-validation';
    default:
      return 'unknown';
  }
}

async function runFromEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const target = env.APPBASIS_PERMISSION_CUTOVER_TARGET?.trim();
  if (target !== TARGET) {
    throw new ReferencePermissionCutoverConfigurationError(
      'Invalid Reference permission cutover target.',
    );
  }
  const mode = env.APPBASIS_PERMISSION_CUTOVER_MODE?.trim();
  if (mode !== 'apply' && mode !== 'verify') {
    throw new ReferencePermissionCutoverConfigurationError(
      'Reference permission cutover mode must be apply or verify.',
    );
  }
  const connectionString = requiredEnvironmentValue(
    env.APPBASIS_DATABASE_URL,
    'database connection',
  );
  const settingsPath = requiredEnvironmentValue(
    env.APPBASIS_REFERENCE_WORKER_SETTINGS_PATH,
    'Worker settings path',
  );
  const workerSettings: unknown = JSON.parse(await readFile(settingsPath, 'utf8'));
  const input = { connectionString, workerSettings };
  return mode === 'apply'
    ? applyReferencePreviewPermissionCutover(input)
    : verifyReferencePreviewPermissionCutover(input);
}

async function verifyCutoverState(
  client: PermissionPostgresClient,
  assignments: readonly LegacyPermissionAssignment[],
): Promise<void> {
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
      throw new ReferencePermissionCutoverStateError(
        'Reference demo role is missing, inactive or not protected.',
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
      throw new ReferencePermissionCutoverStateError(
        'Reference demo role capabilities do not match the declared bundle.',
      );
    }
  }

  for (const assignment of assignments) {
    const rows = await client.unsafe(
      `SELECT role_id
       FROM appbasis_permission_principal_role
       WHERE principal_id = $1
         AND role_id = $2`,
      [assignment.principalId, assignment.roleId],
    );
    if (rows.length !== 1) {
      throw new ReferencePermissionCutoverStateError(
        'A legacy Reference permission assignment was not persisted.',
      );
    }
  }
}

async function assertLegacyIdentitiesExist(
  client: PermissionPostgresClient,
  assignments: readonly LegacyPermissionAssignment[],
): Promise<void> {
  for (const assignment of assignments) {
    const rows = await client.unsafe(
      `SELECT security.identity_id
       FROM appbasis_identity_security_state security
       JOIN "user" identity_user ON identity_user.id = security.identity_id
       WHERE security.identity_id = $1`,
      [assignment.principalId],
    );
    if (rows.length !== 1) {
      throw new ReferencePermissionCutoverStateError(
        'A legacy Reference permission assignment references an unknown application identity.',
      );
    }
  }
}

async function featurePresent(
  client: PermissionPostgresClient,
  tableName: string,
  expectedColumns: readonly string[],
  expectedConstraints: readonly string[],
  expectedIndexes: readonly string[],
  required = false,
): Promise<boolean> {
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

  const counts = [columns.length, constraints.length, indexes.length];
  const expected = [expectedColumns.length, expectedConstraints.length, expectedIndexes.length];
  if (counts.every((count) => count === 0) && !required) return false;
  if (counts.every((count, index) => count === expected[index])) return true;
  throw new ReferencePermissionCutoverStateError(
    `Reference permission schema contains a partial ${tableName} upgrade.`,
  );
}

async function applyVersionedMigration(
  connection: ReturnType<typeof createPostgresDatabase>,
  relativePath: string,
): Promise<void> {
  const migrationPath = await resolveReferencePermissionMigrationPath(relativePath);
  const sql = await readFile(migrationPath, 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) {
    throw new ReferencePermissionCutoverStateError(
      'Versioned permission migration contains no executable statements.',
    );
  }
  await connection.client.begin(async (transaction) => {
    for (const statement of statements) {
      await transaction.unsafe(statement);
    }
  });
}

function provisioningClient(
  client: ReturnType<typeof createPostgresDatabase>['client'],
): PermissionProvisioningPostgresClient {
  return {
    async begin(callback) {
      return client.begin(async (transaction) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  };
}

function workerBindings(settings: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(settings) || settings.success !== true || !isRecord(settings.result)) {
    throw new ReferencePermissionCutoverConfigurationError(
      'Cloudflare Worker settings response is invalid.',
    );
  }
  const bindings = settings.result.bindings;
  if (!Array.isArray(bindings)) {
    throw new ReferencePermissionCutoverConfigurationError(
      'Cloudflare Worker settings contain no bindings array.',
    );
  }
  return bindings.map((binding) => {
    if (!isRecord(binding)) {
      throw new ReferencePermissionCutoverConfigurationError(
        'Cloudflare Worker settings contain an invalid binding.',
      );
    }
    return binding;
  });
}

function identityIdsFromBinding(
  bindings: readonly Record<string, unknown>[],
  name: string,
): readonly string[] {
  const matches = bindings.filter((binding) => binding.name === name);
  if (matches.length === 0) return [];
  if (
    matches.length !== 1 ||
    matches[0]?.type !== 'plain_text' ||
    typeof matches[0]?.text !== 'string'
  ) {
    throw new ReferencePermissionCutoverConfigurationError(
      `Legacy Reference binding ${name} is not one plain-text binding.`,
    );
  }
  const ids = [
    ...new Set(
      matches[0].text
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length > 1000) {
    throw new ReferencePermissionCutoverConfigurationError(
      `Legacy Reference binding ${name} contains too many identities.`,
    );
  }
  for (const id of ids) {
    if (id.length > 200 || /[\u0000-\u001f\u007f]/u.test(id)) {
      throw new ReferencePermissionCutoverConfigurationError(
        `Legacy Reference binding ${name} contains an invalid identity.`,
      );
    }
  }
  return ids;
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
    throw new ReferencePermissionCutoverStateError(
      'Reference permission cutover read an invalid PostgreSQL row.',
    );
  }
  return value;
}

function requiredEnvironmentValue(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) {
    throw new ReferencePermissionCutoverConfigurationError(`${label} is required.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = await runFromEnvironment();
    console.log(
      `Reference permission cutover ${process.env.APPBASIS_PERMISSION_CUTOVER_MODE} completed: schema v${result.schemaVersion}, ${result.assignmentCount} assignments verified.`,
    );
  } catch (error) {
    console.error(
      `Reference permission cutover failed: ${safeReferencePermissionCutoverDiagnostic(error)}.`,
    );
    process.exitCode = 1;
  }
}
