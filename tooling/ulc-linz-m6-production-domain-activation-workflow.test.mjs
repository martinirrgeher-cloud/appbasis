import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const RETIRED_WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-domain-activation.yml",
  import.meta.url,
);
const PILOT_WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-pilot-ingress.yml",
  import.meta.url,
);
const DEACTIVATION_WORKFLOW = new URL(
  "../.github/workflows/m6-ulc-production-pilot-ingress-deactivation.yml",
  import.meta.url,
);

test("legacy M6 custom-domain activation workflow is retired", async () => {
  await assert.rejects(access(RETIRED_WORKFLOW), (error) => error?.code === "ENOENT");
});

test("public M6 ingress remains isolated to the guarded workers.dev pilot workflow", async () => {
  const source = await readFile(PILOT_WORKFLOW, "utf8");

  for (const marker of [
    "ACTIVATE-ULC-M6-PILOT-INGRESS",
    "ulc-linz-m5-production-gate",
    "validUntilOrReviewAt",
    "Revalidate authoritative fresh exact-head M5 evidence immediately before write",
    '{"enabled":true,"previews_enabled":false}',
    "custom organizational domain: not activated",
    "final organizational go-live: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing pilot-ingress guard: ${marker}`);
  }

  assert.equal(source.includes("/workers/domains"), false);
  assert.equal(source.includes("ACTIVATE-ULC-PRODUCTION-DOMAIN"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
});

test("M6 pilot ingress has an explicit fail-closed deactivation path independent of M5 freshness", async () => {
  const source = await readFile(DEACTIVATION_WORKFLOW, "utf8");

  for (const marker of [
    "DEACTIVATE-ULC-M6-PILOT-INGRESS",
    "refs/heads/main",
    "environment: m4-dr",
    "CLOUDFLARE_API_WRITE_TOKEN",
    "Recheck exact pilot ingress state before deactivation",
    "write_required=false",
    "write_required=true",
    "--request POST",
    '{"enabled":false,"previews_enabled":false}',
    ".result.enabled == false and .result.previews_enabled == false",
    "production runtime deployment: unchanged",
    "final organizational go-live: not authorized",
  ]) {
    assert.equal(source.includes(marker), true, `missing pilot-deactivation guard: ${marker}`);
  }

  assert.equal(source.includes("M5 ULC Production Evidence"), false);
  assert.equal(source.includes("m5_run_id"), false);
  assert.equal(source.includes('{"enabled":true'), false);
  assert.equal(source.includes("/workers/domains"), false);
  assert.equal(source.includes("app.ulc-linz.at"), false);
  assert.equal(source.includes("releaseAuthorized: true"), false);
});
