import assert from "node:assert/strict";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SUPPORTED_PLATFORM_SERVICES } from "../app-definition.mjs";
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

test("factory console serves repository state but exposes no write endpoint", async (t) => {
  const server = await startFactoryServer({ repositoryRoot, port: 0 });
  t.after(async () => {
    server.close();
    await once(server, "close");
  });

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
