import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import { productionReadinessCopy } from "./production-readiness-status.js";
import { startFactoryServer } from "./server.mjs";

function readiness({ verifiedCount, ready = false }) {
  const criteria = REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion, index) => ({
    id: criterion.id,
    status: index < verifiedCount ? "verified" : "open",
  }));
  return {
    status: ready ? "ready" : "blocked",
    productionReady: ready,
    verifiedCount,
    requiredCount: REQUIRED_PRODUCTION_READINESS_CRITERIA.length,
    criteria,
  };
}

test("Factory M5 copy names the real current 1/12 open criteria without implying release", () => {
  const current = evaluateProductionReadiness({
    secretsOutsideAppManifests: true,
  });
  assert.deepEqual(productionReadinessCopy(current), {
    heading: "Security & Privacy 1/12 geprüft",
    detail:
      "Noch offen: Datenregion · AVV/DPA · Verschlüsselung · Rollen & Rechte · Löschkonzept · Aufbewahrung · Datenexport · Audit-/Security-Logging · Subprozessoren · High-Privacy-Profil · Privilegierte Control Plane getrennt. Produktion bleibt gesperrt.",
  });

  const allExceptControlPlane = Object.fromEntries(
    REQUIRED_PRODUCTION_READINESS_CRITERIA
      .filter((criterion) => criterion.id !== "privilegedControlPlaneIsolation")
      .map((criterion) => [criterion.id, true]),
  );
  assert.deepEqual(
    productionReadinessCopy(evaluateProductionReadiness(allExceptControlPlane)),
    {
      heading: "Security & Privacy 11/12 geprüft",
      detail: "Noch offen: Privilegierte Control Plane getrennt. Produktion bleibt gesperrt.",
    },
  );
});

test("Factory M5 copy keeps production separate even when M5 is fully verified", () => {
  const allVerified = Object.fromEntries(
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => [criterion.id, true]),
  );
  assert.deepEqual(
    productionReadinessCopy(evaluateProductionReadiness(allVerified)),
    {
      heading: "Security & Privacy 12/12 geprüft",
      detail: "M5 ist erfüllt. Die Produktionsfreigabe bleibt ein separates, gesperrtes Gate.",
    },
  );
});

test("Factory M5 copy fails closed for inconsistent or non-canonical readiness payloads", () => {
  const reordered = readiness({ verifiedCount: 1 });
  [reordered.criteria[0], reordered.criteria[1]] = [
    reordered.criteria[1],
    reordered.criteria[0],
  ];

  for (const invalid of [
    undefined,
    null,
    {},
    readiness({ verifiedCount: 12, ready: false }),
    { ...readiness({ verifiedCount: 1 }), verifiedCount: 2 },
    { ...readiness({ verifiedCount: 1 }), status: "ready" },
    { ...readiness({ verifiedCount: 1 }), requiredCount: 1, criteria: [{ id: "dataRegion", status: "verified" }] },
    reordered,
  ]) {
    assert.deepEqual(productionReadinessCopy(invalid), {
      heading: "Security & Privacy nicht verifiziert",
      detail: "Der M5-Status ist nicht eindeutig verfügbar. Produktion bleibt gesperrt.",
    });
  }
});

test("Factory renders M5 from the shared snapshot refresh lifecycle without enabling release", async (t) => {
  const server = await startFactoryServer({ port: 0 });
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
  const html = await page.text();
  assert.match(html, /id="detail-production-status"/);
  assert.match(html, /id="detail-production-summary"/);

  const helperResponse = await fetch(`${baseUrl}/production-readiness-status.js`);
  assert.equal(helperResponse.status, 200);
  assert.match(helperResponse.headers.get("content-type") ?? "", /^text\/javascript/);
  const helperBody = await helperResponse.text();
  assert.match(
    helperBody,
    /import \{ REQUIRED_PRODUCTION_READINESS_CRITERIA \} from "\.\/production-readiness\.mjs";/,
  );
  assert.doesNotMatch(helperBody, /fetch\(/);
  assert.doesNotMatch(helperBody, /addEventListener/);
  assert.match(helperBody, /Noch offen:/);
  assert.match(helperBody, /Produktion bleibt gesperrt/);

  const canonicalContractResponse = await fetch(`${baseUrl}/production-readiness.mjs`);
  assert.equal(canonicalContractResponse.status, 200);
  assert.match(
    canonicalContractResponse.headers.get("content-type") ?? "",
    /^text\/javascript/,
  );

  const appResponse = await fetch(`${baseUrl}/app.js`);
  assert.equal(appResponse.status, 200);
  const appBody = await appResponse.text();
  assert.match(
    appBody,
    /import \{ productionReadinessCopy \} from "\.\/production-readiness-status\.js";/,
  );
  assert.match(appBody, /renderProductionReadiness\(app\.productionReadiness\);/);
  assert.match(
    appBody,
    /state\.snapshot = nextSnapshot;[\s\S]*restoreSelectedAppDetail\(\);/,
  );
  assert.match(
    appBody,
    /function restoreSelectedAppDetail\(\)[\s\S]*renderAppDetail\(app\);/,
  );

  const snapshotResponse = await fetch(`${baseUrl}/api/factory/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.capabilities.releaseProduction, false);
  assert.ok(
    snapshot.apps.every(
      (app) =>
        app.productionReadiness?.productionReady === false &&
        app.productionReadiness?.verifiedCount === 1 &&
        app.productionReadiness?.requiredCount === 12,
    ),
  );
});
