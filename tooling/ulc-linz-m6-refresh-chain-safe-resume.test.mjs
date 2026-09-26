import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH_CHAIN = new URL(
  "../.github/workflows/m6-ulc-production-refresh-chain.yml",
  import.meta.url,
);

test("M6 refresh chain reuses prerequisites only across a bounded evidence-only ancestry", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  for (const marker of [
    "trusted_prerequisite_heads()",
    'while test "$depth" -lt 20',
    '.parents | type == "array" and length == 1',
    '.files | type == "array" and length >= 1 and length <= 16',
    "tooling/ulc-linz-m5-lifecycle-executor-binding.mjs",
    "tooling/ulc-linz-m5-lifecycle-executor-binding-retry.test.mjs",
    "tooling/ulc-linz-m5-production-evidence-observer.mjs",
    "tooling/ulc-linz-m5-production-evidence-observer.test.mjs",
    "tooling/ulc-linz-m6-production-resource-binding.mjs",
    "tooling/ulc-linz-m6-production-resource-binding.test.mjs",
    "tooling/ulc-linz-m6-runtime-contract-equivalence.mjs",
    "tooling/ulc-linz-m6-runtime-contract-equivalence.test.mjs",
    ".github/workflows/m5-ulc-production-evidence.yml",
    "tooling/ulc-linz-m5-production-evidence-workflow.test.mjs",
    ".github/workflows/m6-ulc-production-refresh-chain.yml",
    "tooling/ulc-linz-m6-refresh-chain-safe-resume.test.mjs",
    '(.head_sha as $head | ($heads | index($head)) != null)',
    "bounded evidence-only safe-resume ancestor qualified",
    "runtime-contract/provider changes still require a new exact-head chain",
  ]) {
    assert.equal(source.includes(marker), true, `missing safe-resume guard: ${marker}`);
  }
});

test("M6 refresh chain does not allow runtime or provider implementation files in safe-resume ancestry", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");
  const safeBlock = source.slice(
    source.indexOf("trusted_prerequisite_heads()"),
    source.indexOf("latest_success_run()"),
  );

  for (const forbidden of [
    "apps/ulc-linz/worker/index.ts",
    "apps/ulc-linz/worker/app.ts",
    "apps/ulc-linz/worker/protected-lifecycle-operations.ts",
    "apps/ulc-linz/wrangler.production.jsonc",
    "tooling/ulc-linz-m6-private-runtime-refresh.mjs",
  ]) {
    assert.equal(
      safeBlock.includes(forbidden),
      false,
      `runtime/provider file must not be safe-resumable: ${forbidden}`,
    );
  }
});


test("M6 safe-resume jq preserves the workflow-run object while checking trusted heads", async () => {
  const source = await readFile(REFRESH_CHAIN, "utf8");

  assert.equal(
    source.includes('($heads | index(.head_sha)) != null'),
    false,
    "jq must not change dot to the trusted-head array before reading the run head SHA",
  );
  assert.equal(
    source.includes('(.head_sha as $head | ($heads | index($head)) != null)'),
    true,
  );
});
