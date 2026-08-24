import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database/postgres-runtime";
import { capabilityId, principalId } from "@appbasis/permissions";
import { describe, expect, it } from "vitest";

import { createGeneratedApp } from "../worker/app";
import { createGeneratedPostgresApplicationRuntime } from "../worker/postgres";

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const runOnRestore = DATABASE_URL.length > 0 ? it : it.skip;
const INVENTORY = JSON.parse(
  await readFile(
    new URL("../privacy/m5-data-inventory.json", import.meta.url),
    "utf8",
  ),
) as {
  schemaVersion: number;
  application: string;
  persistentTables: Array<{ id: string }>;
};

describe("ULC restored production database evidence", () => {
  runOnRestore(
    "exercises auth, permissions, lifecycle/export inventory, retention and security logging on the exact restored database",
    async () => {
      const target = new URL(DATABASE_URL);
      const expectedDatabase = target.pathname.replace(/^\//, "");
      expect(expectedDatabase.length).toBeGreaterThan(0);
      expect(INVENTORY.schemaVersion).toBe(2);
      expect(INVENTORY.application).toBe("ulc-linz");

      const startedAt = new Date();
      const runtime = await createGeneratedPostgresApplicationRuntime({
        connectionString: DATABASE_URL,
        securityLogConnectionString: DATABASE_URL,
        baseURL: "https://m5-restore-smoke.invalid",
        secret: `restore-smoke-${randomUUID()}-${randomUUID()}`,
      });
      try {
        const app = createGeneratedApp({
          identity: runtime.identity,
          securityEvents: runtime.securityEvents,
          secureCookies: false,
        });

        const health = await app.request("/api/health");
        expect(health.status).toBe(200);
        expect(await health.json()).toEqual({ status: "ok", appId: "ulc-linz" });

        const deniedAuth = await app.request("/api/auth/sign-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: `m5.restore.missing.${randomUUID()}`,
            password: `M5!${randomUUID()}Aa7`,
          }),
        });
        expect(deniedAuth.status).toBeGreaterThanOrEqual(400);
        expect(deniedAuth.status).toBeLessThan(500);
        await runtime.securityEvents.flush();

        const permissionAllowed = await runtime.permissions.evaluatePermission({
          principalId: principalId(`m5-restore-missing-${randomUUID()}`),
          capability: capabilityId("ulc-linz:module:__restore_probe__:view"),
        });
        expect(permissionAllowed).toBe(false);
      } finally {
        await runtime.close();
      }

      const database = createPostgresDatabase(DATABASE_URL);
      try {
        const databaseRows = await database.client.unsafe(
          "SELECT current_database() AS database_name",
        );
        expect(databaseRows[0]?.database_name).toBe(expectedDatabase);

        const tableRows = await database.client.unsafe(`
          SELECT c.relname AS table_name
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          ORDER BY c.relname
        `);
        const actualTables = tableRows.map((row) => String(row.table_name)).sort();
        const expectedTables = INVENTORY.persistentTables.map((entry) => entry.id).sort();
        expect(actualTables).toEqual(expectedTables);

        for (const tableName of expectedTables) {
          if (!/^[a-z][a-z0-9_]{0,62}$/.test(tableName)) {
            throw new Error("Restore inventory contains an unsafe table name.");
          }
          await database.client.unsafe(`SELECT * FROM public.${tableName} LIMIT 0`);
        }

        const eventRows = await database.client.unsafe(
          `SELECT occurred_at, retained_until
           FROM public.ulc_linz_security_event_log
           WHERE event_type = 'identity.request.denied'
             AND occurred_at >= $1::timestamptz
           ORDER BY occurred_at DESC
           LIMIT 1`,
          [startedAt.toISOString()],
        );
        expect(eventRows).toHaveLength(1);
        const occurredAt = new Date(String(eventRows[0]?.occurred_at));
        const retainedUntil = new Date(String(eventRows[0]?.retained_until));
        expect(Number.isFinite(occurredAt.getTime())).toBe(true);
        expect(Number.isFinite(retainedUntil.getTime())).toBe(true);

        const boundaryRows = await database.client.unsafe(
          `SELECT ($1::timestamptz + interval '12 months') = $2::timestamptz AS exact_boundary`,
          [occurredAt.toISOString(), retainedUntil.toISOString()],
        );
        expect(boundaryRows[0]?.exact_boundary).toBe(true);

        const accessRows = await database.client.unsafe(`
          SELECT
            to_regrole('ulc_linz_security_event_ingest') IS NOT NULL AS ingest_role,
            to_regrole('ulc_linz_security_event_cleanup') IS NOT NULL AS cleanup_role,
            to_regrole('ulc_linz_security_event_read') IS NOT NULL AS read_role,
            to_regprocedure('public.appbasis_ulc_linz_purge_expired_security_events()') IS NOT NULL AS cleanup_function
        `);
        expect(accessRows).toEqual([
          {
            ingest_role: true,
            cleanup_role: true,
            read_role: true,
            cleanup_function: true,
          },
        ]);
      } finally {
        await database.client.end();
      }
    },
    30_000,
  );
});
