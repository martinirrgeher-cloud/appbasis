import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadFactorySnapshot } from "./model.mjs";
import {
  evaluateM6ProductionReleaseReadiness,
  REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA,
} from "./production-release-readiness.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedIds = [
  "previewAccepted",
  "productionDatabaseReady",
  "productionWorkerReady",
  "productionDomainReady",
  "productionUsersAndPermissionsReady",
  "backupRecoveryReady",
  "securityPrivacyReady",
  "productionMigrationsApplied",
  "productionDeploymentCompleted",
  "postDeploySmokePassed",
];

const allEvidence = () => Object.fromEntries(expectedIds.map((id) => [id, true]));

test("M6 release readiness pins only the semantic per-app production gates", () => {
  assert.deepEqual(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map((criterion) => criterion.id),
    expectedIds,
  );
  assert.ok(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.every(
      (criterion) => !Object.hasOwn(criterion, "stage"),
    ),
  );
});

test("M6 release readiness is blocked when evidence is missing", () => {
  const readiness = evaluateM6ProductionReleaseReadiness();

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.technicalEvidenceVerified, false);
  assert.equal(readiness.verifiedCount, 0);
  assert.equal(readiness.requiredCount, expectedIds.length);
  assert.equal(readiness.explicitApprovalRequired, true);
  assert.equal(readiness.releaseAuthorized, false);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "open"));
});

test("M6 release readiness remains fail-closed for truthy or unknown evidence", () => {
  const evidence = allEvidence();
  evidence.previewAccepted = "yes";
  evidence.releaseProduction = true;

  const readiness = evaluateM6ProductionReleaseReadiness(evidence);

  assert.equal(readiness.technicalEvidenceVerified, false);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.verifiedCount, expectedIds.length - 1);
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "previewAccepted")?.status,
    "open",
  );
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "postDeploySmokePassed")?.status,
    "verified",
  );
});

test("complete technical M6 evidence still never authorizes release in the read-only contract", () => {
  const readiness = evaluateM6ProductionReleaseReadiness(allEvidence());

  assert.equal(readiness.status, "evidence-verified");
  assert.equal(readiness.technicalEvidenceVerified, true);
  assert.equal(readiness.verifiedCount, expectedIds.length);
  assert.equal(readiness.explicitApprovalRequired, true);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(Object.hasOwn(readiness, "productionVerified"), false);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "verified"));
});

test("malformed or inherited values cannot count as M6 production evidence", () => {
  assert.throws(
    () => evaluateM6ProductionReleaseReadiness([]),
    /M6 production release evidence must be a plain object/,
  );
  assert.throws(
    () => evaluateM6ProductionReleaseReadiness(null),
    /M6 production release evidence must be a plain object/,
  );

  const evidence = allEvidence();
  delete evidence.backupRecoveryReady;
  Object.defineProperty(Object.prototype, "backupRecoveryReady", {
    configurable: true,
    enumerable: false,
    value: true,
  });

  try {
    const readiness = evaluateM6ProductionReleaseReadiness(evidence);
    assert.equal(readiness.technicalEvidenceVerified, false);
    assert.equal(readiness.releaseAuthorized, false);
    assert.equal(readiness.verifiedCount, expectedIds.length - 1);
    assert.equal(
      readiness.criteria.find((criterion) => criterion.id === "backupRecoveryReady")?.status,
      "open",
    );
  } finally {
    delete Object.prototype.backupRecoveryReady;
  }
});

test("Factory snapshot exposes M6 read-only without inventing preview or provider evidence", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot);

  assert.ok(snapshot.apps.length > 0);
  for (const app of snapshot.apps) {
    assert.equal(app.productionReleaseReadiness.status, "blocked");
    assert.equal(app.productionReleaseReadiness.technicalEvidenceVerified, false);
    assert.equal(app.productionReleaseReadiness.requiredCount, expectedIds.length);
    assert.equal(app.productionReleaseReadiness.explicitApprovalRequired, true);
    assert.equal(app.productionReleaseReadiness.releaseAuthorized, false);
    assert.deepEqual(
      app.productionReleaseReadiness.criteria.map((criterion) => criterion.id),
      expectedIds,
    );

    const securityPrivacyCriterion = app.productionReleaseReadiness.criteria.find(
      (criterion) => criterion.id === "securityPrivacyReady",
    );
    assert.equal(
      securityPrivacyCriterion?.status,
      app.productionReadiness.productionReady === true ? "verified" : "open",
    );
    assert.ok(
      app.productionReleaseReadiness.criteria
        .filter((criterion) => criterion.id !== "securityPrivacyReady")
        .every((criterion) => criterion.status === "open"),
    );
  }

  assert.equal(snapshot.capabilities.releaseProduction, false);
});
