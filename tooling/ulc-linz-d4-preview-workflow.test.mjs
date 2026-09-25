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

test("ULC D4 migrate preflights separated runtime principals before committing the manifest", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const preflightStart = workflow.indexOf(
    "      - name: Preflight separated ULC preview runtime principals\n",
  );
  const migrateStart = workflow.indexOf(
    "      - name: Apply ULC preview database manifest\n",
  );
  assert.ok(preflightStart >= 0);
  assert.ok(migrateStart > preflightStart);

  const preflightEnd = workflow.indexOf("\n      - name: ", preflightStart + 1);
  const preflightStep = workflow.slice(preflightStart, preflightEnd);
  assert.match(
    preflightStep,
    /APPBASIS_MIGRATION_DATABASE_URL: \$\{\{ secrets\.APPBASIS_MIGRATION_DATABASE_URL \}\}/,
  );
  assert.match(
    preflightStep,
    /APPBASIS_DATABASE_URL: \$\{\{ secrets\.APPBASIS_DATABASE_URL \}\}/,
  );
  assert.match(
    preflightStep,
    /APPBASIS_SECURITY_LOG_DATABASE_URL: \$\{\{ secrets\.APPBASIS_SECURITY_LOG_DATABASE_URL \}\}/,
  );
  assert.match(
    preflightStep,
    /ulc-linz-d4-preview-database-access\.mjs preflight/,
  );
  assert.doesNotMatch(preflightStep, /APPBASIS_APPLY_DATABASE_ACCESS/);
});

test("ULC D4 migrations never run with the application runtime credential", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const stepStart = workflow.indexOf("      - name: Apply ULC preview database manifest\n");
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
});

test("ULC D4 preview lifecycle never targets ULC production resources", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /appbasis-ulc-linz-production/);
  assert.doesNotMatch(workflow, /ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow, /ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL/);
  assert.doesNotMatch(workflow, /m4-dr/);
});
