import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUlcT10PilotDecision,
  readCurrentUlcT10PilotDecision,
} from "./ulc-linz-t10-pilot-decision.mjs";

test("actual ULC production Git contracts remain NO-GO without synthetic readiness", async () => {
  const result = await readCurrentUlcT10PilotDecision();
  assert.equal(result.source, "git-working-tree-only");
  assert.equal(result.evidenceStatus, "blocked");
  assert.equal(result.readyForOperatorReview, false);
  assert.equal(result.checkedModules.length, 6);
  assert.ok(result.openChecks.includes("module:exercise-catalog"));
  assert.ok(result.openChecks.includes("module:training-blocks"));
  assert.ok(result.openChecks.includes("module:training-documentation"));
  assert.ok(result.openChecks.includes("app:lifecycle"));
  assert.ok(result.openChecks.includes("app:privacy"));
  assert.ok(result.openChecks.includes("retention:legal"));
  assert.ok(result.openChecks.includes("provider:dpa"));
  assert.equal(result.checks.find(x => x.id === "module:countdown")?.status,
    "verified-in-repository");
  assert.equal(result.checks.find(x => x.id === "module:athletes")?.status,
    "verified-in-repository");
  assert.equal(result.checks.find(x => x.id === "module:training-plans")?.status,
    "verified-in-repository");
  assert.equal(result.checks.find(x => x.id === "retention:predeployment-safe")?.status,
    "verified-in-repository");
  assert.equal(result.operatorApproved, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.personalDataActivationAuthorized, false);
  assert.equal(result.historicalRestorePromotionAuthorized, false);
});

test("even fully synthetic ready contracts do not confer operator deployment approval", () => {
  const ids = ["countdown","athletes","exercise-catalog","training-blocks",
    "training-plans","training-documentation"];
  const result = evaluateUlcT10PilotDecision({
    app: {
      schemaVersion: 1, appId: "ulc-linz", modules: ids, status: "ready",
      crossCutting: {
        dataExport: "verified", applicationLifecycle: "verified", privacy: "verified",
      },
    },
    modules: Object.fromEntries(ids.map(id => [id, {
      moduleId: id, status: "ready", requirements: {
        authorization: "verified", database: id === "countdown" ? "not-applicable" : "verified",
        lifecycle: id === "countdown" ? "not-applicable" : "verified",
      },
    }])),
    retention: { application: "ulc-linz", legalApproval: true, runtimeActive: false },
    provider: {
      application: "ulc-linz",
      providerScope: ["cloudflare","neon-postgresql"].map(id => ({
        id, appSpecificProductionEvidence: "verified",
      })),
      dataFlows: [{ evidenceStatus: "verified" }],
      m5: {
        dataRegion: "verified", dpa: "verified",
        encryption: "verified", subprocessors: "verified",
      },
    },
  });
  assert.equal(result.evidenceStatus, "repository-prerequisites-verified");
  assert.deepEqual(result.openChecks, []);
  assert.equal(result.readyForOperatorReview, true);
  assert.equal(result.operatorApproved, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.personalDataActivationAuthorized, false);
  assert.equal(result.historicalRestorePromotionAuthorized, false);
  assert.equal(result.finalStatus, "NO-GO-until-separate-documented-T10-approval");
});

test("denies mismatched selected modules, foreign app and provider scope drift", () => {
  const valid = {
    app: {
      schemaVersion: 1, appId: "ulc-linz", status: "blocked",
      modules: ["countdown","athletes","exercise-catalog","training-blocks",
        "training-plans","training-documentation"],
      crossCutting: {},
    },
    modules: Object.fromEntries(
      ["countdown","athletes","exercise-catalog","training-blocks",
        "training-plans","training-documentation"].map(id => [id, {
          moduleId: id, status: "blocked", requirements: { lifecycle: "blocked" },
        }]),
    ),
    retention: { application: "ulc-linz", legalApproval: false, runtimeActive: false },
    provider: {
      application: "ulc-linz",
      providerScope: [
        { id: "cloudflare", appSpecificProductionEvidence: "open" },
        { id: "neon-postgresql", appSpecificProductionEvidence: "open" },
      ],
      dataFlows: [{ evidenceStatus: "open" }], m5: {},
    },
  };
  assert.throws(() => evaluateUlcT10PilotDecision({
    ...valid, app: {...valid.app, modules: valid.app.modules.slice(1)},
  }), /six-module/);
  assert.throws(() => evaluateUlcT10PilotDecision({
    ...valid, retention: {...valid.retention, application: "other"},
  }), /retention source mismatch/);
  assert.throws(() => evaluateUlcT10PilotDecision({
    ...valid, provider: {...valid.provider, providerScope: valid.provider.providerScope.slice(1)},
  }), /provider list changed/);
});
