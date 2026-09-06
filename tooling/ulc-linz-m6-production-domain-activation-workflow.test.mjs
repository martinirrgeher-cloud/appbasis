import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL("../.github/workflows/m6-ulc-production-domain-activation.yml", import.meta.url);

test("M6 production domain activation stays explicit, exact-head gated and fail-closed before write", async () => {
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
    ".success == true and (.result | type == \"array\")",
    "Production domain inventory is malformed or unsuccessful.",
    "--request PUT",
    "/workers/domains",
    "app.ulc-linz.at",
    "appbasis-ulc-linz-production",
    "evaluateUlcLinzM6ProductionDomainEvidence",
    "This does not authorize final production release",
  ]) {
    assert.equal(source.includes(marker), true, `missing workflow guard: ${marker}`);
  }

  assert.equal(source.includes(".result[]?"), false);
  assert.equal(source.includes("releaseAuthorized: true"), false);
  assert.equal(source.includes("releaseProduction"), false);
});

test("M6 production domain activation preserves sanitized provider diagnostics without logging raw responses", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "--output \"$response\"",
    "--write-out '%{http_code}'",
    "(.errors // [])[:5][]",
    "Cloudflare error",
    "gsub(\"[\\\\r\\\\n]\"; \" \")",
    ".[0:300]",
    "Cloudflare custom domain activation failed with HTTP $http_status.",
    "Cloudflare custom domain activation returned an unsuccessful response.",
  ]) {
    assert.equal(source.includes(marker), true, `missing sanitized diagnostic guard: ${marker}`);
  }

  assert.equal(source.includes('cat "$response"'), false);
  assert.equal(source.includes('cat "$RUNNER_TEMP/domain-attach.json"'), false);
  assert.equal(source.includes("--fail-with-body --silent --show-error --connect-timeout 10 --max-time 30 \\\n            --request PUT"), false);
});
