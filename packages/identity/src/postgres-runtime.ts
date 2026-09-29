import { createPostgresDatabase } from "@appbasis/database";

import { createBetterAuthRuntime } from "./better-auth";
import { createIdentityRuntime } from "./server";
import type {
  IdentityPostgresRuntimeSqlClient,
  IdentityPostgresRuntimeTransactionalSqlClient,
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
    });
    const sql: IdentityPostgresRuntimeTransactionalSqlClient = {
      unsafe(
        query: string,
        parameters?: (string | number | boolean | null)[],
      ) {
        return connection.client.unsafe(query, parameters);
      },
      async begin<T>(
        callback: (transaction: IdentityPostgresRuntimeSqlClient) => Promise<T>,
      ): Promise<T> {
        const results = await connection.client.begin(async (transaction) =>
          [
            await callback({
              unsafe(query, parameters) {
                return transaction.unsafe(query, parameters);
              },
            }),
          ] as [T],
        );
        // postgres.js recursively unwraps promise values returned from
        // transaction tuples. The platform transaction port intentionally exposes
        // the simpler Promise<T> contract used by permission administration.
        return results[0] as unknown as T;
      },
    };
    Object.freeze(sql);
    const provisioningIdentity = Object.freeze({
      createInitialUser(
        administrativeSessionToken: string,
        input: Parameters<typeof identity.service.createInitialUser>[0],
      ) {
        const provisioning = createIdentityRuntime({
          auth,
          sql: connection.client,
          baseURL,
          administrativeSessionToken,
        });
        return provisioning.service.createInitialUser(input);
      },
    });

    return Object.freeze({
      identity: identity.service,
      lifecycleIdentity: identity.service,
      provisioningIdentity,
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
