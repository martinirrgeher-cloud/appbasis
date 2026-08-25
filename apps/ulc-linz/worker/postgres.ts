import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
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
  securityLogConnectionString: string;
  baseURL: string;
  secret: string;
}

export async function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): Promise<GeneratedPostgresApplicationRuntime> {
  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);
  let securityLogConnection:
    | ReturnType<typeof createPostgresDatabase>
    | undefined;

  try {
    securityLogConnection = createPostgresDatabase(
      requiredSecurityLogConnectionString(options.securityLogConnectionString),
    );
    const securityConnection = securityLogConnection;
    const permissions = createPermissionStore(identityRuntime.sql);
    const securityEvents = createPostgresUlcLinzSecurityEventLogger(
      securityConnection.client,
    );
    return Object.freeze({
      identity: identityRuntime.identity,
      permissions,
      securityEvents,
      async close() {
        let closeError: unknown = null;
        try {
          await securityConnection.client.end();
        } catch (error) {
          closeError = error;
        }
        try {
          await identityRuntime.close();
        } catch (error) {
          closeError ??= error;
        }
        if (closeError !== null) throw closeError;
      },
    });
  } catch (error) {
    if (securityLogConnection !== undefined) {
      try {
        await securityLogConnection.client.end();
      } catch {
        // Preserve the construction failure; cleanup errors must not replace it.
      }
    }
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

function requiredSecurityLogConnectionString(value: string): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error("A dedicated security-log PostgreSQL connection string is required.");
  }
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
    return value;
  } catch {
    throw new Error("A dedicated security-log PostgreSQL connection string is required.");
  }
}
