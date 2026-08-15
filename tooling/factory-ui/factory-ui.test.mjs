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
import {
  contrastRatioForHex,
  previewAccentForeground,
} from "./preview-theme.mjs";
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

test("factory accent preview guarantees readable black-or-white foregrounds", () => {
  assert.equal(previewAccentForeground("#ffffff"), "#000000");
  assert.equal(previewAccentForeground("#000000"), "#ffffff");

  const regressionColors = ["#777777", "#7c7c7c", "#fef08a", "#2563eb"];
  for (const accent of regressionColors) {
    assertAccessibleAccent(accent);
  }

  for (let channel = 0; channel <= 255; channel += 1) {
    const component = channel.toString(16).padStart(2, "0");
    assertAccessibleAccent(`#${component}${component}${component}`);
  }

  for (let red = 0; red <= 255; red += 17) {
    for (let green = 0; green <= 255; green += 17) {
      for (let blue = 0; blue <= 255; blue += 17) {
        assertAccessibleAccent(
          `#${hexChannel(red)}${hexChannel(green)}${hexChannel(blue)}`,
        );
      }
    }
  }
});

test("factory console exposes app details and target creation flow without enabling writes", async (t) => {
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
  const pageBody = await page.text();
  assert.match(pageBody, /AppBasis Factory/);
  assert.match(pageBody, /data-panel="detail"/);
  assert.match(pageBody, /data-action="back-to-apps"/);
  assert.match(pageBody, /id="detail-name"/);
  assert.match(pageBody, /id="detail-modules"/);
  assert.match(pageBody, /id="detail-services"/);
  assert.match(pageBody, /Read-only Detailansicht/);
  assert.match(pageBody, /data-flow-step="branding"/);
  assert.match(pageBody, /data-flow-step="roles"/);
  assert.match(pageBody, /data-flow-step="preview"/);
  assert.match(pageBody, /data-flow-step="release"/);
  assert.match(pageBody, /id="brand-mark"/);
  assert.match(pageBody, /id="accent-color"/);
  assert.match(pageBody, /Produktion bleibt fail-closed/);
  assert.match(pageBody, /type="button" disabled aria-describedby="create-disabled-reason"/);

  const appScript = await fetch(`${baseUrl}/app.js`);
  assert.equal(appScript.status, 200);
  const appScriptBody = await appScript.text();
  assert.match(appScriptBody, /button\.dataset\.appId = app\.appId/);
  assert.match(appScriptBody, /openAppDetail\(app\.appId\)/);
  assert.match(appScriptBody, /showPanel\("detail"\)/);
  assert.match(appScriptBody, /const appIdToRestore = state\.selectedAppId/);
  assert.match(
    appScriptBody,
    /requestAnimationFrame\(\(\) => focusAppOpenButton\(appIdToRestore\)\)/,
  );
  assert.match(appScriptBody, /button\?\.focus\(\)/);

  const targetStyles = await fetch(`${baseUrl}/target-flow.css`);
  assert.equal(targetStyles.status, 200);
  assert.match(targetStyles.headers.get("content-type") ?? "", /^text\/css/);
  const targetStylesBody = await targetStyles.text();
  assert.match(targetStylesBody, /\.factory-flow/);
  assert.match(targetStylesBody, /\.factory-detail-header/);

  const previewTheme = await fetch(`${baseUrl}/preview-theme.mjs`);
  assert.equal(previewTheme.status, 200);
  assert.match(previewTheme.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(await previewTheme.text(), /previewAccentForeground/);

  const snapshotResponse = await fetch(`${baseUrl}/api/factory/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.ok(Array.isArray(snapshot.apps));
  assert.equal(snapshot.capabilities.createApp, false);
  assert.equal(snapshot.capabilities.deployPreview, false);
  assert.equal(snapshot.capabilities.releaseProduction, false);

  const writeAttempt = await fetch(`${baseUrl}/api/factory/apps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId: "must-not-exist" }),
  });
  assert.equal(writeAttempt.status, 405);

  const unknown = await fetch(`${baseUrl}/api/factory/apps`);
  assert.equal(unknown.status, 404);
});

function assertAccessibleAccent(accent) {
  const foreground = previewAccentForeground(accent);
  const ratio = contrastRatioForHex(accent, foreground);
  assert.ok(ratio !== null && ratio >= 4.5, `${accent} contrast was ${String(ratio)}`);
}

function hexChannel(value) {
  return value.toString(16).padStart(2, "0");
}
