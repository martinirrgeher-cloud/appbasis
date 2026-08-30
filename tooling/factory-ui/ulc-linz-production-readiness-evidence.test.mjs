import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluateProductionReadiness,
  REQUIRED_PRODUCTION_READINESS_CRITERIA,
} from "./production-readiness.mjs";
import {
  composeUlcLinzM5JProductionEvidence,
  deriveUlcLinzM5JProductionEvidence,
  isUlcLinzM5JOwnerMatrixComplete,
  ULC_LINZ_M5_J_OWNER_MATRIX,
} from "./ulc-linz-production-readiness-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

function ownerEvidenceAllTrue() {
  return Object.fromEntries(
    ULC_LINZ_M5_J_OWNER_MATRIX.map((entry) => [
      entry.owner,
      Object.fromEntries(entry.criteria.map((criterionId) => [criterionId, true])),
    ]),
  );
}

function criterionStatus(readiness, id) {
  return readiness.criteria.find((criterion) => criterion.id === id)?.status;
}

test("M5 ownership matrix covers every canonical criterion exactly once", () => {
  assert.equal(isUlcLinzM5JOwnerMatrixComplete(), true);
  const assigned = ULC_LINZ_M5_J_OWNER_MATRIX.flatMap((entry) => entry.criteria);
  assert.equal(assigned.length, REQUIRED_PRODUCTION_READINESS_CRITERIA.length);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.deepEqual(
    new Set(assigned),
    new Set(REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id)),
  );
});

test("M5 generic composition remains strictly all-required", () => {
  const complete = evaluateProductionReadiness(
    composeUlcLinzM5JProductionEvidence(ownerEvidenceAllTrue()),
  );
  assert.equal(complete.productionReady, true);
  assert.equal(complete.verifiedCount, 12);

  for (const criterion of REQUIRED_PRODUCTION_READINESS_CRITERIA) {
    const owners = ownerEvidenceAllTrue();
    const owner = ULC_LINZ_M5_J_OWNER_MATRIX.find((entry) =>
      entry.criteria.includes(criterion.id),
    );
    assert.ok(owner);
    delete owners[owner.owner][criterion.id];
    const incomplete = evaluateProductionReadiness(
      composeUlcLinzM5JProductionEvidence(owners),
    );
    assert.equal(incomplete.productionReady, false, criterion.id);
    assert.equal(incomplete.verifiedCount, 11, criterion.id);
    assert.equal(criterionStatus(incomplete, criterion.id), "open", criterion.id);
  }
});

test("ULC M5 derives 12/12 from the canonical version-controlled evidence snapshot", async () => {
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION),
  );
  assert.equal(readiness.productionReady, true);
  assert.equal(readiness.verifiedCount, 12);
  assert.equal(readiness.requiredCount, 12);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "verified"));
});

test("ULC M5 snapshot is exact, ordered, traceable and contains no operational production gate", async () => {
  const snapshot = JSON.parse(
    await readFile(
      resolve(repositoryRoot, "apps/ulc-linz/privacy/m5-security-privacy-readiness.json"),
      "utf8",
    ),
  );
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.application, "ulc-linz");
  assert.equal(snapshot.gate, "security-privacy-ready-v0.1");
  assert.deepEqual(
    snapshot.criteria.map(({ id }) => id),
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id),
  );
  for (const criterion of snapshot.criteria) {
    assert.equal(criterion.status, "verified", criterion.id);
    assert.ok(Array.isArray(criterion.evidence) && criterion.evidence.length > 0, criterion.id);
    assert.ok(criterion.evidence.every((path) => typeof path === "string" && path.length > 0), criterion.id);
  }
  const serialized = JSON.stringify(snapshot);
  assert.doesNotMatch(serialized, /productionDeploymentCompleted|restoreSucceeded|cleanupLastSucceededAt|runtimeBindingId/);
});

test("ULC M5 fails closed for a non-target app definition", async () => {
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, {
      ...VALID_ULC_DEFINITION,
      appId: "other-app",
    }),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.verifiedCount, 0);
});
