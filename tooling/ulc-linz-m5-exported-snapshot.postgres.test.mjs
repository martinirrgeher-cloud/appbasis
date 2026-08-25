import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";

const databaseUrl = process.env.DATABASE_URL;

if (typeof databaseUrl !== "string" || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required for the M5 exported snapshot PostgreSQL regression test.");
}

test("PostgreSQL accepts transaction characteristics before reads and rejects changing them after a read", async () => {
  const database = createPostgresDatabase(databaseUrl);
  try {
    await database.client.begin(async (sql) => {
      await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      const rows = await sql.unsafe("SELECT pg_export_snapshot() AS snapshot_id");
      assert.equal(Array.isArray(rows), true);
      assert.equal(rows.length, 1);
      assert.match(rows[0].snapshot_id, /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[1-9][0-9]*$/);
    });

    await assert.rejects(
      database.client.begin(async (sql) => {
        await sql.unsafe("SELECT 1");
        await sql.unsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      }),
      /SET TRANSACTION ISOLATION LEVEL must be called before any query|transaction characteristics|active SQL transaction/i,
    );
  } finally {
    await database.client.end().catch(() => {});
  }
});
