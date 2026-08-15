import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import {
  can,
  DEMO_CAPABILITIES,
  PostgresPermissionStore,
  PostgresRoleAdministration,
  RoleAdministrationError,
  roleId,
  type PermissionPostgresClient,
  type PrincipalId,
  type ReplacePrincipalRolesConstraints,
  type RoleAdministrationAuditContext,
  type RoleAdministrationPostgresClient,
  type RoleId,
} from '@appbasis/permissions';

import {
  createReferenceRoleAdminApp,
  type ReferenceRolePrincipalAssignment,
  type ReferenceRolePrincipalDirectory,
  type ReferenceRolePrincipalIdentity,
} from './role-admin-app';
import { roleAdminMutationProtectionResponse } from './role-admin-request-security';

interface HyperdriveBinding {
  connectionString: string;
}

interface ReferenceRoleAdministrationTransaction {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

interface ReferenceRoleAdministrationSqlClient extends ReferenceRoleAdministrationTransaction {
  begin<T>(
    callback: (transaction: ReferenceRoleAdministrationTransaction) => Promise<T>,
  ): Promise<T>;
}

export interface ReferenceRoleAdminWorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  BETTER_AUTH_SECRET?: string;
  APPBASIS_BASE_URL?: string;
}

const fallbackApp = createReferenceRoleAdminApp();

export const roleAdminWorker = {
  async fetch(request: Request, env: ReferenceRoleAdminWorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return fallbackApp.fetch(request);
    }

    const configuration = runtimeConfiguration(env);
    if (configuration === null) {
      return fallbackApp.fetch(request);
    }

    const mutationDenied = roleAdminMutationProtectionResponse(request, configuration.baseURL);
    if (mutationDenied !== null) return mutationDenied;

    const connection = createPostgresDatabase(configuration.connectionString);
    try {
      const auth = createBetterAuthRuntime({
        database: connection.database,
        baseURL: configuration.baseURL,
        secret: configuration.secret,
      });
      const identity = createIdentityRuntime({
        auth,
        sql: connection.client,
        baseURL: configuration.baseURL,
      });
      const permissions = new PostgresPermissionStore(permissionClient(connection.client));
      const roleAdministration = createReferenceRoleAdministration(connection.client);
      const principalDirectory = referenceRolePrincipalDirectory(connection.client);
      const app = createReferenceRoleAdminApp({
        identity: identity.service,
        principalDirectory,
        permissions,
        roleAdministration,
        secureCookies: url.protocol === 'https:',
      });
      return await app.fetch(request);
    } finally {
      await connection.client.end();
    }
  },
};

export default roleAdminWorker;

export function createReferenceRoleAdministration(
  client: ReferenceRoleAdministrationSqlClient,
): PostgresRoleAdministration {
  return new ReferenceRoleAdministration(client);
}

class ReferenceRoleAdministration extends PostgresRoleAdministration {
  constructor(private readonly referenceClient: ReferenceRoleAdministrationSqlClient) {
    super(roleAdministrationClient(referenceClient));
  }

  override async replacePrincipalRoles(
    requestedPrincipalId: PrincipalId,
    requestedRoleIds: readonly RoleId[],
    auditContext: RoleAdministrationAuditContext,
    constraints: ReplacePrincipalRolesConstraints = {},
  ): Promise<readonly RoleId[]> {
    return this.referenceClient.begin(async (transaction) => {
      const permissionTransaction = permissionClient(transaction);
      const transactionalAdministration = new PostgresRoleAdministration(
        transactionRoleAdministrationClient(permissionTransaction),
      );
      const roleIds = await transactionalAdministration.replacePrincipalRoles(
        requestedPrincipalId,
        requestedRoleIds,
        auditContext,
        constraints,
      );

      const permissions = new PostgresPermissionStore(permissionTransaction);
      const actorRequest = { principalId: auditContext.actorPrincipalId };
      const actorCanUseApp = await can(permissions, {
        ...actorRequest,
        capability: DEMO_CAPABILITIES.appUse,
      });
      const actorCanManageUsers = await can(permissions, {
        ...actorRequest,
        capability: DEMO_CAPABILITIES.usersManage,
      });
      if (!actorCanUseApp || !actorCanManageUsers) {
        throw new RoleAdministrationError(
          'LAST_CAPABILITY_HOLDER',
          'The authenticated role administrator must retain complete role administration authorization.',
        );
      }
      return roleIds;
    });
  }
}

function referenceRolePrincipalDirectory(client: {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}): ReferenceRolePrincipalDirectory {
  async function listAssignments(): Promise<readonly ReferenceRolePrincipalAssignment[]> {
    const rows = await client.unsafe(
      `SELECT
         identity_state.identity_id,
         auth_user.username,
         auth_user.name AS display_name,
         permission_principal.principal_id,
         principal_role.role_id
       FROM appbasis_identity_security_state identity_state
       JOIN "user" auth_user
         ON auth_user.id = identity_state.identity_id
       JOIN appbasis_permission_principal permission_principal
         ON permission_principal.principal_id = identity_state.identity_id
       LEFT JOIN appbasis_permission_principal_role principal_role
         ON principal_role.principal_id = permission_principal.principal_id
       ORDER BY
         lower(auth_user.name) ASC,
         lower(auth_user.username) ASC,
         auth_user.id ASC,
         principal_role.role_id ASC`,
    );

    const assignments = new Map<string, {
      identity: ReferenceRolePrincipalIdentity;
      principalId: string;
      roleIds: RoleId[];
    }>();
    for (const row of rows) {
      const identity = principalIdentityFromRow(row);
      const resolvedPrincipalId = requiredDatabaseString(row, 'principal_id');
      if (resolvedPrincipalId !== identity.identityId) {
        throw new Error('Reference role principal directory returned mismatched identity and principal IDs.');
      }
      const existing = assignments.get(resolvedPrincipalId);
      if (existing === undefined) {
        assignments.set(resolvedPrincipalId, {
          identity,
          principalId: resolvedPrincipalId,
          roleIds: [],
        });
      } else if (
        existing.identity.username !== identity.username ||
        existing.identity.displayName !== identity.displayName ||
        existing.identity.identityId !== identity.identityId
      ) {
        throw new Error('Reference role principal directory returned inconsistent identity data.');
      }

      const storedRoleId = nullableDatabaseString(row, 'role_id');
      if (storedRoleId !== null) {
        assignments.get(resolvedPrincipalId)?.roleIds.push(roleId(storedRoleId));
      }
    }

    return [...assignments.values()].map(({ identity, principalId, roleIds }) => ({
      ...identity,
      principalId,
      roleIds,
    }));
  }

  async function find(identityId: string): Promise<ReferenceRolePrincipalIdentity | null> {
    const rows = await client.unsafe(
      `SELECT
         identity_state.identity_id,
         auth_user.username,
         auth_user.name AS display_name
       FROM appbasis_identity_security_state identity_state
       JOIN "user" auth_user ON auth_user.id = identity_state.identity_id
       WHERE identity_state.identity_id = $1
       LIMIT 1`,
      [identityId],
    );
    return rows[0] === undefined ? null : principalIdentityFromRow(rows[0]);
  }

  return Object.freeze({ listAssignments, find });
}

function principalIdentityFromRow(row: Record<string, unknown>): ReferenceRolePrincipalIdentity {
  return {
    identityId: requiredDatabaseString(row, 'identity_id'),
    username: requiredDatabaseString(row, 'username'),
    displayName: requiredDatabaseString(row, 'display_name'),
  };
}

function requiredDatabaseString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`Reference role principal directory returned invalid ${field}.`);
  }
  return value;
}

function nullableDatabaseString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`Reference role principal directory returned invalid ${field}.`);
  }
  return value;
}

function permissionClient(client: ReferenceRoleAdministrationTransaction): PermissionPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  };
}

function roleAdministrationClient(
  client: ReferenceRoleAdministrationSqlClient,
): RoleAdministrationPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) => callback(permissionClient(transaction)));
    },
  };
}

function transactionRoleAdministrationClient(
  client: PermissionPostgresClient,
): RoleAdministrationPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return callback(client);
    },
  };
}

function runtimeConfiguration(env: ReferenceRoleAdminWorkerEnv): {
  connectionString: string;
  baseURL: string;
  secret: string;
} | null {
  const connectionString = env.HYPERDRIVE?.connectionString.trim();
  const secret = env.BETTER_AUTH_SECRET?.trim();
  const baseURL = normalizedBaseURL(env.APPBASIS_BASE_URL);
  if (
    connectionString === undefined ||
    connectionString.length === 0 ||
    secret === undefined ||
    secret.length < 32 ||
    baseURL === null
  ) {
    return null;
  }
  return { connectionString, baseURL, secret };
}

function normalizedBaseURL(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.origin;
  } catch {
    return null;
  }
}
