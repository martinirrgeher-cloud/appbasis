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
