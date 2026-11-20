import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("P03-E canonical-erasure rehearsal stays completely disconnected from live ULC runtime", async () => {
  const read = async path => readFile(new URL("../" + path, import.meta.url), "utf8");
  const [rehearsal, entry, manifest, script, guard] = await Promise.all([
    read("apps/ulc-linz/worker/training-subject-marked-history-rehearsal.ts"),
    read("apps/ulc-linz/worker/index.ts"),
    read("apps/ulc-linz/appbasis.database.json"),
    read("apps/ulc-linz/package.json"),
    read("apps/ulc-linz/test/fixtures/p03-d-training-subject-write-fence.candidate.sql"),
  ]);
  assert.match(rehearsal, /class PostgresUlcMarkedTrainingHistoryRehearsalRepository/);
  assert.match(rehearsal, /SET TRANSACTION ISOLATION LEVEL READ COMMITTED/);
  assert.match(rehearsal, /pg_advisory_xact_lock/);
  assert.match(rehearsal, /hashtextextended/);
  assert.match(rehearsal, /FROM appbasis_athletes_deletion/);
  assert.match(rehearsal, /entity_type = 'athlete'/);
  assert.match(rehearsal, /FOR SHARE/);
  assert.match(rehearsal, /ON CONFLICT \(organization_id, athlete_id\) DO NOTHING/);
  assert.match(rehearsal, /AND canonical\.completed_at = app\.completed_at/);
  assert.match(rehearsal, /AND canonical\.purge_after = app\.purge_after/);
  for (const table of [
    "ulc_linz_training_attendance",
    "ulc_linz_training_registration",
    "ulc_linz_training_registration_change",
  ]) {
    assert.match(rehearsal, new RegExp("DELETE FROM " + table));
  }
  assert.doesNotMatch(entry, /training-subject-marked-history-rehearsal/);
  assert.doesNotMatch(entry, /PostgresUlcMarkedTrainingHistoryRehearsalRepository/);
  assert.match(script, /p03-e-marked-training-history\.postgres\.e2e\.test\.ts/);
  assert.match(guard, /UNREGISTERED/);
  const db = JSON.parse(manifest);
  const lifecycle = db.owners.find(owner => owner.id === "ulc-linz-lifecycle");
  assert.equal(lifecycle.schemaVersion, 18);
  assert.equal(lifecycle.migrations.at(-1),
    "apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql");
  assert.ok(db.owners.every(owner =>
    owner.migrations.every(path => !path.includes("p03-d-training-subject-write-fence"))
  ));
});
