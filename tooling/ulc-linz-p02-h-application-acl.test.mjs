import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const SQL = new URL("../apps/ulc-linz/test/fixtures/p02-h-application-privileges.candidate.sql", import.meta.url);
export const RIGHTS = Object.freeze({
  appbasis_athlete_contact: "SELECT, INSERT, UPDATE, DELETE",
  appbasis_exercise_catalog_favorite_deletion: "SELECT",
  appbasis_exercise_catalog_usage_subject: "SELECT, INSERT",
  appbasis_training_block_favorite_deletion: "SELECT",
  appbasis_training_block_usage_subject: "SELECT, INSERT",
  appbasis_training_block_usage_subject_deletion: "SELECT",
  appbasis_training_documentation: "SELECT, INSERT, UPDATE",
  appbasis_training_documentation_revision: "SELECT, INSERT",
  appbasis_training_documentation_subject_deletion: "SELECT",
  appbasis_training_plan_subject_deletion: "SELECT",
  ulc_linz_registration_calendar_exception: "SELECT, INSERT, UPDATE",
  ulc_linz_registration_calendar_rule: "SELECT, INSERT, UPDATE",
  ulc_linz_training_registration: "SELECT, INSERT, UPDATE",
  ulc_linz_training_registration_change: "SELECT, INSERT",
  ulc_linz_training_trainer_attendance: "SELECT, INSERT, UPDATE, DELETE",
  ulc_linz_youth_content_category: "SELECT, INSERT, UPDATE",
  ulc_linz_youth_group_category: "SELECT, INSERT, UPDATE",
});
export const DENIED_MARKER_TABLE = "ulc_linz_training_subject_deletion";
const NEW_SCHEMA_TABLE_COUNT = 18;

export function parseCandidatePrivileges(source) {
  const grants = source.split("--> statement-breakpoint")
    .map(part => part.replace(/^\s*(?:--[^\n]*(?:\n|$)\s*)+/g, "").trim())
    .filter(Boolean);
  if (grants.length !== Object.keys(RIGHTS).length) throw new Error("P02-H grant count drift");
  const map = {};
  for (const grant of grants) {
    const match = grant.match(/^GRANT (SELECT(?:, INSERT)?(?:, UPDATE)?(?:, DELETE)?) ON TABLE public\.([a-z][a-z_0-9]*) TO ulc_linz_application;$/);
    if (!match) throw new Error("P02-H grant has disallowed shape");
    if (Object.hasOwn(map, match[2])) throw new Error("P02-H repeated table grant");
    map[match[2]] = match[1];
  }
  assert.deepEqual(map, RIGHTS, "P02-H grants must remain exactly the reviewed operation matrix");
  assert.ok(!Object.hasOwn(map, DENIED_MARKER_TABLE));
  return Object.freeze(map);
}

test("P02-H production application ACL candidate has no wildcard, no marker DML and exactly 17 owner-grants", async () => {
  const sql = await readFile(SQL, "utf8");
  assert.match(sql, /candidate only/);
  assert.doesNotMatch(sql, /\b(?:GRANT ALL|GRANT [^;\n]+ TO PUBLIC|REVOKE|ALTER DEFAULT PRIVILEGES|GRANT .*TRUNCATE|GRANT .*REFERENCES|GRANT .*TRIGGER)\b/i);
  const parsed = parseCandidatePrivileges(sql);
  assert.equal(Object.keys(parsed).length, NEW_SCHEMA_TABLE_COUNT - 1);
  for (const name of [
    "appbasis_exercise_catalog_favorite_deletion",
    "appbasis_training_block_favorite_deletion",
    "appbasis_training_block_usage_subject_deletion",
    "appbasis_training_documentation_subject_deletion",
    "appbasis_training_plan_subject_deletion",
  ]) {
    assert.equal(parsed[name], "SELECT", name + ": ordinary app may only read erasure markers");
  }
  assert.equal(parsed.appbasis_training_documentation_revision, "SELECT, INSERT");
  assert.equal(parsed.ulc_linz_training_registration_change, "SELECT, INSERT");
  assert.equal(parsed.ulc_linz_training_trainer_attendance, "SELECT, INSERT, UPDATE, DELETE");
});

test("P02-H cannot accidentally activate candidate SQL or a privileged erasure coordinator", async () => {
  const manifest = JSON.parse(await readFile(new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url), "utf8"));
  assert.equal(manifest.owners.find(o => o.id === "ulc-linz-lifecycle")?.schemaVersion, 19);
  assert.ok(manifest.owners.every(owner => owner.migrations.every(path => !path.includes("p02-h-application-privileges"))));
  const entry = await readFile(new URL("../apps/ulc-linz/worker/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(entry, /training-subject-marked-history-rehearsal/);
});
