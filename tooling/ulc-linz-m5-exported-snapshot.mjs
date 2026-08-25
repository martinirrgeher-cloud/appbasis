import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const SNAPSHOT_ID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[1-9][0-9]*$/;
const MAX_WAIT_MS = 5 * 60 * 1000;
const POLL_MS = 100;

export async function holdUlcLinzM5ExportedSnapshot(
  {
    databaseUrl,
    snapshotPath,
    releasePath,
  },
  {
    databaseFactory = createPostgresDatabase,
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
    fileAccess = access,
    fileWrite = writeFile,
  } = {},
) {
  const safeDatabaseUrl = requiredText(databaseUrl, "ULC M5 backup database URL");
  const safeSnapshotPath = requiredText(snapshotPath, "ULC M5 snapshot path");
  const safeReleasePath = requiredText(releasePath, "ULC M5 snapshot release path");
  if (safeSnapshotPath === safeReleasePath) {
    throw new Error("ULC M5 snapshot and release paths must differ.");
  }
  if (typeof databaseFactory !== "function" || typeof now !== "function" || typeof sleep !== "function") {
    throw new Error("ULC M5 snapshot dependencies are invalid.");
  }

  const database = databaseFactory(safeDatabaseUrl);
  try {
    return await database.client.begin(async (sql) => {
      await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await assertBackupPrincipalLeastPrivilege(sql);
      const rows = await sql.unsafe("SELECT pg_export_snapshot() AS snapshot_id");
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new Error("ULC M5 exported snapshot response is invalid.");
      }
      const snapshotId = requiredSnapshotId(rows[0]?.snapshot_id);
      await fileWrite(safeSnapshotPath, `${snapshotId}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });

      const startedAt = now();
      if (!Number.isFinite(startedAt)) {
        throw new Error("ULC M5 snapshot clock is invalid.");
      }
      for (;;) {
        try {
          await fileAccess(safeReleasePath);
          return snapshotId;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
        const current = now();
        if (!Number.isFinite(current) || current - startedAt >= MAX_WAIT_MS) {
          throw new Error("ULC M5 exported snapshot release timed out.");
        }
        await sleep(POLL_MS);
      }
    });
  } finally {
    await database.client.end().catch(() => {});
  }
}

async function assertBackupPrincipalLeastPrivilege(sql) {
  const rows = await sql.unsafe(`
    WITH current_role AS (
      SELECT oid, rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      FROM pg_catalog.pg_roles
      WHERE rolname = current_user
    ), public_relations AS (
      SELECT c.oid, c.relkind
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
    ), public_functions AS (
      SELECT p.oid
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    )
    SELECT
      role.rolname AS role_name,
      role.rolsuper,
      role.rolcreatedb,
      role.rolcreaterole,
      role.rolreplication,
      role.rolbypassrls,
      (SELECT count(*)::int
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = role.oid) AS membership_count,
      (SELECT count(*)::int
       FROM pg_catalog.pg_auth_members AS membership
       WHERE membership.member = role.oid AND membership.admin_option) AS admin_membership_count,
      (SELECT count(*)::int
       FROM public_relations AS relation
       WHERE pg_catalog.pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid = relation.oid)) = role.rolname) AS owned_relation_count,
      (SELECT count(*)::int
       FROM public_functions AS function
       WHERE pg_catalog.pg_get_userbyid((SELECT proowner FROM pg_catalog.pg_proc WHERE oid = function.oid)) = role.rolname) AS owned_function_count,
      (SELECT count(*)::int
       FROM public_relations AS relation
       WHERE relation.relkind IN ('r', 'p')
         AND NOT pg_catalog.has_table_privilege(role.rolname, relation.oid, 'SELECT')) AS unreadable_table_count,
      (SELECT count(*)::int
       FROM public_relations AS relation
       WHERE relation.relkind IN ('r', 'p')
         AND (
           pg_catalog.has_table_privilege(role.rolname, relation.oid, 'INSERT') OR
           pg_catalog.has_table_privilege(role.rolname, relation.oid, 'UPDATE') OR
           pg_catalog.has_table_privilege(role.rolname, relation.oid, 'DELETE') OR
           pg_catalog.has_table_privilege(role.rolname, relation.oid, 'TRUNCATE') OR
           pg_catalog.has_table_privilege(role.rolname, relation.oid, 'TRIGGER') OR
           pg_catalog.has_table_privilege(role.rolname, relation.oid, 'REFERENCES')
         )) AS writable_table_count,
      (SELECT count(*)::int
       FROM public_relations AS relation
       WHERE relation.relkind = 'S'
         AND (
           pg_catalog.has_sequence_privilege(role.rolname, relation.oid, 'USAGE') OR
           pg_catalog.has_sequence_privilege(role.rolname, relation.oid, 'UPDATE')
         )) AS writable_sequence_count,
      (SELECT count(*)::int
       FROM public_functions AS function
       WHERE pg_catalog.has_function_privilege(role.rolname, function.oid, 'EXECUTE')) AS executable_function_count
    FROM current_role AS role
  `);
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("ULC M5 backup principal inventory is invalid.");
  }
  const role = rows[0];
  if (
    typeof role?.role_name !== "string" || role.role_name.length === 0 ||
    role.rolsuper !== false ||
    role.rolcreatedb !== false ||
    role.rolcreaterole !== false ||
    role.rolreplication !== false ||
    role.rolbypassrls !== false ||
    role.membership_count !== 0 ||
    role.admin_membership_count !== 0 ||
    role.owned_relation_count !== 0 ||
    role.owned_function_count !== 0 ||
    role.unreadable_table_count !== 0 ||
    role.writable_table_count !== 0 ||
    role.writable_sequence_count !== 0 ||
    role.executable_function_count !== 0
  ) {
    throw new Error("ULC M5 backup principal is not least-privileged read-only.");
  }
}

function requiredSnapshotId(value) {
  if (typeof value !== "string" || !SNAPSHOT_ID.test(value)) {
    throw new Error("ULC M5 exported snapshot ID is invalid.");
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || value !== value.trim()) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

async function main() {
  await holdUlcLinzM5ExportedSnapshot({
    databaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
    snapshotPath: process.env.APPBASIS_M5_SNAPSHOT_PATH,
    releasePath: process.env.APPBASIS_M5_SNAPSHOT_RELEASE_PATH,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC M5 exported snapshot failed.");
    process.exitCode = 1;
  });
}
