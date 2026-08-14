import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  renderGeneratedPreviewBootstrapWranglerConfig,
  renderGeneratedPreviewWranglerConfig,
  writeGeneratedPreviewBootstrapWranglerConfig,
  writeGeneratedPreviewWranglerConfig,
} from "./generated-preview-deploy-config.mjs";

test("renders deployment-only Cloudflare bindings without secret values", () => {
  const config = renderGeneratedPreviewWranglerConfig({
    appId: "tasks-minimal",
    hyperdriveId: "provider-hyperdrive-id",
    baseURL: "https://tasks-preview.example.test",
  });

  assert.deepEqual(config, {
    $schema: "./node_modules/wrangler/config-schema.json",
    name: "appbasis-tasks-minimal",
    main: "./worker/index.ts",
    compatibility_date: "2026-08-14",
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    preview_urls: false,
    keep_vars: true,
    vars: {
      APPBASIS_BASE_URL: "https://tasks-preview.example.test",
    },
    secrets: {
      required: ["BETTER_AUTH_SECRET"],
    },
    hyperdrive: [
      {
        binding: "HYPERDRIVE",
        id: "provider-hyperdrive-id",
      },
    ],
  });

  const serialized = JSON.stringify(config);
  assert.match(serialized, /BETTER_AUTH_SECRET/);
  assert.doesNotMatch(serialized, /secret-value|postgres(?:ql)?:\/\//i);
});

test("supports an explicit repository-local preview entrypoint without changing the default", () => {
  const config = renderGeneratedPreviewWranglerConfig({
    appId: "tasks-minimal",
    hyperdriveId: "provider-hyperdrive-id",
    baseURL: "https://tasks-preview.example.test",
    entrypoint: "./worker/preview.ts",
  });
  assert.equal(config.main, "./worker/preview.ts");

  const defaultConfig = renderGeneratedPreviewWranglerConfig({
    appId: "tasks-minimal",
    hyperdriveId: "provider-hyperdrive-id",
    baseURL: "https://tasks-preview.example.test",
  });
  assert.equal(defaultConfig.main, "./worker/index.ts");
});

test("renders a secretless bootstrap config without weakening the normal deploy config", () => {
  const input = {
    appId: "tasks-minimal",
    hyperdriveId: "provider-hyperdrive-id",
    baseURL: "https://tasks-preview.example.test",
    entrypoint: "./worker/preview.ts",
  };
  const deployConfig = renderGeneratedPreviewWranglerConfig(input);
  const bootstrapConfig = renderGeneratedPreviewBootstrapWranglerConfig(input);

  assert.equal("secrets" in bootstrapConfig, false);
  assert.deepEqual(bootstrapConfig, {
    $schema: deployConfig.$schema,
    name: deployConfig.name,
    main: "./worker/preview.ts",
    compatibility_date: deployConfig.compatibility_date,
    compatibility_flags: deployConfig.compatibility_flags,
    workers_dev: true,
    preview_urls: false,
    keep_vars: true,
    vars: deployConfig.vars,
    hyperdrive: deployConfig.hyperdrive,
  });
  assert.deepEqual(deployConfig.secrets.required, ["BETTER_AUTH_SECRET"]);
});

test("fails closed on invalid provider, Worker-name, entrypoint or public-origin deployment inputs", () => {
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: "tasks-minimal",
        hyperdriveId: "provider id with spaces",
        baseURL: "https://tasks-preview.example.test",
      }),
    /hyperdriveId is invalid/,
  );
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: "tasks-minimal",
        hyperdriveId: "provider-id",
        baseURL: "http://tasks-preview.example.test",
      }),
    /canonical HTTPS origin/,
  );
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: "tasks-minimal",
        hyperdriveId: "provider-id",
        baseURL: "https://tasks-preview.example.test",
        entrypoint: "../worker/preview.ts",
      }),
    /canonical relative TypeScript path/,
  );
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: "tasks-minimal",
        hyperdriveId: "provider-id",
        baseURL: "https://tasks-preview.example.test",
        entrypoint: "./worker/../preview.ts",
      }),
    /canonical relative TypeScript path/,
  );
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: "Tasks-Minimal",
        hyperdriveId: "provider-id",
        baseURL: "https://tasks-preview.example.test",
      }),
    /appId must match/,
  );
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: "tasks-",
        hyperdriveId: "provider-id",
        baseURL: "https://tasks-preview.example.test",
      }),
    /Worker name is invalid/,
  );
  assert.throws(
    () =>
      renderGeneratedPreviewWranglerConfig({
        appId: `a${"b".repeat(54)}`,
        hyperdriveId: "provider-id",
        baseURL: "https://tasks-preview.example.test",
      }),
    /Worker name is invalid/,
  );
});

test("writes only the rendered deployment artifact with owner-only permissions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "appbasis-generated-preview-"));
  const outputPath = path.join(directory, "wrangler.preview.generated.json");
  try {
    await writeGeneratedPreviewWranglerConfig({
      appId: "tasks-minimal",
      hyperdriveId: "provider-id",
      baseURL: "https://tasks-preview.example.test",
      entrypoint: "./worker/preview.ts",
      outputPath,
    });
    const written = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(written.hyperdrive[0].id, "provider-id");
    assert.equal(written.main, "./worker/preview.ts");
    assert.deepEqual(written.secrets.required, ["BETTER_AUTH_SECRET"]);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("writes the bootstrap artifact owner-only and without secret declarations", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "appbasis-generated-preview-"));
  const outputPath = path.join(directory, "wrangler.bootstrap.generated.json");
  try {
    await writeGeneratedPreviewBootstrapWranglerConfig({
      appId: "tasks-minimal",
      hyperdriveId: "provider-id",
      baseURL: "https://tasks-preview.example.test",
      entrypoint: "./worker/preview.ts",
      outputPath,
    });
    const written = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal("secrets" in written, false);
    assert.equal(written.main, "./worker/preview.ts");
    assert.equal(written.workers_dev, true);
    assert.equal(written.preview_urls, false);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("replaces a stale world-readable artifact with owner-only permissions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "appbasis-generated-preview-"));
  const outputPath = path.join(directory, "wrangler.preview.generated.json");
  try {
    await writeFile(outputPath, "stale\n", { mode: 0o644 });
    await chmod(outputPath, 0o644);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o644);

    await writeGeneratedPreviewWranglerConfig({
      appId: "tasks-minimal",
      hyperdriveId: "replacement-provider-id",
      baseURL: "https://tasks-preview.example.test",
      outputPath,
    });

    const written = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(written.hyperdrive[0].id, "replacement-provider-id");
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
