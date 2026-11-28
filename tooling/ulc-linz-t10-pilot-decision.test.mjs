import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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

const scopedFlowDescriptors = [
  ["ulc-linz-user", "cloudflare", "application-request-processing", "t11-first-live"],
  ["cloudflare", "neon-postgresql", "application-persistence", "t11-first-live"],
  ["cloudflare", "neon-postgresql", "security-log-persistence", "t11-first-live"],
  ["appbasis-control-plane", "cloudflare", "provider-evidence-read", "out-of-app-runtime-read-only-source"],
  ["appbasis-control-plane", "neon-postgresql", "provider-evidence-read", "out-of-app-runtime-read-only-source"],
  ["neon-postgresql", "neon-postgresql", "managed-backup-recovery", "quarantine-no-promotion"],
];
function predeploymentFlows() {
  return scopedFlowDescriptors.map(([from, to, purpose, operationalDisposition]) => ({
    from, to, purpose,
    evidenceStatus: "open", // Live evidence intentionally not asserted ahead of T11.
    predeployment: {
      evidenceStatus: "verified", operationalDisposition,
      scope: "Source-checked protected ULC pilot, outside live user ingress before T11.",
      evidence: [currentReceipt()],
    },
  }));
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
      dataFlows: predeploymentFlows(),
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

test("T10 predeployment flow gate is exact and cannot be satisfied by invented T11 traffic", () => {
  function probe(dataFlows) {
    const ids = ["countdown","athletes","exercise-catalog","training-blocks",
      "training-plans","training-documentation"];
    return evaluateUlcT10PilotDecision({
      app: {schemaVersion:1,appId:"ulc-linz",modules:ids,status:"blocked",crossCutting:{}},
      modules: Object.fromEntries(ids.map(moduleId => [moduleId,{
        moduleId,status:"ready", requirements:{
          authorization:"verified",database:"verified",lifecycle:"verified",
        },
      }])),
      retention:t10LegalDecision(false),
      provider:{
        application:"ulc-linz",
        providerScope:["cloudflare","neon-postgresql"].map(id=>({
          id,appSpecificProductionEvidence:"open",
        })),
        dataFlows,m5:{},
      },
    }).checks.find(check=>check.id==="provider:data-flows")?.status;
  }
  const good = predeploymentFlows();
  assert.equal(probe(good),"verified-in-repository");
  assert.equal(good.every(x=>x.evidenceStatus==="open"),true);
  const missing = structuredClone(good);
  delete missing[0].predeployment;
  assert.equal(probe(missing),"open");
  const fakeLive = structuredClone(good);
  fakeLive[0].evidenceStatus="verified";
  assert.equal(probe(fakeLive),"open");
  const wrongDisposition = structuredClone(good);
  wrongDisposition[5].predeployment.operationalDisposition="t11-first-live";
  assert.equal(probe(wrongDisposition),"open");
  const unrelatedAccount = structuredClone(good);
  unrelatedAccount[2].predeployment.evidence[0].appEnvironment="other-app";
  assert.equal(probe(unrelatedAccount),"open");
  const stale = structuredClone(good);
  stale[1].predeployment.evidence[0].validUntilOrReviewAt =
    new Date(Date.now()-60_000).toISOString();
  assert.equal(probe(stale),"open");
  const unexpected = structuredClone(good);
  unexpected[3].to="unapproved-provider";
  assert.equal(probe(unexpected),"open");
  assert.throws(()=>probe(good.slice(1)),/flow scope changed/);
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

test("real T10 operator GO is pinned to protected six-module privacy evidence without T11 deployment", async () => {
  const read = async path => JSON.parse(await readFile(new URL("../" + path, import.meta.url), "utf8"));
  const legal = await read("apps/ulc-linz/privacy/t10-current-production-legal-decision.json");
  const app = await read("apps/ulc-linz/appbasis.production.json");
  const provider = await read("apps/ulc-linz/privacy/m5-provider-compliance-inventory.json");
  const current = await readCurrentUlcT10PilotDecision();

  const approvedScope = "private-members-only-six-module-pilot-no-private-minor-media";
  assert.equal(legal.legalApproval, true);
  assert.equal(legal.runtimeActive, false);
  assert.equal(legal.currentSchemaTableCount, 69);
  assert.equal(legal.scope, approvedScope);
  assert.equal(legal.decision?.privateRecordReference,
    "private:ulc-linz/t10-operator-go-2026-11-28");
  assert.equal(legal.decision?.decidedOn, "2026-11-28");
  assert.equal(legal.decision?.approvedPilotScope, approvedScope);
  assert.equal(legal.decision?.includesMinorsAndParents, true);
  assert.equal(legal.decision?.responsibleRole, "authorised-ulc-linz-club-controller");
  assert.deepEqual(legal.decision?.approvedProviderScope,
    ["cloudflare", "neon-postgresql"]);
  for (const k of ["t11DeploymentAuthorized", "t11IngressAuthorized",
    "personalDataActivationAuthorized", "oldRestorePromotionAuthorized",
    "privateMediaAuthorized"]) assert.equal(legal.decision?.[k], false);
  assert.equal(legal.decision?.authorityBasis, "explicit-operator-chat-go-2026-11-28");

  assert.equal(app.status, "ready");
  assert.equal(app.crossCutting.privacy, "verified");
  assert.equal(app.crossCutting.applicationLifecycle, "verified");
  assert.deepEqual(app.blockers, []);
  assert.deepEqual(app.modules, [
    "countdown", "athletes", "exercise-catalog", "training-blocks",
    "training-plans", "training-documentation",
  ]);
  const entries = app.evidence.privacy;
  const paths = entries.map(e => e.path);
  for (const path of [
    "apps/ulc-linz/privacy/T10-PRIVACY-RELEASE-EVIDENCE-20261128.md",
    "apps/ulc-linz/privacy/t10-current-production-legal-decision.json",
    "apps/ulc-linz/privacy/m5-provider-compliance-inventory.json",
    "apps/ulc-linz/privacy/T02-APP-DATENSCHUTZINFORMATION-ENTWURF.md",
    "apps/ulc-linz/privacy/T07-LOESCHPRAXIS-BETRIEBSANWEISUNG-20261127.md",
    "apps/ulc-linz/worker/privacy-info-ui.ts",
    "apps/ulc-linz/worker/production-protected.ts",
  ]) assert.ok(paths.includes(path), path);
  for (const { path, gitBlobSha } of entries) {
    const bytes = await readFile(new URL("../" + path, import.meta.url));
    const digest = createHash("sha1")
      .update("blob " + bytes.length + "\0", "utf8")
      .update(bytes)
      .digest("hex");
    assert.equal(gitBlobSha, digest, path);
  }
  // No released private media, real traffic, old restore or automated retention.
  assert.equal(provider.dataFlows.length, 6);
  assert.equal(provider.dataFlows.every(x =>
    x.evidenceStatus === "open" && x.predeployment?.evidenceStatus === "verified"), true);
  assert.equal(current.checks.length, 19);
  for (const id of ["retention:legal", "app:privacy", "app:composition"]) {
    assert.equal(current.checks.find(x => x.id === id)?.status,
      "verified-in-repository", id);
  }
  assert.equal(current.operatorApproved, false,
    "Repository evaluator must not synthesize a separate live approval");
  for (const key of ["deploymentAuthorized", "personalDataActivationAuthorized",
    "historicalRestorePromotionAuthorized", "irreversibleActionsPerformed"])
    assert.equal(current[key], false);
});
