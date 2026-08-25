import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isCanonicalUlcLinzM6ProductionAccessBootstrapContract,
  ULC_LINZ_M6_PRODUCTION_ACCESS_BOOTSTRAP_CONTRACT,
} from "./ulc-linz-m6-production-access-bootstrap-contract.mjs";
import { ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN } from "./ulc-linz-m6-production-preflight.mjs";

test("binds the protected security-log role workflow to the canonical M6 access-bootstrap step", async () => {
  assert.equal(isCanonicalUlcLinzM6ProductionAccessBootstrapContract(), true);

  const contract = ULC_LINZ_M6_PRODUCTION_ACCESS_BOOTSTRAP_CONTRACT;
  assert.equal(contract.stepId, "production-access-bootstrap");
  assert.deepEqual(contract.requiresCompletedStepIds, [
    "production-migrations",
    "production-worker-deploy",
  ]);
  assert.deepEqual(contract.requiredBeforeStepIds, [
    "backup-recovery-validation",
    "m5-production-evidence",
  ]);
  assert.equal(contract.productionReleaseAuthorized, false);

  const accessIndex = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.findIndex(
    ({ id }) => id === contract.stepId,
  );
  const migrationsIndex = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.findIndex(
    ({ id }) => id === "production-migrations",
  );
  const evidenceIndex = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.findIndex(
    ({ id }) => id === "m5-production-evidence",
  );
  assert.ok(migrationsIndex >= 0 && migrationsIndex < accessIndex);
  assert.ok(accessIndex >= 0 && accessIndex < evidenceIndex);

  const workflow = await readFile(contract.protectedRoleBindingWorkflow, "utf8");
  for (const required of [
    "github.ref == 'refs/heads/main'",
    contract.protectedRoleBindingConfirmation,
    "ULC_LINZ_PRODUCTION_OWNER_DATABASE_URL",
    "ULC_LINZ_SECURITY_LOG_INGEST_DATABASE_URL",
    "ULC_LINZ_SECURITY_LOG_CLEANUP_DATABASE_URL",
    "ULC_LINZ_SECURITY_LOG_READ_DATABASE_URL",
    "ULC_LINZ_APPLY_SECURITY_LOG_ROLE_BINDING: '1'",
    "membershipBindingsVerified !== true",
    "productionReleaseAuthorized !== false",
  ]) {
    assert.ok(workflow.includes(required), required);
  }
});

test("fails closed when access-bootstrap ordering or dependencies drift", () => {
  const changed = structuredClone(ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN);
  const access = changed.steps.find(({ id }) => id === "production-access-bootstrap");
  access.requires = ["production-worker-deploy"];
  assert.equal(isCanonicalUlcLinzM6ProductionAccessBootstrapContract(changed), false);

  const changedEvidence = structuredClone(ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN);
  const evidence = changedEvidence.steps.find(({ id }) => id === "m5-production-evidence");
  evidence.requires = evidence.requires.filter((id) => id !== "production-access-bootstrap");
  assert.equal(
    isCanonicalUlcLinzM6ProductionAccessBootstrapContract(changedEvidence),
    false,
  );
});
