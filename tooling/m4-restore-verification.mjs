import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { verifyM3PreviewSchema } from "../apps/m3-preview/tooling/verify-preview-schema.mjs";

const EXPECTED_DATABASE_NAME = "appbasis_m3_preview";
const CANONICAL_SESSION_QUERIES = Object.freeze([
  "SET TIME ZONE 'UTC'",
  "SET DateStyle TO 'ISO, YMD'",
]);
const FINGERPRINT_TABLES = Object.freeze([
  ["identity_users", 'public."user"', "t.id"],
  ["identity_accounts", "public.account", "t.id"],
  ["identity_sessions", "public.session", "t.id"],
  ["identity_verifications", "public.verification", "t.id"],
  ["identity_persons", "public.appbasis_person", "t.id"],
  ["identity_security_state", "public.appbasis_identity_security_state", "t.identity_id"],
  ["identity_operations", "public.appbasis_identity_operation", "t.operation_id"],
  ["permission_capabilities", "public.appbasis_permission_capability", "t.capability_id"],
  ["permission_roles", "public.appbasis_permission_role", "t.role_id"],
  ["permission_role_capabilities", "public.appbasis_permission_role_capability", "t.role_id, t.capability_id"],
  ["permission_principals", "public.appbasis_permission_principal", "t.principal_id"],
  ["permission_principal_roles", "public.appbasis_permission_principal_role", "t.principal_id, t.role_id"],
  ["permission_principal_grants", "public.appbasis_permission_principal_grant", "t.principal_id, t.capability_id"],
  ["permission_principal_revokes", "public.appbasis_permission_principal_revoke", "t.principal_id, t.capability_id"],
  ["permission_audit", "public.appbasis_permission_administration_audit", "t.event_id"],
  ["tasks", "public.appbasis_task", "t.id"],
]);
const FINGERPRINT_FIELDS = Object.freeze(
  FINGERPRINT_TABLES.flatMap(([key]) => [`${key}_count`, `${key}_digest`]),
);
const RESTORE_FINGERPRINT_QUERY = `
SELECT
${FINGERPRINT_TABLES.flatMap(([key, table, order]) => [
  `  (SELECT COUNT(*)::text FROM ${table}) AS ${key}_count`,
  `  (SELECT md5(COALESCE(string_agg(md5(row_to_json(t)::text), '' ORDER BY ${order}), '')) FROM ${table} AS t) AS ${key}_digest`,
]).join(",\n")}
`;

export async function inspectM4RestoreFingerprint({
  connectionString,
  createDatabase = createPostgresDatabase,
  verifySchema = verifyM3PreviewSchema,
} = {}) {
  requiredM3PreviewDatabaseUrl(connectionString, "M4 database URL");
  if (typeof createDatabase !== "function") {
    throw new Error("createDatabase must be a function.");
  }
  if (typeof verifySchema !== "function") {
    throw new Error("verifySchema must be a function.");
  }

  try {
    await verifySchema({ connectionString, createDatabase });
  } catch {
    throw new Error("M4 database schema verification failed.");
  }

  let database;
  try {
    database = createDatabase(connectionString);
    for (const query of CANONICAL_SESSION_QUERIES) {
      await database.client.unsafe(query);
    }
    const rows = await database.client.unsafe(RESTORE_FINGERPRINT_QUERY);
    if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
      throw new Error("invalid fingerprint response");
    }
    return normalizeFingerprint(rows[0], "M4 database fingerprint");
  } catch {
    throw new Error("M4 database fingerprint read failed.");
  } finally {
    if (database?.client && typeof database.client.end === "function") {
      try {
        await database.client.end();
      } catch {
        // Do not replace a sanitized verification result with cleanup details.
      }
    }
  }
}

export async function verifyM4RestoredDatabase({
  restoreConnectionString,
  expectedFingerprint,
  createDatabase = createPostgresDatabase,
  verifySchema = verifyM3PreviewSchema,
} = {}) {
  const expected = normalizeFingerprint(
    expectedFingerprint,
    "APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT",
  );
  const actual = await inspectM4RestoreFingerprint({
    connectionString: restoreConnectionString,
    createDatabase,
    verifySchema,
  });
  const mismatches = FINGERPRINT_FIELDS.filter(
    (field) => expected[field] !== actual[field],
  );
  if (mismatches.length > 0) {
    throw new Error(
      `M4 restore fingerprint mismatch: ${mismatches.join(", ")}.`,
    );
  }
  return Object.freeze({ status: "restore-fingerprint-match", appId: "m3-preview" });
}

export function parseM4RestoreFingerprint(value) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT is invalid.");
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT is invalid.");
  }
  return normalizeFingerprint(
    parsed,
    "APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT",
  );
}

function normalizeFingerprint(value, name) {
  if (!isRecord(value)) {
    throw new Error(`${name} is invalid.`);
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [...FINGERPRINT_FIELDS].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${name} is invalid.`);
  }

  const normalized = {};
  for (const field of FINGERPRINT_FIELDS) {
    const fieldValue = value[field];
    if (field.endsWith("_count")) {
      if (typeof fieldValue !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(fieldValue)) {
        throw new Error(`${name} is invalid.`);
      }
    } else if (
      typeof fieldValue !== "string" ||
      !/^[0-9a-f]{32}$/.test(fieldValue)
    ) {
      throw new Error(`${name} is invalid.`);
    }
    normalized[field] = fieldValue;
  }
  return Object.freeze(normalized);
}

function requiredM3PreviewDatabaseUrl(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${name} must be a canonical PostgreSQL URL.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a canonical PostgreSQL URL.`);
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.pathname !== `/${EXPECTED_DATABASE_NAME}` ||
    url.hash.length > 0
  ) {
    throw new Error(`${name} must select the dedicated m3-preview database.`);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] === "fingerprint") {
      const fingerprint = await inspectM4RestoreFingerprint({
        connectionString: process.env.APPBASIS_M4_SOURCE_DATABASE_URL,
      });
      process.stdout.write(`${JSON.stringify(fingerprint)}\n`);
    } else if (process.argv[2] === "verify") {
      const result = await verifyM4RestoredDatabase({
        restoreConnectionString: process.env.APPBASIS_M4_RESTORE_DATABASE_URL,
        expectedFingerprint: parseM4RestoreFingerprint(
          process.env.APPBASIS_M4_EXPECTED_RESTORE_FINGERPRINT,
        ),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      throw new Error("Expected command mode fingerprint or verify.");
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "M4 restore verification failed.",
    );
    process.exitCode = 1;
  }
}
