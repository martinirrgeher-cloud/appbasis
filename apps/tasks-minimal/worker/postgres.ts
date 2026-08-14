import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
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

export function createGeneratedPostgresRuntime(
  connectionString: string,
): GeneratedPostgresRuntime {
  const connection = createPostgresDatabase(
    requiredPostgresConnectionString(connectionString),
  );
  const sql = {
    unsafe(query: string, parameters?: (string | number | boolean | null)[]) {
      return connection.client.unsafe(query, parameters);
    },
  };
  const permissions = new PostgresPermissionStore(sql);
  const tasks = new PostgresTaskRepository(sql);

  return Object.freeze({
    permissions,
    tasks,
    async close() {
      await connection.client.end();
    },
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
