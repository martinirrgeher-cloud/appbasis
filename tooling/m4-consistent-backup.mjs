import { spawn } from "node:child_process";
import { open, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { verifyM3PreviewSchema } from "../apps/m3-preview/tooling/verify-preview-schema.mjs";
import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  configureM4FingerprintSession,
  readM4RestoreFingerprintFromClient,
  requiredM3PreviewDatabaseUrl,
} from "./m4-restore-verification.mjs";

const SNAPSHOT_QUERY = "SELECT pg_export_snapshot() AS snapshot_id";
const SNAPSHOT_PATTERN = /^[0-9A-Fa-f-]{1,128}$/;
export const M4_POSTGRES_DUMP_IMAGE =
  "postgres:18-alpine@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";

export async function captureM4ConsistentBackup({
  connectionString,
  outputPath,
  createDatabase = createPostgresDatabase,
  verifySchema = verifyM3PreviewSchema,
  runDump = runPostgresDumpWithSnapshot,
} = {}) {
  requiredM3PreviewDatabaseUrl(
    connectionString,
    "APPBASIS_M4_SOURCE_DATABASE_URL",
  );
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw new Error("M4 backup dump output path is invalid.");
  }
  if (typeof createDatabase !== "function" || typeof verifySchema !== "function") {
    throw new Error("M4 consistent backup database dependencies are invalid.");
  }
  if (typeof runDump !== "function") {
    throw new Error("M4 consistent backup dump dependency is invalid.");
  }

  try {
    await verifySchema({ connectionString, createDatabase });
  } catch {
    throw new Error("M4 consistent backup schema verification failed.");
  }

  let database;
  try {
    database = createDatabase(connectionString);
    if (!database?.client || typeof database.client.begin !== "function") {
      throw new Error("database client does not support transactions");
    }

    return await database.client.begin(
      "isolation level repeatable read read only",
      async (transaction) => {
        await configureM4FingerprintSession(transaction, { local: true });
        const snapshotRows = await transaction.unsafe(SNAPSHOT_QUERY);
        const snapshotId = normalizeSnapshotId(snapshotRows);
        const fingerprint = await readM4RestoreFingerprintFromClient(transaction);
        await runDump({ connectionString, snapshotId, outputPath });
        return fingerprint;
      },
    );
  } catch {
    throw new Error("M4 consistent backup capture failed.");
  } finally {
    if (database?.client && typeof database.client.end === "function") {
      try {
        await database.client.end();
      } catch {
        // Do not replace the sanitized backup result with cleanup details.
      }
    }
  }
}

export async function runPostgresDumpWithSnapshot({
  connectionString,
  snapshotId,
  outputPath,
  spawnImpl = spawn,
} = {}) {
  requiredM3PreviewDatabaseUrl(connectionString, "M4 source database URL");
  if (!SNAPSHOT_PATTERN.test(snapshotId ?? "")) {
    throw new Error("M4 PostgreSQL snapshot id is invalid.");
  }
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw new Error("M4 backup dump output path is invalid.");
  }
  if (typeof spawnImpl !== "function") {
    throw new Error("spawnImpl must be a function.");
  }

  let output;
  let outputCreated = false;
  try {
    output = await open(outputPath, "wx", 0o600);
    outputCreated = true;
    const child = spawnImpl(
      "docker",
      [
        "run",
        "--rm",
        "--env",
        "APPBASIS_M4_SOURCE_DATABASE_URL",
        "--env",
        "APPBASIS_M4_EXPORTED_SNAPSHOT",
        M4_POSTGRES_DUMP_IMAGE,
        "sh",
        "-ceu",
        'pg_dump --format=custom --no-owner --no-acl --snapshot="$APPBASIS_M4_EXPORTED_SNAPSHOT" --dbname="$APPBASIS_M4_SOURCE_DATABASE_URL"',
      ],
      {
        env: {
          ...process.env,
          APPBASIS_M4_SOURCE_DATABASE_URL: connectionString,
          APPBASIS_M4_EXPORTED_SNAPSHOT: snapshotId,
        },
        stdio: ["ignore", output.fd, "ignore"],
      },
    );
    await waitForSuccessfulChild(child);
    await output.sync();
  } catch {
    await output?.close().catch(() => {});
    output = undefined;
    if (outputCreated) {
      await rm(outputPath, { force: true }).catch(() => {});
    }
    throw new Error("M4 PostgreSQL snapshot dump failed.");
  } finally {
    await output?.close().catch(() => {});
  }
}

function normalizeSnapshotId(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    rows[0] === null ||
    typeof rows[0] !== "object" ||
    !SNAPSHOT_PATTERN.test(rows[0].snapshot_id ?? "")
  ) {
    throw new Error("M4 exported PostgreSQL snapshot is invalid.");
  }
  return rows[0].snapshot_id;
}

function waitForSuccessfulChild(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    if (!child || typeof child.once !== "function") {
      rejectPromise(new Error("invalid child process"));
      return;
    }
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) resolvePromise();
      else rejectPromise(new Error("dump process failed"));
    });
  });
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    if (process.argv[2] !== "capture") {
      throw new Error("Expected command mode capture.");
    }
    const fingerprint = await captureM4ConsistentBackup({
      connectionString: process.env.APPBASIS_M4_SOURCE_DATABASE_URL,
      outputPath: process.argv[3],
    });
    process.stdout.write(`${JSON.stringify(fingerprint)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "M4 consistent backup capture failed.",
    );
    process.exitCode = 1;
  }
}
