import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-composition-gate.yml",
  import.meta.url,
);

test("M6 composition gate binds live platform checks to the selected app composition", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "VERIFY-ULC-M6-COMPOSITION",
    "Composition-gate reruns cannot reuse an earlier production approval.",
    "security_smoke_run_id",
    "lifecycle_preflight_run_id",
    ".github/workflows/m5-ulc-private-security-smoke.yml",
    ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
    ".head_sha == $sha",
    ".run_attempt == 1",
    "max_age_seconds=2700",
    ".updated_at",
    "45-minute platform-prerequisite freshness window",
    "node ./tooling/production-contract.mjs ulc-linz --require-ready",
    "ulc-linz-production-composition-gate",
    "production-composition-gate.json",
    "selectedModules",
    "compositionReady: true",
    "validUntilOrReviewAt",
    "15 minutes",
    "unselected modules: not part of this gate",
    "productionReleaseAuthorized: false",
  ]) {
    assert.equal(source.includes(marker), true, `missing composition guard: ${marker}`);
  }

  assert.equal(
    source.includes(".github/workflows/m5-ulc-production-evidence.yml"),
    false,
  );
  assert.equal(source.includes("securityPrivacyReady"), false);
  assert.equal(source.includes("verifiedCount == 12"), false);
});
