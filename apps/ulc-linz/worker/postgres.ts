import {
  createPostgresIdentityApplicationRuntime,
  type IdentityPostgresRuntimeSqlClient,
} from "@appbasis/identity/postgres-runtime";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  PostgresPermissionStore,
  type PermissionStore,
} from "@appbasis/permissions";

import {
  createPostgresUlcLinzSecurityEventLogger,
  type BufferedUlcLinzSecurityEventLogger,
} from "./security-events-postgres";

export interface GeneratedPostgresApplicationRuntime {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  securityEvents: BufferedUlcLinzSecurityEventLogger;
  close(): Promise<void>;
}

export interface GeneratedPostgresApplicationRuntimeOptions {
  connectionString: string;
  baseURL: string;
  secret: string;
}

export async function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): Promise<GeneratedPostgresApplicationRuntime> {
  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);

  try {
    const permissions = createPermissionStore(identityRuntime.sql);
    const securityEvents = createPostgresUlcLinzSecurityEventLogger(identityRuntime.sql);
    return Object.freeze({
      identity: identityRuntime.identity,
      permissions,
      securityEvents,
      async close() {
        await identityRuntime.close();
      },
    });
  } catch (error) {
    try {
      await identityRuntime.close();
    } catch {
      // Preserve the construction failure; cleanup errors must not replace it.
    }
    throw error;
  }
}

function createPermissionStore(client: IdentityPostgresRuntimeSqlClient) {
  return new PostgresPermissionStore({
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  });
}
