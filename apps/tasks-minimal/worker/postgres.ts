import { createPostgresDatabase } from "@appbasis/database";
import { createIdentityRuntime } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
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

export function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): GeneratedPostgresApplicationRuntime {
  const connectionString = requiredPostgresConnectionString(
    options.connectionString,
  );
  const baseURL = requiredBaseURL(options.baseURL);
  const secret = requiredIdentitySecret(options.secret);
  const connection = createPostgresDatabase(connectionString);
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
  const repositories = createPersistentRepositories(connection.client);

  return Object.freeze({
    identity: identity.service,
    ...repositories,
    async close() {
      await connection.client.end();
    },
  });
}

function createPersistentRepositories(client: {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}) {
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
