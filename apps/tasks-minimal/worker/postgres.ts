import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { PostgresTaskRepository, type TaskRepository } from "@appbasis/tasks";

export interface GeneratedPostgresRuntime {
  tasks: TaskRepository;
  close(): Promise<void>;
}

export function createGeneratedPostgresRuntime(
  connectionString: string,
): GeneratedPostgresRuntime {
  const connection = createPostgresDatabase(
    requiredPostgresConnectionString(connectionString),
  );
  const tasks = new PostgresTaskRepository({
    unsafe(query, parameters) {
      return connection.client.unsafe(query, parameters);
    },
  });

  return Object.freeze({
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
