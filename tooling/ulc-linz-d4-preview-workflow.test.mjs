import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/ulc-linz-d4-preview.yml",
);

test("ULC D4 preview lifecycle keeps provider writes explicit and main-only", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /operation:/);
  for (const operation of ["hyperdrives", "migrate", "bootstrap", "deploy"]) {
    assert.match(workflow, new RegExp("- " + operation));
  }
  assert.match(workflow, /apply:/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /ULC D4 preview operation was not explicitly authorized/);
  assert.match(workflow, /environment:\s*\n\s*name: generated-preview-ulc-linz/);
});

test("ULC D4 preview lifecycle binds distinct Hyperdrives and verifies the security-log ACL", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /APPBASIS_MIGRATION_DATABASE_URL/);
  assert.match(workflow, /APPBASIS_DATABASE_URL/);
  assert.match(workflow, /APPBASIS_SECURITY_LOG_DATABASE_URL/);
  assert.match(workflow, /validateUlcLinzD4PreviewDatabaseCredentials/);
  assert.match(workflow, /ulc-linz-d4-preview-hyperdrive\.mjs ensure/);
  assert.match(workflow, /ulc-linz-d4-preview-hyperdrive\.mjs resolve/);
  assert.match(workflow, /securityLogHyperdriveId:/);
  assert.match(workflow, /SECURITY_LOG_HYPERDRIVE/);
  assert.match(workflow, /Hyperdrive IDs must be distinct/);
  assert.match(workflow, /ulc-linz-d4-preview-database-access\.mjs/);
  assert.match(workflow, /APPBASIS_APPLY_DATABASE_ACCESS/);
});

test("ULC D4 preview lifecycle reuses the canonical plan and probes the ULC countdown boundary", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /ulc-linz-d4-preview-plan\.mjs/);
  assert.doesNotMatch(workflow, /node \.\/tooling\/generated-app-preview-plan\.mjs/);
  assert.match(
    workflow,
    /node \.\/tooling\/ulc-linz-d4-preview-migrate\.mjs/,
  );
  assert.doesNotMatch(
    workflow,
    /node --experimental-transform-types \.\/tooling\/generated-app-preview-migrate\.mjs/,
  );
  assert.match(workflow, /ulc-linz-d4-preview-audit-smoke\.mjs/);
  assert.match(workflow, /APPBASIS_MIGRATION_DATABASE_URL/);
  const auditStepStart = workflow.indexOf(
    "      - name: Verify ULC preview UI, protected countdown and persisted audit event\n",
  );
  const auditStepEnd = workflow.indexOf("\n      - name: ", auditStepStart + 1);
  assert.ok(auditStepStart >= 0);
  const auditStep = workflow.slice(auditStepStart, auditStepEnd);
  assert.match(
    auditStep,
    /APPBASIS_BETTER_AUTH_SECRET: \$\{\{ secrets\.APPBASIS_BETTER_AUTH_SECRET \}\}/,
  );
  assert.doesNotMatch(workflow, /node \.\/tooling\/generated-app-preview-smoke\.mjs/);
  assert.match(workflow, /generated-preview-database-smoke\.mjs/);
  assert.match(workflow, /\.\/worker\/preview\.ts|APPBASIS_ENTRYPOINT/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
});

test("ULC D4 migrate routes fresh, established and current preview states explicitly", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /Resolve ULC preview migration state/);
  assert.match(workflow, /ulc-linz-d4-preview-migration-state\.mjs/);
  assert.match(workflow, /initial\\|athletes-upgrade\\|training-upgrade\\|current/);
  assert.match(workflow, /Preflight fresh ULC preview runtime principals/);
  assert.match(workflow, /database-access\.mjs preflight >\/dev\/null/);
  assert.match(workflow, /Preflight established ULC preview runtime principals/);
  assert.match(workflow, /database-access\.mjs preflight-existing >\/dev\/null/);
  assert.match(workflow, /Apply initial ULC preview database manifest/);
  assert.match(workflow, /ulc-linz-d4-preview-migrate\.mjs/);
  assert.match(workflow, /Apply incremental ULC preview Stammdaten migration/);
  assert.match(workflow, /ulc-linz-d4-preview-athletes-upgrade\.mjs/);
  assert.match(workflow, /Apply incremental ULC preview training migration/);
  assert.match(workflow, /ulc-linz-d4-preview-training-upgrade\.mjs/);
  assert.match(workflow, /Confirm current ULC preview schema/);

  const stateStart = workflow.indexOf("      - name: Resolve ULC preview migration state\n");
  const freshPreflightStart = workflow.indexOf("      - name: Preflight fresh ULC preview runtime principals\n");
  const existingPreflightStart = workflow.indexOf("      - name: Preflight established ULC preview runtime principals\n");
  const initialMigrateStart = workflow.indexOf("      - name: Apply initial ULC preview database manifest\n");
  const upgradeStart = workflow.indexOf("      - name: Apply incremental ULC preview Stammdaten migration\n");
  const trainingUpgradeStart = workflow.indexOf("      - name: Apply incremental ULC preview training migration\n");
  assert.ok(stateStart >= 0);
  assert.ok(freshPreflightStart > stateStart);
  assert.ok(existingPreflightStart > freshPreflightStart);
  assert.ok(initialMigrateStart > existingPreflightStart);
  assert.ok(upgradeStart > initialMigrateStart);
  assert.ok(trainingUpgradeStart > upgradeStart);
});

test("ULC D4 migrations never run with the application runtime credential", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  for (const stepName of [
    "Apply initial ULC preview database manifest",
    "Apply incremental ULC preview Stammdaten migration",
    "Apply incremental ULC preview training migration",
  ]) {
    const stepStart = workflow.indexOf("      - name: " + stepName + "\n");
    const nextStep = workflow.indexOf("\n      - name: ", stepStart + 1);
    assert.ok(stepStart >= 0);
    const step = workflow.slice(stepStart, nextStep);
    assert.match(
      step,
      /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_MIGRATION_DATABASE_URL \}\}/,
    );
    assert.doesNotMatch(
      step,
      /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
    );
  }
});

test("ULC D4 preview lifecycle never targets ULC production resources", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /appbasis-ulc-linz-production/);
  assert.doesNotMatch(workflow, /ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow, /ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL/);
  assert.doesNotMatch(workflow, /m4-dr/);
});
