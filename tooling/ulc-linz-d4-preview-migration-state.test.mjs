import assert from "node:assert/strict";
import test from "node:test";

import { resolveUlcLinzD4PreviewMigrationState } from "./ulc-linz-d4-preview-migration-state.mjs";

const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_URL = `postgresql://appbasis_ulc_linz_preview_migration:x@${HOST}/${DATABASE}?sslmode=require`;
const APPLICATION_URL = `postgresql://appbasis_ulc_linz_preview_application:x@${HOST}/${DATABASE}?sslmode=require`;
const SECURITY_URL = `postgresql://appbasis_ulc_linz_preview_security_log:x@${HOST}/${DATABASE}?sslmode=require`;

const BASELINE = [
  "appbasis_person",
  "appbasis_permission_principal",
  "ulc_linz_membership",
  "ulc_linz_security_event_log",
];
const ATHLETES = [
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_trainer",
  "appbasis_athlete_group_membership",
  "appbasis_trainer_group_membership",
  "appbasis_athletes_deletion",
];

function factory({ tables = [], group = false } = {}) {
  return () => ({
    client: {
      async unsafe(sql) {
        if (sql.includes("FROM pg_catalog.pg_tables")) {
          return [...tables].sort().map((tablename) => ({ tablename }));
        }
        if (sql.includes("FROM pg_catalog.pg_roles")) {
          return group
            ? [{ rolname: "appbasis_ulc_linz_preview_security_ingest" }]
            : [];
        }
        throw new Error("unexpected SQL");
      },
      async end() {},
    },
  });
}

async function resolve(state) {
  return resolveUlcLinzD4PreviewMigrationState(
    {
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
    },
    { databaseFactory: factory(state) },
  );
}

test("classifies a fresh empty ULC preview as initial", async () => {
  assert.deepEqual(await resolve(), { mode: "initial" });
});

test("classifies the established countdown preview as an athletes upgrade", async () => {
  assert.deepEqual(
    await resolve({ tables: BASELINE, group: true }),
    { mode: "athletes-upgrade" },
  );
});

test("classifies a fully migrated preview as current", async () => {
  assert.deepEqual(
    await resolve({ tables: [...BASELINE, ...ATHLETES], group: true }),
    { mode: "current" },
  );
});

test("fails closed on a partially applied Stammdaten schema", async () => {
  await assert.rejects(
    resolve({ tables: [...BASELINE, ATHLETES[0]], group: true }),
    /partially applied/,
  );
});

test("fails closed when established preview security isolation is missing", async () => {
  await assert.rejects(
    resolve({ tables: BASELINE, group: false }),
    /security group is missing/,
  );
});
