import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  createPostgresIdentityApplicationRuntime,
  type IdentityPostgresRuntimeSqlClient,
  type IdentityPostgresRuntimeTransactionalSqlClient,
} from "@appbasis/identity/postgres-runtime";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  ExerciseCatalogService,
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogPostgresClient,
  type ExerciseCatalogPostgresQueryClient,
  type ExerciseCatalogSqlParameter,
} from "@appbasis/exercise-catalog";
import {
  PostgresPermissionStore,
  type PermissionStore,
} from "@appbasis/permissions";

import { EXERCISE_CATALOG_MINIMAL_DEFINITION } from "./catalog-config";

export interface ExerciseCatalogMinimalPostgresRuntime {
  readonly permissions: PermissionStore;
  readonly catalog: ExerciseCatalogService;
  close(): Promise<void>;
}

export interface ExerciseCatalogMinimalPostgresApplicationRuntime
  extends ExerciseCatalogMinimalPostgresRuntime {
  readonly identity: IdentityHttpService;
}

export interface ExerciseCatalogMinimalPostgresApplicationRuntimeOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
}

export function createExerciseCatalogMinimalPostgresRuntime(
  connectionString: string,
): ExerciseCatalogMinimalPostgresRuntime {
  const connection = createPostgresDatabase(
    requiredPostgresConnectionString(connectionString),
  );
  const repositories = createPersistentRepositories(
    adaptDatabaseClient(connection.client),
  );

  return Object.freeze({
    ...repositories,
    async close() {
      await connection.client.end();
    },
  });
}

export async function createExerciseCatalogMinimalPostgresApplicationRuntime(
  options: ExerciseCatalogMinimalPostgresApplicationRuntimeOptions,
): Promise<ExerciseCatalogMinimalPostgresApplicationRuntime> {
  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);

  try {
    const repositories = createPersistentRepositories(
      adaptIdentityClient(identityRuntime.sql),
    );
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

function createPersistentRepositories(client: ExerciseCatalogPostgresClient) {
  const permissions = new PostgresPermissionStore({
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  });
  const catalog = new ExerciseCatalogService({
    repository: new PostgresExerciseCatalogRepository(client),
    definition: EXERCISE_CATALOG_MINIMAL_DEFINITION,
  });
  return Object.freeze({ permissions, catalog });
}

function adaptIdentityClient(
  client: IdentityPostgresRuntimeTransactionalSqlClient,
): ExerciseCatalogPostgresClient {
  return Object.freeze({
    unsafe(query: string, parameters?: ExerciseCatalogSqlParameter[]) {
      return client.unsafe(query, parameters);
    },
    begin<T>(
      callback: (
        transaction: ExerciseCatalogPostgresQueryClient,
      ) => Promise<T>,
    ): Promise<T> {
      return client.begin(async (transaction: IdentityPostgresRuntimeSqlClient) =>
        callback({
          unsafe(query, parameters) {
            return transaction.unsafe(query, parameters);
          },
        }),
      );
    },
  });
}

function adaptDatabaseClient(
  client: ReturnType<typeof createPostgresDatabase>["client"],
): ExerciseCatalogPostgresClient {
  return Object.freeze({
    unsafe(query: string, parameters?: ExerciseCatalogSqlParameter[]) {
      return client.unsafe(query, parameters);
    },
    async begin<T>(
      callback: (
        transaction: ExerciseCatalogPostgresQueryClient,
      ) => Promise<T>,
    ): Promise<T> {
      const result = await client.begin(async (transaction) =>
        [
          await callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }),
        ] as [T],
      );
      return result[0] as unknown as T;
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
