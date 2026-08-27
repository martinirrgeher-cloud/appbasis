import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const RESTORE_CREDENTIALS = [
  ["owner", "APPBASIS_M4_RESTORE_DATABASE_URL"],
  ["application", "APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL"],
  ["security-log-ingest", "APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL"],
  ["security-log-read", "APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL"],
];

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

  const failures = [];
  for (const [index, credential] of parsed.entries()) {
    const database = databaseFactory(credential.url.toString());
    try {
      const rows = await database.client.unsafe("SELECT current_user AS current_user");
      if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.current_user !== decodedPrincipals[index]) {
        failures.push(`${credential.label}: authenticated principal mismatch`);
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

function parseCredential(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`ULC M5 restore ${label} credential is missing.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`ULC M5 restore ${label} credential is not a valid PostgreSQL URL.`);
  }
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
    throw new Error(`ULC M5 restore ${label} credential must use PostgreSQL.`);
  }
  if (!url.hostname || !url.pathname || url.pathname === "/" || !url.username || !url.password) {
    throw new Error(`ULC M5 restore ${label} credential must include host, database, username and password.`);
  }
  decodePrincipal(url.username);
  return url;
}

function decodePrincipal(username) {
  try {
    return decodeURIComponent(username);
  } catch {
    throw new Error("ULC M5 restore credential contains an invalid URL-encoded PostgreSQL principal.");
  }
}

function endpointKey(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
}

async function main() {
  const result = await verifyRestoreCredentials();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  });
}
