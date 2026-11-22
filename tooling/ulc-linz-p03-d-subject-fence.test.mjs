import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const CANDIDATE =
  "../apps/ulc-linz/test/fixtures/p03-d-training-subject-write-fence.candidate.sql";
const GUARDED_TABLES = [
  "ulc_linz_training_attendance",
  "ulc_linz_training_registration",
  "ulc_linz_training_registration_change",
];

test("P03-D pins app-owned published subject deletion fence and no-resurrection writers", async () => {
  const sql = await readFile(new URL(CANDIDATE, import.meta.url), "utf8");
  const appManifest = JSON.parse(await readFile(
    new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url), "utf8"
  ));
  const lifecycle = appManifest.owners.find(owner => owner.id === "ulc-linz-lifecycle");
  assert.equal(lifecycle?.schemaVersion, 19);
  assert.equal(lifecycle?.migrations.length, 19);
  const canonical = "../apps/ulc-linz/migrations/0017_ulc_linz_training_subject_write_fence.sql";
  assert.equal(lifecycle.migrations.includes(canonical.slice(3)), true);
  assert.equal(lifecycle.migrations.at(-1),
    "apps/ulc-linz/migrations/0018_ulc_linz_training_subject_isolation_reconciliation.sql");
  assert.equal((await readFile(new URL(canonical,import.meta.url),"utf8")).split("--> statement-breakpoint").length,6);
  assert.equal(lifecycle?.migrations.includes(CANDIDATE.slice(3)), false);
  assert.match(sql, /CANDIDATE ONLY/);
  assert.match(sql, /UNREGISTERED/);
  assert.match(sql, /CREATE TABLE ulc_linz_training_subject_deletion/);
  assert.match(sql, /840 hours/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = pg_catalog, pg_temp/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /FROM public\.ulc_linz_training_session/);
  assert.match(sql, /FOR KEY SHARE/);
  assert.match(sql, /REVOKE ALL ON FUNCTION/);
  assert.match(sql, /NEW.organization_id IS DISTINCT FROM OLD.organization_id/);
  assert.match(sql, /NEW.athlete_id IS DISTINCT FROM OLD.athlete_id/);
  const triggerTargets = [...sql.matchAll(/\bCREATE TRIGGER\s+\w+[\s\S]*?\bON\s+(ulc_linz_[a-z_]+)/gi)]
    .map(match => match[1]).sort();
  assert.deepEqual(triggerTargets, [...GUARDED_TABLES].sort());
  assert.equal((sql.match(/\bCREATE FUNCTION\b/g) ?? []).length, 1);
  assert.equal((sql.match(/\bCREATE TABLE\b/g) ?? []).length, 1);
  assert.equal((sql.match(/\bCREATE TRIGGER\b/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /\b(?:GRANT|DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
});
