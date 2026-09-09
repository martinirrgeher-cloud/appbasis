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
