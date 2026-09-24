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

test("ULC D4 preview lifecycle binds distinct application and security-log Hyperdrives", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /APPBASIS_DATABASE_URL/);
  assert.match(workflow, /APPBASIS_SECURITY_LOG_DATABASE_URL/);
  assert.match(workflow, /validateUlcLinzD4PreviewDatabaseUrls/);
  assert.match(workflow, /ulc-linz-d4-preview-hyperdrive\.mjs ensure/);
  assert.match(workflow, /ulc-linz-d4-preview-hyperdrive\.mjs resolve/);
  assert.match(workflow, /securityLogHyperdriveId:/);
  assert.match(workflow, /SECURITY_LOG_HYPERDRIVE/);
  assert.match(workflow, /Hyperdrive IDs must be distinct/);
});

test("ULC D4 preview lifecycle reuses the canonical preview plan, migration and smokes", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /generated-app-preview-plan\.mjs/);
  assert.match(
    workflow,
    /node --experimental-transform-types \.\/tooling\/generated-app-preview-migrate\.mjs/,
  );
  assert.match(workflow, /generated-app-preview-smoke\.mjs/);
  assert.match(workflow, /generated-preview-database-smoke\.mjs/);
  assert.match(workflow, /\.\/worker\/preview\.ts|APPBASIS_ENTRYPOINT/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
});

test("ULC D4 preview lifecycle never targets ULC production resources", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(workflow, /appbasis-ulc-linz-production/);
  assert.doesNotMatch(workflow, /ULC_LINZ_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(workflow, /ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL/);
  assert.doesNotMatch(workflow, /m4-dr/);
});
