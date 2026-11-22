import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import { executeUlcLifecycleRepairTransaction } from "./ulc-linz-lifecycle-schema-preview.mjs";
import {
  inspectUlcLifecycleSchema,
  loadUlcLifecycleRepairPlan,
  ULC_LIFECYCLE_REPAIR_PATHS,
} from "./ulc-linz-lifecycle-schema-reconcile.mjs";

const DATABASE_URL = process.env.DATABASE_URL;

test("P04: three canonical lifecycle migrations reconcile an existing partial Preview-like schema atomically", {
  skip: !DATABASE_URL,
  timeout: 80_000,
}, async () => {
  // ALWAYS a disposable, separately created CI database. No Preview or Production.
  const admin = createPostgresDatabase(DATABASE_URL);
  const name = "ulc_p04_lifecycle_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const url = new URL(DATABASE_URL);
  url.pathname = "/" + name;
  let database;
  let created = false;
  try {
    await admin.client.unsafe("CREATE DATABASE " + name);
    created = true;
    database = createPostgresDatabase(url.toString());
    const manifest = JSON.parse(await readFile(
      new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url),
      "utf8",
    ));
    const migrations = manifest.owners.flatMap(owner => owner.migrations);
    assert.equal(migrations.length, 45);
    // The v7 attribution trigger depends on a subject table deliberately
    // missing from this historical three-migration rehearsal baseline.
    const laterGuard =
      "modules/training-blocks/migrations/0006_appbasis_training_block_usage_subject_tombstone_guard.sql";
    assert.ok(migrations.includes(laterGuard));
    const omitted = new Set([...ULC_LIFECYCLE_REPAIR_PATHS, laterGuard]);
    assert.equal(omitted.size, 4);

    // Install every existing canonical migration except the three missing
    // ones: a realistic already-populated repository baseline.
    for (const filename of migrations) {
      if (omitted.has(filename)) continue;
      const sql = await readFile(new URL("../" + filename, import.meta.url), "utf8");
      for (const statement of sql.split("--> statement-breakpoint")) {
        if (statement.trim()) await database.client.unsafe(statement);
      }
    }
    const before = await inspectUlcLifecycleSchema(database.client);
    assert.equal(before.state, "migration-required");
    assert.deepEqual(before.requiredMigrations, ULC_LIFECYCLE_REPAIR_PATHS);

    await database.client.unsafe(
      `INSERT INTO appbasis_athlete
        (id, organization_id, first_name, last_name)
       VALUES ('p04-safe-neighbor', 'p04-org', 'Neighbor', 'Safe')`,
    );

    const plan = await loadUlcLifecycleRepairPlan();
    assert.deepEqual(plan.map(migration => migration.path), ULC_LIFECYCLE_REPAIR_PATHS);

    // A failure inside the proposed transaction must leave all target DDL
    // absent, and the real pre-existing athlete untouched.
    await assert.rejects(
      database.client.begin(async transaction => {
        for (const statement of plan[0].statements) {
          await transaction.unsafe(statement);
        }
        throw new Error("P04_SYNTHETIC_ROLLBACK");
      }),
      /P04_SYNTHETIC_ROLLBACK/,
    );
    assert.equal((await inspectUlcLifecycleSchema(database.client)).state,
      "migration-required");

    // Rehearse the 3 existing files exactly, without editing their SQL.
    assert.equal(
      await executeUlcLifecycleRepairTransaction(database.client, plan),
      "applied",
    );
    assert.equal(
      await executeUlcLifecycleRepairTransaction(database.client, plan),
      "already-current",
    );
    const after = await inspectUlcLifecycleSchema(database.client);
    assert.equal(after.state, "current");
    assert.deepEqual(after.requiredMigrations, []);
    // The independent v7 tombstone-guard migration can only be applied
    // after the deliberately missing v6 subject attribution table exists.
    const guardSql = await readFile(
      new URL("../" + laterGuard, import.meta.url), "utf8",
    );
    for (const statement of guardSql.split("--> statement-breakpoint")) {
      if (statement.trim()) await database.client.unsafe(statement);
    }
    const guarded = await database.client.unsafe(
      "SELECT count(*)::int AS count FROM pg_catalog.pg_trigger " +
      "WHERE tgname='appbasis_training_block_usage_subject_tombstone_guard' AND tgenabled='O'",
    );
    assert.deepEqual(guarded, [{ count: 1 }]);
    const retained = await database.client.unsafe(
      "SELECT first_name FROM appbasis_athlete WHERE id = 'p04-safe-neighbor'",
    );
    assert.equal(retained[0]?.first_name, "Neighbor");

    // The newly installed v2 documentation SQL must block an unauthorized
    // direct document INSERT after an actual module-local subject marker.
    await database.client.unsafe(
      `INSERT INTO appbasis_training_documentation_subject_deletion
         (organization_id, subject_id, completed_at, purge_after)
       VALUES ('p04-org', 'p04-erased', now(), now() + interval '35 days')`,
    );
    await assert.rejects(
      database.client.unsafe(
        `INSERT INTO appbasis_training_documentation
          (id, organization_id, subject_id, session_date, source_plan_id, source_plan_revision)
         VALUES ('p04-doc', 'p04-org', 'p04-erased', '2026-11-18', 'p04-plan', 1)`,
      ),
      /deletion marker/,
    );

    // A partially lost schema is NEVER repaired by guessing or re-applying
    // three CREATE migration files against a half-installed production DB.
    await database.client.unsafe(
      "DROP TABLE appbasis_training_block_favorite_deletion",
    );
    await assert.rejects(inspectUlcLifecycleSchema(database.client),
      /partial or drifted/);
  } finally {
    if (database) await database.client.end().catch(() => {});
    if (created) await admin.client.unsafe("DROP DATABASE " + name + " WITH (FORCE)");
    await admin.client.end().catch(() => {});
  }
});
