import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const MODULE_CANDIDATE =
  "../modules/exercise-catalog/migrations/0004_appbasis_exercise_catalog_subject_lifecycle.sql";
const FIXTURES = [
  "../apps/ulc-linz/test/fixtures/p02-g-catalog-favorite-erasure-marker.candidate.sql",
  "../apps/ulc-linz/test/fixtures/p02-h-catalog-usage-subject.candidate.sql",
];

export function sqlStatements(sql) {
  return sql.split("--> statement-breakpoint").map(part =>
    part.replace(/^\s*--(?!>)[^\n]*(?:\n|$)/gm, "").trim()
  ).filter(Boolean);
}

test("P2-F stages both original protected catalog guards under the correct module owner", async () => {
  const candidate = await readFile(new URL(MODULE_CANDIDATE, import.meta.url), "utf8");
  const originals = await Promise.all(FIXTURES.map(path =>
    readFile(new URL(path, import.meta.url), "utf8")
  ));
  const expected = originals.flatMap(sqlStatements);
  const actual = sqlStatements(candidate);
  assert.deepEqual(actual, expected,
    "module migration must preserve the already PostgreSQL-tested guard DDL exactly");
  assert.equal(actual.length, 3);
  assert.equal((candidate.match(/\bCREATE TABLE\b/g) ?? []).length, 2);
  assert.match(candidate, /REVIEW ONLY/);
  assert.match(candidate, /NOT registered/);
  assert.doesNotMatch(candidate, /\b(?:GRANT|DROP TABLE|TRUNCATE|DELETE FROM)\b/i);
  assert.ok(actual.some(sql => sql.includes("appbasis_exercise_catalog_favorite_deletion")));
  assert.ok(actual.some(sql => sql.includes("appbasis_exercise_catalog_usage_subject_usage_fk")));

  const moduleManifest = JSON.parse(await readFile(
    new URL("../modules/exercise-catalog/appbasis.module.json", import.meta.url), "utf8"
  ));
  const appManifest = JSON.parse(await readFile(
    new URL("../apps/ulc-linz/appbasis.database.json", import.meta.url), "utf8"
  ));
  const path = MODULE_CANDIDATE.slice(3);
  assert.equal(moduleManifest.database.schemaVersion, 4,
    "v5 is not implicitly published");
  assert.equal(moduleManifest.database.migrations.includes(path), false);
  const appOwner = appManifest.owners.find(owner => owner.id === "exercise-catalog");
  assert.equal(appOwner?.schemaVersion, 4);
  assert.equal(appOwner.migrations.includes(path), false);
  for (const fixture of FIXTURES) {
    assert.equal(appOwner.migrations.includes(fixture.slice(3)), false);
  }
});
