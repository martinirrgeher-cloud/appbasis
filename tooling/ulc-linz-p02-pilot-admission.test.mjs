import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

import {
  evaluateUlcP02PilotAdmission,
  inspectUlcP02PilotAdmission,
  ULC_P02_COUNT_KEYS,
} from "./ulc-linz-p02-pilot-admission.mjs";

function baseline(overrides = {}) {
  return {
    catalog_items: 5,
    catalog_favorites: 1,
    catalog_usage: 0,
    catalog_private_media: 0,
    catalog_pending_media_delete: 0,
    blocks: 2,
    block_favorites: 0,
    block_usage: 3,
    block_usage_attributed: 0,
    block_usage_unattributed: 3,
    block_usage_notes: 0,
    block_usage_source_refs: 3,
    block_deleted_subject_markers: 0,
    documentation: 1,
    documentation_revisions: 1,
    documentation_deleted_subject_markers: 0,
    registrations: 9,
    registration_changes: 92,
    current_registration_notes: 0,
    historical_registration_notes: 0,
    ...overrides,
  };
}

function fakeSql({
  evidence = baseline(),
  database_name = "appbasis_ulc_linz_preview",
  principal_name = "appbasis_ulc_linz_preview_migration",
  public_tables = 66,
  catalog_favorite_guard_exists = false,
  catalog_subject_guard_exists = false,
} = {}) {
  const statements = [];
  let didBegin = false;
  return {
    statements,
    async begin(fn) {
      if (didBegin) throw new Error("Unexpected nested transaction");
      didBegin = true;
      return fn({
        async unsafe(sql) {
          statements.push(sql.trim());
          if (statements.length === 1) {
            assert.match(sql, /^SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/);
            return [];
          }
          if (statements.length === 2) return [{
            database_name, principal_name, public_tables,
            catalog_favorite_guard_exists, catalog_subject_guard_exists,
          }];
          if (statements.length === 3) return [evidence];
          throw new Error("Unexpected fourth SQL statement");
        },
      });
    },
  };
}

test("P02 current Preview data is classified, not interpreted as production approval", async () => {
  const sql = fakeSql();
  const result = await inspectUlcP02PilotAdmission(sql);
  assert.equal(result.status, "blocked");
  assert.equal(result.productionReady, false);
  assert.equal(result.mode, "aggregated-preview-readonly");
  assert.equal(result.changesApplied, false);
  assert.equal(result.dataImported, false);
  assert.equal(result.counts.block_usage, 3);
  assert.equal(result.counts.block_usage_unattributed, 3);
  assert.ok(result.findings.some(x =>
    x.code === "BLOCK_USAGE_UNATTRIBUTED" && x.count === 3
  ));
  assert.ok(result.findings.some(x => x.code === "P02_WRITER_AND_RESTORE_GATE"));
  assert.ok(result.findings.some(x => x.code === "P01_LEGAL_AND_PROVIDER_GATE"));
  assert.equal(sql.statements.length, 3);
  for (const query of sql.statements.slice(1)) {
    assert.match(query, /^SELECT\b/);
    assert.doesNotMatch(query, /\b(?:INSERT|DELETE|UPDATE|DROP|ALTER|CREATE|GRANT|TRUNCATE)\b/i);
  }
  assert.doesNotMatch(JSON.stringify(result), /p02-person|private-video-storage-key|actual-notes-content/);
});

test("a completely empty dataset is still blocked without P1/owner/restore evidence", () => {
  const clean = baseline(Object.fromEntries(
    ULC_P02_COUNT_KEYS.map(key => [key, 0]),
  ));
  const report = evaluateUlcP02PilotAdmission(clean);
  assert.equal(report.status, "blocked");
  assert.equal(report.productionReady, false);
  assert.deepEqual(report.findings.map(x => x.code), [
    "P01_LEGAL_AND_PROVIDER_GATE",
    "P02_WRITER_AND_RESTORE_GATE",
  ]);
});

test("potentially personal legacy notes, catalog media and historical registration notes are never inferred safe", () => {
  const report = evaluateUlcP02PilotAdmission(baseline({
    catalog_usage: 2,
    catalog_private_media: 1,
    catalog_pending_media_delete: 1,
    block_usage_notes: 2,
    current_registration_notes: 1,
    historical_registration_notes: 5,
  }));
  const found = report.findings.map(x => x.code);
  for (const mandatory of [
    "CATALOG_USAGE_UNVERIFIED",
    "CATALOG_PRIVATE_MEDIA",
    "BLOCK_USAGE_NOTES",
    "REGISTRATION_NOTES",
  ]) assert.ok(found.includes(mandatory), mandatory);
  assert.equal(report.findings.find(x => x.code === "REGISTRATION_NOTES").count, 6);
  assert.equal(report.productionReady, false);
});

test("zero unattributed usage requires all usage rows to have owner links", () => {
  const report = evaluateUlcP02PilotAdmission(baseline({
    block_usage: 3,
    block_usage_attributed: 3,
    block_usage_unattributed: 0,
  }));
  assert.equal(report.findings.some(x => x.code === "BLOCK_USAGE_UNATTRIBUTED"), false);
  assert.equal(report.status, "blocked");
});

test("guarded 68-table catalog transition is inspectable without allowing a release", async () => {
  const ready = await inspectUlcP02PilotAdmission(fakeSql({
    public_tables: 68,
    catalog_favorite_guard_exists: true,
    catalog_subject_guard_exists: true,
  }));
  assert.equal(ready.status, "blocked");
  for (const missing of [
    { catalog_favorite_guard_exists: false, catalog_subject_guard_exists: true },
    { catalog_favorite_guard_exists: true, catalog_subject_guard_exists: false },
  ]) {
    await assert.rejects(inspectUlcP02PilotAdmission(fakeSql({
      public_tables: 68,
      ...missing,
    })), /guarded 66\/68-table schema/);
  }
});

test("mismatched Preview database, migration role or table shape fail before touching data", async () => {
  const cases = [
    { database_name: "ulc_linz_k2_restore_20261118" },
    { principal_name: "appbasis_ulc_linz_preview_application" },
    { public_tables: 62 },
    { public_tables: 67 },
  ];
  for (const fixture of cases) {
    const sql = fakeSql(fixture);
    await assert.rejects(inspectUlcP02PilotAdmission(sql), /wrong Preview database, role or guarded 66\/68-table schema/);
    assert.equal(sql.statements.length, 2);
  }
  await assert.rejects(inspectUlcP02PilotAdmission(null), /transaction unavailable/);
});

test("absent, invalid or contradictory aggregate results are rejected", () => {
  const failCases = [
    null, {},
    baseline({ block_usage_unattributed: 2 }),
    baseline({ block_usage_attributed: 1 }),
    baseline({ block_usage_notes: 4 }),
    baseline({ catalog_pending_media_delete: 1 }),
    baseline({ historical_registration_notes: 93 }),
    baseline({ block_usage: -1 }),
    baseline({ block_usage: "1.5" }),
    baseline({ catalog_items: Number.MAX_SAFE_INTEGER + 1 }),
    baseline({ documentation_revisions: 0 }),
  ];
  for (const fixture of failCases) {
    assert.throws(() => evaluateUlcP02PilotAdmission(fixture), /blocked:/);
  }
  assert.equal(evaluateUlcP02PilotAdmission(baseline({
    block_usage: "3",
  })).counts.block_usage, 3);
});

test("only explicit read-only inspect operation is wired; no delete or provider permissions", async () => {
  const source = await readFile(
    new URL("./ulc-linz-p02-pilot-admission.mjs", import.meta.url), "utf8",
  );
  assert.match(source, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY/);
  assert.match(source, /process\.argv\[2\] !== "inspect"/);
  assert.doesNotMatch(source, /\b(?:pg_restore|ALTER TABLE|DROP TABLE|GRANT SELECT ON)\b/);
  assert.equal(ULC_P02_COUNT_KEYS.length, 20);
});
