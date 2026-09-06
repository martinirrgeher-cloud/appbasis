import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW = new URL("../.github/workflows/m6-ulc-production-domain-diagnostic.yml", import.meta.url);

test("M6 production domain diagnostic is bounded, explicit and non-release-authorizing", async () => {
  const source = await readFile(WORKFLOW, "utf8");

  for (const marker of [
    "DIAGNOSE-ULC-M6-PRODUCTION-DOMAIN",
    "refs/heads/main",
    "group: m6-ulc-production-runtime-config",
    "CLOUDFLARE_API_WRITE_TOKEN",
    "app.ulc-linz.at",
    "appbasis-ulc-linz-production",
    "Production hostname is already bound to another service; diagnostic write refused.",
    "--request PUT",
    "/workers/domains",
    "(.errors // [])[:5][]",
    "Cloudflare error",
    ".[0:300]",
    "purpose: provider-write diagnosis only",
    "M6 Production Ready: not established by this run",
    "final production release: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing diagnostic guard: ${marker}`);
  }

  assert.equal(source.includes("M5_RUN_ID"), false);
  assert.equal(source.includes("m5_run_id"), false);
  assert.equal(source.includes("releaseAuthorized: true"), false);
  assert.equal(source.includes("releaseProduction"), false);
  assert.equal(source.includes('cat "$response"'), false);
});
