import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { createPostgresDatabase } from "@appbasis/database";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";
import { PostgresIdentityDeletion } from "@appbasis/identity/postgres-deletion";
import { createIdentityRuntime } from "@appbasis/identity/server";
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
const SECURITY_LOG_INGEST_DATABASE_URL =
  process.env.APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL?.trim() ?? "";
const SECURITY_LOG_READ_DATABASE_URL =
  process.env.APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL?.trim() ?? "";
const AUTHORITATIVE_DATABASE_URL = process.env.ULC_LINZ_PRODUCTION_DATABASE_URL?.trim() ?? "";
const RECONCILIATION_EVIDENCE_PATH =
  process.env.APPBASIS_M5_RESTORE_RECONCILIATION_EVIDENCE_PATH?.trim() ?? "";
const RESTORE_BASE_URL = "https://m5-restore-smoke.invalid";
const SECURITY_EVENT_TABLE = "ulc_linz_security_event_log";
const SECURITY_GROUPS = [
  "ulc_linz_security_event_ingest",
  "ulc_linz_security_event_cleanup",
  "ulc_linz_security_event_read",
] as const;
const ALLOWED_INGEST_COLUMNS = [
  "schema_version", "app_id", "category", "event_type", "occurred_at",
  "actor_principal_id", "organization_id", "action", "target_type", "target_id",
  "operation", "http_status", "error_code", "reason_code", "retained_until",
] as const;
const runOnRestore =
  DATABASE_URL.length > 0 &&
  SECURITY_LOG_INGEST_DATABASE_URL.length > 0 &&
  SECURITY_LOG_READ_DATABASE_URL.length > 0 &&
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
    "exercises positive auth, permissions, reconciliation, inventory, retention and security ACLs on the exact restored database",
    async () => {
      const target = new URL(DATABASE_URL);
      const ingestTarget = new URL(SECURITY_LOG_INGEST_DATABASE_URL);
      const readTarget = new URL(SECURITY_LOG_READ_DATABASE_URL);
      const source = new URL(AUTHORITATIVE_DATABASE_URL);
      const endpoint = (url: URL) =>
        `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
      const expectedDatabase = target.pathname.replace(/^\//, "");
      expect(expectedDatabase.length).toBeGreaterThan(0);
      expect(endpoint(target)).not.toBe(endpoint(source));
      expect(endpoint(ingestTarget)).toBe(endpoint(target));
      expect(endpoint(readTarget)).toBe(endpoint(target));
      expect(new Set([target.username, ingestTarget.username, readTarget.username]).size).toBe(3);
      expect(INVENTORY.schemaVersion).toBe(2);
      expect(INVENTORY.application).toBe("ulc-linz");

      const startedAt = new Date();
      const identitySecret = `restore-smoke-${randomUUID()}-${randomUUID()}`;
      const controlledIdentity = await provisionControlledRestoreIdentity({
        connectionString: DATABASE_URL,
        baseURL: RESTORE_BASE_URL,
        secret: identitySecret,
      });
      const runtime = await createGeneratedPostgresApplicationRuntime({
        connectionString: DATABASE_URL,
        securityLogConnectionString: SECURITY_LOG_INGEST_DATABASE_URL,
        baseURL: RESTORE_BASE_URL,
        secret: identitySecret,
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

        const successfulAuth = await app.request("/api/auth/sign-in", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            username: controlledIdentity.username,
            password: controlledIdentity.password,
          }),
        });
        expect(successfulAuth.status).toBe(200);
        expect(await successfulAuth.json()).toMatchObject({
          identity: {
            identityId: controlledIdentity.identityId,
            username: controlledIdentity.username,
            accountStatus: "active",
            mustChangePassword: true,
          },
          access: "password-change-required",
        });
        expect(successfulAuth.headers.get("set-cookie")).toContain("HttpOnly");

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
        const permissionAllowed = await evaluatePermission.call(runtime.permissions, {
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
      const securityReadDatabase = createPostgresDatabase(SECURITY_LOG_READ_DATABASE_URL);
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
          if (tableName === SECURITY_EVENT_TABLE) continue;
          await database.client.unsafe(`SELECT * FROM public.${tableName} LIMIT 0`);
        }
        await securityReadDatabase.client.unsafe(
          `SELECT * FROM public.${SECURITY_EVENT_TABLE} LIMIT 0`,
        );

        const eventRows = await securityReadDatabase.client.unsafe(
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
        const accessRows = await securityReadDatabase.client.unsafe(`
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
        await verifyRestoredSecurityAcl(securityReadDatabase.client);
        await verifyRestoreOperationalPrincipal(
          SECURITY_LOG_INGEST_DATABASE_URL,
          "ulc_linz_security_event_ingest",
        );
        await verifyRestoreOperationalPrincipal(
          SECURITY_LOG_READ_DATABASE_URL,
          "ulc_linz_security_event_read",
        );

        await writeFile(
          RECONCILIATION_EVIDENCE_PATH,
          `${JSON.stringify({
            schemaVersion: 1,
            application: "ulc-linz",
            authoritativeSourceBound: true,
            restoredTargetBound: true,
            requiredDeletionCount: reconciliationResult.requiredDeletionCount,
            reconciledIdentityCount: reconciliationResult.reconciledIdentityIds.length,
            positiveAuthenticationVerified: true,
            securityAclVerified: true,
            restoreReconciliationVerified: true,
          })}\n`,
          { encoding: "utf8", mode: 0o600, flag: "wx" },
        );
      } finally {
        await Promise.allSettled([
          database.client.end(),
          securityReadDatabase.client.end(),
        ]);
      }
    },
    30_000,
  );
});

async function verifyRestoredSecurityAcl(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const grantRows = await client.unsafe(`
    WITH acl_rows AS (
      SELECT 'table'::text AS object_kind, relation.relname::text AS object_name,
             NULL::text AS column_name, relation.relowner AS owner_oid,
             acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('r', relation.relowner))) acl
      WHERE namespace.nspname = 'public' AND relation.relname = 'ulc_linz_security_event_log'
      UNION ALL
      SELECT 'sequence'::text, relation.relname::text, NULL::text, relation.relowner,
             acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(relation.relacl, pg_catalog.acldefault('S', relation.relowner))) acl
      WHERE namespace.nspname = 'public' AND relation.relname = 'ulc_linz_security_event_log_id_seq'
      UNION ALL
      SELECT 'column'::text, relation.relname::text, attribute.attname::text, relation.relowner,
             acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_attribute attribute
      JOIN pg_catalog.pg_class relation ON relation.oid = attribute.attrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
      WHERE namespace.nspname = 'public' AND relation.relname = 'ulc_linz_security_event_log'
        AND attribute.attnum > 0 AND NOT attribute.attisdropped
      UNION ALL
      SELECT 'function'::text, procedure.proname::text, NULL::text, procedure.proowner,
             acl.grantee, acl.privilege_type, acl.is_grantable
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) acl
      WHERE namespace.nspname = 'public'
        AND procedure.proname = 'appbasis_ulc_linz_purge_expired_security_events'
        AND procedure.pronargs = 0
    )
    SELECT object_kind, object_name, column_name,
           CASE WHEN grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(grantee) END AS grantee,
           privilege_type, is_grantable
    FROM acl_rows
    WHERE grantee = 0 OR grantee <> owner_oid
    ORDER BY object_kind, object_name, column_name, grantee, privilege_type
  `);
  const expected = new Set<string>();
  for (const column of ALLOWED_INGEST_COLUMNS) {
    expected.add(`column:ulc_linz_security_event_log:${column}:ulc_linz_security_event_ingest:INSERT`);
  }
  expected.add("sequence:ulc_linz_security_event_log_id_seq::ulc_linz_security_event_ingest:USAGE");
  expected.add("column:ulc_linz_security_event_log:retained_until:ulc_linz_security_event_cleanup:SELECT");
  expected.add("function:appbasis_ulc_linz_purge_expired_security_events::ulc_linz_security_event_cleanup:EXECUTE");
  expected.add("table:ulc_linz_security_event_log::ulc_linz_security_event_read:SELECT");

  const actual = new Set<string>();
  for (const row of grantRows) {
    expect(row.is_grantable).toBe(false);
    actual.add(`${String(row.object_kind)}:${String(row.object_name)}:${row.column_name === null ? "" : String(row.column_name)}:${String(row.grantee)}:${String(row.privilege_type)}`);
  }
  expect(actual).toEqual(expected);

  const membershipRows = await client.unsafe(
    `SELECT parent.rolname AS group_role, member.rolname AS member_role, membership.admin_option
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid = membership.member
      WHERE parent.rolname = ANY($1::text[]) OR member.rolname = ANY($1::text[])
      ORDER BY parent.rolname, member.rolname`,
    [[...SECURITY_GROUPS]],
  );
  expect(membershipRows).toHaveLength(SECURITY_GROUPS.length);
  const seenGroups = new Set<string>();
  const seenMembers = new Set<string>();
  for (const row of membershipRows) {
    expect(SECURITY_GROUPS).toContain(String(row.group_role));
    expect(SECURITY_GROUPS).not.toContain(String(row.member_role));
    expect(row.admin_option).toBe(false);
    seenGroups.add(String(row.group_role));
    seenMembers.add(String(row.member_role));
  }
  expect(seenGroups).toEqual(new Set(SECURITY_GROUPS));
  expect(seenMembers.size).toBe(SECURITY_GROUPS.length);
}

async function verifyRestoreOperationalPrincipal(
  connectionString: string,
  expectedGroup: (typeof SECURITY_GROUPS)[number],
) {
  const connection = createPostgresDatabase(connectionString);
  try {
    const rows = await connection.client.unsafe(
      `SELECT role.rolsuper AS superuser,
              role.rolcreatedb AS create_db,
              role.rolcreaterole AS create_role,
              role.rolreplication AS replication,
              role.rolbypassrls AS bypass_rls,
              pg_catalog.pg_has_role(current_user, $1::name, 'MEMBER') AS expected_member,
              (SELECT count(*)::int
                 FROM pg_catalog.pg_auth_members membership
                WHERE membership.member = role.oid) AS membership_count,
              EXISTS (
                SELECT 1
                  FROM pg_catalog.pg_auth_members membership
                 WHERE membership.member = role.oid
                   AND membership.roleid = to_regrole($1)
                   AND membership.admin_option
              ) AS admin_option
         FROM pg_catalog.pg_roles role
        WHERE role.rolname = current_user`,
      [expectedGroup],
    );
    expect(rows).toEqual([
      {
        superuser: false,
        create_db: false,
        create_role: false,
        replication: false,
        bypass_rls: false,
        expected_member: true,
        membership_count: 1,
        admin_option: false,
      },
    ]);
  } finally {
    await connection.client.end();
  }
}

async function provisionControlledRestoreIdentity(input: {
  connectionString: string;
  baseURL: string;
  secret: string;
}): Promise<{ identityId: string; username: string; password: string }> {
  const connection = createPostgresDatabase(input.connectionString);
  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: input.baseURL,
      secret: input.secret,
    });
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const adminUsername = `m5.restore.admin.${suffix}`;
    const adminPassword = `M5!Admin-${randomUUID()}Aa7`;
    const username = `m5.restore.user.${suffix}`;
    const password = `M5!User-${randomUUID()}Aa7`;

    await auth.api.createUser({
      body: {
        email: `${adminUsername}@identity.invalid`,
        password: adminPassword,
        name: "M5 Restore Controlled Admin",
        role: "admin",
        data: { username: adminUsername, displayUsername: adminUsername },
      },
    });
    const administrativeSessionToken = await signInSessionCookie(
      auth,
      input.baseURL,
      adminUsername,
      adminPassword,
    );
    const identityRuntime = createIdentityRuntime({
      auth,
      sql: connection.client,
      baseURL: input.baseURL,
      administrativeSessionToken,
    });
    const identity = await identityRuntime.service.createInitialUser({
      username,
      temporaryPassword: password,
      displayName: "M5 Restore Authentication Probe",
      contactEmail: `${username}@identity.invalid`,
    });
    return { identityId: identity.identityId, username, password };
  } finally {
    await connection.client.end();
  }
}

async function signInSessionCookie(
  auth: ReturnType<typeof createBetterAuthRuntime>,
  baseURL: string,
  username: string,
  password: string,
): Promise<string> {
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );
  if (!response.ok) throw new Error("Controlled restore administrator sign-in failed.");
  const cookie = response.headers.get("set-cookie");
  if (cookie === null) throw new Error("Controlled restore administrator returned no session cookie.");
  return cookie.split(";", 1)[0] ?? cookie;
}

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