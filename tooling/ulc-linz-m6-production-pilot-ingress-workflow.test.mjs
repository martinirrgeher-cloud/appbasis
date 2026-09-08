import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL("../.github/workflows/m6-ulc-production-pilot-ingress.yml", import.meta.url);

test("M6 pilot ingress stays explicit, exact-head M5 gated, fresh and preview-closed", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "ACTIVATE-ULC-M6-PILOT-INGRESS",
    "refs/heads/main",
    "M5 ULC Production Evidence",
    ".github/workflows/m5-ulc-production-evidence.yml",
    ".head_sha == $sha",
    ".conclusion == \"success\"",
    "ulc-linz-m5-production-gate",
    "/actions/runs/${M5_RUN_ID}/artifacts?per_page=100",
    "/actions/artifacts/${artifact_id}/zip",
    "m5-production-gate.json",
    ".validUntilOrReviewAt",
    "valid_epoch - observed_epoch",
    "-eq 900",
    "now_epoch >= valid_epoch",
    "Revalidate authoritative fresh exact-head M5 evidence immediately before write",
    "expired before pilot-ingress activation",
    "group: m6-ulc-production-runtime-config",
    "CLOUDFLARE_API_WRITE_TOKEN",
    "/workers/scripts/$TARGET_WORKER/subdomain",
    "--request POST",
    "{\"enabled\":true,\"previews_enabled\":false}",
    ".result.enabled == true and .result.previews_enabled == false",
    "custom organizational domain: not activated",
    "final organizational go-live: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing pilot ingress guard: ${marker}`);
  }

  assert.equal((source.match(/valid_epoch - observed_epoch/g) ?? []).length, 2);
  assert.equal(source.includes(".created_at"), false);
  assert.equal(source.includes("age_seconds > 900"), false);
  assert.equal(source.includes("previews_enabled\":true"), false);
  assert.equal(source.includes("/workers/domains"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
  assert.equal(source.includes("releaseAuthorized: true"), false);
  assert.equal(source.includes("releaseProduction"), false);
});

test("M6 pilot ingress preserves bounded provider diagnostics without raw response logging", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "--output \"$response\"",
    "--write-out '%{http_code}'",
    "(.errors // [])[:5][]",
    "Cloudflare error",
    ".[0:300]",
    "Cloudflare pilot ingress activation failed with HTTP $http_status.",
  ]) {
    assert.equal(source.includes(marker), true, `missing diagnostic guard: ${marker}`);
  }

  assert.equal(source.includes('cat "$response"'), false);
  assert.equal(source.includes("CLOUDFLARE_API_WRITE_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}"), false);
});
