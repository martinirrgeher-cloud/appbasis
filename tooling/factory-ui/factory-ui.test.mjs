import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  assert.ok(
    snapshot.apps.every(
      (app) =>
        app.theme?.schemaVersion === 1 &&
        typeof app.theme?.brandMark === "string" &&
        /^#[0-9a-f]{6}$/.test(app.theme?.accentColor ?? ""),
    ),
  );
  assert.ok(snapshot.catalog.modules.includes("tasks"));
  assert.deepEqual(snapshot.catalog.platformServices, SUPPORTED_PLATFORM_SERVICES);
  assert.deepEqual(snapshot.capabilities, {
    createApp: true,
    previewWorkflow: true,
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

test("factory console exposes app details and local creation without enabling deployments", async (t) => {
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
  assert.match(pageBody, /class="factory-app-shell"/);
  assert.match(pageBody, /class="factory-nav-rail"/);
  assert.match(pageBody, /class="factory-mobile-header"/);
  assert.match(pageBody, /class="factory-tab__icon"/);
  assert.match(pageBody, /data-tab="apps"/);
  assert.match(pageBody, /data-tab="create"/);
  assert.match(pageBody, /data-panel="detail"/);
  assert.match(pageBody, /data-action="back-to-apps"/);
  assert.match(pageBody, /id="detail-name"/);
  assert.match(pageBody, /id="detail-modules"/);
  assert.match(pageBody, /id="detail-services"/);
  assert.match(pageBody, /id="detail-preview-status"/);
  assert.match(pageBody, /id="detail-preview-lifecycle"/);
  assert.match(pageBody, /id="detail-preview-workflow"/);
  assert.match(pageBody, /Preview-Workflow öffnen/);
  assert.match(pageBody, /Read-only Detailansicht/);
  assert.match(pageBody, /data-flow-step="branding"/);
  assert.match(pageBody, /data-flow-step="roles"/);
  assert.match(pageBody, /data-flow-step="preview"/);
  assert.doesNotMatch(pageBody, /data-flow-step="release"/);
  assert.match(pageBody, /data-wizard-panel="identity"/);
  assert.match(pageBody, /data-wizard-panel="preview" hidden/);
  assert.match(pageBody, /data-wizard-back/);
  assert.match(pageBody, /data-wizard-next/);
  assert.match(pageBody, /id="brand-mark"/);
  assert.match(pageBody, /id="accent-color"/);
  assert.match(pageBody, /id="create-preview-readiness"/);
  assert.match(pageBody, /id="preview-lifecycle"/);
  assert.match(pageBody, /Benötigt Aufgaben \+ Benutzer & Login \+ Rollen & Rechte/);
  assert.match(pageBody, /Theme-Manifest gespeichert/);
  assert.match(pageBody, /Produktion bleibt getrennt und fail-closed/);
  assert.match(pageBody, /id="create-app-button" type="submit" disabled/);
  assert.match(pageBody, /id="factory-status"/);
  assert.match(pageBody, /src="\/create-app\.js"/);
  assert.match(pageBody, /src="\/create-wizard\.js"/);
  assert.match(pageBody, /Deployments, Provider-Ressourcen und Produktionsfreigaben werden dadurch nicht ausgelöst/);

  const appScript = await fetch(`${baseUrl}/app.js`);
  assert.equal(appScript.status, 200);
  const appScriptBody = await appScript.text();
  assert.match(appScriptBody, /factoryLifecycleCardCopy/);
  assert.match(appScriptBody, /status\.textContent = lifecycleCard\.label/);
  assert.match(appScriptBody, /detailRow\("Status", \[lifecycleCard\.heading\]/);
  assert.match(appScriptBody, /detailRow\("Nächster Schritt", \[lifecycleCard\.nextStep\]/);
  assert.doesNotMatch(appScriptBody, /status\.textContent = "Im Repository"/);
  assert.match(appScriptBody, /button\.dataset\.appId = app\.appId/);
  assert.match(appScriptBody, /openAppDetail\(app\.appId\)/);
  assert.match(appScriptBody, /showPanel\("detail"\)/);
  assert.match(appScriptBody, /applyAppMark\(mark, app\)/);
  assert.match(appScriptBody, /app\?\.theme\?\.accentColor/);
  assert.match(appScriptBody, /previewAccentForeground\(accent\)/);
  assert.match(appScriptBody, /renderGeneratedPreviewLifecycle\(app\.previewLifecycle\)/);
  assert.match(appScriptBody, /lifecycle\?\.status !== "workflow-ready"/);
  assert.match(appScriptBody, /Preview-Workflow bereit/);
  assert.match(appScriptBody, /workflowLink\.href = lifecycle\.workflowUrl/);
  assert.match(appScriptBody, /lifecycle\.target\.environment/);
  assert.match(
    appScriptBody,
    /modules\.includes\("tasks"\)[\s\S]*services\.includes\("identity"\)[\s\S]*services\.includes\("permissions"\)/,
  );
  assert.match(appScriptBody, /Generischer Preview-Lifecycle verfügbar/);
  assert.match(appScriptBody, /Für diesen Entwurf noch nicht verfügbar/);
  assert.match(
    appScriptBody,
    /function returnToApps\(appIdToRestore = state\.selectedAppId\)/,
  );
  assert.match(appScriptBody, /scheduleAppsFocus\(appIdToRestore\);/);
  assert.match(appScriptBody, /const focusedAppIdBeforeRender = focusedAppButtonId\(\);/);
  assert.match(appScriptBody, /restoreListFocusAfterRender\(focusedAppIdBeforeRender\);/);
  assert.match(
    appScriptBody,
    /if \(appId !== null && focusAppOpenButton\(appId\)\) return;/,
  );
  assert.match(
    appScriptBody,
    /document\.querySelector\("button\[data-tab='apps'\]"\)\?\.focus\(\)/,
  );

  assert.match(appScriptBody, /snapshotGeneration: 0/);
  assert.match(appScriptBody, /const generation = \+\+state\.snapshotGeneration;/);
  assert.match(appScriptBody, /const nextSnapshot = await response\.json\(\);/);
  assert.ok(
    (appScriptBody.match(/if \(generation !== state\.snapshotGeneration\) return;/g) ?? [])
      .length >= 2,
  );
  assert.match(appScriptBody, /const draftCatalogState = captureDraftCatalogState\(\);/);
  assert.match(appScriptBody, /renderCatalog\(draftCatalogState\);/);
  assert.match(appScriptBody, /restoreDraftCatalogFocus\(draftCatalogState\.focus\);/);
  assert.match(appScriptBody, /input\.checked = selectedIds\.includes\(id\);/);
  assert.match(appScriptBody, /function focusedDraftOption\(\)/);
  assert.match(
    appScriptBody,
    /document\.querySelector\("button\[data-tab='create'\]"\)\?\.focus\(\)/,
  );
  assert.match(appScriptBody, /if \(state\.snapshot !== null\) \{/);
  assert.match(appScriptBody, /Aktualisierung fehlgeschlagen/);
  assert.match(appScriptBody, /Der zuletzt geladene Stand bleibt sichtbar/);
  assert.doesNotMatch(
    appScriptBody,
    /catch \{[\s\S]*?selectTab\("apps"\)[\s\S]*?showError\("Die Factory-Daten konnten nicht gelesen werden/,
  );

  const lifecycleCardScript = await fetch(`${baseUrl}/fc1-lifecycle-card-status.mjs`);
  assert.equal(lifecycleCardScript.status, 200);
  assert.match(lifecycleCardScript.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(await lifecycleCardScript.text(), /factoryLifecycleCardCopy/);

  const createScript = await fetch(`${baseUrl}/create-app.js`);
  assert.equal(createScript.status, 200);
  assert.match(createScript.headers.get("content-type") ?? "", /^text\/javascript/);
  const createScriptBody = await createScript.text();
  assert.match(createScriptBody, /fetch\("\/api\/factory\/apps"/);
  assert.match(createScriptBody, /"content-type": "application\/json"/);
  assert.match(createScriptBody, /credentials: "same-origin"/);
  assert.match(createScriptBody, /Es wurde kein Deployment gestartet/);
  assert.match(createScriptBody, /FACTORY_STATE_UNAVAILABLE/);
  assert.match(createScriptBody, /brandMark: brandMark\?\.value\.trim\(\)/);
  assert.match(createScriptBody, /accentColor: accentColor\?\.value/);
  assert.match(createScriptBody, /form\?\.dataset\.wizardStep === "preview"/);

  const wizardScript = await fetch(`${baseUrl}/create-wizard.js`);
  assert.equal(wizardScript.status, 200);
  assert.match(wizardScript.headers.get("content-type") ?? "", /^text\/javascript/);
  const wizardScriptBody = await wizardScript.text();
  assert.match(wizardScriptBody, /Object\.freeze\(\["identity", "branding", "modules", "roles", "preview"\]\)/);
  assert.match(wizardScriptBody, /form\.dataset\.wizardStep = currentStep/);
  assert.match(wizardScriptBody, /item\.classList\.toggle\("is-complete", complete\)/);
  assert.match(wizardScriptBody, /nextButton\.disabled = !currentStepValid\(\)/);
  assert.doesNotMatch(wizardScriptBody, /releaseProduction/);

  const shellStyles = await fetch(`${baseUrl}/styles.css`);
  assert.equal(shellStyles.status, 200);
  assert.match(shellStyles.headers.get("content-type") ?? "", /^text\/css/);
  const shellStylesBody = await shellStyles.text();
  assert.match(shellStylesBody, /\.factory-nav-rail/);
  assert.match(shellStylesBody, /\.factory-mobile-header/);
  assert.match(shellStylesBody, /grid-template-columns: 252px minmax\(0, 1fr\)/);
  assert.match(shellStylesBody, /@media \(min-width: 1024px\)/);
  assert.match(shellStylesBody, /position: fixed/);
  assert.match(shellStylesBody, /position: sticky/);

  const targetStyles = await fetch(`${baseUrl}/target-flow.css`);
  assert.equal(targetStyles.status, 200);
  assert.match(targetStyles.headers.get("content-type") ?? "", /^text\/css/);
  const targetStylesBody = await targetStyles.text();
  assert.match(targetStylesBody, /\.factory-flow/);
  assert.match(targetStylesBody, /\.factory-detail-header/);
  assert.match(targetStylesBody, /\.factory-wizard-actions/);
  assert.match(targetStylesBody, /\.factory-flow li\.is-complete/);
  assert.match(targetStylesBody, /\.factory-preview-lifecycle/);
  assert.match(targetStylesBody, /\.factory-preview-steps/);
  assert.match(targetStylesBody, /\.factory-preview-workflow-link/);

  const previewTheme = await fetch(`${baseUrl}/preview-theme.mjs`);
  assert.equal(previewTheme.status, 200);
  assert.match(previewTheme.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(await previewTheme.text(), /previewAccentForeground/);

  const snapshotResponse = await fetch(`${baseUrl}/api/factory/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.ok(Array.isArray(snapshot.apps));
  assert.equal(snapshot.capabilities.createApp, true);
  assert.equal(snapshot.capabilities.previewWorkflow, true);
  assert.equal(snapshot.capabilities.deployPreview, false);
  assert.equal(snapshot.capabilities.releaseProduction, false);

  const writeAttempt = await fetch(`${baseUrl}/api/factory/apps`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId: "must-not-exist" }),
  });
  assert.equal(writeAttempt.status, 403);
  assert.equal((await writeAttempt.json()).error.code, "INVALID_REQUEST_ORIGIN");

  const unknown = await fetch(`${baseUrl}/api/factory/apps`);
  assert.equal(unknown.status, 404);
});

test("factory local app creation is origin-locked, JSON-only and uses the existing generator", async (t) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "appbasis-factory-create-"));
  await mkdir(join(fixtureRoot, "apps", "demo"), { recursive: true });
  await mkdir(join(fixtureRoot, "modules", "tasks"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "apps", "demo", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "demo",
        displayName: "Demo",
        modules: ["tasks"],
        platformServices: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const server = await startFactoryServer({ repositoryRoot: fixtureRoot, port: 0 });
  t.after(async () => {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const endpoint = `${baseUrl}/api/factory/apps`;

  const crossOrigin = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: "http://attacker.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "cross-origin",
      displayName: "Cross Origin",
      modules: [],
      platformServices: [],
    }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).error.code, "INVALID_REQUEST_ORIGIN");

  const wrongMediaType = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "text/plain",
    },
    body: "{}",
  });
  assert.equal(wrongMediaType.status, 415);
  assert.equal((await wrongMediaType.json()).error.code, "UNSUPPORTED_MEDIA_TYPE");

  const unknownField = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "unknown-field",
      displayName: "Unknown Field",
      modules: [],
      platformServices: [],
      deploy: true,
    }),
  });
  assert.equal(unknownField.status, 400);
  assert.equal((await unknownField.json()).error.code, "INVALID_APP_REQUEST");

  const traversal = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "../escape",
      displayName: "Escape",
      modules: [],
      platformServices: [],
    }),
  });
  assert.equal(traversal.status, 400);
  assert.equal((await traversal.json()).error.code, "INVALID_APP_REQUEST");

  const missingIdentity = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      appId: "permissions-only",
      displayName: "Permissions Only",
      modules: [],
      platformServices: ["permissions"],
    }),
  });
  assert.equal(missingIdentity.status, 400);
  assert.equal((await missingIdentity.json()).error.code, "INVALID_APP_REQUEST");

  const created = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "new-app",
      displayName: "Neue App",
      brandMark: "NA",
      accentColor: "#0F766E",
      modules: ["tasks"],
      platformServices: [],
    }),
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.relativeDestination, "apps/new-app");
  assert.deepEqual(createdBody.app, {
    schemaVersion: 2,
    appId: "new-app",
    displayName: "Neue App",
    modules: ["tasks"],
    platformServices: [],
  });

  const persisted = JSON.parse(
    await readFile(join(fixtureRoot, "apps", "new-app", "appbasis.app.json"), "utf8"),
  );
  assert.deepEqual(persisted, createdBody.app);
  assert.deepEqual(
    JSON.parse(
      await readFile(join(fixtureRoot, "apps", "new-app", "appbasis.theme.json"), "utf8"),
    ),
    {
      schemaVersion: 1,
      brandMark: "NA",
      accentColor: "#0f766e",
    },
  );

  const refreshedSnapshot = await fetch(`${baseUrl}/api/factory/snapshot`);
  assert.equal(refreshedSnapshot.status, 200);
  const refreshed = await refreshedSnapshot.json();
  assert.deepEqual(
    refreshed.apps.map((app) => app.appId).sort(),
    ["demo", "new-app"],
  );
  assert.deepEqual(
    refreshed.apps.find((app) => app.appId === "new-app")?.theme,
    {
      schemaVersion: 1,
      brandMark: "NA",
      accentColor: "#0f766e",
    },
  );

  const duplicate = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "new-app",
      displayName: "Neue App",
      modules: ["tasks"],
      platformServices: [],
    }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, "APP_ALREADY_EXISTS");

  await writeFile(
    join(fixtureRoot, "apps", "demo", "appbasis.app.json"),
    "{ invalid-json\n",
    "utf8",
  );
  const blockedByInvalidRepository = await fetch(endpoint, {
    method: "POST",
    headers: {
      origin: baseUrl,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      appId: "must-stay-blocked",
      displayName: "Must Stay Blocked",
      modules: [],
      platformServices: [],
    }),
  });
  assert.equal(blockedByInvalidRepository.status, 503);
  assert.equal(
    (await blockedByInvalidRepository.json()).error.code,
    "FACTORY_STATE_UNAVAILABLE",
  );
  await assert.rejects(
    readFile(join(fixtureRoot, "apps", "must-stay-blocked", "appbasis.app.json"), "utf8"),
    (error) => error?.code === "ENOENT",
  );
});

function assertAccessibleAccent(accent) {
  const foreground = previewAccentForeground(accent);
  const ratio = contrastRatioForHex(accent, foreground);
  assert.ok(ratio !== null && ratio >= 4.5, `${accent} contrast was ${String(ratio)}`);
}

function hexChannel(value) {
  return value.toString(16).padStart(2, "0");
}
