import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  assertUlcLinzM5NeonBranchIsolationAttestation,
  verifyUlcLinzM5NeonBranchIsolation,
} from "./ulc-linz-m5-neon-branch-isolation.mjs";
import { parseUlcLinzProductionDatabaseUrl } from "./ulc-linz-m6-production-hyperdrive.mjs";

const STRONG_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const SAFE_CHANNEL_BINDING_MODES = new Set(["disable", "prefer", "require"]);
const SOURCE_ROLE = "ulc_linz_application";
const CONNECTION_IDENTITY_QUERY = "SELECT current_database() AS current_database, current_user AS current_user";
const EMPTY_TARGET_QUERY = `
SELECT
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_namespace AS n
    WHERE n.nspname = 'public'
  ) AS public_schema_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_namespace AS n
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
      AND n.nspname !~ '^pg_toast(?:_|$)'
      AND n.nspname !~ '^pg_temp_'
  ) AS extra_schema_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  ) AS public_relation_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) AS public_routine_count,
  (
    SELECT COUNT(*)::int
    FROM pg_catalog.pg_type AS t
    JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
  ) AS public_type_count
`;

const RESET_PUBLIC_SCHEMA_STATEMENTS = Object.freeze([
  "DROP SCHEMA IF EXISTS public CASCADE",
  "CREATE SCHEMA public",
  "REVOKE CREATE ON SCHEMA public FROM PUBLIC",
  "GRANT USAGE ON SCHEMA public TO PUBLIC",
]);

export async function verifyUlcLinzM5IsolatedRestoreTargetEmpty({
  sourceUrl,
  restoreUrl,
  createDatabase = createPostgresDatabase,
} = {}) {
  const restore = validateTargetBoundary({ sourceUrl, restoreUrl, createDatabase });

  let database;
  try {
    database = createDatabase(restoreUrl);
    const client = requiredInspectableClient(database?.client);
    await verifyEffectiveConnectionIdentity(client, restore);
    const state = requiredTargetState(await client.unsafe(EMPTY_TARGET_QUERY));
    if (!isEmptyTargetState(state)) throw new Error("restore target is not empty");
    return Object.freeze({ status: "restore-target-empty", appId: "ulc-linz" });
  } catch {
    throw new Error(
      "ULC M5 restore target is not empty, has an unexpected effective database identity, or could not be inspected; use a fresh isolated target.",
    );
  } finally {
    await closeDatabase(database);
  }
}

export async function resetAndVerifyUlcLinzM5IsolatedRestoreTarget({
  sourceUrl,
  restoreUrl,
  createDatabase = createPostgresDatabase,
} = {}) {
  assertGuardedDestructiveResetWorkflowContext();
  await verifyUlcLinzM5NeonBranchIsolation({
    sourceUrl,
    restoreUrls: [restoreUrl],
    apiKey: process.env.NEON_API_KEY,
    orgId: process.env.NEON_ORG_ID,
  });
  assertUlcLinzM5NeonBranchIsolationAttestation({ sourceUrl, restoreUrl, env: process.env });
  const restore = validateTargetBoundary({ sourceUrl, restoreUrl, createDatabase });

  let database;
  try {
    database = createDatabase(restoreUrl);
    const client = requiredInspectableClient(database?.client);
    if (typeof client.begin !== "function") throw new Error("database transaction boundary is invalid");

    await verifyEffectiveConnectionIdentity(client, restore);
    const before = requiredTargetState(await client.unsafe(EMPTY_TARGET_QUERY));
    if (before.extra_schema_count !== 0) {
      throw new Error("restore target contains an unexpected non-public schema");
    }

    let resetApplied = false;
    if (!isEmptyTargetState(before)) {
      await client.begin(async (transaction) => {
        if (!transaction || typeof transaction.unsafe !== "function") {
          throw new Error("database transaction client is invalid");
        }
        await verifyEffectiveConnectionIdentity(transaction, restore);
        for (const statement of RESET_PUBLIC_SCHEMA_STATEMENTS) {
          await transaction.unsafe(statement);
        }
      });
      resetApplied = true;
    }

    await verifyEffectiveConnectionIdentity(client, restore);
    const after = requiredTargetState(await client.unsafe(EMPTY_TARGET_QUERY));
    if (!isEmptyTargetState(after)) {
      throw new Error("restore target reset did not produce an empty target");
    }

    return Object.freeze({ status: "restore-target-empty", appId: "ulc-linz", resetApplied });
  } catch {
    throw new Error(
      "ULC M5 isolated restore target reset was refused or failed; no production source mutation was attempted.",
    );
  } finally {
    await closeDatabase(database);
  }
}

export function parseUlcLinzM5RestoreDatabaseUrl(value) {
  const url = requiredEncryptedDatabaseUrl(value, "ULC M5 restore database URL");
  assertCanonicalSingleHostAuthority(value, url, "ULC M5 restore database URL");
  assertSafeRestoreQuery(url, "ULC M5 restore database URL");
  const hostname = url.hostname.toLowerCase();
  const databaseName = canonicalDatabaseName(url);
  const port = url.port || "5432";
  if (
    hostname.endsWith(".") ||
    !hostname.endsWith(".neon.tech") ||
    !hostname.split(".")[0]?.startsWith("ep-") ||
    hostname.split(".")[0]?.endsWith("-pooler") ||
    port !== "5432" ||
    url.pathname !== `/${databaseName}` ||
    url.hash !== "" ||
    decodePrincipal(url.username) === SOURCE_ROLE
  ) {
    throw new Error(
      "ULC M5 restore database URL must use one canonical direct Neon endpoint, canonical database name, default PostgreSQL port and a non-production principal.",
    );
  }
  return url;
}

function assertGuardedDestructiveResetWorkflowContext(env = process.env) {
  if (
    env?.GITHUB_ACTIONS !== "true" ||
    env?.GITHUB_WORKFLOW !== "M5 ULC Production Evidence" ||
    env?.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env?.GITHUB_REF !== "refs/heads/main"
  ) {
    throw new Error("ULC M5 destructive restore reset requires the exact guarded production-evidence workflow context.");
  }
}

function validateTargetBoundary({ sourceUrl, restoreUrl, createDatabase }) {
  const source = requiredUlcLinzProductionDatabaseUrl(sourceUrl);
  const restore = parseUlcLinzM5RestoreDatabaseUrl(restoreUrl);
  if (databaseAliasIdentity(source) === databaseAliasIdentity(restore)) {
    throw new Error(
      "ULC M5 restore target must be a different database endpoint from production, including equivalent URL and Neon pooler aliases.",
    );
  }
  if (typeof createDatabase !== "function") {
    throw new Error("ULC M5 restore target database dependency is invalid.");
  }
  return restore;
}

async function verifyEffectiveConnectionIdentity(client, expectedUrl) {
  const rows = await client.unsafe(CONNECTION_IDENTITY_QUERY);
  const expectedDatabase = canonicalDatabaseName(expectedUrl);
  const expectedUser = decodePrincipal(expectedUrl.username);
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0]?.current_database !== expectedDatabase ||
    rows[0]?.current_user !== expectedUser
  ) {
    throw new Error("effective restore database identity does not match the approved target");
  }
}

function requiredInspectableClient(client) {
  if (!client || typeof client.unsafe !== "function") throw new Error("database client is invalid");
  return client;
}

function requiredTargetState(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0] === null || typeof rows[0] !== "object") {
    throw new Error("restore target inspection result is invalid");
  }
  const state = rows[0];
  for (const key of [
    "public_schema_count",
    "extra_schema_count",
    "public_relation_count",
    "public_routine_count",
    "public_type_count",
  ]) {
    if (!Number.isInteger(state[key]) || state[key] < 0) {
      throw new Error("restore target inspection result is invalid");
    }
  }
  return state;
}

function isEmptyTargetState(state) {
  return state.public_schema_count === 1 &&
    state.extra_schema_count === 0 &&
    state.public_relation_count === 0 &&
    state.public_routine_count === 0 &&
    state.public_type_count === 0;
}

async function closeDatabase(database) {
  if (database?.client && typeof database.client.end === "function") {
    await database.client.end().catch(() => {});
  }
}

function requiredUlcLinzProductionDatabaseUrl(value) {
  const url = requiredEncryptedDatabaseUrl(value, "ULC production database URL");
  assertNoConnectionIdentityOverrides(url, "ULC production database URL");
  if (decodePrincipal(url.username) !== SOURCE_ROLE) {
    throw new Error("ULC M5 source database URL is not the dedicated production application principal.");
  }
  try {
    parseUlcLinzProductionDatabaseUrl(value);
  } catch {
    throw new Error("ULC M5 source database URL is not the canonical ULC production Neon origin.");
  }
  return url;
}

function requiredEncryptedDatabaseUrl(value, name) {
  const url = new URL(value);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} must be PostgreSQL.`);
  }
  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || !STRONG_SSL_MODES.has(sslModes[0])) {
    throw new Error(`${name} must require encrypted transport with exactly one strong sslmode.`);
  }
  if (!url.hostname || !url.username || url.pathname.length <= 1) throw new Error(`${name} is invalid.`);
  return url;
}

function assertSafeRestoreQuery(url, name) {
  assertNoConnectionIdentityOverrides(url, name);
  const allowed = new Set(["sslmode", "channel_binding"]);
  const seen = new Set();
  for (const [key, value] of url.searchParams.entries()) {
    if (!allowed.has(key) || seen.has(key)) {
      throw new Error(`${name} contains a duplicate or unsupported connection parameter.`);
    }
    seen.add(key);
    if (key === "channel_binding" && !SAFE_CHANNEL_BINDING_MODES.has(value)) {
      throw new Error(`${name} contains an unsupported channel_binding mode.`);
    }
  }
}

function assertNoConnectionIdentityOverrides(url, name) {
  const forbidden = new Set([
    "database", "dbname", "host", "hostname", "port", "user", "username", "password",
    "service", "servicefile", "target_session_attrs",
  ]);
  for (const key of url.searchParams.keys()) {
    if (forbidden.has(key.toLowerCase())) {
      throw new Error(`${name} must not override connection identity through query parameters.`);
    }
  }
}

function assertCanonicalSingleHostAuthority(value, url, name) {
  if (typeof value !== "string") throw new Error(`${name} must be a canonical single-host connection string.`);
  const schemeIndex = value.indexOf("://");
  if (schemeIndex <= 0) throw new Error(`${name} must be a canonical single-host connection string.`);
  const authorityStart = schemeIndex + 3;
  const boundaryIndexes = ["/", "?", "#"]
    .map((separator) => value.indexOf(separator, authorityStart))
    .filter((index) => index >= 0);
  const authorityEnd = boundaryIndexes.length > 0 ? Math.min(...boundaryIndexes) : value.length;
  const authority = value.slice(authorityStart, authorityEnd);
  const rawAtCount = [...authority].filter((character) => character === "@").length;
  if (rawAtCount !== 1) {
    throw new Error(`${name} must contain exactly one canonical user-info delimiter.`);
  }
  const hostPort = authority.slice(authority.indexOf("@") + 1);
  if (
    !hostPort ||
    hostPort.includes(",") ||
    /%2c/i.test(hostPort) ||
    hostPort.includes("%") ||
    hostPort.toLowerCase() !== url.host.toLowerCase()
  ) {
    throw new Error(`${name} must contain exactly one canonical database host.`);
  }
}

function databaseAliasIdentity(value) {
  const url = value instanceof URL ? value : new URL(value);
  const port = url.port === "" ? "5432" : url.port;
  return `${normalizeProviderHostname(url.hostname)}:${port}/${canonicalDatabaseName(url)}`;
}

function canonicalDatabaseName(url) {
  const encodedName = url.pathname.slice(1);
  if (!encodedName || encodedName.includes("/")) throw new Error("database URL must identify exactly one database name");
  let decodedName;
  try {
    decodedName = decodeURIComponent(encodedName);
  } catch {
    throw new Error("database URL contains an invalid encoded database name");
  }
  if (!decodedName || decodedName.includes("/") || decodedName.includes("\\") || decodedName.includes("\0")) {
    throw new Error("database URL contains an invalid database name");
  }
  return decodedName;
}

function decodePrincipal(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("database URL contains an invalid encoded PostgreSQL principal");
  }
}

function normalizeProviderHostname(value) {
  let hostname = value.toLowerCase();
  while (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  if (!hostname) throw new Error("database URL hostname is invalid");
  if (!hostname.endsWith(".neon.tech")) return hostname;
  const labels = hostname.split(".");
  labels[0] = labels[0].replace(/-pooler$/, "");
  return labels.join(".");
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] !== "verify-empty") {
      throw new Error("Expected command mode verify-empty; destructive reset is available only through the guarded M4/M5 workflow path.");
    }
    const result = await verifyUlcLinzM5IsolatedRestoreTargetEmpty({
      sourceUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
      restoreUrl: process.env.APPBASIS_M4_RESTORE_DATABASE_URL,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "ULC M5 restore target operation failed.");
    process.exitCode = 1;
  }
}