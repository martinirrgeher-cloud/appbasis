import { createPostgresDatabase } from '@appbasis/database';
import { createIdentityRuntime } from '@appbasis/identity';
import { createBetterAuthRuntime } from '@appbasis/identity/better-auth';
import {
  DEMO_KNOWN_CAPABILITIES,
  DEMO_ROLE_BUNDLES,
  DEMO_ROLES,
  InMemoryPermissionStore,
  principalId,
  type PrincipalPermissions,
} from '@appbasis/permissions';

import { InMemoryTaskRepository } from '../../../modules/tasks/src';
import { createReferenceApp } from './app';

interface HyperdriveBinding {
  connectionString: string;
}

export interface ReferenceWorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  BETTER_AUTH_SECRET?: string;
  APPBASIS_BASE_URL?: string;
  APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS?: string;
  APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS?: string;
}

const fallbackApp = createReferenceApp();
const tasks = new InMemoryTaskRepository();

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
      const permissions = createReferencePermissionStore(env);
      const app = createReferenceApp({
        identity: identity.service,
        permissions,
        tasks,
        secureCookies: new URL(configuration.baseURL).protocol === 'https:',
      });
      return await app.fetch(request);
    } finally {
      await connection.client.end();
    }
  },
};

export default worker;

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

function createReferencePermissionStore(env: ReferenceWorkerEnv) {
  const principals = new Map<string, PrincipalPermissions>();

  for (const id of identityIds(env.APPBASIS_REFERENCE_MEMBER_IDENTITY_IDS)) {
    principals.set(id, {
      principalId: principalId(id),
      roleIds: [DEMO_ROLES.member],
      grants: [],
      revokes: [],
    });
  }
  for (const id of identityIds(env.APPBASIS_REFERENCE_ADMIN_IDENTITY_IDS)) {
    principals.set(id, {
      principalId: principalId(id),
      roleIds: [DEMO_ROLES.admin],
      grants: [],
      revokes: [],
    });
  }

  return new InMemoryPermissionStore({
    knownCapabilities: DEMO_KNOWN_CAPABILITIES,
    roles: DEMO_ROLE_BUNDLES,
    principals: [...principals.values()],
  });
}

function identityIds(value: string | undefined): string[] {
  if (value === undefined) return [];
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}
