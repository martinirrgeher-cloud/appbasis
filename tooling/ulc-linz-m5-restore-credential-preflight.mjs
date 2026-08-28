import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  persistUlcLinzM5NeonBranchIsolationAttestation,
  verifyUlcLinzM5NeonBranchIsolation,
} from "./ulc-linz-m5-neon-branch-isolation.mjs";
import { parseUlcLinzM5RestoreDatabaseUrl } from "./ulc-linz-m5-restore-target.mjs";

const RESTORE_CREDENTIALS = [
  ["owner", "APPBASIS_M4_RESTORE_DATABASE_URL"],
  ["application", "APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL"],
  ["security-log-ingest", "APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL"],
  ["security-log-read", "APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL"],
];
const IDENTITY_QUERY = "SELECT current_database() AS current_database, current_user AS current_user";
const CREDENTIAL_ONLY_MODE = "credentials-only";

export async function verifyRestoreCredentials(env = process.env, { databaseFactory = createPostgresDatabase } = {}) {
  const parsed = RESTORE_CREDENTIALS.map(([label, name]) => ({
    label,
    name,
    url: parseCredential(env[name], label),
  }));
  const endpoint = endpointKey(parsed[0].url);
  if (parsed.some(({ url }) => endpointKey(url) !== endpoint)) {
    throw new Error("All ULC M5 restore credentials must target the exact same isolated restore database.");
  }

  const decodedPrincipals = parsed.map(({ url }) => decodePrincipal(url.username));
  if (new Set(decodedPrincipals).size !== parsed.length) {
    throw new Error("ULC M5 restore owner, application, ingest and read credentials must use distinct principals.");
  }

  const expectedDatabase = decodeDatabaseName(parsed[0].url);
  const failures = [];
  for (const [index, credential] of parsed.entries()) {
    const database = databaseFactory(credential.url.toString());
    try {
      const rows = await database.client.unsafe(IDENTITY_QUERY);
      if (
        !Array.isArray(rows) ||
        rows.length !== 1 ||
        rows[0]?.current_user !== decodedPrincipals[index] ||
        rows[0]?.current_database !== expectedDatabase
      ) {
        failures.push(`${credential.label}: effective database identity mismatch`);
      }
    } catch {
      failures.push(`${credential.label}: login failed`);
    } finally {
      await database.client.end().catch(() => {});
    }
  }
  if (failures.length > 0) {
    throw new Error(`ULC M5 restore credential preflight failed (${failures.join(", ")}).`);
  }
  return { restoreCredentialPreflightVerified: true };
}

export function isCredentialOnlyPreflightMode(value) {
  if (value === undefined || value === null || value === "") return false;
  if (value === CREDENTIAL_ONLY_MODE) return true;
  throw new Error(`Unsupported ULC M5 restore credential preflight mode: ${value}.`);
}

function parseCredential(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`ULC M5 restore ${label} credential is missing.`);
  }
  let preliminary;
  try {
    preliminary = new URL(value);
  } catch {
    throw new Error(`ULC M5 restore ${label} credential is not a valid PostgreSQL URL.`);
  }
  if (!new Set(["postgres:", "postgresql:"]).has(preliminary.protocol)) {
    throw new Error(`ULC M5 restore ${label} credential must use PostgreSQL.`);
  }
  if (!preliminary.hostname || !preliminary.pathname || preliminary.pathname === "/" || !preliminary.username || !preliminary.password) {
    throw new Error(`ULC M5 restore ${label} credential must include host, database, username and password.`);
  }
  const url = parseUlcLinzM5RestoreDatabaseUrl(value);
  decodePrincipal(url.username);
  decodeDatabaseName(url);
  return url;
}

function decodePrincipal(username) {
  try {
    return decodeURIComponent(username);
  } catch {
    throw new Error("ULC M5 restore credential contains an invalid URL-encoded PostgreSQL principal.");
  }
}

function decodeDatabaseName(url) {
  try {
    return decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("ULC M5 restore credential contains an invalid URL-encoded database name.");
  }
}

function endpointKey(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}/${decodeDatabaseName(url)}`;
}

async function main() {
  const credentialResult = await verifyRestoreCredentials();
  if (isCredentialOnlyPreflightMode(process.argv[2])) {
    process.stdout.write(`${JSON.stringify(credentialResult)}\n`);
    return;
  }
  const proof = await verifyUlcLinzM5NeonBranchIsolation({
    sourceUrl: process.env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    restoreUrls: RESTORE_CREDENTIALS.map(([, name]) => process.env[name]),
    apiKey: process.env.NEON_API_KEY,
    orgId: process.env.NEON_ORG_ID,
  });
  await persistUlcLinzM5NeonBranchIsolationAttestation(proof);
  process.stdout.write(`${JSON.stringify({
    ...credentialResult,
    neonBranchIsolationVerified: true,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  });
}
