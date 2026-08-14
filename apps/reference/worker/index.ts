import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import {
  PostgresPermissionStore,
  PostgresRoleAdministration,
  type PermissionPostgresClient,
  type PermissionStore,
  type RoleAdministrationPostgresClient,
} from '@appbasis/permissions';
import { PostgresTaskRepository } from '@appbasis/tasks';

import { createReferenceApp } from './app';

interface HyperdriveBinding {
  connectionString: string;
}

export interface ReferenceWorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  BETTER_AUTH_SECRET?: string;
  APPBASIS_BASE_URL?: string;
}

const fallbackApp = createReferenceApp();

export const worker = {
  async fetch(request: Request, env: ReferenceWorkerEnv): Promise<Response> {
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
      const permissions = createReferencePermissionStore(
        permissionClient(connection.client),
      );
      const roleAdministration = new PostgresRoleAdministration(
        roleAdministrationClient(connection.client),
      );
      const tasks = new PostgresTaskRepository({
        unsafe(query, parameters) {
          return connection.client.unsafe(query, parameters);
        },
      });
      const app = createReferenceApp({
        identity: identity.service,
        permissions,
        roleAdministration,
        tasks,
        secureCookies: url.protocol === 'https:',
      });
      return await app.fetch(request);
    } finally {
      await connection.client.end();
    }
  },
};

export default worker;

export function createReferencePermissionStore(
  client: PermissionPostgresClient,
): PermissionStore {
  return new PostgresPermissionStore(client);
}

function roleAdministrationClient(
  client: ReturnType<typeof createPostgresDatabase>['client'],
): RoleAdministrationPostgresClient {
  return {
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
    begin<T>(callback: (transaction: PermissionPostgresClient) => Promise<T>): Promise<T> {
      return beginRoleAdministrationTransaction(client, callback);
    },
  };
}

async function beginRoleAdministrationTransaction<T>(
  client: ReturnType<typeof createPostgresDatabase>['client'],
  callback: (transaction: PermissionPostgresClient) => Promise<T>,
): Promise<T> {
  const result = await client.begin(async (transaction) =>
    callback(permissionClient(transaction)),
  );
  // postgres-js unwraps arrays in its generic return type even though the
  // transaction callback value is returned unchanged after awaiting it.
  return result as unknown as T;
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

function runtimeConfiguration(env: ReferenceWorkerEnv): {
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
