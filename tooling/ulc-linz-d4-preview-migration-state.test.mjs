import assert from "node:assert/strict";
import test from "node:test";

import { resolveUlcLinzD4PreviewMigrationState } from "./ulc-linz-d4-preview-migration-state.mjs";
import {
  CANONICAL_PG_CHECK,
  canonicalIdentityColumns,
  canonicalIdentityConstraints,
} from "./ulc-linz-d4-preview-identity-audit-test-fixture.mjs";

const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_URL = `postgresql://appbasis_ulc_linz_preview_migration:x@${HOST}/${DATABASE}?sslmode=require`;
const APPLICATION_URL = `postgresql://appbasis_ulc_linz_preview_application:x@${HOST}/${DATABASE}?sslmode=require`;
const SECURITY_URL = `postgresql://appbasis_ulc_linz_preview_security_log:x@${HOST}/${DATABASE}?sslmode=require`;

const BASELINE = [
  "appbasis_person",
  "appbasis_identity_operation",
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
const TRAINING = [
  "ulc_linz_training_session",
  "ulc_linz_training_attendance",
];
const TRAINER_IDENTITY_AUDIT = "ulc_linz_trainer_identity_audit";

function factory({
  tables = [],
  group = false,
  identityColumns = [],
  identityConstraint = false,
} = {}) {
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
        if (sql.includes("FROM pg_catalog.pg_attribute")) {
          return identityColumns.map((value) =>
            typeof value === "string"
              ? canonicalIdentityColumns().find((entry) => entry.column_name === value)
              : value,
          );
        }
        if (sql.includes("FROM pg_catalog.pg_constraint")) {
          return identityConstraint === true
            ? canonicalIdentityConstraints()
            : (Array.isArray(identityConstraint) ? identityConstraint : []);
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

test("classifies a Stammdaten-complete preview as a training upgrade", async () => {
  assert.deepEqual(
    await resolve({ tables: [...BASELINE, ...ATHLETES], group: true }),
    { mode: "training-upgrade" },
  );
});

test("classifies a training-complete preview as a trainer identity audit upgrade", async () => {
  assert.deepEqual(
    await resolve({ tables: [...BASELINE, ...ATHLETES, ...TRAINING], group: true }),
    { mode: "trainer-identity-audit-upgrade" },
  );
});

test("classifies a trainer-audit-complete identity-v2 preview as requiring the identity audit delta", async () => {
  assert.deepEqual(
    await resolve({
      tables: [...BASELINE, ...ATHLETES, ...TRAINING, TRAINER_IDENTITY_AUDIT],
      group: true,
    }),
    { mode: "identity-provisioning-audit-upgrade" },
  );
});

test("classifies a fully migrated identity-v3 preview as current", async () => {
  assert.deepEqual(
    await resolve({
      tables: [...BASELINE, ...ATHLETES, ...TRAINING, TRAINER_IDENTITY_AUDIT],
      group: true,
      identityColumns: ["provisioning_owner", "actor_principal_id", "reason"],
      identityConstraint: true,
    }),
    { mode: "current" },
  );
});

test("rejects partially upgraded identity provisioning audit schemas", async () => {
  const establishedTables = [...BASELINE, ...ATHLETES, ...TRAINING, TRAINER_IDENTITY_AUDIT];
  for (const incomplete of [
    { identityColumns: ["provisioning_owner"], identityConstraint: false },
    { identityColumns: ["provisioning_owner", "actor_principal_id", "reason"], identityConstraint: false },
    { identityColumns: [], identityConstraint: true },
    {
      identityColumns: canonicalIdentityColumns().map((entry, i) =>
        i === 0 ? { ...entry, data_type: "character varying" } : entry
      ),
      identityConstraint: true,
    },
    {
      identityColumns: canonicalIdentityColumns().map((entry, i) =>
        i === 0 ? { ...entry, has_default: true } : entry
      ),
      identityConstraint: true,
    },
    {
      identityColumns: canonicalIdentityColumns(),
      identityConstraint: [{
        definition: CANONICAL_PG_CHECK.replace("char_length(reason) <= 500", "char_length(reason) <= 501"),
        validated: true,
      }],
    },
  ]) {
    await assert.rejects(
      resolve({ tables: establishedTables, group: true, ...incomplete }),
      /partially applied or drifted/,
    );
  }
});

test("fails closed when trainer identity audit appears before the training baseline", async () => {
  await assert.rejects(
    resolve({
      tables: [...BASELINE, ...ATHLETES, TRAINER_IDENTITY_AUDIT],
      group: true,
    }),
    /audit exists before the training baseline/,
  );
});

test("fails closed on a partially applied training schema", async () => {
  await assert.rejects(
    resolve({ tables: [...BASELINE, ...ATHLETES, TRAINING[0]], group: true }),
    /training schema is partially applied/,
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

test("rejects identity v3 markers before every prerequisite migration stage", async () => {
  for (const tables of [
    [...BASELINE],
    [...BASELINE, ...ATHLETES],
    [...BASELINE, ...ATHLETES, ...TRAINING],
    [...BASELINE, ...ATHLETES, TRAINER_IDENTITY_AUDIT],
  ]) {
    await assert.rejects(
      resolve({
        tables,
        group: true,
        identityColumns: canonicalIdentityColumns(),
        identityConstraint: true,
      }),
      /identity provisioning audit exists before the complete app baseline/,
    );
  }
});

test("rejects partial identity v3 even before older migration stages", async () => {
  await assert.rejects(
    resolve({
      tables: BASELINE,
      group: true,
      identityColumns: ["provisioning_owner"],
      identityConstraint: false,
    }),
    /identity provisioning audit schema is partially applied or drifted/,
  );
});

test("rejects trainer/training out-of-order markers before athlete upgrades", async () => {
  for (const tables of [
    [...BASELINE, ...TRAINING],
    [...BASELINE, TRAINER_IDENTITY_AUDIT],
    [...BASELINE, ...TRAINING, TRAINER_IDENTITY_AUDIT],
  ]) {
    await assert.rejects(
      resolve({ tables, group: true }),
      /training or trainer audit exists before Stammdaten baseline/,
    );
  }
});
