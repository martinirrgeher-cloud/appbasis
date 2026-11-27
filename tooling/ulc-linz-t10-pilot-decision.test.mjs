import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateUlcT10PilotDecision,
  readCurrentUlcT10PilotDecision,
  hasCurrentUlcProductionEvidence,
} from "./ulc-linz-t10-pilot-decision.mjs";

test("actual ULC T10 checks may become evidenced without authorizing production", async () => {
  const result = await readCurrentUlcT10PilotDecision();
  assert.equal(result.source, "git-working-tree-only");
  assert.equal(result.checkedModules.length, 6);
  assert.equal(result.checks.length, 19);
  assert.equal(result.openChecks.length,
    result.checks.filter(x => x.status === "open").length);
  assert.equal(result.readyForOperatorReview, result.openChecks.length === 0);
  assert.equal(result.evidenceStatus,
    result.openChecks.length === 0 ? "repository-prerequisites-verified" : "blocked");
  assert.equal(result.checks.find(x => x.id === "retention:predeployment-safe")?.status,
    "verified-in-repository");
  assert.equal(result.operatorApproved, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.personalDataActivationAuthorized, false);
  assert.equal(result.historicalRestorePromotionAuthorized, false);
  assert.equal(result.finalStatus, "NO-GO-until-separate-documented-T10-approval");
});

function t10LegalDecision(legalApproval) {
  const scope = "private-members-only-six-module-pilot-no-private-minor-media";
  return {
    schemaVersion: 1, application: "ulc-linz", environment: "production",
    documentType: "t10-current-production-legal-decision",
    currentSchemaTableCount: 69, scope, legalApproval, runtimeActive: false,
    decision: legalApproval ? {
      privateRecordReference: "private:ulc-linz/t10-formal-controller-signoff",
      responsibleRole: "authorised-club-privacy-controller",
      decidedOn: "2026-11-27",
      coveredPurposes: ["members", "parents", "training", "security"],
      includesMinorsAndParents: true,
      approvedPilotScope: scope,
    } : null,
  };
}

function currentReceipt() {
  return {
    appEnvironment: "ulc-linz-production",
    observedAt: new Date(Date.now()-3600_000).toISOString(),
    validUntilOrReviewAt: new Date(Date.now()+86400_000).toISOString(),
    reference: "https://github.com/martinirrgeher-cloud/appbasis/issues/716",
    accountBindingReference: "https://github.com/martinirrgeher-cloud/appbasis/issues/716",
  };
}

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
    retention: t10LegalDecision(true),
    provider: {
      application: "ulc-linz",
      providerScope: ["cloudflare","neon-postgresql"].map(id => ({
        id, appSpecificProductionEvidence: "verified", evidence: [currentReceipt()],
      })),
      dataFlows: [{ evidenceStatus: "verified", evidence: [currentReceipt()] }],
      productionEvidence: Object.fromEntries(
        ["dataRegion","dpa","encryption","subprocessors"]
          .map(key => [key, [currentReceipt()]])),
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

test("provider verification never passes with bare flags, stale or unbound proofs", () => {
  const proof = currentReceipt();
  assert.equal(hasCurrentUlcProductionEvidence([proof]), true);
  assert.equal(hasCurrentUlcProductionEvidence([]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof, appEnvironment: "other-app"}]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof,
    validUntilOrReviewAt: new Date(Date.now()-1_000).toISOString()}]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof, accountBindingReference: ""}]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof, reference: "https://"}]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof, accountBindingReference: "https://"}]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof,
    validUntilOrReviewAt: "2027-02-29T00:00:00.000Z"}]), false);
  assert.equal(hasCurrentUlcProductionEvidence([{...proof,
    observedAt: "2026-11-27T14:00:00"}]), false);
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
    retention: t10LegalDecision(false),
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
  }), /legal decision source mismatch/);
  assert.throws(() => evaluateUlcT10PilotDecision({
    ...valid, provider: {...valid.provider, providerScope: valid.provider.providerScope.slice(1)},
  }), /provider list changed/);
});
