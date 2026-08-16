import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadFactorySnapshot } from "./model.mjs";
import {
  evaluateM6ProductionLifecycle,
  REQUIRED_M6_PRODUCTION_LIFECYCLE_CRITERIA,
} from "./production-release-readiness.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedIds = [
  "m1Ready",
  "m2Ready",
  "m3Ready",
  "m4Ready",
  "m5Ready",
  "productionDatabaseReady",
  "productionWorkerReady",
  "productionDomainReady",
  "productionUsersAndPermissionsReady",
  "productionMigrationsApplied",
  "productionDeploymentCompleted",
  "postDeploySmokePassed",
];

const allEvidence = () => Object.fromEntries(expectedIds.map((id) => [id, true]));

test("M6 lifecycle pins the ordered production path from prerequisites through post-deploy smoke", () => {
  assert.deepEqual(
    REQUIRED_M6_PRODUCTION_LIFECYCLE_CRITERIA.map((criterion) => criterion.id),
    expectedIds,
  );
  assert.deepEqual(
    REQUIRED_M6_PRODUCTION_LIFECYCLE_CRITERIA.map((criterion) => criterion.stage),
    [
      "prerequisites",
      "prerequisites",
      "prerequisites",
      "prerequisites",
      "prerequisites",
      "provisioning",
      "provisioning",
      "provisioning",
      "provisioning",
      "migration",
      "deployment",
      "verification",
    ],
  );
});

test("M6 lifecycle is blocked when evidence is missing and names the first open gate", () => {
  const readiness = evaluateM6ProductionLifecycle();

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionVerified, false);
  assert.equal(readiness.verifiedCount, 0);
  assert.equal(readiness.requiredCount, expectedIds.length);
  assert.equal(readiness.explicitApprovalRequired, true);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.nextCriterion?.id, "m1Ready");
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "open"));
});

test("M6 lifecycle remains fail-closed for out-of-order, truthy or unknown evidence", () => {
  const evidence = allEvidence();
  evidence.m1Ready = "yes";
  evidence.releaseProduction = true;

  const readiness = evaluateM6ProductionLifecycle(evidence);

  assert.equal(readiness.productionVerified, false);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.verifiedCount, expectedIds.length - 1);
  assert.equal(readiness.nextCriterion?.id, "m1Ready");
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "postDeploySmokePassed")?.status,
    "verified",
  );
});

test("complete technical M6 evidence still never authorizes release in the read-only contract", () => {
  const readiness = evaluateM6ProductionLifecycle(allEvidence());

  assert.equal(readiness.status, "verified");
  assert.equal(readiness.productionVerified, true);
  assert.equal(readiness.verifiedCount, expectedIds.length);
  assert.equal(readiness.nextCriterion, null);
  assert.equal(readiness.explicitApprovalRequired, true);
  assert.equal(readiness.releaseAuthorized, false);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "verified"));
});

test("malformed or inherited values cannot count as M6 production evidence", () => {
  assert.throws(
    () => evaluateM6ProductionLifecycle([]),
    /M6 production lifecycle evidence must be a plain object/,
  );
  assert.throws(
    () => evaluateM6ProductionLifecycle(null),
    /M6 production lifecycle evidence must be a plain object/,
  );

  const evidence = allEvidence();
  delete evidence.m4Ready;
  Object.defineProperty(Object.prototype, "m4Ready", {
    configurable: true,
    enumerable: false,
    value: true,
  });

  try {
    const readiness = evaluateM6ProductionLifecycle(evidence);
    assert.equal(readiness.productionVerified, false);
    assert.equal(readiness.releaseAuthorized, false);
    assert.equal(readiness.verifiedCount, expectedIds.length - 1);
    assert.equal(readiness.nextCriterion?.id, "m4Ready");
  } finally {
    delete Object.prototype.m4Ready;
  }
});

test("Factory snapshot exposes M6 read-only without inventing milestone or provider evidence", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot);

  assert.ok(snapshot.apps.length > 0);
  for (const app of snapshot.apps) {
    assert.equal(app.productionLifecycleReadiness.status, "blocked");
    assert.equal(app.productionLifecycleReadiness.productionVerified, false);
    assert.equal(app.productionLifecycleReadiness.requiredCount, expectedIds.length);
    assert.equal(app.productionLifecycleReadiness.explicitApprovalRequired, true);
    assert.equal(app.productionLifecycleReadiness.releaseAuthorized, false);
    assert.deepEqual(
      app.productionLifecycleReadiness.criteria.map((criterion) => criterion.id),
      expectedIds,
    );

    const m5Criterion = app.productionLifecycleReadiness.criteria.find(
      (criterion) => criterion.id === "m5Ready",
    );
    assert.equal(
      m5Criterion?.status,
      app.productionReadiness.productionReady === true ? "verified" : "open",
    );
    assert.ok(
      app.productionLifecycleReadiness.criteria
        .filter((criterion) => criterion.id !== "m5Ready")
        .every((criterion) => criterion.status === "open"),
    );
  }

  assert.equal(snapshot.capabilities.releaseProduction, false);
});
