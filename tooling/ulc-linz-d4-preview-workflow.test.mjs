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
  for (const operation of ["inspect", "hyperdrives", "migrate", "bootstrap", "deploy"]) {
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
  assert.match(
    workflow,
    /initial\|athletes-upgrade\|training-upgrade\|trainer-identity-audit-upgrade\|identity-provisioning-audit-upgrade\|training-module-config-upgrade\|current/,
  );
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
  assert.match(
    workflow,
    /Apply incremental ULC preview trainer identity audit migration/,
  );
  assert.match(
    workflow,
    /ulc-linz-d4-preview-trainer-identity-audit-upgrade\.mjs/,
  );
  assert.match(workflow, /Apply incremental ULC preview identity provisioning audit migration/);
  assert.match(workflow, /ulc-linz-d4-preview-identity-audit-upgrade\.mjs/);
  assert.match(
    workflow,
    /Apply incremental ULC preview training module configuration migration/,
  );
  assert.match(
    workflow,
    /ulc-linz-preview-training-module-config-upgrade\.mjs/,
  );
  assert.match(workflow, /Confirm current ULC preview schema/);

  const stateStart = workflow.indexOf("      - name: Resolve ULC preview migration state\n");
  const freshPreflightStart = workflow.indexOf("      - name: Preflight fresh ULC preview runtime principals\n");
  const existingPreflightStart = workflow.indexOf("      - name: Preflight established ULC preview runtime principals\n");
  const initialMigrateStart = workflow.indexOf("      - name: Apply initial ULC preview database manifest\n");
  const upgradeStart = workflow.indexOf("      - name: Apply incremental ULC preview Stammdaten migration\n");
  const trainingUpgradeStart = workflow.indexOf("      - name: Apply incremental ULC preview training migration\n");
  const trainerIdentityAuditUpgradeStart = workflow.indexOf(
    "      - name: Apply incremental ULC preview trainer identity audit migration\n",
  );
  const identityAuditUpgradeStart = workflow.indexOf(
    "      - name: Apply incremental ULC preview identity provisioning audit migration\n",
  );
  const trainingModuleConfigUpgradeStart = workflow.indexOf(
    "      - name: Apply incremental ULC preview training module configuration migration\n",
  );
  const currentStart = workflow.indexOf(
    "      - name: Confirm current ULC preview schema\n",
  );
  assert.ok(stateStart >= 0);
  assert.ok(freshPreflightStart > stateStart);
  assert.ok(existingPreflightStart > freshPreflightStart);
  assert.ok(initialMigrateStart > existingPreflightStart);
  assert.ok(upgradeStart > initialMigrateStart);
  assert.ok(trainingUpgradeStart > upgradeStart);
  assert.ok(trainerIdentityAuditUpgradeStart > trainingUpgradeStart);
  assert.ok(identityAuditUpgradeStart > trainerIdentityAuditUpgradeStart);
  assert.ok(trainingModuleConfigUpgradeStart > identityAuditUpgradeStart);
  assert.ok(currentStart > trainingModuleConfigUpgradeStart);
});

test("ULC D4 migrations never run with the application runtime credential", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  for (const stepName of [
    "Apply initial ULC preview database manifest",
    "Apply incremental ULC preview Stammdaten migration",
    "Apply incremental ULC preview training migration",
    "Apply incremental ULC preview trainer identity audit migration",
    "Apply incremental ULC preview identity provisioning audit migration",
    "Apply incremental ULC preview training module configuration migration",
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

test("ULC preview inspect is read-only and deploy requires identity-v3 schema before provider writes", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /- inspect/);
  assert.match(workflow, /if: inputs.operation != 'inspect'/);
  assert.match(workflow, /inputs.operation == 'migrate' \|\| inputs.operation == 'inspect'/);
  assert.match(workflow, /Report read-only ULC preview migration state/);
  assert.match(workflow, /Require current ULC preview schema before bootstrap or deployment/);
  assert.match(workflow, /fully migrated schema-v7 baseline/);
  assert.match(workflow, /if: inputs.operation == 'bootstrap' \\|\\| inputs.operation == 'deploy'/);
  const guard = workflow.indexOf("      - name: Require current ULC preview schema before bootstrap or deployment");
  const bootstrapWorker = workflow.indexOf("      - name: Create ULC preview Worker when absent");
  const reconcile = workflow.indexOf("      - name: Reconcile separated ULC preview runtime database access");
  const secretWrite = workflow.indexOf("      - name: Synchronize ULC preview identity secret");
  const providerDeploy = workflow.indexOf("      - name: Deploy ULC preview Worker");
  assert.ok(guard >= 0);
  assert.ok(bootstrapWorker > guard);
  assert.ok(reconcile > guard);
  assert.ok(secretWrite > guard);
  assert.ok(providerDeploy > guard);
});

test("ULC E4E-D read-only inspect workflow runs only on main without apply or deployment", async () => {
  const inspect = await readFile(
    resolve(repositoryRoot, ".github/workflows/ulc-linz-e4e-d-preview-schema-inspect.yml"),
    "utf8",
  );
  assert.match(inspect, /branches:\s*\n\s*- main/);
  assert.match(inspect, /generated-preview-ulc-linz/);
  assert.match(inspect, /ulc-linz-d4-preview-migration-state\.mjs/);
  assert.match(
    inspect,
    /identity-provisioning-audit-upgrade\|training-module-config-upgrade\|current/,
  );
  assert.doesNotMatch(inspect, /APPBASIS_APPLY_MIGRATIONS|wrangler deploy|ALTER TABLE/);
});
