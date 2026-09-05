import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL("../.github/workflows/m6-ulc-production-domain-activation.yml", import.meta.url);

test("M6 production domain activation stays explicit, exact-head gated and separately serialized", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "ACTIVATE-ULC-PRODUCTION-DOMAIN",
    "refs/heads/main",
    "M5 ULC Production Evidence",
    ".github/workflows/m5-ulc-production-evidence.yml",
    ".head_sha == $sha",
    ".conclusion == \"success\"",
    "group: m6-ulc-production-runtime-config",
    "CLOUDFLARE_API_WRITE_TOKEN",
    "--request PUT",
    "/workers/domains",
    "app.ulc-linz.at",
    "appbasis-ulc-linz-production",
    "evaluateUlcLinzM6ProductionDomainEvidence",
    "This does not authorize final production release",
  ]) {
    assert.equal(source.includes(marker), true, `missing workflow guard: ${marker}`);
  }

  assert.equal(source.includes("releaseAuthorized: true"), false);
  assert.equal(source.includes("releaseProduction"), false);
});
