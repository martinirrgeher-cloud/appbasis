import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SUPPORTED_PLATFORM_SERVICES,
  verifyAppDefinitions,
} from "../app-definition.mjs";
import { acquireAppRegistryLock } from "../app-publication.mjs";
import { loadFactorySnapshot } from "./model.mjs";
import { startFactoryServer } from "./server.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("factory snapshot reads the real app registry and supported catalog", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot);

  assert.ok(snapshot.apps.length > 0);
  assert.ok(snapshot.apps.every((app) => app.schemaVersion === 2));
  assert.ok(snapshot.catalog.modules.includes("tasks"));
  assert.deepEqual(snapshot.catalog.platformServices, SUPPORTED_PLATFORM_SERVICES);
  assert.deepEqual(snapshot.capabilities, {
    createApp: false,
    deployPreview: false,
    releaseProduction: false,
  });
});

test("factory snapshot ignores unpublished app directories without weakening strict verification", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "appbasis-factory-readonly-"));
  await mkdir(join(fixtureRoot, "apps", "demo"), { recursive: true });
  await mkdir(join(fixtureRoot, "apps", "publishing"), { recursive: true });
  await mkdir(join(fixtureRoot, "modules", "tasks"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "apps", "demo", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "demo",
        displayName: "Demo",
        modules: ["tasks"],
        platformServices: ["identity"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  try {
    const lock = await acquireAppRegistryLock(fixtureRoot, "publish");
    try {
      const snapshot = await Promise.race([
        loadFactorySnapshot(fixtureRoot),
        delay(250).then(() => {
          throw new Error("Factory snapshot unexpectedly waited for the registry lock.");
        }),
      ]);
      assert.deepEqual(
        snapshot.apps.map((app) => app.appId),
        ["demo"],
      );
      assert.deepEqual(snapshot.catalog.modules, ["tasks"]);
    } finally {
      await lock.release();
    }

    await assert.rejects(
      verifyAppDefinitions(fixtureRoot),
      /apps\/publishing is missing appbasis\.app\.json/,
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("factory console serves repository state but exposes no write endpoint", async (t) => {
  const server = await startFactoryServer({ repositoryRoot, port: 0 });
  t.after(
    () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      }),
  );

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /AppBasis Factory/);

  const snapshotResponse = await fetch(`${baseUrl}/api/factory/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.ok(Array.isArray(snapshot.apps));
  assert.equal(snapshot.capabilities.createApp, false);

  const writeAttempt = await fetch(`${baseUrl}/api/factory/apps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId: "must-not-exist" }),
  });
  assert.equal(writeAttempt.status, 405);

  const unknown = await fetch(`${baseUrl}/api/factory/apps`);
  assert.equal(unknown.status, 404);
});
