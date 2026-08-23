import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import {
  createPostgresUlcLinzSecurityEventLogger,
  purgeExpiredUlcLinzSecurityEvents,
} from "../worker/security-events-postgres";
import type { UlcLinzSecurityEvent } from "../worker/security-events";

const databaseUrl = process.env.DATABASE_URL;
const migrationPath = "../migrations/0002_ulc_linz_security_event_log.sql";
const occurredAt = "2026-08-23T05:30:00.000Z";
const event: UlcLinzSecurityEvent = Object.freeze({
  schemaVersion: 1,
  appId: "ulc-linz",
  category: "security",
  eventType: "authorization.denied",
  occurredAt,
  actorPrincipalId: "identity-security-e2e",
  organizationId: "ulc-linz",
  action: "edit",
  targetType: "module",
  targetId: "training",
  reasonCode: "capability-denied",
});

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Linz security-event PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Linz security-event PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const databaseName = `appbasis_ulc_security_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, databaseName);
    let isolated: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    beforeAll(async () => {
      await administrativeConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      isolated = createPostgresDatabase(isolatedDatabaseUrl);
      const migration = await readFile(new URL(migrationPath, import.meta.url), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await requiredConnection().client.unsafe(statement);
      }
    });

    afterAll(async () => {
      if (isolated !== null) {
        await isolated.client.end();
        isolated = null;
      }
      if (created) {
        await administrativeConnection.client.unsafe(
          `DROP DATABASE ${databaseName} WITH (FORCE)`,
        );
      }
      await administrativeConnection.client.end();
    });

    it("persists the normalized security envelope and retains it through the exact twelve-month boundary", async () => {
      const connection = requiredConnection();
      const logger = createPostgresUlcLinzSecurityEventLogger(connection.client);
      logger.record(event);
      await logger.flush();

      const rows = await connection.client.unsafe(
        `SELECT schema_version, app_id, category, event_type, occurred_at,
                actor_principal_id, organization_id, action, target_type,
                target_id, operation, http_status, error_code, reason_code,
                retained_until
           FROM ulc_linz_security_event_log`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        schema_version: 1,
        app_id: "ulc-linz",
        category: "security",
        event_type: "authorization.denied",
        actor_principal_id: "identity-security-e2e",
        organization_id: "ulc-linz",
        action: "edit",
        target_type: "module",
        target_id: "training",
        operation: null,
        http_status: null,
        error_code: null,
        reason_code: "capability-denied",
      });
      expect(new Date(String(rows[0]?.occurred_at)).toISOString()).toBe(occurredAt);
      expect(new Date(String(rows[0]?.retained_until)).toISOString()).toBe(
        "2027-08-23T05:30:00.000Z",
      );

      await purgeExpiredUlcLinzSecurityEvents(
        connection.client,
        new Date("2027-08-23T05:30:00.000Z"),
      );
      let count = await connection.client.unsafe(
        `SELECT count(*)::int AS count FROM ulc_linz_security_event_log`,
      );
      expect(count[0]?.count).toBe(1);

      await purgeExpiredUlcLinzSecurityEvents(
        connection.client,
        new Date("2027-08-23T05:30:00.001Z"),
      );
      count = await connection.client.unsafe(
        `SELECT count(*)::int AS count FROM ulc_linz_security_event_log`,
      );
      expect(count[0]?.count).toBe(0);
    });

    function requiredConnection() {
      if (isolated === null) throw new Error("ULC security-event database is not ready.");
      return isolated;
    }
  });
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
