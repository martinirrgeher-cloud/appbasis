import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ulc-linz-m6-aggregate-readiness.mjs",import.meta.url),"utf8");
const workflow = await readFile(new URL("../.github/workflows/ulc-linz-m6-aggregate-readiness.yml",import.meta.url),"utf8");

test("consolidated M6 audit is explicitly manual and has no repository write permission",()=>{
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/AUDIT-ULC-M6-READINESS/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow,/contents: write|actions: write/);
});
test("M6 diagnostic only uses provider GET and does not call write/deploy methods",()=>{
  assert.match(source,/method:"GET"/);
  assert.match(workflow,/method:"GET"/);
  for(const forbidden of [
    /wrangler (?:deploy|versions upload|versions deploy|secret put)/,
    /(?:method|--request):?\s*["']?(?:POST|PUT|PATCH|DELETE)["']?/,
    /\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|GRANT ALL|TRUNCATE TABLE)\b/,
  ]){
    assert.doesNotMatch(source,forbidden);
    assert.doesNotMatch(workflow,forbidden);
  }
});
test("M6 audit detects each closed Worker contract property and does not print provider payloads",()=>{
  for(const fragment of [
    "subdomain?.enabled===false",
    "subdomain?.previews_enabled===false",
    "deployed_on",
    "references?.domains",
    "deployments?.deployments",
    "matchingWorkers=",
    "resolveUlcLinzProductionHyperdrive",
    "resolveUlcLinzProductionSecurityLogHyperdrive",
    "GITHUB_STEP_SUMMARY",
  ]) assert.ok(source.includes(fragment),fragment);
  assert.doesNotMatch(source,/console\.log\((?:data|worker|versions|deployments|scripts|response)\b/);
});
test("initial and protected audit jobs have distinct current production and legacy follow-up secret scopes",()=>{
  assert.match(workflow,/initial-provider-and-app-inventory:/);
  assert.match(workflow,/protected-followup-secret-inventory:/);
  assert.match(workflow,/environment: m4-dr/);
  assert.match(workflow,/secrets\.ULC_LINZ_PRODUCTION_CLOUDFLARE_API_TOKEN/);
  assert.match(workflow,/secrets\.CLOUDFLARE_API_WRITE_TOKEN/);
  assert.match(workflow,/secrets\.ULC_LINZ_PRODUCTION_SMOKE_PASSWORD/);
  assert.match(workflow,/secrets\.ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL/);
  assert.match(workflow,/secrets\.ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL/);
});
