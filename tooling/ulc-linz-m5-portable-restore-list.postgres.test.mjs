import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { createPortableRestoreList } from "./ulc-linz-m5-portable-restore-list.mjs";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;
const postgresImage = "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";

if (!databaseUrl) {
  test("M5 portable restore PostgreSQL regression requires DATABASE_URL", { skip: true }, () => {});
} else {
  test("provider default ACLs are excluded while application object ACLs survive the portable restore", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const sourceDatabaseName = `m5_portable_source_${suffix}`;
    const failedRestoreDatabaseName = `m5_portable_failed_${suffix}`;
    const restoredDatabaseName = `m5_portable_restored_${suffix}`;
    const readerRole = `m5_portable_reader_${suffix}`;
    const restoreOwnerRole = `m5_portable_owner_${suffix}`;
    const restorePassword = `M5_${suffix}_restore_p9`;
    const work = await mkdtemp(join(tmpdir(), "appbasis-m5-portable-"));
    const admin = createPostgresDatabase(databaseUrl);

    try {
      await cleanup(admin, {
        sourceDatabaseName,
        failedRestoreDatabaseName,
        restoredDatabaseName,
        readerRole,
        restoreOwnerRole,
      });
      await admin.client.unsafe("DROP ROLE IF EXISTS cloud_admin");
      await admin.client.unsafe("DROP ROLE IF EXISTS neon_superuser");
      await admin.client.unsafe("CREATE ROLE cloud_admin NOLOGIN");
      await admin.client.unsafe("CREATE ROLE neon_superuser NOLOGIN");
      await admin.client.unsafe(`CREATE ROLE ${readerRole} NOLOGIN`);
      await admin.client.unsafe(`CREATE ROLE ${restoreOwnerRole} LOGIN PASSWORD '${restorePassword}' NOINHERIT`);
      await admin.client.unsafe(`CREATE DATABASE ${sourceDatabaseName}`);
      await admin.client.unsafe(`CREATE DATABASE ${failedRestoreDatabaseName} OWNER ${restoreOwnerRole}`);
      await admin.client.unsafe(`CREATE DATABASE ${restoredDatabaseName} OWNER ${restoreOwnerRole}`);

      const sourceUrl = databaseUrlFor(databaseUrl, sourceDatabaseName);
      const source = createPostgresDatabase(sourceUrl);
      try {
        await source.client.unsafe(
          "ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION",
        );
        await source.client.unsafe(
          "ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION",
        );
        await source.client.unsafe("CREATE TABLE public.evidence_table (id integer PRIMARY KEY)");
        await source.client.unsafe("INSERT INTO public.evidence_table (id) VALUES (1)");
        await source.client.unsafe(`GRANT SELECT ON TABLE public.evidence_table TO ${readerRole}`);

        await source.client.begin(async (sql) => {
          await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
          const snapshotRows = await sql.unsafe("SELECT pg_catalog.pg_export_snapshot() AS snapshot_id");
          assert.equal(snapshotRows.length, 1);
          const snapshotId = snapshotRows[0]?.snapshot_id;
          assert.match(snapshotId, /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[1-9][0-9]*$/);

          await runPostgresContainer(work, [
            "pg_dump",
            "--format=custom",
            "--no-owner",
            `--snapshot=${snapshotId}`,
            `--dbname=${sourceUrl}`,
            "--file=/evidence/production.pgdump",
          ]);
          const { stdout: tocText } = await runPostgresContainer(work, [
            "pg_restore",
            "--list",
            "/evidence/production.pgdump",
          ]);
          assert.match(tocText, /DEFAULT ACL public DEFAULT PRIVILEGES FOR TABLES cloud_admin/);
          assert.match(tocText, /DEFAULT ACL public DEFAULT PRIVILEGES FOR SEQUENCES cloud_admin/);

          const filteredToc = await createPortableRestoreList({
            databaseUrl: sourceUrl,
            snapshotId,
            tocText,
          });
          assert.doesNotMatch(filteredToc, /DEFAULT ACL/);
          assert.match(filteredToc, /ACL public TABLE evidence_table/);
          await writeFile(join(work, "production.restore.filtered.list"), filteredToc, {
            encoding: "utf8",
            mode: 0o600,
            flag: "wx",
          });

          const failedRestoreUrl = databaseUrlFor(databaseUrl, failedRestoreDatabaseName, restoreOwnerRole, restorePassword);
          await assert.rejects(
            () => runPostgresContainer(work, [
              "pg_restore",
              "--single-transaction",
              "--no-owner",
              "--exit-on-error",
              `--dbname=${failedRestoreUrl}`,
              "/evidence/production.pgdump",
            ]),
            (error) => {
              assert.match(`${error?.stderr ?? ""}`, /default privileges|cloud_admin/i);
              return true;
            },
          );

          const restoredUrl = databaseUrlFor(databaseUrl, restoredDatabaseName, restoreOwnerRole, restorePassword);
          await runPostgresContainer(work, [
            "pg_restore",
            "--single-transaction",
            "--no-owner",
            "--exit-on-error",
            "--use-list=/evidence/production.restore.filtered.list",
            `--dbname=${restoredUrl}`,
            "/evidence/production.pgdump",
          ]);
        });
      } finally {
        await source.client.end().catch(() => {});
      }

      const restored = createPostgresDatabase(databaseUrlFor(databaseUrl, restoredDatabaseName));
      try {
        const [result] = await restored.client.unsafe(`
          SELECT
            (SELECT count(*)::int FROM public.evidence_table) AS row_count,
            pg_catalog.has_table_privilege('${readerRole}', 'public.evidence_table', 'SELECT') AS reader_select,
            (SELECT count(*)::int FROM pg_catalog.pg_default_acl) AS default_acl_count
        `);
        assert.deepEqual(result, {
          row_count: 1,
          reader_select: true,
          default_acl_count: 0,
        });
      } finally {
        await restored.client.end().catch(() => {});
      }
    } finally {
      await cleanup(admin, {
        sourceDatabaseName,
        failedRestoreDatabaseName,
        restoredDatabaseName,
        readerRole,
        restoreOwnerRole,
      });
      await admin.client.unsafe("DROP ROLE IF EXISTS cloud_admin").catch(() => {});
      await admin.client.unsafe("DROP ROLE IF EXISTS neon_superuser").catch(() => {});
      await admin.client.end().catch(() => {});
      await rm(work, { recursive: true, force: true });
    }
  });
}

async function runPostgresContainer(work, command) {
  return execFileAsync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "host",
      "--volume",
      `${work}:/evidence`,
      postgresImage,
      ...command,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
}

function databaseUrlFor(baseUrl, databaseName, username, password) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  if (username) url.username = username;
  if (password) url.password = password;
  return url.toString();
}

async function cleanup(admin, {
  sourceDatabaseName,
  failedRestoreDatabaseName,
  restoredDatabaseName,
  readerRole,
  restoreOwnerRole,
}) {
  for (const databaseName of [sourceDatabaseName, failedRestoreDatabaseName, restoredDatabaseName]) {
    await admin.client.unsafe(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`).catch(() => {});
  }
  await admin.client.unsafe(`DROP ROLE IF EXISTS ${readerRole}`).catch(() => {});
  await admin.client.unsafe(`DROP ROLE IF EXISTS ${restoreOwnerRole}`).catch(() => {});
}
