import { createPostgresDatabase } from "@appbasis/database";
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
  readonly administrativeSessionToken: string;
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

type LifecyclePrivilege = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

const REQUIRED_LIFECYCLE_TABLE_PRIVILEGES = Object.freeze([
  ["public.ulc_linz_membership", ["SELECT", "UPDATE", "DELETE"]],
  ["public.ulc_linz_subject_scope", ["SELECT", "DELETE"]],
  ["public.ulc_linz_lifecycle_deletion", ["SELECT", "INSERT", "DELETE"]],
  ["public.ulc_linz_lifecycle_audit", ["INSERT", "DELETE"]],
  ["public.appbasis_identity_operation", ["SELECT", "INSERT", "UPDATE", "DELETE"]],
  ["public.user", ["SELECT", "UPDATE", "DELETE"]],
  ["public.appbasis_identity_security_state", ["SELECT", "UPDATE", "DELETE"]],
  ["public.verification", ["SELECT"]],
  ["public.appbasis_person", ["DELETE"]],
  ["public.account", ["SELECT"]],
  ["public.session", ["SELECT", "DELETE"]],
  ["public.appbasis_permission_principal", ["SELECT", "DELETE"]],
  ["public.appbasis_permission_principal_role", ["SELECT", "DELETE"]],
  ["public.appbasis_permission_principal_grant", ["SELECT", "DELETE"]],
  ["public.appbasis_permission_principal_revoke", ["SELECT", "DELETE"]],
  ["public.appbasis_permission_role", ["SELECT"]],
  ["public.appbasis_permission_role_capability", ["SELECT"]],
  ["public.appbasis_permission_capability", ["SELECT"]],
  ["public.appbasis_permission_administration_audit", ["INSERT"]],
] as const satisfies readonly (readonly [string, readonly LifecyclePrivilege[]])[]);

const REQUIRED_LIFECYCLE_IDENTITY_SEQUENCES = Object.freeze([
  ["public.ulc_linz_lifecycle_audit", "event_id"],
  ["public.appbasis_permission_administration_audit", "event_id"],
] as const);

const ADMINISTRATIVE_SESSION_COOKIE_NAMES = Object.freeze([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

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
  const administrativeSessionToken = requiredAdministrativeSessionToken(
    options.administrativeSessionToken,
  );
  const connection = createPostgresDatabase(connectionString);

  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL,
      secret,
    });
    const identityRuntime = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL,
      administrativeSessionToken,
    });
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
      identity: identityRuntime.service,
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
        await verifyAdministrativeSessionReadOnly(
          connection.client,
          administrativeSessionToken,
          secret,
        );
        await verifyLifecycleDatabaseCapabilities(connection.client);
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

async function verifyAdministrativeSessionReadOnly(
  sql: Pick<ReturnType<typeof createPostgresDatabase>["client"], "unsafe">,
  administrativeSessionToken: string,
  secret: string,
): Promise<void> {
  const sessionToken = await verifiedAdministrativeSessionDatabaseToken(
    administrativeSessionToken,
    secret,
  );
  if (sessionToken === null) {
    throw new Error("ULC protected lifecycle administrative session is invalid.");
  }

  const rows = await sql.unsafe(
    `SELECT s.expires_at, u.role, u.banned
     FROM "session" s
     JOIN "user" u ON u.id = s.user_id
     WHERE s.token = $1
     LIMIT 1`,
    [sessionToken],
  );
  const administrator = rows[0];
  const expiresAt = timestampValue(administrator?.expires_at);
  if (
    rows.length !== 1 ||
    expiresAt === null ||
    expiresAt <= Date.now() ||
    administrator?.banned === true ||
    typeof administrator?.role !== "string" ||
    !administrator.role
      .split(",")
      .map((value: string) => value.trim())
      .includes("admin")
  ) {
    throw new Error("ULC protected lifecycle administrative session is invalid.");
  }
}

async function verifiedAdministrativeSessionDatabaseToken(
  cookieHeader: string,
  secret: string,
): Promise<string | null> {
  const cookie = readAdministrativeSessionCookie(cookieHeader);
  if (cookie === null) return null;
  const signature = decodeBase64Url(cookie.signature);
  if (signature === null) return null;

  try {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(cookie.token),
    );
    return valid ? cookie.token : null;
  } catch {
    return null;
  }
}

function readAdministrativeSessionCookie(
  cookieHeader: string,
): { token: string; signature: string } | null {
  for (const part of cookieHeader.split(";")) {
    const segment = part.trim();
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const name = segment.slice(0, separator);
    if (!ADMINISTRATIVE_SESSION_COOKIE_NAMES.includes(name)) continue;

    let signedValue: string;
    try {
      signedValue = decodeURIComponent(segment.slice(separator + 1));
    } catch {
      return null;
    }
    const signatureSeparator = signedValue.lastIndexOf(".");
    if (signatureSeparator <= 0 || signatureSeparator === signedValue.length - 1) {
      return null;
    }
    return {
      token: signedValue.slice(0, signatureSeparator),
      signature: signedValue.slice(signatureSeparator + 1),
    };
  }
  return null;
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const decoded = atob(padded);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function timestampValue(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function verifyLifecycleDatabaseCapabilities(
  sql: Pick<ReturnType<typeof createPostgresDatabase>["client"], "unsafe">,
): Promise<void> {
  for (const [relation, privileges] of REQUIRED_LIFECYCLE_TABLE_PRIVILEGES) {
    for (const privilege of privileges) {
      const rows = await sql.unsafe(
        `WITH target AS (
           SELECT to_regclass($1) AS relation_oid
         )
         SELECT
           relation_oid IS NOT NULL AS relation_present,
           CASE
             WHEN relation_oid IS NULL THEN false
             ELSE pg_catalog.has_table_privilege(current_user, relation_oid, $2)
           END AS privilege_present
         FROM target`,
        [relation, privilege],
      );
      if (
        rows.length !== 1 ||
        rows[0]?.relation_present !== true ||
        rows[0]?.privilege_present !== true
      ) {
        throw new Error("ULC protected lifecycle database capability is unavailable.");
      }
    }
  }

  for (const [relation, column] of REQUIRED_LIFECYCLE_IDENTITY_SEQUENCES) {
    const rows = await sql.unsafe(
      `WITH target AS (
         SELECT pg_catalog.pg_get_serial_sequence($1, $2) AS sequence_name
       )
       SELECT
         sequence_name IS NOT NULL AS sequence_present,
         CASE
           WHEN sequence_name IS NULL THEN false
           ELSE pg_catalog.has_sequence_privilege(current_user, sequence_name, 'USAGE')
         END AS usage_present
       FROM target`,
      [relation, column],
    );
    if (
      rows.length !== 1 ||
      rows[0]?.sequence_present !== true ||
      rows[0]?.usage_present !== true
    ) {
      throw new Error("ULC protected lifecycle database capability is unavailable.");
    }
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

function requiredAdministrativeSessionToken(value: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("ULC protected lifecycle administrative session is invalid.");
  }
  return value;
}
