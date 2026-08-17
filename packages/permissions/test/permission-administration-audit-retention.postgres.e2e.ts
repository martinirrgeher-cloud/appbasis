import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";

import {
  PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS,
  PostgresPermissionAdministrationAuditRetention,
} from "../src";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  throw new Error("DATABASE_URL is required for permission audit retention PostgreSQL E2E tests.");
}

const administrativeConnection = createPostgresDatabase(databaseUrl);
const isolatedDatabaseName =
  "appbasis_permission_audit_retention_" + randomUUID().replaceAll("-", "").slice(0, 16);
const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, isolatedDatabaseName);
let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
let isolatedDatabaseCreated = false;
const migrationUrls = [
  new URL("../migrations/0000_appbasis_permissions_foundation.sql", import.meta.url),
  new URL("../migrations/0001_appbasis_permission_role_lifecycle.sql", import.meta.url),
  new URL("../migrations/0002_appbasis_permission_administration_audit.sql", import.meta.url),
  new URL(
    "../migrations/0003_appbasis_principal_permission_administration_audit.sql",
    import.meta.url,
  ),
];

beforeAll(async () => {
  await administrativeConnection.client.unsafe("CREATE DATABASE " + isolatedDatabaseName);
  isolatedDatabaseCreated = true;
  isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
  const connection = requiredIsolatedConnection();
  for (const migrationUrl of migrationUrls) {
    const migration = await readFile(migrationUrl, "utf8");
    await connection.client.unsafe(migration);
  }
});

afterAll(async () => {
  if (isolatedConnection !== null) {
    await isolatedConnection.client.end();
    isolatedConnection = null;
  }
  if (isolatedDatabaseCreated) {
    await administrativeConnection.client.unsafe(
      "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
    );
  }
  await administrativeConnection.client.end();
});

describe("PostgresPermissionAdministrationAuditRetention", () => {
  it("deletes only audit events strictly older than the confirmed 12-month retention boundary", async () => {
    expect(PERMISSION_ADMINISTRATION_AUDIT_RETENTION_MONTHS).toBe(12);
    const connection = requiredIsolatedConnection();
    await connection.client.unsafe(
      `INSERT INTO appbasis_permission_administration_audit (
         event_type,
         actor_principal_id,
         reason,
         target_type,
         target_id,
         previous_value,
         new_value,
         created_at
       ) VALUES
         ('role.update', 'retention-admin', 'old role event', 'role', 'managed:old', '{}'::jsonb, '{}'::jsonb, '2025-08-17T11:59:59.999Z'),
         ('principal.permissions.replace', 'retention-admin', 'older principal event', 'principal', 'principal-old', '{}'::jsonb, '{}'::jsonb, '2025-07-01T00:00:00.000Z'),
         ('role.update', 'retention-admin', 'exact boundary', 'role', 'managed:boundary', '{}'::jsonb, '{}'::jsonb, '2025-08-17T12:00:00.000Z'),
         ('principal.permissions.replace', 'retention-admin', 'newer principal event', 'principal', 'principal-new', '{}'::jsonb, '{}'::jsonb, '2025-08-17T12:00:00.001Z')`,
    );

    const retention = new PostgresPermissionAdministrationAuditRetention(connection.client);
    await expect(
      retention.deleteExpiredAuditEvents(new Date("2026-08-17T12:00:00.000Z")),
    ).resolves.toBe(2);

    const remaining = await connection.client.unsafe(
      `SELECT reason, created_at
       FROM appbasis_permission_administration_audit
       ORDER BY created_at ASC`,
    );
    expect(remaining.map((row) => row.reason)).toEqual([
      "exact boundary",
      "newer principal event",
    ]);
  });

  it("rejects an invalid retention clock before issuing a cleanup write", async () => {
    const retention = new PostgresPermissionAdministrationAuditRetention(
      requiredIsolatedConnection().client,
    );
    await expect(retention.deleteExpiredAuditEvents(new Date(Number.NaN))).rejects.toThrow(
      "requires a valid current time",
    );
  });
});

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}

function requiredIsolatedConnection() {
  if (isolatedConnection === null) {
    throw new Error("The isolated permission audit retention PostgreSQL database is not ready.");
  }
  return isolatedConnection;
}
