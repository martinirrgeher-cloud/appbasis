import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REFRESH = new URL("../.github/workflows/m6-ulc-production-runtime-refresh-config.yml", import.meta.url);
const SMOKE = new URL("../.github/workflows/m6-ulc-production-post-deploy-smoke.yml", import.meta.url);
const SMOKE_RUNNER = new URL("../apps/ulc-linz/tooling/run-production-post-deploy-smoke.mjs", import.meta.url);

test("M6 runtime refresh binds Better Auth to the canonical workers.dev pilot origin without exposing the worker", async () => {
  const source = await readFile(REFRESH, "utf8");
  for (const marker of [
    "/workers/subdomain",
    'pilot_base_url="https://${TARGET_WORKER}.${subdomain}.workers.dev"',
    "pilot_origin_fingerprint=",
    "sha256sum",
    "PILOT_ORIGIN_FINGERPRINT=%s",
    "origin-hmac:${PILOT_ORIGIN_FINGERPRINT}",
    "baseURL: process.env.PILOT_BASE_URL",
    "Read and validate current closed private runtime state",
    "previous private deployment was not changed",
  ]) {
    assert.equal(source.includes(marker), true, `missing runtime pilot-origin guard: ${marker}`);
  }
  assert.equal(source.includes("baseURL: 'https://app.ulc-linz.at'"), false);
  assert.equal(source.includes("--request POST"), false);
  assert.equal(source.includes("/workers/scripts/$TARGET_WORKER/subdomain"), false);
});

test("M6 post-deploy smoke requires exact-head pilot activation and never depends on the organizational domain", async () => {
  const source = await readFile(SMOKE, "utf8");
  for (const marker of [
    "pilot_ingress_run_id",
    "M6 ULC Production Pilot Ingress",
    ".github/workflows/m6-ulc-production-pilot-ingress.yml",
    ".head_sha == $sha",
    "/workers/scripts/$TARGET_WORKER/subdomain",
    ".result.enabled == true and .result.previews_enabled == false",
    "/workers/subdomain",
    "TARGET_BASE_URL=https://%s.%s.workers.dev",
    "ULC_LINZ_PRODUCTION_BASE_URL=https://%s.%s.workers.dev",
    "custom organizational domain: not activated",
    "final organizational go-live: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing pilot smoke guard: ${marker}`);
  }
  assert.equal(source.includes("M6 ULC Production Domain Activation"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
  assert.equal(source.includes("/workers/domains"), false);
});

test("production protected smoke rejects an implicit or malformed auth origin", async () => {
  const source = await readFile(SMOKE_RUNNER, "utf8");
  assert.equal(source.includes("ULC_LINZ_PRODUCTION_BASE_URL"), true);
  assert.equal(source.includes("requiredHttpsOrigin"), true);
  assert.equal(source.includes('const baseURL = "https://app.ulc-linz.at"'), false);
  for (const marker of [
    'url.protocol !== "https:"',
    "url.username.length > 0",
    "url.password.length > 0",
    "url.search.length > 0",
    "url.hash.length > 0",
    "url.origin !== normalized",
  ]) {
    assert.equal(source.includes(marker), true, `missing smoke origin validation: ${marker}`);
  }
});
