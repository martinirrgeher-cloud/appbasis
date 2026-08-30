import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deriveUlcLinzM5FAuditSecurityLoggingRepositoryEvidence } from "../ulc-linz-m5-audit-security-logging-evidence.mjs";
import { deriveUlcLinzM5HControlPlaneRepositoryEvidence } from "../ulc-linz-m5-control-plane-evidence.mjs";
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
const OPEN_PROVIDER_CRITERIA = Object.freeze([
  "dataRegion",
  "dpa",
  "encryption",
  "subprocessors",
]);
const AUDIT_CONTRACT_PATHS = Object.freeze([
  "apps/ulc-linz/worker/app.ts",
  "apps/ulc-linz/worker/authorization.ts",
  "apps/ulc-linz/worker/security-events.ts",
  "apps/ulc-linz/worker/security-events-postgres.ts",
  "apps/ulc-linz/migrations/0002_ulc_linz_security_event_log.sql",
  "apps/ulc-linz/migrations/0003_ulc_linz_security_event_access.sql",
]);
const CONTROL_PLANE_CONTRACT_PATHS = Object.freeze([
  "apps/ulc-linz/worker/app.ts",
  "apps/ulc-linz/worker/index.ts",
]);

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

async function copyRepositoryPaths(root, paths) {
  for (const path of paths) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(repositoryRoot, path), target);
  }
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

test("ULC M5 derives the truthful repository baseline without operational production gates", async () => {
  const readiness = evaluateProductionReadiness(
    await deriveUlcLinzM5JProductionEvidence(repositoryRoot, VALID_ULC_DEFINITION),
  );
  assert.equal(readiness.productionReady, false);
  assert.equal(readiness.verifiedCount, 8);
  assert.equal(readiness.requiredCount, 12);
  for (const criterion of REQUIRED_PRODUCTION_READINESS_CRITERIA) {
    assert.equal(
      criterionStatus(readiness, criterion.id),
      OPEN_PROVIDER_CRITERIA.includes(criterion.id) ? "open" : "verified",
      criterion.id,
    );
  }
});

test("static audit and control-plane M5 evidence fails closed on implementation drift", async (t) => {
  const auditRoot = await mkdtemp(join(tmpdir(), "appbasis-m5-audit-"));
  const controlRoot = await mkdtemp(join(tmpdir(), "appbasis-m5-control-"));
  t.after(() => Promise.all([
    rm(auditRoot, { recursive: true, force: true }),
    rm(controlRoot, { recursive: true, force: true }),
  ]));

  await copyRepositoryPaths(auditRoot, AUDIT_CONTRACT_PATHS);
  assert.deepEqual(deriveUlcLinzM5FAuditSecurityLoggingRepositoryEvidence(auditRoot), {
    auditSecurityLogging: true,
  });
  await writeFile(join(auditRoot, "apps/ulc-linz/worker/security-events.ts"), "", "utf8");
  assert.deepEqual(deriveUlcLinzM5FAuditSecurityLoggingRepositoryEvidence(auditRoot), {});

  await copyRepositoryPaths(controlRoot, CONTROL_PLANE_CONTRACT_PATHS);
  assert.deepEqual(deriveUlcLinzM5HControlPlaneRepositoryEvidence(controlRoot), {
    privilegedControlPlaneIsolation: true,
  });
  await writeFile(join(controlRoot, "apps/ulc-linz/worker/app.ts"), "", "utf8");
  assert.deepEqual(deriveUlcLinzM5HControlPlaneRepositoryEvidence(controlRoot), {});
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
    assert.equal(
      criterion.status,
      OPEN_PROVIDER_CRITERIA.includes(criterion.id) ? "open" : "verified",
      criterion.id,
    );
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
