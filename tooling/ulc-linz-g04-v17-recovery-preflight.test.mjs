import assert from "node:assert/strict";
import test from "node:test";
import {
  G04PreviewRecoveryPreflightError,
  validateG04V17PreviewRecoveryPreflight,
} from "./ulc-linz-g04-v17-recovery-preflight.mjs";

const sourceHost = "ep-test-ulc-preview.eu-central-1.aws.neon.tech";
const restoreHost = "ep-test-ulc-restore.eu-central-1.aws.neon.tech";
const url = (host, db, user, ssl = "require") =>
  "postgresql://" + user + ":test-secret@" + host + ":5432/" + db +
  "?sslmode=" + ssl;
const sourceDb = "appbasis_ulc_linz_preview";
const good = () => ({
  migrationDatabaseUrl: url(sourceHost, sourceDb, "appbasis_ulc_linz_preview_migration"),
  applicationDatabaseUrl: url(sourceHost, sourceDb, "appbasis_ulc_linz_preview_app"),
  securityLogDatabaseUrl: url(sourceHost, sourceDb, "appbasis_ulc_linz_preview_security"),
  restoreDatabaseUrl: url(restoreHost, "appbasis_ulc_linz_g04_restore_rehearsal", "g04_restore_operator"),
});

test("G-04.3 permits only independently isolated Preview restore preflight, never apply", () => {
  const result = validateG04V17PreviewRecoveryPreflight(good());
  assert.deepEqual(result, {
    status: "preflight-only-requires-operator-and-controller-approval",
    environment: "generated-preview-ulc-linz",
    sourceDatabase: sourceDb,
    restoreDatabase: "appbasis_ulc_linz_g04_restore_rehearsal",
    sourceAndRestoreOriginsDistinct: true,
    sourceSchemaRequired: 16,
    targetSchemaProposed: 17,
    authorizedToBackup: false,
    authorizedToRestore: false,
    authorizedToMigrate: false,
    authorizedToDeploy: false,
    productionChanged: false,
  });
  assert.equal(JSON.stringify(result).includes("test-secret"), false);
});

test("G-04.3 rejects identical, pooled, remote-untrusted, production and weak-SSL targets", () => {
  const bad = [
    (v) => { v.restoreDatabaseUrl = v.migrationDatabaseUrl; },
    (v) => { v.restoreDatabaseUrl = url(sourceHost, "appbasis_ulc_linz_g04_restore_rehearsal", "different"); },
    (v) => { v.restoreDatabaseUrl = url("ep-test-ulc-restore-pooler.eu-central-1.aws.neon.tech", "appbasis_ulc_linz_g04_restore_rehearsal", "different"); },
    (v) => { v.restoreDatabaseUrl = url("db.example.com", "appbasis_ulc_linz_g04_restore_rehearsal", "different"); },
    (v) => { v.restoreDatabaseUrl = url(restoreHost, "production", "different"); },
    (v) => { v.restoreDatabaseUrl = url(restoreHost, sourceDb, "different"); },
    (v) => { v.restoreDatabaseUrl = url(restoreHost, "appbasis_ulc_linz_g04_restore_rehearsal", "g04_restore_operator", "prefer"); },
    (v) => { v.migrationDatabaseUrl = url(sourceHost, sourceDb, "appbasis_ulc_linz_preview_migration", "disable"); },
    (v) => { v.restoreDatabaseUrl += "&sslmode=require"; },
    (v) => { v.restoreDatabaseUrl += "&database=appbasis_ulc_linz_preview"; },
    (v) => { v.restoreDatabaseUrl += "#ignored"; },
    (v) => { v.applicationDatabaseUrl = url(restoreHost, sourceDb, "appbasis_ulc_linz_preview_app"); },
    (v) => { v.restoreDatabaseUrl = url(restoreHost, "appbasis_ulc_linz_g04_restore_rehearsal", "appbasis_ulc_linz_preview_app"); },
    (v) => { v.securityLogDatabaseUrl = undefined; },
    (v) => { v.restoreDatabaseUrl = undefined; },
  ];
  for (const change of bad) {
    const input = good();
    change(input);
    assert.throws(() => validateG04V17PreviewRecoveryPreflight(input),
      G04PreviewRecoveryPreflightError);
  }
});

test("G-04.3 never performs provider writes or fills pending v17 evidence", () => {
  const output = validateG04V17PreviewRecoveryPreflight(good());
  assert.equal(output.authorizedToBackup, false);
  assert.equal(output.authorizedToRestore, false);
  assert.equal(output.authorizedToMigrate, false);
  assert.equal(output.authorizedToDeploy, false);
});
