import "./ulc-linz-m6-production-closeout-workflows.test.mjs";

import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUlcLinzM6ProductionDomainEvidence,
  ULC_LINZ_M6_PRODUCTION_DOMAIN_CONTRACT,
} from "./ulc-linz-m6-production-domain-evidence.mjs";

test("M6 production domain evidence accepts exactly the canonical ULC domain binding", () => {
  assert.deepEqual(ULC_LINZ_M6_PRODUCTION_DOMAIN_CONTRACT, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    hostname: "app.ulc-linz.at",
    service: "appbasis-ulc-linz-production",
  });

  assert.deepEqual(
    evaluateUlcLinzM6ProductionDomainEvidence({
      success: true,
      result: [
        {
          id: "domain-id",
          hostname: "app.ulc-linz.at",
          service: "appbasis-ulc-linz-production",
          zone_id: "zone-id",
        },
      ],
    }),
    { productionDomainReady: true },
  );
});

test("M6 production domain evidence fails closed on missing, conflicting, duplicate or mixed bindings", () => {
  const cases = [
    null,
    { success: "true", result: [] },
    { success: true, result: [] },
    {
      success: true,
      result: [{ id: "domain-id", hostname: "app.ulc-linz.at", service: "other", zone_id: "zone-id" }],
    },
    {
      success: true,
      result: [
        { id: "a", hostname: "app.ulc-linz.at", service: "appbasis-ulc-linz-production", zone_id: "z" },
        { id: "b", hostname: "app.ulc-linz.at", service: "appbasis-ulc-linz-production", zone_id: "z" },
      ],
    },
    {
      success: true,
      result: [
        { id: "canonical", hostname: "app.ulc-linz.at", service: "appbasis-ulc-linz-production", zone_id: "z" },
        { id: "conflict", hostname: "app.ulc-linz.at", service: "other-worker", zone_id: "z" },
      ],
    },
  ];

  for (const payload of cases) {
    assert.deepEqual(evaluateUlcLinzM6ProductionDomainEvidence(payload), {
      productionDomainReady: false,
    });
  }
});
