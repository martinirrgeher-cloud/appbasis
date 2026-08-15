import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import {
  PostgresPermissionStore,
  PostgresRoleAdministration,
  type PermissionPostgresClient,
  type RoleAdministrationPostgresClient,
} from '@appbasis/permissions';

import {
  createReferenceRoleAdminApp,
  type ReferenceRolePrincipalDirectory,
  type ReferenceRolePrincipalIdentity,
} from './role-admin-app';
import { roleAdminMutationProtectionResponse } from './role-admin-request-security';

interface HyperdriveBinding {
  connectionString: string;
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
      const roleAdministration = new PostgresRoleAdministration(
        roleAdministrationClient(connection.client),
      );
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

function referenceRolePrincipalDirectory(client: {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}): ReferenceRolePrincipalDirectory {
  async function list(): Promise<readonly ReferenceRolePrincipalIdentity[]> {
    const rows = await client.unsafe(
      `SELECT
         identity_state.identity_id,
         auth_user.username,
         auth_user.name AS display_name
       FROM appbasis_identity_security_state identity_state
       JOIN "user" auth_user ON auth_user.id = identity_state.identity_id
       ORDER BY lower(auth_user.name) ASC, lower(auth_user.username) ASC, auth_user.id ASC`,
    );
    return rows.map(principalIdentityFromRow);
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

  return Object.freeze({ list, find });
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

function permissionClient(client: {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}): PermissionPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  };
}

function roleAdministrationClient(client: {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
  begin<T>(
    callback: (transaction: {
      unsafe(
        query: string,
        parameters?: (string | number | boolean | null)[],
      ): PromiseLike<readonly Record<string, unknown>[]>;
    }) => Promise<T>,
  ): Promise<T>;
}): RoleAdministrationPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin(callback) {
      return client.begin(async (transaction) => callback(permissionClient(transaction)));
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
