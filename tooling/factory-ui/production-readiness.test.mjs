import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";

const expectedIds = [
  "dataRegion",
  "dpa",
  "encryption",
  "rolesAndPermissions",
  "deletionConcept",
  "retention",
  "dataExport",
  "auditSecurityLogging",
  "subprocessors",
  "highPrivacyProfile",
  "secretsOutsideAppManifests",
  "privilegedControlPlaneIsolation",
];

test("M5 gate contains every required production security and privacy criterion", () => {
  assert.deepEqual(
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map((criterion) => criterion.id),
    expectedIds,
  );
});

test("M5 gate is blocked when no production evidence is supplied", () => {
  const readiness = evaluateProductionReadiness();

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.verifiedCount, 0);
  assert.equal(readiness.requiredCount, expectedIds.length);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "open"));
});

test("M5 gate remains blocked when even one required criterion is not verified", () => {
  const evidence = Object.fromEntries(expectedIds.map((id) => [id, true]));
  evidence.subprocessors = false;

  const readiness = evaluateProductionReadiness(evidence);

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.verifiedCount, expectedIds.length - 1);
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "subprocessors")?.status,
    "open",
  );
});

test("M5 gate becomes ready only when every required criterion is explicitly true", () => {
  const evidence = Object.fromEntries(expectedIds.map((id) => [id, true]));
  const readiness = evaluateProductionReadiness(evidence);

  assert.equal(readiness.status, "ready");
  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, expectedIds.length);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "verified"));
});

test("truthy strings, unknown keys and malformed evidence cannot unlock M5", () => {
  const almost = Object.fromEntries(expectedIds.map((id) => [id, true]));
  almost.highPrivacyProfile = "yes";
  almost.productionReady = true;

  const readiness = evaluateProductionReadiness(almost);
  assert.equal(readiness.productionReady, false);
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "highPrivacyProfile")?.status,
    "open",
  );

  assert.throws(
    () => evaluateProductionReadiness([]),
    /Production readiness evidence must be a plain object/,
  );
  assert.throws(
    () => evaluateProductionReadiness(null),
    /Production readiness evidence must be a plain object/,
  );
});
