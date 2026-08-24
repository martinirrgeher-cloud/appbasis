import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { PostgresIdentityDeletion } from "@appbasis/identity/postgres-deletion";
import {
  PostgresPermissionStore,
  PostgresPrincipalAccessAdministration,
  PostgresPrincipalLifecycleAdministration,
  capabilityId,
  principalId,
} from "@appbasis/permissions";
import { describe, expect, it } from "vitest";

import { createGeneratedApp } from "../worker/app";
import type { UlcLinzIdentityLifecycleOwner } from "../worker/lifecycle";
import { createGeneratedPostgresApplicationRuntime } from "../worker/postgres";
import {
  PostgresUlcLinzDeletionReconciliationSource,
  reconcileUlcLinzRestoredDatabase,
} from "../worker/restore-reconciliation";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";
const AUTHORITATIVE_DATABASE_URL = process.env.ULC_LINZ_PRODUCTION_DATABASE_URL?.trim() ?? "";
const RECONCILIATION_EVIDENCE_PATH =
  process.env.APPBASIS_M5_RESTORE_RECONCILIATION_EVIDENCE_PATH?.trim() ?? "";
const runOnRestore =
  DATABASE_URL.length > 0 &&
  AUTHORITATIVE_DATABASE_URL.length > 0 &&
  RECONCILIATION_EVIDENCE_PATH.length > 0
    ? it
    : it.skip;
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
    "exercises auth, permissions, reconciliation, inventory, retention and security ACLs on the exact restored database",
    async () => {
      const target = new URL(DATABASE_URL);
      const source = new URL(AUTHORITATIVE_DATABASE_URL);
      const expectedDatabase = target.pathname.replace(/^\//, "");
      expect(expectedDatabase.length).toBeGreaterThan(0);
      expect(`${target.hostname.toLowerCase()}:${target.port || "5432"}${target.pathname}`).not.toBe(
        `${source.hostname.toLowerCase()}:${source.port || "5432"}${source.pathname}`,
      );
      expect(INVENTORY.schemaVersion).toBe(2);
      expect(INVENTORY.application).toBe("ulc-linz");

      const startedAt = new Date();
      const runtime = await createGeneratedPostgresApplicationRuntime({
        connectionString: DATABASE_URL,
        securityLogConnectionString: DATABASE_URL,
        baseURL: "https://m5-restore-smoke.invalid",
        secret: `restore-smoke-${randomUUID()}-${randomUUID()}`,
      });
      let reconciliationResult:
        | Awaited<ReturnType<typeof reconcileUlcLinzRestoredDatabase>>
        | undefined;
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

        const evaluatePermission = runtime.permissions.evaluatePermission;
        if (evaluatePermission === undefined) {
          throw new Error("Restored production runtime is missing the permission evaluator.");
        }
        const permissionAllowed = await evaluatePermission({
          principalId: principalId(`m5-restore-missing-${randomUUID()}`),
          capability: capabilityId("ulc-linz:module:__restore_probe__:view"),
        });
        expect(permissionAllowed).toBe(false);

        const authoritative = createPostgresDatabase(AUTHORITATIVE_DATABASE_URL);
        const restored = createPostgresDatabase(DATABASE_URL);
        try {
          const reconciliationSource = new PostgresUlcLinzDeletionReconciliationSource(
            authoritative.client,
          );
          const restoredScopes = new PostgresUlcLinzScopePersistence(restored.client);
          const restoredPermissions = new PostgresPermissionStore(restored.client);
          reconciliationResult = await reconcileUlcLinzRestoredDatabase(
            reconciliationSource,
            {
              identity: requireLifecycleIdentityOwner(runtime.identity),
              identityDeletion: new PostgresIdentityDeletion(restored.client),
              permissions: restoredPermissions,
              accessAdministration: new PostgresPrincipalAccessAdministration(restored.client),
              principalLifecycle: new PostgresPrincipalLifecycleAdministration(restored.client),
              scopes: restoredScopes,
            },
          );
          expect(reconciliationResult.requiredDeletionCount).toBeGreaterThanOrEqual(0);
          expect(reconciliationResult.reconciledIdentityIds).toHaveLength(
            reconciliationResult.requiredDeletionCount,
          );
        } finally {
          await Promise.allSettled([
            authoritative.client.end(),
            restored.client.end(),
          ]);
        }
      } finally {
        await runtime.close();
      }

      if (reconciliationResult === undefined) {
        throw new Error("Restore reconciliation did not produce evidence.");
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
            to_regprocedure('public.appbasis_ulc_linz_purge_expired_security_events()') IS NOT NULL AS cleanup_function,
            has_table_privilege('ulc_linz_security_event_ingest', 'public.ulc_linz_security_event_log', 'SELECT') AS ingest_select,
            has_column_privilege('ulc_linz_security_event_ingest', 'public.ulc_linz_security_event_log', 'schema_version', 'INSERT') AS ingest_column_insert,
            has_column_privilege('ulc_linz_security_event_ingest', 'public.ulc_linz_security_event_log', 'id', 'INSERT') AS ingest_identity_insert,
            has_sequence_privilege('ulc_linz_security_event_ingest', 'public.ulc_linz_security_event_log_id_seq', 'USAGE') AS ingest_sequence_usage,
            has_function_privilege('ulc_linz_security_event_ingest', 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS ingest_cleanup_execute,
            has_table_privilege('ulc_linz_security_event_cleanup', 'public.ulc_linz_security_event_log', 'DELETE') AS cleanup_delete,
            has_column_privilege('ulc_linz_security_event_cleanup', 'public.ulc_linz_security_event_log', 'retained_until', 'SELECT') AS cleanup_retention_select,
            has_column_privilege('ulc_linz_security_event_cleanup', 'public.ulc_linz_security_event_log', 'target_id', 'SELECT') AS cleanup_event_select,
            has_function_privilege('ulc_linz_security_event_cleanup', 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS cleanup_execute,
            has_table_privilege('ulc_linz_security_event_read', 'public.ulc_linz_security_event_log', 'SELECT') AS read_select,
            has_table_privilege('ulc_linz_security_event_read', 'public.ulc_linz_security_event_log', 'INSERT') AS read_insert,
            has_function_privilege('ulc_linz_security_event_read', 'public.appbasis_ulc_linz_purge_expired_security_events()', 'EXECUTE') AS read_cleanup_execute,
            EXISTS (
              SELECT 1
              FROM pg_catalog.pg_proc p,
                   LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
              WHERE p.oid = 'public.appbasis_ulc_linz_purge_expired_security_events()'::regprocedure
                AND acl.grantee = 0
                AND acl.privilege_type = 'EXECUTE'
            ) AS public_cleanup_execute
        `);
        expect(accessRows).toEqual([
          {
            ingest_role: true,
            cleanup_role: true,
            read_role: true,
            cleanup_function: true,
            ingest_select: false,
            ingest_column_insert: true,
            ingest_identity_insert: false,
            ingest_sequence_usage: true,
            ingest_cleanup_execute: false,
            cleanup_delete: false,
            cleanup_retention_select: true,
            cleanup_event_select: false,
            cleanup_execute: true,
            read_select: true,
            read_insert: false,
            read_cleanup_execute: false,
            public_cleanup_execute: false,
          },
        ]);

        await writeFile(
          RECONCILIATION_EVIDENCE_PATH,
          `${JSON.stringify({
            schemaVersion: 1,
            application: "ulc-linz",
            authoritativeSourceBound: true,
            restoredTargetBound: true,
            requiredDeletionCount: reconciliationResult.requiredDeletionCount,
            reconciledIdentityCount: reconciliationResult.reconciledIdentityIds.length,
            securityAclVerified: true,
            restoreReconciliationVerified: true,
          })}\n`,
          { encoding: "utf8", mode: 0o600, flag: "wx" },
        );
      } finally {
        await database.client.end();
      }
    },
    30_000,
  );
});

function requireLifecycleIdentityOwner(value: unknown): UlcLinzIdentityLifecycleOwner {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { disableIdentity?: unknown }).disableIdentity !== "function"
  ) {
    throw new Error("Restored production runtime is missing the lifecycle identity owner.");
  }
  return value as UlcLinzIdentityLifecycleOwner;
}
