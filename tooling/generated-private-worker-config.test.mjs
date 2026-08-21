import assert from "node:assert/strict";
import test from "node:test";

import { renderGeneratedPrivateWorkerConfig } from "./generated-private-worker-config.mjs";
import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

test("generated production worker config disables public Cloudflare development ingress", () => {
  const config = JSON.parse(
    renderGeneratedPrivateWorkerConfig({ appId: "ulc-linz" }),
  );

  assert.equal(config.name, "appbasis-ulc-linz-production");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, false);
  assert.equal("routes" in config, false);
});

test("canonical deployable runtime includes a separate private production worker config", () => {
  const generated = createIdentityRuntimeTemplate({
    appId: "ulc-linz",
    displayName: "ULC Linz",
    modules: [],
    platformServices: ["identity", "permissions"],
  });
  const configFile = generated.files.find(
    (entry) => entry.path === "wrangler.production.jsonc",
  );

  assert.ok(configFile);
  assert.equal(
    generated.files.some((entry) => entry.path === "worker/index.ts"),
    true,
  );
  const config = JSON.parse(configFile.content);
  assert.equal(config.name, "appbasis-ulc-linz-production");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal("routes" in config, false);
  assert.equal(
    generated.files.some((entry) => entry.path === "wrangler.jsonc"),
    false,
  );
});

test("runtime without a deployable worker entrypoint omits production config", () => {
  const generated = createIdentityRuntimeTemplate({
    appId: "checklist",
    displayName: "Checklist",
    platformServices: ["identity"],
  });

  assert.equal(
    generated.files.some((entry) => entry.path === "worker/index.ts"),
    false,
  );
  assert.equal(
    generated.files.some((entry) => entry.path === "wrangler.production.jsonc"),
    false,
  );
});

test("private production worker config rejects invalid app identifiers", () => {
  assert.throws(
    () => renderGeneratedPrivateWorkerConfig({ appId: "ULC Linz" }),
    /lowercase kebab-case identifier/,
  );
});
