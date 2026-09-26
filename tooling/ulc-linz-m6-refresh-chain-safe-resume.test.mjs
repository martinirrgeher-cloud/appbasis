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
    'while test "$depth" -lt 4',
    '.parents | type == "array" and length == 1',
    '.files | type == "array" and length >= 1 and length <= 6',
    "tooling/ulc-linz-m5-lifecycle-executor-binding.mjs",
    "tooling/ulc-linz-m5-lifecycle-executor-binding-retry.test.mjs",
    ".github/workflows/m5-ulc-production-evidence.yml",
    "tooling/ulc-linz-m5-production-evidence-workflow.test.mjs",
    ".github/workflows/m6-ulc-production-refresh-chain.yml",
    "tooling/ulc-linz-m6-refresh-chain-safe-resume.test.mjs",
    '($heads | index(.head_sha)) != null',
    "bounded evidence-only safe-resume ancestor qualified",
    "runtime/provider changes still require a new exact-head chain",
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
