import assert from "node:assert/strict";
import test from "node:test";

import { renderGeneratedPrivateWorkerConfig } from "./generated-private-worker-config.mjs";
import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

test("generated worker config disables public Cloudflare development ingress", () => {
  const config = JSON.parse(
    renderGeneratedPrivateWorkerConfig({ appId: "ulc-linz" }),
  );

  assert.equal(config.name, "appbasis-ulc-linz");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, false);
  assert.equal("routes" in config, false);
});

test("canonical generated runtime includes the private worker config", () => {
  const generated = createIdentityRuntimeTemplate({
    appId: "ulc-linz",
    displayName: "ULC Linz",
    modules: [],
    platformServices: ["identity"],
  });
  const configFile = generated.files.find((entry) => entry.path === "wrangler.jsonc");

  assert.ok(configFile);
  const config = JSON.parse(configFile.content);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal("routes" in config, false);
});

test("private worker config rejects invalid app identifiers", () => {
  assert.throws(
    () => renderGeneratedPrivateWorkerConfig({ appId: "ULC Linz" }),
    /lowercase kebab-case identifier/,
  );
});
