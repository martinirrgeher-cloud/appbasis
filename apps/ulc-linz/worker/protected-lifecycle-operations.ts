import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresIdentityDeletion } from "@appbasis/identity/postgres-deletion";
import { PostgresIdentityDeletionRetention } from "@appbasis/identity/postgres-deletion-retention";
import { createIdentityRuntime } from "@appbasis/identity/server";
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
  const connection = createPostgresDatabase(requiredConnectionString(options.connectionString));
  try {
    const baseURL = requiredBaseURL(options.baseURL);
    const secret = requiredSecret(options.secret);
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL,
      secret,
    });
    const identity = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL,
    }).service;
    const scopes = new PostgresUlcLinzScopePersistence(connection.client);
    const permissions = new PostgresPermissionStore(connection.client);
    const accessAdministration = new PostgresPrincipalAccessAdministration(
      connection.client,
    );
    const principalLifecycle = new PostgresPrincipalLifecycleAdministration(
      connection.client,
    );
    const identityDeletion = new PostgresIdentityDeletion(connection.client);
    const identityDeletionRetention = new PostgresIdentityDeletionRetention(
      connection.client,
    );

    const dependencies = Object.freeze({
      identity,
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
        await connection.client.end();
      },
    });
  } catch (error) {
    try {
      await connection.client.end();
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
