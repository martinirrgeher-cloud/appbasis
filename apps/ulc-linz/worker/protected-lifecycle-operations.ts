import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import { PostgresIdentityDeletion } from "@appbasis/identity/postgres-deletion";
import { PostgresIdentityDeletionRetention } from "@appbasis/identity/postgres-deletion-retention";
import { createPostgresIdentityApplicationRuntime } from "@appbasis/identity/postgres-runtime";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  PostgresPrincipalLifecycleAdministration,
} from "@appbasis/permissions";

import { runUlcLinzRetention, type UlcLinzRetentionRunResult } from "./retention";
import { PostgresUlcLinzScopePersistence } from "./scope-persistence";

export interface UlcLinzProtectedLifecycleOptions {
  readonly connectionString: string;
  readonly baseURL: string;
  readonly secret: string;
}

export interface UlcLinzProtectedLifecycleOperations {
  verifyBinding(): Promise<void>;
  runRetention(): Promise<UlcLinzRetentionRunResult>;
  close(): Promise<void>;
}

type LifecycleSqlClient =
  ConstructorParameters<typeof PostgresPermissionStore>[0] &
  ConstructorParameters<typeof PostgresPrincipalAccessAdministration>[0] &
  ConstructorParameters<typeof PostgresPrincipalLifecycleAdministration>[0] &
  ConstructorParameters<typeof PostgresIdentityDeletion>[0] &
  ConstructorParameters<typeof PostgresIdentityDeletionRetention>[0] &
  ConstructorParameters<typeof PostgresUlcLinzScopePersistence>[0];

/**
 * Protected control-plane composition for the current ULC lifecycle owners.
 *
 * This module is intentionally not imported by the public application Worker.
 * The guarded GitHub Actions operation runs it only through an isolated remote
 * Worker harness with the canonical production Hyperdrive. Keeping the
 * composition here makes the retention executor use the same deletion,
 * Identity, permission and app-owned persistence contracts as the tested
 * lifecycle implementation instead of introducing a second SQL lifecycle.
 */
export async function createUlcLinzProtectedLifecycleOperations(
  options: UlcLinzProtectedLifecycleOptions,
): Promise<UlcLinzProtectedLifecycleOperations> {
  const connectionString = requiredConnectionString(options.connectionString);
  const baseURL = requiredBaseURL(options.baseURL);
  const secret = requiredSecret(options.secret);
  const identityRuntime = await createPostgresIdentityApplicationRuntime({
    connectionString,
    baseURL,
    secret,
  });
  const connection = createPostgresDatabase(connectionString);

  try {
    // The database runtime contract intentionally exposes only the common
    // read/query surface. The concrete runtime client is the same postgres-js
    // client used by the existing lifecycle owners, which additionally require
    // transactional administration methods. Keep that widening local to this
    // protected composition boundary.
    const lifecycleClient = connection.client as unknown as LifecycleSqlClient;
    const scopes = new PostgresUlcLinzScopePersistence(lifecycleClient);
    const permissions = new PostgresPermissionStore(lifecycleClient);
    const accessAdministration = new PostgresPrincipalAccessAdministration(
      lifecycleClient,
    );
    const principalLifecycle = new PostgresPrincipalLifecycleAdministration(
      lifecycleClient,
    );
    const identityDeletion = new PostgresIdentityDeletion(lifecycleClient);
    const identityDeletionRetention = new PostgresIdentityDeletionRetention(
      lifecycleClient,
    );

    const dependencies = Object.freeze({
      identity: identityRuntime.identity,
      identityDeletion,
      permissions,
      accessAdministration,
      principalLifecycle,
      scopes,
      identityDeletionRetention,
    });

    return Object.freeze({
      async verifyBinding() {
        const rows = await connection.client.unsafe(
          "SELECT current_database() AS database_name",
        );
        if (
          !Array.isArray(rows) ||
          rows.length !== 1 ||
          typeof rows[0]?.database_name !== "string" ||
          rows[0].database_name.length === 0
        ) {
          throw new Error("ULC protected lifecycle database binding is invalid.");
        }
        await scopes.evaluateRetention();
      },
      async runRetention() {
        return runUlcLinzRetention(dependencies);
      },
      async close() {
        let closeError: unknown = null;
        try {
          await connection.client.end();
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
    try {
      await connection.client.end();
    } catch {
      // Preserve the construction failure.
    }
    try {
      await identityRuntime.close();
    } catch {
      // Preserve the construction failure.
    }
    throw error;
  }
}

function requiredConnectionString(value: string): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error("ULC protected lifecycle PostgreSQL binding is required.");
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
    throw new Error("ULC protected lifecycle PostgreSQL binding is required.");
  }
}

function requiredBaseURL(value: string): string {
  if (typeof value !== "string" || value.trim() !== value) {
    throw new Error("ULC protected lifecycle base URL is required.");
  }
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
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
    throw new Error("ULC protected lifecycle base URL is required.");
  }
}

function requiredSecret(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 32
  ) {
    throw new Error("ULC protected lifecycle identity secret is invalid.");
  }
  return value;
}
