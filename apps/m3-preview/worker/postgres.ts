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
import { PostgresTaskRepository, type TaskRepository } from "@appbasis/tasks";

export interface GeneratedPostgresRuntime {
  permissions: PermissionStore;
  tasks: TaskRepository;
  close(): Promise<void>;
}

export interface GeneratedPostgresApplicationRuntime
  extends GeneratedPostgresRuntime {
  identity: IdentityHttpService;
}

export interface GeneratedPostgresApplicationRuntimeOptions {
  connectionString: string;
  baseURL: string;
  secret: string;
}

export function createGeneratedPostgresRuntime(
  connectionString: string,
): GeneratedPostgresRuntime {
  const connection = createPostgresDatabase(
    requiredPostgresConnectionString(connectionString),
  );
  const repositories = createPersistentRepositories(connection.client);

  return Object.freeze({
    ...repositories,
    async close() {
      await connection.client.end();
    },
  });
}

export async function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): Promise<GeneratedPostgresApplicationRuntime> {
  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);

  try {
    const repositories = createPersistentRepositories(identityRuntime.sql);
    return Object.freeze({
      identity: identityRuntime.identity,
      ...repositories,
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

function createPersistentRepositories(client: IdentityPostgresRuntimeSqlClient) {
  const sql = {
    unsafe(query: string, parameters?: (string | number | boolean | null)[]) {
      return client.unsafe(query, parameters);
    },
  };
  return Object.freeze({
    permissions: new PostgresPermissionStore(sql),
    tasks: new PostgresTaskRepository(sql),
  });
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
