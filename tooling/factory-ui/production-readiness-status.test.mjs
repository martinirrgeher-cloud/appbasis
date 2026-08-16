import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import {
  evaluateM6ProductionReleaseReadiness,
  REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA,
} from "./production-release-readiness.mjs";
import {
  productionReadinessCopy,
  productionReleaseReadinessCopy,
} from "./production-readiness-status.js";
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

function allM6Evidence() {
  return Object.fromEntries(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map((criterion) => [criterion.id, true]),
  );
}

test("Factory M5 copy names the real current 1/12 open criteria without implying release", () => {
  const current = evaluateProductionReadiness({
    secretsOutsideAppManifests: true,
  });
  assert.deepEqual(productionReadinessCopy(current), {
    heading: "Security & Privacy 1/12 geprüft",
    detail:
      "Noch offen: Datenregion · AVV/DPA · Verschlüsselung · Rollen & Rechte · Löschkonzept · Aufbewahrung · Datenexport · Audit-/Security-Logging · Subprozessoren · High-Privacy-Profil definiert · Privilegierte Control Plane getrennt. Produktion bleibt gesperrt.",
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

test("Factory M6 copy reports the real blocked technical evidence without authorizing release", () => {
  const current = evaluateM6ProductionReleaseReadiness();
  assert.deepEqual(productionReleaseReadinessCopy(current), {
    heading: "M6 0/10 technisch geprüft",
    detail: "10 Nachweise sind noch offen. Produktion bleibt gesperrt.",
  });

  const allExceptSmoke = allM6Evidence();
  delete allExceptSmoke.postDeploySmokePassed;
  assert.deepEqual(
    productionReleaseReadinessCopy(evaluateM6ProductionReleaseReadiness(allExceptSmoke)),
    {
      heading: "M6 9/10 technisch geprüft",
      detail: "1 Nachweis ist noch offen. Produktion bleibt gesperrt.",
    },
  );
});

test("Factory M6 copy keeps explicit release authorization separate from complete evidence", () => {
  assert.deepEqual(
    productionReleaseReadinessCopy(
      evaluateM6ProductionReleaseReadiness(allM6Evidence()),
    ),
    {
      heading: "M6 10/10 technisch geprüft",
      detail: "Die technische M6-Evidenz ist vollständig. Dieser Status autorisiert keine Produktionsfreigabe.",
    },
  );
});

test("Factory M6 copy fails closed for inconsistent or non-canonical evidence payloads", () => {
  const current = evaluateM6ProductionReleaseReadiness();
  const reordered = structuredClone(current);
  [reordered.criteria[0], reordered.criteria[1]] = [
    reordered.criteria[1],
    reordered.criteria[0],
  ];

  for (const invalid of [
    undefined,
    null,
    {},
    { ...current, releaseAuthorized: true },
    { ...current, explicitApprovalRequired: false },
    { ...current, technicalEvidenceVerified: true },
    { ...current, verifiedCount: 1 },
    reordered,
  ]) {
    assert.deepEqual(productionReleaseReadinessCopy(invalid), {
      heading: "M6 nicht verifiziert",
      detail: "Der M6-Status ist nicht eindeutig verfügbar. Produktion bleibt gesperrt.",
    });
  }
});

test("Factory renders M5 and M6 from the shared snapshot lifecycle without enabling release", async (t) => {
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
  assert.match(
    helperBody,
    /import \{ REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA \} from "\.\/production-release-readiness\.mjs";/,
  );
  assert.doesNotMatch(helperBody, /fetch\(/);
  assert.doesNotMatch(helperBody, /addEventListener/);
  assert.match(helperBody, /productionReleaseReadinessCopy/);
  assert.match(helperBody, /releaseAuthorized !== false/);
  assert.match(helperBody, /Produktion bleibt gesperrt/);

  const canonicalM5Response = await fetch(`${baseUrl}/production-readiness.mjs`);
  assert.equal(canonicalM5Response.status, 200);
  assert.match(
    canonicalM5Response.headers.get("content-type") ?? "",
    /^text\/javascript/,
  );

  const canonicalM6Response = await fetch(`${baseUrl}/production-release-readiness.mjs`);
  assert.equal(canonicalM6Response.status, 200);
  assert.match(
    canonicalM6Response.headers.get("content-type") ?? "",
    /^text\/javascript/,
  );
  const canonicalM6Body = await canonicalM6Response.text();
  assert.match(canonicalM6Body, /REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA/);
  assert.match(canonicalM6Body, /releaseAuthorized: false/);

  const appResponse = await fetch(`${baseUrl}/app.js`);
  assert.equal(appResponse.status, 200);
  const appBody = await appResponse.text();
  assert.match(appBody, /productionReleaseReadinessCopy/);
  assert.match(
    appBody,
    /renderProductionReadiness\(app\.productionReadiness, app\.productionReleaseReadiness\);/,
  );
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
        app.productionReadiness?.requiredCount === 12 &&
        app.productionReadiness?.criteria?.find(
          (criterion) => criterion.id === "highPrivacyProfile",
        )?.status === "open" &&
        app.productionReleaseReadiness?.status === "blocked" &&
        app.productionReleaseReadiness?.technicalEvidenceVerified === false &&
        app.productionReleaseReadiness?.releaseAuthorized === false,
    ),
  );
});
