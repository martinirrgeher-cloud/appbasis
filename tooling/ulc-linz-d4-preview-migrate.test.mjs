import assert from "node:assert/strict";
import test from "node:test";

import {
  applyUlcLinzD4PreviewMigrations,
  loadUlcLinzD4PreviewMigrationPlan,
} from "./ulc-linz-d4-preview-migrate.mjs";

const DATABASE_URL =
  "postgresql://preview_owner:secret@example.test/appbasis_ulc_linz_preview";

test("appends the preview-only security isolation after the canonical ULC migrations", async () => {
  const { plan } = await loadUlcLinzD4PreviewMigrationPlan();

  assert.equal(plan.length, 11);
  assert.equal(
    plan.at(-2)?.relativePath,
    "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
  );
  assert.equal(
    plan.at(-1)?.relativePath,
    "apps/ulc-linz/preview-migrations/0000_d4_security_role_isolation.sql",
  );

  const sql = plan.at(-1)?.statements.join("\n") ?? "";
  assert.match(
    sql,
    /rolname = 'appbasis_ulc_linz_preview_security_ingest'/,
  );
  assert.match(sql, /already exists/);
  assert.match(
    sql,
    /CREATE ROLE appbasis_ulc_linz_preview_security_ingest\s+NOLOGIN/,
  );
  for (const sharedRole of [
    "ulc_linz_security_event_ingest",
    "ulc_linz_security_event_cleanup",
    "ulc_linz_security_event_read",
  ]) {
    assert.match(sql, new RegExp(sharedRole));
  }
  assert.match(
    sql,
    /TO appbasis_ulc_linz_preview_security_ingest/,
  );
  assert.match(
    sql,
    /GRANT USAGE ON SEQUENCE public\.ulc_linz_security_event_log_id_seq/,
  );
});

test("executes canonical migrations and preview isolation in one transaction", async () => {
  let beginCount = 0;
  const statements = [];
  const createDatabase = () => ({
    client: {
      async begin(callback) {
        beginCount += 1;
        const transaction = async (strings) => {
          const sql = Array.isArray(strings) ? strings.join("?") : String(strings);
          if (sql.includes("current_database()")) {
            return [{ database_name: "appbasis_ulc_linz_preview" }];
          }
          if (sql.includes("public_objects")) return [];
          throw new Error("Unexpected tagged SQL: " + sql);
        };
        transaction.unsafe = async (sql) => {
          statements.push(sql);
          return [];
        };
        return callback(transaction);
      },
      async end() {},
    },
  });

  const result = await applyUlcLinzD4PreviewMigrations(
    { connectionString: DATABASE_URL },
    { createDatabase },
  );

  assert.equal(beginCount, 1);
  assert.equal(result.migrationCount, 11);
  const canonicalIndex = statements.findIndex((sql) =>
    sql.includes("GRANT INSERT (") &&
    sql.includes("TO ulc_linz_security_event_ingest"),
  );
  const previewIndex = statements.findIndex((sql) =>
    sql.includes("CREATE ROLE appbasis_ulc_linz_preview_security_ingest"),
  );
  assert.ok(canonicalIndex >= 0);
  assert.ok(previewIndex > canonicalIndex);
});
