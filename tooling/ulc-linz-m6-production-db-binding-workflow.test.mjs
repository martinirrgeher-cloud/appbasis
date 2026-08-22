import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const WORKFLOW_URL = new URL(
  "../.github/workflows/m6-ulc-production-db-binding.yml",
  import.meta.url,
);

async function workflowSource() {
  return readFile(WORKFLOW_URL, "utf8");
}

test("requires an exact explicit main-only production binding approval", async () => {
  const source = await workflowSource();

  assert.match(source, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(source, /CREATE-ULC-PRODUCTION-HYPERDRIVE/);
  assert.match(source, /create or reconcile the dedicated production database binding/);
  assert.match(source, /Exact production database-binding confirmation is required/);
  assert.doesNotMatch(source, /apply:\s*true/);
});

test("uses a dedicated production database secret and masks all provider inputs", async () => {
  const source = await workflowSource();

  for (const name of [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "ULC_LINZ_PRODUCTION_DATABASE_URL",
  ]) {
    assert.match(source, new RegExp(`secrets\\.${name}`));
    assert.match(source, new RegExp(`::add-mask::\\$${name}`));
  }

  assert.doesNotMatch(source, /APPBASIS_DATABASE_URL/);
  assert.doesNotMatch(source, /BETTER_AUTH_SECRET/);
});

test("runs the single idempotent ensure only after the approval gate and verifies readback", async () => {
  const source = await workflowSource();
  const gateIndex = source.indexOf("Require explicit main dispatch");
  const ensureIndex = source.indexOf("Ensure exact dedicated production Hyperdrive");
  const readbackIndex = source.indexOf("Read back exact production Hyperdrive");

  assert.ok(gateIndex >= 0);
  assert.ok(ensureIndex > gateIndex);
  assert.ok(readbackIndex > ensureIndex);
  assert.match(
    source.slice(ensureIndex, readbackIndex),
    /ULC_LINZ_APPLY_PRODUCTION_HYPERDRIVE:\s*'1'/,
  );
  assert.match(
    source.slice(ensureIndex, readbackIndex),
    /ulc-linz-m6-production-hyperdrive\.mjs ensure/,
  );
  assert.match(
    source.slice(ensureIndex, readbackIndex),
    /approved current credentials/,
  );
  assert.match(
    source.slice(readbackIndex),
    /ulc-linz-m6-production-hyperdrive\.mjs resolve/,
  );
});

test("does not deploy, expose a domain, or write runtime secrets", async () => {
  const source = await workflowSource();

  assert.doesNotMatch(source, /wrangler\s+deploy/i);
  assert.doesNotMatch(source, /workers_dev/i);
  assert.doesNotMatch(source, /custom domain|route|hostname/i);
  assert.doesNotMatch(source, /secret put|BETTER_AUTH_SECRET/i);
});
