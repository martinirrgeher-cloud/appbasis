import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const SNAPSHOT_ID = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[1-9][0-9]*$/;
const EXPECTED_PROVIDER_DEFAULT_ACLS = [
  {
    ownerRole: "cloud_admin",
    schemaName: "public",
    objectType: "S",
    acl: "neon_superuser=r*w*U*/cloud_admin",
    tocKind: "SEQUENCES",
  },
  {
    ownerRole: "cloud_admin",
    schemaName: "public",
    objectType: "r",
    acl: "neon_superuser=a*r*w*d*D*x*t*m*/cloud_admin",
    tocKind: "TABLES",
  },
];

export async function createPortableRestoreList(
  { databaseUrl, snapshotId, tocText },
  { databaseFactory = createPostgresDatabase } = {},
) {
  if (typeof tocText !== "string" || tocText.trim() === "") {
    throw new Error("ULC M5 restore TOC is required.");
  }
  const safeSnapshotId = requiredSnapshotId(snapshotId);
  const database = databaseFactory(requiredText(databaseUrl, "production backup database URL"));
  try {
    return await database.client.begin(async (sql) => {
      await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await sql.unsafe(`SET TRANSACTION SNAPSHOT '${safeSnapshotId}'`);
      const rows = await sql.unsafe(`
        SELECT
          owner_role.rolname AS owner_role,
          namespace.nspname AS schema_name,
          default_acl.defaclobjtype AS object_type,
          pg_catalog.array_to_string(default_acl.defaclacl, ',') AS acl
        FROM pg_catalog.pg_default_acl default_acl
        JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = default_acl.defaclrole
        LEFT JOIN pg_catalog.pg_namespace namespace ON namespace.oid = default_acl.defaclnamespace
        ORDER BY owner_role.rolname, namespace.nspname NULLS FIRST, default_acl.defaclobjtype
      `);
      assertExactProviderDefaultAclInventory(rows);
      return filterExactProviderDefaultAclToc(tocText);
    });
  } finally {
    await database.client.end().catch(() => {});
  }
}

export function assertExactProviderDefaultAclInventory(rows) {
  if (!Array.isArray(rows) || rows.length !== EXPECTED_PROVIDER_DEFAULT_ACLS.length) {
    throw new Error("ULC M5 production default ACL inventory is unexpected.");
  }
  const normalized = [...rows]
    .map((row) => ({
      ownerRole: row?.owner_role,
      schemaName: row?.schema_name,
      objectType: row?.object_type,
      acl: row?.acl,
    }))
    .sort(compareDefaultAcl);
  const expected = [...EXPECTED_PROVIDER_DEFAULT_ACLS]
    .map(({ tocKind: _tocKind, ...row }) => row)
    .sort(compareDefaultAcl);
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    throw new Error("ULC M5 production default ACL inventory is unexpected.");
  }
}

export function filterExactProviderDefaultAclToc(tocText) {
  const lines = tocText.split("\n");
  const observed = [];
  const filtered = [];
  for (const line of lines) {
    if (!line.includes(" DEFAULT ACL ")) {
      filtered.push(line);
      continue;
    }
    const match = /^\d+;\s+\d+\s+\d+\s+DEFAULT ACL public DEFAULT PRIVILEGES FOR (SEQUENCES|TABLES) cloud_admin$/.exec(line);
    if (!match) {
      throw new Error("ULC M5 restore TOC contains an unexpected default ACL entry.");
    }
    observed.push(match[1]);
  }
  const expectedKinds = EXPECTED_PROVIDER_DEFAULT_ACLS.map((entry) => entry.tocKind).sort(compareText);
  if (JSON.stringify(observed.sort(compareText)) !== JSON.stringify(expectedKinds)) {
    throw new Error("ULC M5 restore TOC does not contain the exact provider default ACL entries.");
  }
  return filtered.join("\n");
}

function compareDefaultAcl(left, right) {
  const leftKey = `${left.ownerRole}\u0000${left.schemaName ?? ""}\u0000${left.objectType}\u0000${left.acl}`;
  const rightKey = `${right.ownerRole}\u0000${right.schemaName ?? ""}\u0000${right.objectType}\u0000${right.acl}`;
  return compareText(leftKey, rightKey);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredSnapshotId(value) {
  if (typeof value !== "string" || !SNAPSHOT_ID.test(value)) {
    throw new Error("ULC M5 exported snapshot ID is invalid.");
  }
  return value;
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`ULC M5 ${label} is required.`);
  }
  return value.trim();
}

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error("Usage: node ulc-linz-m5-portable-restore-list.mjs <input-list> <output-list>");
  }
  const tocText = await readFile(inputPath, "utf8");
  const filtered = await createPortableRestoreList({
    databaseUrl: process.env.ULC_LINZ_PRODUCTION_BACKUP_DATABASE_URL,
    snapshotId: process.env.DATABASE_SNAPSHOT,
    tocText,
  });
  await writeFile(outputPath, filtered, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  });
}
