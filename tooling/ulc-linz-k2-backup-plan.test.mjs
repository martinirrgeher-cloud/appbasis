import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ulcBackupPlan,
  ULC_REQUIRED_OWNER_TABLES,
  ulcRequiredOwnerSchemaSql,
  ulcR2Endpoint,
  assertUlcBackupBucket,
  assertUlcNeonDatabaseUrl,
  assertUlcBackupSourceDatabase,
  assertIsolatedUlcRestoreTarget,
  assertUlcBackupKey,
  assertUlcBackupR2Lifecycle,
} from "./ulc-linz-k2-backup-plan.mjs";

const SOURCE = "postgresql://readonly:secret@ep-ulcprod.aws-eu-central-1.neon.tech/neondb?sslmode=require";
const RESTORE = "postgresql://restore:secret@ep-ulcrestore.aws-eu-central-1.neon.tech/neondb?sslmode=require";

test("ULC backup keys are daily, app-isolated, date-bound and immutable by convention", () => {
  const plan = ulcBackupPlan(new Date("2026-11-14T17:05:00.000Z"), "appbasis_ulc_linz_preview");
  assert.deepEqual(plan, {
    schemaVersion: 1,
    appId: "ulc-linz",
    kind: "daily",
    createdAt: "2026-11-14T17:05:00.000Z",
    date: "2026-11-14",
    databaseName: "appbasis_ulc_linz_preview",
    key: "appbasis/ulc-linz/pilot/db/appbasis_ulc_linz_preview/daily/2026-11-14.tar.aesgcm",
  });
  assert.equal(assertUlcBackupKey(plan.key, "appbasis_ulc_linz_preview"), plan.key);
  assert.throws(() => assertUlcBackupKey(plan.key, "appbasis_ulc_linz_production"), /approved database scope/);
  assert.throws(() => ulcBackupPlan(new Date(), ""), /missing or invalid/);
  assert.throws(() => ulcBackupPlan(new Date("bad"), "appbasis_ulc_linz_preview"), /timestamp/);
  assert.throws(() => assertUlcBackupKey("appbasis/m3-preview/m4/daily/2026-11-14.tar.aesgcm", "appbasis_ulc_linz_preview"), /approved database scope/);
});

test("ULC exports require an explicit Neon TLS source and a distinct branch endpoint", () => {
  assert.equal(assertUlcNeonDatabaseUrl(SOURCE), true);
  assert.equal(assertIsolatedUlcRestoreTarget(SOURCE, RESTORE), true);
  assert.throws(() => assertIsolatedUlcRestoreTarget(SOURCE, SOURCE), /separate/);
  assert.throws(() => assertIsolatedUlcRestoreTarget(SOURCE, SOURCE.replace("neondb?", "anotherdb?")), /separate/);
  assert.throws(() => assertUlcNeonDatabaseUrl("postgres://role@localhost/db?sslmode=require"), /Neon/);
  assert.throws(() => assertUlcNeonDatabaseUrl(SOURCE.replace("sslmode=require", "sslmode=disable")), /Neon/);
});

test("ULC backups require a dedicated EU-bound R2 endpoint", () => {
  assert.equal(ulcR2Endpoint("a".repeat(32), "eu"), "https://"+"a".repeat(32)+".eu.r2.cloudflarestorage.com");
  assert.throws(() => ulcR2Endpoint("a".repeat(32), "default"), /EU-jurisdiction/);
  assert.equal(assertUlcBackupBucket("ulc-linz-pilot-backup"), "ulc-linz-pilot-backup");
  assert.throws(() => assertUlcBackupBucket("ULC Backup"), /invalid/);
});

test("rejects noncanonical object names and other app scopes", () => {
  for (const name of [
    "../appbasis/ulc-linz/pilot/db/appbasis_ulc_linz_preview/daily/2026-11-14.tar.aesgcm",
    "appbasis/ulc-linz/pilot/db/appbasis_ulc_linz_preview/daily/2026-02-30.tar.aesgcm",
    "appbasis/ulc-linz/pilot/db/appbasis_ulc_linz_preview/weekly/2026-11-14.tar.aesgcm",
    "appbasis/ulc-linz/pilot/db/appbasis_ulc_linz_preview/daily/2026-11-14.sql",
  ]) assert.throws(() => assertUlcBackupKey(name, "appbasis_ulc_linz_preview"));
});

test("ULC backup and restore require all eight installed data owners", () => {
  assert.equal(ULC_REQUIRED_OWNER_TABLES.length, 8);
  assert.equal(new Set(ULC_REQUIRED_OWNER_TABLES).size, 8);
  const sql = ulcRequiredOwnerSchemaSql();
  assert.ok(sql.startsWith("SELECT "));
  for (const table of ULC_REQUIRED_OWNER_TABLES) {
    assert.ok(sql.includes('to_regclass(\'public."' + table + '"\') IS NOT NULL'));
  }
  assert.equal((sql.match(/to_regclass/g) || []).length, 8);
  assert.ok(sql.includes('public."user"'), "reserved identity table must be quoted");
});

test("source database must match the exact approved logical ULC database", () => {
  const preview = SOURCE.replace("/neondb?", "/appbasis_ulc_linz_preview?");
  assert.equal(assertUlcBackupSourceDatabase(preview, "appbasis_ulc_linz_preview"), true);
  assert.throws(() => assertUlcBackupSourceDatabase(SOURCE, "appbasis_ulc_linz_preview"), /does not match/);
  assert.throws(() => assertUlcBackupSourceDatabase(preview, ""), /missing or invalid/);
  assert.throws(() => assertUlcBackupSourceDatabase(preview, "../ulc"), /missing or invalid/);
});

test("K2 manual preflight cannot enable scheduled backups or write an R2 object", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ulc-linz-k2-encrypted-backup.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /if \[\[ "\$GITHUB_EVENT_NAME" == "schedule" \]\]/);
  assert.match(workflow, /if \[\[ "\$ENABLED" != "1" \]\]/);
  assert.match(workflow, /elif \[\[ "\$GITHUB_EVENT_NAME" == "workflow_dispatch" \]\]/);
  assert.match(workflow, /if \[\[ "\$MANUAL_APPLY" == "true" \]\]/);
  assert.match(workflow, /echo "run=preflight" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /if: steps\.gate\.outputs\.run == 'preflight'/);
  assert.match(workflow, /name: Store immutable ciphertext and verify provider metadata\n\s+if: steps\.gate\.outputs\.run == 'upload'/);
  assert.match(workflow, /if: always\(\) && steps\.setup\.outputs\.workspace != ''/);
  assert.doesNotMatch(workflow, /if: steps\.gate\.outputs\.run == '1'/);
});

test("K2 owner-schema SQL is exported into both PostgreSQL Docker containers", () => {
  for (const workflowName of [
    "ulc-linz-k2-encrypted-backup.yml",
    "ulc-linz-k2-isolated-restore.yml",
  ]) {
    const workflow = readFileSync(
      new URL("../.github/workflows/" + workflowName, import.meta.url),
      "utf8",
    );
    assert.match(
      workflow,
      /export ULC_REQUIRED_SCHEMA_SQL="\$\(node \.\/tooling\/ulc-linz-k2-backup-plan\.mjs schema-sql\)"/,
      workflowName + " must export the schema query",
    );
    assert.match(
      workflow,
      /--env ULC_REQUIRED_SCHEMA_SQL \\/,
      workflowName + " must forward the exported schema query to Docker",
    );
    assert.doesNotMatch(
      workflow,
      /(?<!export )ULC_REQUIRED_SCHEMA_SQL="\$\(node \.\/tooling\/ulc-linz-k2-backup-plan\.mjs schema-sql\)"/,
      workflowName + " must not create a shell-only variable",
    );
  }
});

test("K2 restore apply=false verifies the ciphertext without requiring an empty quarantine database", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ulc-linz-k2-isolated-restore.yml", import.meta.url),
    "utf8",
  );

  const preflight = workflow.split("      - name: Create private workspace and download ciphertext")[0];
  assert.match(preflight, /node \.\/tooling\/ulc-linz-k2-backup-plan\.mjs targets/);
  assert.match(preflight, /node \.\/tooling\/ulc-linz-k2-backup-plan\.mjs bucket/);
  assert.match(preflight, /aws s3api head-bucket/);
  assert.doesNotMatch(preflight, /ULC_RESTORE_SQL|ULC K2 quarantine target already has tables/);

  const archiveIndex = workflow.indexOf("      - name: Authenticate archive and validate isolated manifest");
  const dumpIndex = workflow.indexOf("      - name: Verify dump is readable by PostgreSQL 18");
  const guardIndex = workflow.indexOf("      - name: Check quarantine is empty immediately before approved restore");
  const restoreIndex = workflow.indexOf("      - name: Restore only into the verified empty quarantine database");
  assert.ok(archiveIndex > 0 && dumpIndex > archiveIndex && guardIndex > dumpIndex &&
    restoreIndex > guardIndex, "archive verification precedes the actual restore-only guard");

  const guarded = workflow.slice(guardIndex, restoreIndex);
  assert.match(guarded, /if: \$\{\{ inputs\.apply == true \}\}/);
  assert.match(guarded, /ULC_RESTORE_SQL=SELECT count\(\*\) FROM pg_class/);
  assert.match(guarded, /test "\$EMPTY" = "0" \|\|/);
  assert.match(guarded, /quarantine target already has tables; stop without changes/);

  const writer = workflow.slice(restoreIndex);
  assert.match(writer, /if: inputs\.apply == true/);
  assert.match(writer, /pg_restore --single-transaction --no-owner --no-acl --exit-on-error/);
  assert.doesNotMatch(preflight, /pg_restore --single-transaction/);
});

test("disabled scheduled K2 backups fail visibly instead of falsely reporting success", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ulc-linz-k2-encrypted-backup.yml", import.meta.url),
    "utf8",
  );
  const scheduledGate = workflow.split('if [[ "$GITHUB_EVENT_NAME" == "schedule" ]]')[1]
    ?.split('elif [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]')[0];
  assert.ok(scheduledGate, "scheduled gate must exist");
  assert.match(scheduledGate, /SCHEDULED BACKUP FAILED/);
  assert.match(scheduledGate, /::error title=ULC K2 daily backup missing/);
  assert.match(scheduledGate, /exit 1/);
  assert.doesNotMatch(scheduledGate, /exit 0/);
  assert.match(workflow, /echo "run=preflight" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /if: steps\.gate\.outputs\.run == 'upload'/);
});

test("ULC backup requires an enabled exact-prefix R2 expiration of 30 days", () => {
  const prefix = "appbasis/ulc-linz/pilot/db/neondb/daily/";
  const approved = { Rules: [
    { ID: "AbortIncomplete", Status: "Enabled", Filter: { Prefix: "" }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } },
    { ID: "ULC-30-day", Status: "Enabled", Filter: { Prefix: prefix }, Expiration: { Days: 30 } },
    { ID: "OtherFiles", Status: "Enabled", Filter: { Prefix: "other/" }, Expiration: { Days: 14 } },
  ] };
  assert.deepEqual(assertUlcBackupR2Lifecycle(approved, "neondb"),
    { prefix, days: 30, valid: true });
  for (const policy of [
    null, {}, { Rules: [] },
    { Rules: [{ ID: "ULC-30", Status: "Disabled", Filter: { Prefix: prefix }, Expiration: { Days: 30 } }] },
    { Rules: [{ Status: "Enabled", Filter: { Prefix: prefix }, Expiration: { Days: 31 } }] },
    { Rules: [{ Status: "Enabled", Filter: { Prefix: "" }, Expiration: { Days: 30 } }] },
    { Rules: [{ Status: "Enabled", Filter: { Prefix: prefix + "2026" }, Expiration: { Days: 30 } }] },
    { Rules: [{ Status: "Enabled", Filter: { Prefix: prefix }, Expiration: { Date: "2026-12-21T00:00:00Z" } }] },
    { Rules: [{ Status: "Enabled", Filter: { And: { Prefix: prefix } }, Expiration: { Days: 30 } }] },
    { Rules: [approved.Rules[1], approved.Rules[1]] },
    { Rules: [approved.Rules[1], { Status: "Enabled", Filter: { Prefix: "" }, Expiration: { Days: 90 } }] },
  ]) {
    assert.throws(() => assertUlcBackupR2Lifecycle(policy, "neondb"), /retention/);
  }
  assert.throws(() => assertUlcBackupR2Lifecycle(approved, "appbasis_ulc_linz_preview"), /retention/);
});

test("ULC upload workflow enforces R2 30-day expiry before creating ciphertext", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/ulc-linz-k2-encrypted-backup.yml", import.meta.url),
    "utf8",
  );
  const lifecycleAt = workflow.indexOf("      - name: Require exact ULC R2 30-day backup lifecycle");
  const workspaceAt = workflow.indexOf("      - name: Create secure temporary workspace and fixed daily object key");
  const uploadAt = workflow.indexOf("      - name: Store immutable ciphertext and verify provider metadata");
  assert.ok(lifecycleAt > 0 && workspaceAt > lifecycleAt && uploadAt > workspaceAt);
  const part = workflow.slice(lifecycleAt, workspaceAt);
  assert.match(part, /if: steps\.gate\.outputs\.run == 'upload'/);
  assert.match(part, /get-bucket-lifecycle-configuration/);
  assert.match(part, /secrets\.APPBASIS_ULC_R2_LIFECYCLE_READ_ACCESS_KEY_ID/);
  assert.match(part, /secrets\.APPBASIS_ULC_R2_LIFECYCLE_READ_SECRET_ACCESS_KEY/);
  assert.match(part, /lifecycle read credential missing/);
  assert.doesNotMatch(part, /secrets\.APPBASIS_ULC_R2_BACKUP_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY)/);
  assert.match(workflow.slice(uploadAt), /secrets\.APPBASIS_ULC_R2_BACKUP_ACCESS_KEY_ID/);
  assert.match(workflow.slice(uploadAt), /secrets\.APPBASIS_ULC_R2_BACKUP_SECRET_ACCESS_KEY/);
  assert.match(part, /ulc-linz-k2-backup-plan\.mjs lifecycle/);
  assert.doesNotMatch(part, /put-bucket-lifecycle|delete-object|aws s3api put-object/);
});
