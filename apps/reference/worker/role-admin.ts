import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import {
  PostgresPermissionStore,
  PostgresRoleAdministration,
  type PermissionPostgresClient,
  type RoleAdministrationPostgresClient,
} from '@appbasis/permissions';

import { createReferenceRoleAdminApp } from './role-admin-app';

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
  async fetch(
    request: Request,
    env: ReferenceRoleAdminWorkerEnv,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return fallbackApp.fetch(request);
    }

    const configuration = runtimeConfiguration(env);
    if (configuration === null) {
      return fallbackApp.fetch(request);
    }

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
      const permissions = new PostgresPermissionStore(
        permissionClient(connection.client),
      );
      const roleAdministration = new PostgresRoleAdministration(
        roleAdministrationClient(connection.client),
      );
      const app = createReferenceRoleAdminApp({
        identity: identity.service,
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

function roleAdministrationClient(
  client: ReturnType<typeof createPostgresDatabase>['client'],
): RoleAdministrationPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    async begin<T>(
      callback: (transaction: PermissionPostgresClient) => Promise<T>,
    ): Promise<T> {
      const wrapped = await client.begin(async (transaction) => ({
        value: await callback(permissionClient(transaction)),
      }));
      return wrapped.value;
    },
  };
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
