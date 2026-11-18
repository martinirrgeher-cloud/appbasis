import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertUlcLifecyclePreviewScope,
  executeUlcLifecycleRepairTransaction,
  inspectUlcLifecyclePreview,
  migrateUlcLifecyclePreview,
  verifyUlcLifecyclePreviewMarkerPrivileges,
} from "./ulc-linz-lifecycle-schema-preview.mjs";

const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const url = (user, db = DATABASE) =>
  `postgresql://${user}:synthetic-test-only@${HOST}/${db}?sslmode=require`;
const input = Object.freeze({
  migrationDatabaseUrl: url("appbasis_ulc_linz_preview_migration"),
  applicationDatabaseUrl: url("appbasis_ulc_linz_preview_application"),
  securityLogDatabaseUrl: url("appbasis_ulc_linz_preview_security_log"),
});

test("accepts only the exact separate Preview credentials and roles", () => {
  assert.deepEqual(assertUlcLifecyclePreviewScope(input), {
    database: DATABASE, principal: "appbasis_ulc_linz_preview_migration",
  });
  assert.throws(() => assertUlcLifecyclePreviewScope({
    ...input, migrationDatabaseUrl: url("appbasis_ulc_linz_preview_migration", "prod"),
  }), /same dedicated preview database|isolated Preview|dedicated generated preview database/);
  assert.throws(() => assertUlcLifecyclePreviewScope({
    ...input, migrationDatabaseUrl: url("appbasis_ulc_linz_preview_application"),
  }), /roles must be distinct|isolated Preview/);
  assert.throws(() => assertUlcLifecyclePreviewScope({
    ...input, applicationDatabaseUrl: url("unauthorized_application"),
  }), /canonical roles/);
});

test("migrate without independent backup/restore/operator confirmation never opens a database", async () => {
  let connections = 0;
  const options = { databaseFactory() { connections++; throw new Error("unexpected connection"); } };
  for (const invalid of [
    input,
    { ...input, apply: true },
    { ...input, apply: true, backupConfirmed: true },
    { ...input, apply: true, backupConfirmed: true, restoreConfirmed: true },
    { ...input, apply: true, backupConfirmed: true, restoreConfirmed: true,
      approvalRef: "wrong" },
  ]) {
    await assert.rejects(migrateUlcLifecyclePreview(invalid, options),
      /apply \+ backup \+ restore evidence \+ exact operator approval required/);
  }
  assert.equal(connections, 0);
});

test("inspect only reads catalog metadata and returns a source-file plan", async () => {
  let connections = 0;
  let closed = 0;
  const baselines = new Set([
    "appbasis_athletes_deletion",
    "appbasis_training_block_favorite",
    "appbasis_training_block_usage",
    "appbasis_training_documentation",
    "appbasis_training_documentation_revision",
  ]);
  const result = await inspectUlcLifecyclePreview(input, {
    databaseFactory() {
      connections++;
      return { client: {
        async unsafe(sql) {
          if (sql.startsWith("SELECT current_database()")) {
            return [{ database_name: DATABASE, principal_name: "appbasis_ulc_linz_preview_migration" }];
          }
          if (sql.includes("pg_catalog.pg_tables")) {
            return Array.from(baselines, name => ({ name }));
          }
          if (sql.includes("pg_catalog.pg_proc") ||
              sql.includes("pg_catalog.pg_trigger")) return [];
          throw new Error("read-only inspection attempted unexpected query");
        },
        async end() { closed++; },
      } };
    },
  });
  assert.equal(result.state, "migration-required");
  assert.equal(result.requiredMigrations.length, 3);
  assert.equal(result.productionChanged, false);
  assert.equal(connections, 1);
  assert.equal(closed, 1);
});

test("protected lifecycle DML is denied to both Preview runtime roles (read-only check)", async () => {
  const roles = [
    "appbasis_ulc_linz_preview_application",
    "appbasis_ulc_linz_preview_security_log",
  ];
  const markerTables = [
    "appbasis_training_block_favorite_deletion",
    "appbasis_training_block_usage_subject",
    "appbasis_training_block_usage_subject_deletion",
    "appbasis_training_documentation_subject_deletion",
  ];
  const tableNames = [
    "appbasis_athletes_deletion", "appbasis_training_block_favorite",
    "appbasis_training_block_usage", "appbasis_training_documentation",
    "appbasis_training_documentation_revision", ...markerTables,
  ];
  const funcNames = [
    "appbasis_training_documentation_guard_subject",
    "appbasis_training_documentation_guard_root_insert",
    "appbasis_training_documentation_guard_revision_write",
  ];
  const triggerNames = [
    "appbasis_training_documentation_guard_root",
    "appbasis_training_documentation_guard_revision",
  ];
  let allowWrite = false;
  let closed = 0;
  const options = {
    databaseFactory() {
      return { client: {
        async unsafe(sql) {
          if (sql.startsWith("SELECT current_database()")) {
            return [{ database_name: DATABASE, principal_name: "appbasis_ulc_linz_preview_migration" }];
          }
          if (sql.includes("pg_catalog.pg_tables")) return tableNames.map(name => ({ name }));
          if (sql.includes("pg_catalog.pg_proc")) return funcNames.map(name => ({ name }));
          if (sql.includes("pg_catalog.pg_trigger")) return triggerNames.map(name => ({ name }));
          if (sql.includes("has_table_privilege")) {
            return roles.flatMap(principal_name =>
              markerTables.map(table_name => ({
                principal_name, table_name, can_insert: allowWrite,
                can_update: false, can_delete: false,
              }))
            );
          }
          throw new Error("privilege verifier tried unexpected SQL");
        },
        async end() { closed++; },
      } };
    },
  };
  const allowed = await verifyUlcLifecyclePreviewMarkerPrivileges(input, options);
  assert.equal(allowed.runtimeMutationRightsDenied, true);
  allowWrite = true;
  await assert.rejects(
    verifyUlcLifecyclePreviewMarkerPrivileges(input, options),
    /unauthorized Preview runtime DML/,
  );
  assert.equal(closed, 2);
});

test("migration transaction refuses missing executor, invalid plan and nontransactional usage", async () => {
  await assert.rejects(executeUlcLifecycleRepairTransaction({}, []),
    /transaction client unavailable/);
  await assert.rejects(executeUlcLifecycleRepairTransaction({ unsafe() {}, begin() {} }, []),
    /exactly three entries/);
});

test("separate Preview workflow is inspect-first and cannot mutate on push", async () => {
  const yaml = await readFile(
    new URL("../.github/workflows/ulc-linz-p04-lifecycle-preview.yml", import.meta.url),
    "utf8",
  );
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /options: \[inspect, migrate\]/);
  assert.match(yaml, /default: inspect/);
  assert.match(yaml, /refs\/heads\/main/);
  assert.match(yaml, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.match(yaml, /test "\$APPROVAL_REF" = ULC-P04-LIFECYCLE-PREVIEW/);
  assert.match(yaml, /APPBASIS_APPLY_P04_LIFECYCLE_PREVIEW/);
  assert.match(yaml, /generated-preview-ulc-linz/);
  assert.doesNotMatch(yaml, /\n\s*push:/);
  assert.doesNotMatch(yaml, /wrangler deploy|m6-ulc-production|PRODUCTION_DATABASE_URL/i);
  assert.doesNotMatch(yaml, /d4-preview-database-access\\.mjs reconcile/);
  assert.match(yaml, /verify-privileges/);
});
