import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createPostgresDatabase } from "@appbasis/database/node-runtime";
import { BetterAuthIdentityBackend } from "@appbasis/identity";
import { createBetterAuthRuntime } from "@appbasis/identity/better-auth";

import { parseUlcLinzProductionDatabaseUrl } from "../../../tooling/ulc-linz-m6-production-hyperdrive.mjs";

const SESSION_COOKIE_NAME = "better-auth.session_token";
const HTTP_ONLY_PREFIX = "#HttpOnly_";
const BASE_URL = "https://app.ulc-linz.at";

export async function revokeUlcLinzProductionHttpSmokeSession(env = process.env) {
  const databaseUrl = required(
    env.ULC_LINZ_PRODUCTION_DATABASE_URL,
    "ULC_LINZ_PRODUCTION_DATABASE_URL",
  );
  parseUlcLinzProductionDatabaseUrl(databaseUrl);
  const authSecret = required(
    env.ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET,
    "ULC_LINZ_PRODUCTION_BETTER_AUTH_SECRET",
  );
  const cookieFile = required(
    env.ULC_LINZ_PRODUCTION_HTTP_SMOKE_COOKIE_FILE,
    "ULC_LINZ_PRODUCTION_HTTP_SMOKE_COOKIE_FILE",
  );
  const sessionToken = await readSessionCookie(cookieFile);

  const connection = createPostgresDatabase(databaseUrl);
  try {
    const auth = createBetterAuthRuntime({
      database: connection.database,
      baseURL: BASE_URL,
      secret: authSecret,
    });
    const backend = new BetterAuthIdentityBackend({
      auth,
      sql: connection.client,
      baseURL: BASE_URL,
    });
    await backend.endSession(sessionToken);
  } finally {
    await connection.client.end();
  }
}

async function readSessionCookie(path) {
  const raw = await readFile(path, "utf8");
  const rows = raw
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) =>
      line.startsWith(HTTP_ONLY_PREFIX) ? line.slice(HTTP_ONLY_PREFIX.length) : line,
    )
    .filter((line) => !line.startsWith("#"));
  const matches = rows
    .map((line) => line.split("\t"))
    .filter((fields) => fields.length >= 7 && fields[5] === SESSION_COOKIE_NAME);
  if (matches.length !== 1) {
    throw new Error("Expected exactly one production HTTP smoke session cookie.");
  }
  const value = matches[0][6];
  if (typeof value !== "string" || value.length === 0 || /[\r\n;]/.test(value)) {
    throw new Error("Production HTTP smoke session cookie is invalid.");
  }
  return `${SESSION_COOKIE_NAME}=${value}`;
}

function required(value, name) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error(`Missing or invalid ${name}.`);
  }
  return value;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    await revokeUlcLinzProductionHttpSmokeSession();
  } catch {
    console.error("ULC M6 production HTTP smoke session revocation failed.");
    process.exitCode = 1;
  }
}
