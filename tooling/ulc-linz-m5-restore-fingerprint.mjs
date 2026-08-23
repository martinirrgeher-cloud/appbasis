import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;

export function fingerprintUlcLinzRestoreInventory(inventory) {
  const canonical = canonicalInventory(inventory);
  const schemaPayload = JSON.stringify({
    tables: canonical.tables,
    columns: canonical.columns,
    constraints: canonical.constraints,
    indexes: canonical.indexes,
  });
  const countPayload = JSON.stringify(canonical.rowCounts);
  return Object.freeze({
    tableCount: canonical.tables.length,
    schemaFingerprint: `sha256:${createHash("sha256").update(schemaPayload).digest("hex")}`,
    rowCountFingerprint: `sha256:${createHash("sha256").update(countPayload).digest("hex")}`,
  });
}

export async function readUlcLinzRestoreFingerprint(databaseUrl) {
  if (typeof databaseUrl !== "string" || databaseUrl.length < 1) {
    throw new Error("ULC restore fingerprint database URL is required.");
  }
  const database = createPostgresDatabase(databaseUrl);
  try {
    const tables = await database.client.unsafe(`
      SELECT c.relname AS table_name
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `);
    const names = tables.map((row) => requiredTableName(row.table_name));
    const columns = await database.client.unsafe(`
      SELECT table_name, column_name, data_type, is_nullable,
             COALESCE(column_default, '') AS column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    const constraints = await database.client.unsafe(`
      SELECT c.relname AS table_name, con.conname AS constraint_name,
             con.contype AS constraint_type
      FROM pg_catalog.pg_constraint AS con
      JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
      ORDER BY c.relname, con.conname
    `);
    const indexes = await database.client.unsafe(`
      SELECT tablename AS table_name, indexname AS index_name, indexdef AS index_definition
      FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    const rowCounts = [];
    for (const tableName of names) {
      const rows = await database.client.unsafe(`SELECT count(*)::bigint AS row_count FROM public.${tableName}`);
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0]?.row_count !== "string") {
        throw new Error("ULC restore row-count inventory is invalid.");
      }
      rowCounts.push({ tableName, rowCount: rows[0].row_count });
    }
    return fingerprintUlcLinzRestoreInventory({
      tables: names,
      columns: columns.map((row) => ({
        tableName: requiredTableName(row.table_name),
        columnName: requiredIdentifier(row.column_name),
        dataType: requiredText(row.data_type),
        nullable: row.is_nullable === "YES",
        defaultExpression: requiredText(row.column_default),
      })),
      constraints: constraints.map((row) => ({
        tableName: requiredTableName(row.table_name),
        constraintName: requiredIdentifier(row.constraint_name),
        constraintType: requiredText(row.constraint_type),
      })),
      indexes: indexes.map((row) => ({
        tableName: requiredTableName(row.table_name),
        indexName: requiredIdentifier(row.index_name),
        indexDefinition: requiredText(row.index_definition),
      })),
      rowCounts,
    });
  } finally {
    await database.client.end().catch(() => {});
  }
}

function canonicalInventory(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ULC restore inventory is invalid.");
  }
  const tables = [...value.tables].map(requiredTableName).sort();
  if (new Set(tables).size !== tables.length) throw new Error("ULC restore inventory contains duplicate tables.");
  const columns = [...value.columns].map((entry) => ({
    tableName: requiredTableName(entry.tableName),
    columnName: requiredIdentifier(entry.columnName),
    dataType: requiredText(entry.dataType),
    nullable: requiredBoolean(entry.nullable),
    defaultExpression: requiredText(entry.defaultExpression),
  })).sort(compareObjects);
  const constraints = [...value.constraints].map((entry) => ({
    tableName: requiredTableName(entry.tableName),
    constraintName: requiredIdentifier(entry.constraintName),
    constraintType: requiredText(entry.constraintType),
  })).sort(compareObjects);
  const indexes = [...value.indexes].map((entry) => ({
    tableName: requiredTableName(entry.tableName),
    indexName: requiredIdentifier(entry.indexName),
    indexDefinition: requiredText(entry.indexDefinition),
  })).sort(compareObjects);
  const rowCounts = [...value.rowCounts].map((entry) => ({
    tableName: requiredTableName(entry.tableName),
    rowCount: requiredCount(entry.rowCount),
  })).sort(compareObjects);
  if (rowCounts.length !== tables.length || rowCounts.some((entry, index) => entry.tableName !== tables[index])) {
    throw new Error("ULC restore row-count inventory does not cover every table exactly once.");
  }
  return { tables, columns, constraints, indexes, rowCounts };
}

function compareObjects(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function requiredTableName(value) {
  if (typeof value !== "string" || !TABLE_NAME.test(value)) throw new Error("ULC restore table name is invalid.");
  return value;
}

function requiredIdentifier(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("ULC restore schema identifier is invalid.");
  }
  return value;
}

function requiredText(value) {
  if (typeof value !== "string" || value.length > 4096 || /[\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new Error("ULC restore schema text is invalid.");
  }
  return value;
}

function requiredBoolean(value) {
  if (typeof value !== "boolean") throw new Error("ULC restore schema boolean is invalid.");
  return value;
}

function requiredCount(value) {
  const text = typeof value === "bigint" ? value.toString() : String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new Error("ULC restore row count is invalid.");
  return text;
}

async function main() {
  const result = await readUlcLinzRestoreFingerprint(process.env.DATABASE_URL);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "ULC restore fingerprint failed.");
    process.exitCode = 1;
  });
}
