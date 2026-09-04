import { createPostgresDatabase } from "@appbasis/database";

import { createBetterAuthRuntime } from "./better-auth";
import { createIdentityRuntime } from "./server";
import type {
  PostgresIdentityApplicationRuntime,
  PostgresIdentityApplicationRuntimeOptions,
} from "./postgres-runtime-contract";

export async function createPostgresIdentityApplicationRuntime(
  options: PostgresIdentityApplicationRuntimeOptions,
): Promise<PostgresIdentityApplicationRuntime> {
  const connectionString = requiredPostgresConnectionString(
    options.connectionString,
  );
  const baseURL = requiredBaseURL(options.baseURL);
  const secret = requiredIdentitySecret(options.secret);
  const administrativeSessionToken = optionalAdministrativeSessionToken(
    options.administrativeSessionToken,
  );
  const connection = createPostgresDatabase(connectionString);

  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL,
      secret,
    });
    const identity = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL,
      ...(administrativeSessionToken === undefined
        ? {}
        : { administrativeSessionToken }),
    });
    const sql = Object.freeze({
      unsafe(
        query: string,
        parameters?: (string | number | boolean | null)[],
      ) {
        return connection.client.unsafe(query, parameters);
      },
    });

    return Object.freeze({
      identity: identity.service,
      lifecycleIdentity: Object.freeze({
        assertAdministrativeSessionAuthorized() {
          return identity.backend.assertProvisioningAuthorized();
        },
        disableIdentity(identityId: string) {
          return identity.service.disableIdentity(identityId);
        },
      }),
      sql,
      async close() {
        await connection.client.end();
      },
    });
  } catch (error) {
    try {
      await connection.client.end();
    } catch {
      // Preserve the construction failure; cleanup errors must not replace it.
    }
    throw error;
  }
}

function requiredPostgresConnectionString(value: string): string {
  const normalized = value.trim();
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      throw new Error("invalid");
    }
    return normalized;
  } catch {
    throw new Error("A valid PostgreSQL connection string is required.");
  }
}

function requiredBaseURL(value: string): string {
  const normalized = value.trim();
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      throw new Error("invalid");
    }
    return url.origin;
  } catch {
    throw new Error("A canonical HTTP(S) base URL is required.");
  }
}

function requiredIdentitySecret(value: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length < 32) {
    throw new Error("An identity secret with at least 32 characters is required.");
  }
  return value;
}

function optionalAdministrativeSessionToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.trim() !== value || value.length === 0) {
    throw new Error("A valid administrative Better Auth session is required.");
  }
  return value;
}
