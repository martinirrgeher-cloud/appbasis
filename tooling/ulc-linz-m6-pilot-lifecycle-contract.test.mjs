import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflows = {
  runtime: new URL("../.github/workflows/m6-ulc-production-runtime-config.yml", import.meta.url),
  deploy: new URL("../.github/workflows/m6-ulc-private-production-deploy.yml", import.meta.url),
  m5: new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url),
  ingress: new URL("../.github/workflows/m6-ulc-production-pilot-ingress.yml", import.meta.url),
  smoke: new URL("../.github/workflows/m6-ulc-production-post-deploy-smoke.yml", import.meta.url),
  refresh: new URL("../.github/workflows/m6-ulc-private-production-refresh-deploy.yml", import.meta.url),
};

async function sources() {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(workflows).map(async ([key, url]) => [key, await readFile(url, "utf8")]),
    ),
  );
}

test("canonical M6 pilot lifecycle uses one provider-derived workers.dev runtime contract", async () => {
  const source = await sources();
  const pilotOrigin = 'PILOT_BASE_URL="https://${TARGET_WORKER}.${subdomain}.workers.dev"';
  const originFingerprint = "PILOT_ORIGIN_FINGERPRINT";
  const originMessage = "origin-hmac:${process.env.PILOT_ORIGIN_FINGERPRINT}";

  assert.ok(source.runtime.includes(pilotOrigin));
  assert.ok(source.deploy.includes(pilotOrigin));
  assert.ok(source.runtime.includes(originFingerprint));
  assert.ok(source.deploy.includes(originFingerprint));
  assert.ok(source.runtime.includes(originMessage));
  assert.ok(source.deploy.includes(originMessage));
  assert.ok(source.deploy.includes("base?.text !== process.env.PILOT_BASE_URL"));
  assert.ok(source.refresh.includes("ulc-linz-m6-private-runtime-refresh.mjs bindings"));
  assert.ok(source.smoke.includes('https://%s.%s.workers.dev'));

  assert.equal(source.deploy.includes("TARGET_BASE_URL: https://app.ulc-linz.at"), false);
  assert.equal(source.deploy.includes("base?.text !== process.env.TARGET_BASE_URL"), false);
});

test("M5 produces and pilot ingress consumes the same authoritative 15-minute gate", async () => {
  const source = await sources();
  const artifactName = "ulc-linz-m5-production-gate";

  for (const marker of [
    "Create sanitized authoritative M5 pilot gate",
    "m5-production-gate.json",
    "providerBoundEvidenceInput?.resourceBindingEvidence",
    "validUntilOrReviewAt",
    "validMs - observedMs !== 15 * 60 * 1000",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
    artifactName,
    "retention-days: 1",
  ]) {
    assert.ok(source.m5.includes(marker), `M5 missing authoritative gate marker: ${marker}`);
  }

  for (const marker of [
    artifactName,
    "/actions/runs/${M5_RUN_ID}/artifacts?per_page=100",
    "/actions/artifacts/${artifact_id}/zip",
    "m5-production-gate.json",
    ".headSha == $sha",
    ".runId == $runId",
    ".validUntilOrReviewAt",
    "valid_epoch - observed_epoch",
    "-eq 900",
    "Revalidate authoritative fresh exact-head M5 evidence immediately before write",
  ]) {
    assert.ok(source.ingress.includes(marker), `pilot ingress missing gate marker: ${marker}`);
  }

  assert.equal(source.ingress.includes(".created_at"), false);
  assert.equal(source.ingress.includes("age_seconds"), false);
});

test("public reachability stays isolated to explicit pilot ingress and release remains unauthorized", async () => {
  const source = await sources();

  for (const privateSource of [source.runtime, source.deploy, source.m5, source.refresh]) {
    assert.equal(privateSource.includes('{"enabled":true,"previews_enabled":false}'), false);
  }
  assert.ok(source.ingress.includes('{"enabled":true,"previews_enabled":false}'));
  assert.ok(source.ingress.includes("ACTIVATE-ULC-M6-PILOT-INGRESS"));
  assert.ok(source.ingress.includes("productionReleaseAuthorized == false"));
  assert.ok(source.smoke.includes("final organizational go-live: not authorized"));
  assert.ok(source.m5.includes("productionReleaseAuthorized !== false"));
  assert.equal(source.ingress.includes("/workers/domains"), false);
  assert.equal(source.smoke.includes("/workers/domains"), false);
});
