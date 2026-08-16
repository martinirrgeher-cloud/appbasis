import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL(
  "../.github/workflows/m3-preview-initial-version.yml",
  import.meta.url,
);
const contractUrl = new URL("./m3-preview-initial-version.mjs", import.meta.url);

test("pins the one-time m3-preview initial version workflow boundary", async () => {
  const [workflow, contract] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(contractUrl, "utf8"),
  ]);

  assert.match(workflow, /name: M3 Preview Initial Version/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /apply:/);
  assert.match(workflow, /default: false/);
  assert.match(workflow, /type: boolean/);
  assert.match(workflow, /environment: m3-preview/);
  assert.match(workflow, /pnpm run verify:repo/);

  const schemaGate = workflow.indexOf(
    "Verify migrated m3-preview database before initial version",
  );
  const hyperdriveGate = workflow.indexOf("Resolve exact m3-preview Hyperdrive");
  const workerGate = workflow.indexOf(
    "Require exact pre-provisioned m3-preview Worker",
  );
  const pristineGate = workflow.indexOf("Require pristine Worker version state");
  const applyGate = workflow.indexOf(
    "Require explicit initial version confirmation",
  );
  const upload = workflow.indexOf(
    "Upload initial Worker version with protected secret and no traffic",
  );
  assert.ok(schemaGate >= 0);
  assert.ok(hyperdriveGate > schemaGate);
  assert.ok(workerGate > hyperdriveGate);
  assert.ok(pristineGate > workerGate);
  assert.ok(applyGate > pristineGate);
  assert.ok(upload > applyGate);

  assert.match(workflow, /m3-preview-hyperdrive\.mjs resolve/);
  assert.match(workflow, /m3-preview-worker-bootstrap\.mjs ensure/);
  assert.match(workflow, /APPBASIS_APPLY_WORKER: "0"/);
  assert.match(workflow, /m3-preview-initial-version\.mjs preflight/);
  assert.match(workflow, /APPBASIS_APPLY_INITIAL_VERSION/);
  assert.match(workflow, /initial version upload was not explicitly confirmed/);

  assert.match(
    workflow,
    /APPBASIS_BETTER_AUTH_SECRET: \$\{\{ secrets\.APPBASIS_BETTER_AUTH_SECRET \}\}/,
  );
  assert.match(workflow, /m3-preview-initial-version\.mjs write-secrets-file/);
  assert.match(workflow, /--secrets-file "\$secrets_file"/);
  assert.match(workflow, /--strict/);
  assert.match(workflow, /--dry-run/);
  assert.match(workflow, /--experimental-provision=false/);
  assert.match(workflow, /--experimental-auto-create=false/);
  assert.match(workflow, /--tag m3-preview-initial-v1/);
  assert.match(workflow, /WRANGLER_OUTPUT_FILE_PATH/);
  assert.match(workflow, /\.version_id \/\/ empty/);
  assert.match(workflow, /m3-preview-initial-version\.mjs verify-upload/);
  assert.match(workflow, /trap 'rm -rf "\$temporary_directory"' EXIT/);

  assert.doesNotMatch(workflow, /wrangler secret put/);
  assert.doesNotMatch(workflow, /wrangler versions secret/);
  assert.doesNotMatch(workflow, /workers\/scripts\/.*\/secrets/);
  assert.doesNotMatch(workflow, /versions deploy/);
  assert.doesNotMatch(workflow, /wrangler deploy(?!ments)/);
  assert.doesNotMatch(workflow, /migrate:preview|apply-preview-migrations/);
  assert.doesNotMatch(workflow, /m3-preview-hyperdrive\.mjs ensure/);
  assert.doesNotMatch(workflow, /APPBASIS_APPLY_HYPERDRIVE/);
  assert.doesNotMatch(workflow, /APPBASIS_APPLY_WORKER: "1"/);

  assert.match(contract, /no existing versions/);
  assert.match(contract, /no existing deployments/);
  assert.match(contract, /unexpectedly created a deployment/);
  assert.match(contract, /workers\/tag/);
  assert.match(contract, /mode: 0o600/);
  assert.match(contract, /flag: "wx"/);
  assert.match(contract, /secret\.length < 32/);
});
