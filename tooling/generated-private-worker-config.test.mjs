import assert from "node:assert/strict";
import test from "node:test";

import { renderGeneratedPrivateWorkerBootstrapConfig } from "./generated-private-worker-config.mjs";
import { createIdentityRuntimeTemplate } from "./generated-runtime-template.mjs";

const BOOTSTRAP_CONFIG_PATH = "wrangler.production.bootstrap.jsonc";

test("generated production worker bootstrap disables public Cloudflare development ingress", () => {
  const config = JSON.parse(
    renderGeneratedPrivateWorkerBootstrapConfig({ appId: "ulc-linz" }),
  );

  assert.equal(config.name, "appbasis-ulc-linz-production");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, true);
  assert.equal("routes" in config, false);
  assert.equal("vars" in config, false);
  assert.equal("hyperdrive" in config, false);
  assert.equal("secrets" in config, false);
});

test("canonical deployable runtime includes only the private production worker bootstrap config", () => {
  const generated = createIdentityRuntimeTemplate({
    appId: "ulc-linz",
    displayName: "ULC Linz",
    modules: [],
    platformServices: ["identity", "permissions"],
  });
  const configFile = generated.files.find(
    (entry) => entry.path === BOOTSTRAP_CONFIG_PATH,
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
  assert.equal(config.keep_vars, true);
  assert.equal("routes" in config, false);
  assert.equal("vars" in config, false);
  assert.equal("hyperdrive" in config, false);
  assert.equal("secrets" in config, false);
  assert.equal(
    generated.files.some((entry) => entry.path === "wrangler.production.jsonc"),
    false,
  );
});

test("runtime without a deployable worker entrypoint omits production bootstrap config", () => {
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
    generated.files.some((entry) => entry.path === BOOTSTRAP_CONFIG_PATH),
    false,
  );
});

test("private production worker bootstrap config rejects invalid app identifiers", () => {
  assert.throws(
    () => renderGeneratedPrivateWorkerBootstrapConfig({ appId: "ULC Linz" }),
    /lowercase kebab-case identifier/,
  );
});
