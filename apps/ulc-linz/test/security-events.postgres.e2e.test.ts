import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import {
  createPostgresUlcLinzSecurityEventLogger,
  purgeExpiredUlcLinzSecurityEvents,
  type UlcLinzSecurityEventSqlClient,
} from "../worker/security-events-postgres";
import type { UlcLinzSecurityEvent } from "../worker/security-events";

const databaseUrl = process.env.DATABASE_URL;
const migrationPaths = [
  "../migrations/0002_ulc_linz_security_event_log.sql",
  "../migrations/0003_ulc_linz_security_event_access.sql",
];
const INGEST_ROLE = "ulc_linz_security_event_ingest";
const CLEANUP_ROLE = "ulc_linz_security_event_cleanup";
const READ_ROLE = "ulc_linz_security_event_read";
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
      for (const migrationPath of migrationPaths) {
        const migration = await readFile(new URL(migrationPath, import.meta.url), "utf8");
        for (const statement of migration.split("--> statement-breakpoint")) {
          if (statement.trim() !== "") await requiredConnection().client.unsafe(statement);
        }
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

    it("persists the normalized security envelope with an exact twelve-calendar-month boundary", async () => {
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
    });

    it("defines three non-login least-privilege roles without elevated cluster privileges", async () => {
      const roles = await requiredConnection().client.unsafe(
        `SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
                rolreplication, rolbypassrls
           FROM pg_catalog.pg_roles
          WHERE rolname IN (
            'ulc_linz_security_event_ingest',
            'ulc_linz_security_event_cleanup',
            'ulc_linz_security_event_read'
          )
          ORDER BY rolname`,
      );
      expect(roles).toEqual([
        roleRow(CLEANUP_ROLE),
        roleRow(INGEST_ROLE),
        roleRow(READ_ROLE),
      ]);
    });

    it("allows ingest only to append normalized events", async () => {
      const connection = requiredConnection();
      await connection.client.unsafe(`TRUNCATE ulc_linz_security_event_log RESTART IDENTITY`);

      await asRole(INGEST_ROLE, async (client) => {
        const logger = createPostgresUlcLinzSecurityEventLogger(client);
        logger.record({ ...event, targetId: "ingest-only" });
        await logger.flush();
      });
      await expectDenied(INGEST_ROLE, `SELECT * FROM ulc_linz_security_event_log`);
      await expectDenied(INGEST_ROLE, `DELETE FROM ulc_linz_security_event_log`);
      await expectDenied(
        INGEST_ROLE,
        `UPDATE ulc_linz_security_event_log SET target_id = 'changed'`,
      );

      const rows = await connection.client.unsafe(
        `SELECT target_id FROM ulc_linz_security_event_log`,
      );
      expect(rows).toEqual([{ target_id: "ingest-only" }]);
    });

    it("allows cleanup only through the fixed server-owned retention function", async () => {
      const connection = requiredConnection();
      await connection.client.unsafe(`TRUNCATE ulc_linz_security_event_log RESTART IDENTITY`);
      const serverNow = await readServerNow();
      const expiredOccurredAt = new Date(serverNow);
      expiredOccurredAt.setUTCFullYear(expiredOccurredAt.getUTCFullYear() - 2);
      const recentOccurredAt = new Date(serverNow);
      recentOccurredAt.setUTCMonth(recentOccurredAt.getUTCMonth() - 1);

      const logger = createPostgresUlcLinzSecurityEventLogger(connection.client);
      logger.record({ ...event, occurredAt: expiredOccurredAt.toISOString(), targetId: "expired" });
      logger.record({ ...event, occurredAt: recentOccurredAt.toISOString(), targetId: "recent" });
      await logger.flush();

      await asRole(CLEANUP_ROLE, async (client) => {
        await purgeExpiredUlcLinzSecurityEvents(client);
        const retentionRows = await client.unsafe(
          `SELECT retained_until FROM ulc_linz_security_event_log`,
        );
        expect(Array.from(retentionRows as ArrayLike<unknown>)).toHaveLength(1);
      });
      await expectDenied(CLEANUP_ROLE, `SELECT target_id FROM ulc_linz_security_event_log`);
      await expectDenied(CLEANUP_ROLE, `DELETE FROM ulc_linz_security_event_log`);
      await expectDenied(
        CLEANUP_ROLE,
        `INSERT INTO ulc_linz_security_event_log (schema_version, app_id, category, event_type, occurred_at, action, target_type, reason_code, retained_until)
         VALUES (1, 'ulc-linz', 'security', 'authorization.denied', statement_timestamp(), 'view', 'module', 'scope-denied', statement_timestamp() + interval '12 months')`,
      );

      const remaining = await connection.client.unsafe(
        `SELECT target_id FROM ulc_linz_security_event_log`,
      );
      expect(remaining).toEqual([{ target_id: "recent" }]);
    });

    it("allows the protected read role to query but never mutate security events", async () => {
      await asRole(READ_ROLE, async (client) => {
        const rows = await client.unsafe(
          `SELECT target_id FROM ulc_linz_security_event_log`,
        );
        expect(rows).toEqual([{ target_id: "recent" }]);
      });
      await expectDenied(READ_ROLE, `DELETE FROM ulc_linz_security_event_log`);
      await expectDenied(
        READ_ROLE,
        `UPDATE ulc_linz_security_event_log SET target_id = 'changed'`,
      );
    });

    it("uses only PostgreSQL server time and removes only already-expired rows", async () => {
      const connection = requiredConnection();
      await connection.client.unsafe(`TRUNCATE ulc_linz_security_event_log RESTART IDENTITY`);

      const serverNow = await readServerNow();
      const recentOccurredAt = new Date(serverNow);
      recentOccurredAt.setUTCMonth(recentOccurredAt.getUTCMonth() - 1);
      const expiredOccurredAt = new Date(serverNow);
      expiredOccurredAt.setUTCFullYear(expiredOccurredAt.getUTCFullYear() - 2);

      const logger = createPostgresUlcLinzSecurityEventLogger(connection.client);
      logger.record({ ...event, occurredAt: recentOccurredAt.toISOString(), targetId: "recent" });
      logger.record({ ...event, occurredAt: expiredOccurredAt.toISOString(), targetId: "expired" });
      await logger.flush();

      await purgeExpiredUlcLinzSecurityEvents(connection.client);

      const remaining = await connection.client.unsafe(
        `SELECT target_id FROM ulc_linz_security_event_log ORDER BY target_id`,
      );
      expect(remaining).toEqual([{ target_id: "recent" }]);
    });

    async function readServerNow() {
      const rows = await requiredConnection().client.unsafe(
        `SELECT statement_timestamp() AS now`,
      );
      return new Date(String(rows[0]?.now));
    }

    async function asRole(
      role: string,
      run: (client: UlcLinzSecurityEventSqlClient) => Promise<void>,
    ) {
      const connection = requiredConnection();
      await connection.client.begin(async (transaction) => {
        await transaction.unsafe(`SET LOCAL ROLE ${role}`);
        await run(transaction);
      });
    }

    async function expectDenied(role: string, statement: string) {
      await expect(
        asRole(role, async (client) => {
          await client.unsafe(statement);
        }),
      ).rejects.toThrow();
    }

    function requiredConnection() {
      if (isolated === null) throw new Error("ULC security-event database is not ready.");
      return isolated;
    }
  });
}

function roleRow(role: string) {
  return {
    rolname: role,
    rolcanlogin: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  };
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
