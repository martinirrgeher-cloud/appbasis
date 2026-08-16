import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";

const EXPECTED_DATABASE_NAME = "appbasis_m3_preview";
const REQUIRED_SCHEMA_QUERY = `
SELECT
  to_regclass('public."user"') IS NOT NULL AS identity_user,
  to_regclass('public.account') IS NOT NULL AS identity_account,
  to_regclass('public.session') IS NOT NULL AS identity_session,
  to_regclass('public.verification') IS NOT NULL AS identity_verification,
  to_regclass('public.appbasis_person') IS NOT NULL AS identity_person,
  to_regclass('public.appbasis_identity_security_state') IS NOT NULL AS identity_security_state,
  to_regclass('public.appbasis_identity_operation') IS NOT NULL AS identity_operation,
  to_regclass('public.appbasis_permission_capability') IS NOT NULL AS permission_capability,
  to_regclass('public.appbasis_permission_role') IS NOT NULL AS permission_role,
  to_regclass('public.appbasis_permission_role_capability') IS NOT NULL AS permission_role_capability,
  to_regclass('public.appbasis_permission_principal') IS NOT NULL AS permission_principal,
  to_regclass('public.appbasis_permission_principal_role') IS NOT NULL AS permission_principal_role,
  to_regclass('public.appbasis_permission_principal_grant') IS NOT NULL AS permission_principal_grant,
  to_regclass('public.appbasis_permission_principal_revoke') IS NOT NULL AS permission_principal_revoke,
  to_regclass('public.appbasis_permission_administration_audit') IS NOT NULL AS permission_audit,
  to_regclass('public.appbasis_task') IS NOT NULL AS task,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appbasis_permission_role'
      AND column_name = 'display_name'
  ) AS permission_role_display_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appbasis_permission_role'
      AND column_name = 'description'
  ) AS permission_role_description,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appbasis_permission_role'
      AND column_name = 'state'
  ) AS permission_role_state,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appbasis_permission_role'
      AND column_name = 'kind'
  ) AS permission_role_kind
`;

export async function verifyM3PreviewSchema({
  connectionString,
  createDatabase = createPostgresDatabase,
} = {}) {
  const normalizedConnectionString = requiredPreviewDatabaseUrl(connectionString);
  if (typeof createDatabase !== "function") {
    throw new Error("createDatabase must be a function.");
  }

  const database = createDatabase(normalizedConnectionString);
  try {
    const rows = await database.client.unsafe(REQUIRED_SCHEMA_QUERY);
    if (!Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
      throw new Error("m3-preview schema verification returned an invalid result.");
    }
    const missing = Object.entries(rows[0])
      .filter(([, value]) => value !== true)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(
        `m3-preview database schema is incomplete: ${missing.join(", ")}.`,
      );
    }
    return Object.freeze({ status: "schema-ready", appId: "m3-preview" });
  } finally {
    await database.client.end();
  }
}

function requiredPreviewDatabaseUrl(value) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    throw new Error("APPBASIS_DATABASE_URL must be a canonical PostgreSQL URL.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("APPBASIS_DATABASE_URL must be a canonical PostgreSQL URL.");
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname.length === 0 ||
    url.pathname !== `/${EXPECTED_DATABASE_NAME}` ||
    url.hash.length > 0
  ) {
    throw new Error("APPBASIS_DATABASE_URL must select the dedicated m3-preview database.");
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function main() {
  await verifyM3PreviewSchema({
    connectionString: process.env.APPBASIS_DATABASE_URL,
  });
  console.log("m3-preview database schema verification passed.");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "m3-preview database schema verification failed.",
    );
    process.exitCode = 1;
  });
}
