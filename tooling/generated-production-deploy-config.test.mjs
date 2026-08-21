import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  renderGeneratedProductionWranglerConfig,
  writeGeneratedProductionWranglerConfig,
} from "./generated-production-deploy-config.mjs";

const input = Object.freeze({
  appId: "ulc-linz",
  hyperdriveId: "provider-hyperdrive-id",
  baseURL: "https://app.ulc-linz.example.test",
});

test("renders the final production deployment bindings without public ingress", () => {
  const config = renderGeneratedProductionWranglerConfig(input);

  assert.equal(config.name, "appbasis-ulc-linz-production");
  assert.equal(config.main, "./worker/index.ts");
  assert.equal(config.compatibility_date, "2026-08-21");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.keep_vars, true);
  assert.deepEqual(config.vars, {
    APPBASIS_BASE_URL: "https://app.ulc-linz.example.test",
  });
  assert.deepEqual(config.hyperdrive, [
    { binding: "HYPERDRIVE", id: "provider-hyperdrive-id" },
  ]);
  assert.equal("secrets" in config, false);
  assert.equal("routes" in config, false);
  assert.equal("route" in config, false);
});

test("pins the same compatibility date as the production bootstrap contract", () => {
  assert.equal(
    renderGeneratedProductionWranglerConfig(input).compatibility_date,
    "2026-08-21",
  );
  assert.equal(
    renderGeneratedProductionWranglerConfig({
      ...input,
      compatibilityDate: "2026-08-21",
    }).compatibility_date,
    "2026-08-21",
  );
  assert.throws(
    () =>
      renderGeneratedProductionWranglerConfig({
        ...input,
        compatibilityDate: "2026-08-14",
      }),
    /must remain 2026-08-21/,
  );
});

test("reuses fail-closed provider, origin and entrypoint validation", () => {
  assert.throws(
    () => renderGeneratedProductionWranglerConfig({ ...input, hyperdriveId: "bad id" }),
    /hyperdriveId is invalid/,
  );
  assert.throws(
    () => renderGeneratedProductionWranglerConfig({ ...input, baseURL: "http://example.test" }),
    /canonical HTTPS origin/,
  );
  assert.throws(
    () => renderGeneratedProductionWranglerConfig({ ...input, entrypoint: "../worker/index.ts" }),
    /canonical relative TypeScript path/,
  );
  assert.throws(
    () => renderGeneratedProductionWranglerConfig({ ...input, appId: "Ulc-Linz" }),
    /appId must match/,
  );
});

test("rejects production worker names that exceed the Cloudflare limit", () => {
  assert.throws(
    () =>
      renderGeneratedProductionWranglerConfig({
        ...input,
        appId: `a${"b".repeat(50)}`,
      }),
    /production Worker name is invalid/,
  );
});

test("writes only an owner-readable runtime deployment artifact", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "appbasis-generated-production-"));
  const outputPath = path.join(directory, "wrangler.production.generated.json");
  try {
    await writeGeneratedProductionWranglerConfig({ ...input, outputPath });
    const written = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(written.name, "appbasis-ulc-linz-production");
    assert.equal(written.compatibility_date, "2026-08-21");
    assert.equal(written.workers_dev, false);
    assert.equal(written.preview_urls, false);
    assert.equal("secrets" in written, false);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
