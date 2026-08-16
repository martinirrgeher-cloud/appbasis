import assert from "node:assert/strict";
import test from "node:test";

import { productionReadinessCopy } from "./production-readiness-status.js";

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
