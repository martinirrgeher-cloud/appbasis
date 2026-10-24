import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  applyUlcAttendancePreview,
  assertUlcAttendancePreviewEnvironment,
  classifyUlcAttendancePreviewShape,
  loadUlcAttendancePreviewPlan,
  UlcAttendancePreviewExecutionError,
} from "./ulc-linz-attendance-preview.mjs";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const HOST = "ep-ulc-preview.eu-central-1.aws.neon.tech";
const DATABASE = "appbasis_ulc_linz_preview";
const MIGRATION_URL =
  `postgresql://appbasis_ulc_linz_preview_migration:owner-password@${HOST}/${DATABASE}?sslmode=require`;
const APPLICATION_URL =
  `postgresql://appbasis_ulc_linz_preview_app:app-password@${HOST}/${DATABASE}?sslmode=require`;
const SECURITY_URL =
  `postgresql://appbasis_ulc_linz_preview_security_ingest:security-password@${HOST}/${DATABASE}?sslmode=require`;

const BASELINE_TABLES = [
  "appbasis_training_group",
  "appbasis_athlete",
  "appbasis_athlete_contact",
  "ulc_linz_training_session",
  "ulc_linz_training_attendance",
  "ulc_linz_training_module_group",
  "ulc_linz_exercise_catalog_item",
  "appbasis_training_block",
  "appbasis_training_block_revision",
  "appbasis_training_plan",
  "appbasis_training_plan_revision",
];

test("attendance preview plan pins only the athletes-v4 and lifecycle-v9 deltas", async () => {
  const plan = await loadUlcAttendancePreviewPlan({ repositoryRoot });

  assert.equal(plan.application, "ulc-linz");
  assert.deepEqual(plan.baseline, {
    athletesSchemaVersion: 3,
    lifecycleSchemaVersion: 8,
  });
  assert.deepEqual(plan.target, {
    athletesSchemaVersion: 4,
    lifecycleSchemaVersion: 9,
    migrations: [
      "modules/athletes/migrations/0003_appbasis_training_group_attendance_mode.sql",
      "apps/ulc-linz/migrations/0008_ulc_linz_session_registration.sql",
    ],
  });
  assert.equal(plan.migrations.length, 2);
  assert.equal(plan.migrations[0].ownerId, "athletes");
  assert.equal(plan.migrations[1].ownerId, "ulc-linz-lifecycle");
  assert.ok(plan.migrations.every((migration) => migration.statements.length > 0));
  assert.equal(plan.productionChanged, false);
});

test("attendance preview shape distinguishes absent, current and partial targets", () => {
  const absent = {
    attendanceModeColumn: false,
    attendanceModeConstraint: false,
    registrationTable: false,
    registrationChangeTable: false,
    registrationIndex: false,
    registrationChangeIndex: false,
  };
  const current = Object.fromEntries(
    Object.keys(absent).map((key) => [key, true]),
  );

  assert.equal(classifyUlcAttendancePreviewShape(absent), "migration-required");
  assert.equal(classifyUlcAttendancePreviewShape(current), "current");
  assert.throws(
    () =>
      classifyUlcAttendancePreviewShape({
        ...absent,
        attendanceModeColumn: true,
      }),
    UlcAttendancePreviewExecutionError,
  );
});

test("attendance preview applies both deltas atomically on the established E7B9 baseline", async () => {
  const state = {
    attendanceModeColumn: false,
    attendanceModeConstraint: false,
    registrationTable: false,
    registrationChangeTable: false,
    registrationIndex: false,
    registrationChangeIndex: false,
  };
  let beginCount = 0;
  let ended = false;
  const executed = [];

  const unsafe = async (sql) => {
    executed.push(sql);
    if (sql.startsWith("SELECT current_database()")) {
      return [
        {
          database_name: DATABASE,
          principal_name: "appbasis_ulc_linz_preview_migration",
        },
      ];
    }
    if (sql.includes("FROM pg_catalog.pg_tables")) {
      const tables = [...BASELINE_TABLES];
      if (state.registrationTable) tables.push("ulc_linz_training_registration");
      if (state.registrationChangeTable) {
        tables.push("ulc_linz_training_registration_change");
      }
      return tables.sort().map((tablename) => ({ tablename }));
    }
    if (sql.includes("AS attendance_mode_column")) {
      return [
        {
          attendance_mode_column: state.attendanceModeColumn,
          attendance_mode_constraint: state.attendanceModeConstraint,
          registration_table: state.registrationTable,
          registration_change_table: state.registrationChangeTable,
          registration_index: state.registrationIndex,
          registration_change_index: state.registrationChangeIndex,
        },
      ];
    }
    if (
      sql.includes("ALTER TABLE appbasis_training_group") &&
      sql.includes("ADD COLUMN attendance_mode")
    ) {
      state.attendanceModeColumn = true;
      state.attendanceModeConstraint = true;
      return [];
    }
    if (sql.includes("CREATE TABLE ulc_linz_training_registration (")) {
      state.registrationTable = true;
      return [];
    }
    if (sql.includes("CREATE TABLE ulc_linz_training_registration_change (")) {
      state.registrationChangeTable = true;
      return [];
    }
    if (
      sql.includes(
        "CREATE INDEX ulc_linz_training_registration_org_athlete_idx",
      )
    ) {
      state.registrationIndex = true;
      return [];
    }
    if (
      sql.includes(
        "CREATE INDEX ulc_linz_training_registration_change_org_idx",
      )
    ) {
      state.registrationChangeIndex = true;
      return [];
    }
    return [];
  };

  const result = await applyUlcAttendancePreview(
    {
      migrationDatabaseUrl: MIGRATION_URL,
      applicationDatabaseUrl: APPLICATION_URL,
      securityLogDatabaseUrl: SECURITY_URL,
      repositoryRoot,
      apply: true,
    },
    {
      databaseFactory: () => ({
        client: {
          async begin(callback) {
            beginCount += 1;
            await callback({ unsafe });
          },
          unsafe,
          async end() {
            ended = true;
          },
        },
      }),
    },
  );

  assert.equal(result.state, "applied");
  assert.equal(result.migrationCount, 2);
  assert.equal(result.statementCount, 5);
  assert.equal(beginCount, 1);
  assert.equal(ended, true);
  assert.ok(
    executed.some((sql) =>
      sql.includes("ulc-linz:preview-attendance-upgrade"),
    ),
  );
  assert.equal(
    classifyUlcAttendancePreviewShape(state),
    "current",
  );
});

test("attendance preview mutation requires both explicit approval flags", () => {
  assert.doesNotThrow(() =>
    assertUlcAttendancePreviewEnvironment({
      APPBASIS_GENERATED_APP_ID: "ulc-linz",
      APPBASIS_MIGRATION_TARGET: DATABASE,
      APPBASIS_APPLY_MIGRATIONS: "1",
      APPBASIS_APPLY_ATTENDANCE_PREVIEW: "1",
    }),
  );

  assert.throws(
    () =>
      assertUlcAttendancePreviewEnvironment({
        APPBASIS_GENERATED_APP_ID: "ulc-linz",
        APPBASIS_MIGRATION_TARGET: DATABASE,
        APPBASIS_APPLY_MIGRATIONS: "1",
        APPBASIS_APPLY_ATTENDANCE_PREVIEW: "0",
      }),
    /explicit attendance approval/,
  );
});
