import assert from "node:assert/strict";
import test from "node:test";

import { productionReadinessCopy } from "./production-readiness-status.js";
import { startFactoryServer } from "./server.mjs";

function readiness({ verifiedCount, requiredCount = 12, ready = false }) {
  const criteria = Array.from({ length: requiredCount }, (_, index) => ({
    id: `criterion-${index + 1}`,
    status: index < verifiedCount ? "verified" : "open",
  }));
  return {
    status: ready ? "ready" : "blocked",
    productionReady: ready,
    verifiedCount,
    requiredCount,
    criteria,
  };
}

test("Factory M5 copy shows partial readiness without implying release", () => {
  assert.deepEqual(productionReadinessCopy(readiness({ verifiedCount: 1 })), {
    heading: "Security & Privacy 1/12 geprüft",
    detail: "11 Kriterien sind noch offen. Produktion bleibt gesperrt.",
  });
});

test("Factory M5 copy keeps production separate even when M5 is fully verified", () => {
  assert.deepEqual(
    productionReadinessCopy(readiness({ verifiedCount: 12, ready: true })),
    {
      heading: "Security & Privacy 12/12 geprüft",
      detail: "M5 ist erfüllt. Die Produktionsfreigabe bleibt ein separates, gesperrtes Gate.",
    },
  );
});

test("Factory M5 copy fails closed for inconsistent readiness payloads", () => {
  for (const invalid of [
    undefined,
    null,
    {},
    readiness({ verifiedCount: 12, ready: false }),
    { ...readiness({ verifiedCount: 1 }), verifiedCount: 2 },
    { ...readiness({ verifiedCount: 1 }), status: "ready" },
  ]) {
    assert.deepEqual(productionReadinessCopy(invalid), {
      heading: "Security & Privacy nicht verifiziert",
      detail: "Der M5-Status ist nicht eindeutig verfügbar. Produktion bleibt gesperrt.",
    });
  }
});

test("Factory serves the read-only M5 status adapter without enabling release", async (t) => {
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
  assert.match(html, /src="\/production-readiness-status\.js"/);

  const script = await fetch(`${baseUrl}/production-readiness-status.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type") ?? "", /^text\/javascript/);
  const scriptBody = await script.text();
  assert.match(scriptBody, /fetch\("\/api\/factory\/snapshot"/);
  assert.match(scriptBody, /const generation = \+\+statusGeneration/);
  assert.ok(
    (scriptBody.match(/generation !== statusGeneration/g) ?? []).length >= 2,
  );
  assert.match(scriptBody, /Produktion bleibt gesperrt/);

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
