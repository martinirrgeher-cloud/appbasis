import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA } from "./factory-ui/production-release-readiness.mjs";
import {
  ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN,
  UlcLinzM6ProductionPreflightError,
  evaluateUlcLinzM6ProductionPreflight,
} from "./ulc-linz-m6-production-preflight.mjs";

const REPOSITORY_ROOT = process.cwd();
const APP_DEFINITION_PATH = "apps/ulc-linz/appbasis.app.json";
const DATABASE_MANIFEST_PATH = "apps/ulc-linz/appbasis.database.json";

const MUTATING_STEP_KINDS = new Set([
  "provider-write",
  "production-data-write",
  "application-write",
  "public-exposure-write",
  "recovery-validation-write",
  "production-smoke-write",
  "authorization-gate",
]);

test("ULC M6 preflight verifies repository contracts but never authorizes a provider write", async () => {
  const result = await evaluateUlcLinzM6ProductionPreflight(REPOSITORY_ROOT);

  assert.equal(result.application, "ulc-linz");
  assert.equal(result.environment, "production");
  assert.equal(result.status, "prepared-blocked-before-provider-write");
  assert.equal(result.repositoryPreflightVerified, true);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.explicitApprovalRequired, true);
  assert.equal(result.firstProviderWriteStepId, "neon-production-database");
  assert.deepEqual(result.prerequisiteGates, ["M3_DONE", "M4_DONE", "M5_DONE"]);

  assert.deepEqual(result.productionTarget, {
    databaseRegion: "EU / Frankfurt",
    providerRegion: "aws-eu-central-1",
    providerModel: "standard-workers-global-transient",
    euOnly: false,
    dedicatedProductionDatabase: true,
    dedicatedProductionWorker: true,
  });

  assert.deepEqual(result.contracts, {
    appDefinitionVerified: true,
    databaseManifestVerified: true,
    runtimeContractVerified: true,
    resourceBindingContractVerified: true,
    permissionProvisioningContractVerified: true,
    m6CriterionCoverageVerified: true,
    secretValuesInRepository: false,
    automaticProviderWrites: false,
    automaticProductionRelease: false,
  });

  assert.equal(result.executionPlan, ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.executionPlan), true);
});

test("ULC M6 execution plan covers every canonical M6 release criterion exactly by id", () => {
  const requiredIds = REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map(
    (criterion) => criterion.id,
  ).sort();
  const coveredIds = Object.keys(
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.m6CriterionCoverage,
  ).sort();

  assert.deepEqual(coveredIds, requiredIds);
  assert.deepEqual(
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.m6CriterionCoverage
      .productionUsersAndPermissionsReady,
    ["production-access-bootstrap"],
  );
  assert.deepEqual(
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.m6CriterionCoverage
      .securityPrivacyReady,
    ["m5-production-evidence"],
  );
});

test("ULC M6 plan keeps every mutating or release action behind explicit approval", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;

  assert.equal(plan.providerWritesEnabled, false);
  assert.equal(plan.firstProviderWriteStepId, "neon-production-database");
  assert.equal(plan.steps.length, 13);

  for (const step of plan.steps) {
    if (MUTATING_STEP_KINDS.has(step.kind)) {
      assert.equal(step.approvalRequired, true, step.id);
    }
  }

  const firstStep = plan.steps[0];
  assert.deepEqual(firstStep.target, {
    provider: "neon",
    dedicatedProductionResource: true,
    region: "aws-eu-central-1",
  });

  const releaseGate = plan.steps.at(-1);
  assert.equal(releaseGate.id, "release-gate");
  assert.equal(releaseGate.approvalRequired, true);
  assert.equal(releaseGate.target.explicitUserReleaseApprovalRequired, true);
  assert.equal(releaseGate.target.automaticRelease, false);
});

test("ULC M6 separates hostname selection from public domain activation", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  const selection = plan.steps.find(
    (step) => step.id === "production-domain-selection",
  );
  const activation = plan.steps.find(
    (step) => step.id === "production-domain-activation",
  );

  assert.equal(selection.kind, "operator-input");
  assert.equal(selection.target.providerWrite, false);
  assert.equal(selection.target.publicIngress, false);

  assert.equal(activation.kind, "public-exposure-write");
  assert.equal(activation.approvalRequired, true);
  assert.equal(activation.target.publicIngress, true);
  assert.deepEqual(activation.requires, [
    "production-domain-selection",
    "production-worker-deploy",
    "production-access-bootstrap",
  ]);
});

test("ULC M6 migrations require recovery precheck, recovery path and verification", () => {
  const migration = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.find(
    (step) => step.id === "production-migrations",
  );

  assert.equal(migration.kind, "production-data-write");
  assert.equal(migration.approvalRequired, true);
  assert.equal(migration.target.backupRecoveryStatePrecheckRequired, true);
  assert.equal(
    migration.target.immediateBackupBeforeCriticalMigrationPreferred,
    true,
  );
  assert.equal(migration.target.rollbackOrRecoveryPlanRequired, true);
  assert.equal(migration.target.migrationVerificationRequired, true);
});

test("ULC M6 runtime configuration names secrets without storing secret values", () => {
  const step = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.find(
    (entry) => entry.id === "runtime-configuration",
  );

  assert.deepEqual(step.target.secretNames, ["BETTER_AUTH_SECRET"]);
  assert.deepEqual(step.target.plainConfigurationNames, ["APPBASIS_BASE_URL"]);
  assert.deepEqual(step.target.requiredBindings, ["HYPERDRIVE"]);
  assert.equal(step.target.secretValuesInRepository, false);
});

test("ULC M6 production access bootstrap stays explicit and has no default principal assignment", () => {
  const step = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.find(
    (entry) => entry.id === "production-access-bootstrap",
  );

  assert.equal(step.kind, "application-write");
  assert.equal(step.approvalRequired, true);
  assert.equal(step.target.principalAssignmentsMustBeExplicit, true);
  assert.equal(step.target.defaultPrincipalAssignments, 0);
  assert.equal(step.target.leastPrivilegeRequired, true);
  assert.equal(step.target.noSecondProvisioningContract, true);
});

test("ULC M6 preflight fails closed when app definition drifts", async () => {
  await withRepositoryFixture(async (root, fixture) => {
    fixture.appDefinition.modules = ["tasks"];
    await writeFixture(root, fixture);

    await assert.rejects(
      evaluateUlcLinzM6ProductionPreflight(root),
      errorWithCode("APP_DEFINITION_INVALID"),
    );
  });
});

test("ULC M6 preflight fails closed when database ownership or migrations drift", async () => {
  await withRepositoryFixture(async (root, fixture) => {
    fixture.databaseManifest.owners[0].schemaVersion = 999;
    await writeFixture(root, fixture);

    await assert.rejects(
      evaluateUlcLinzM6ProductionPreflight(root),
      errorWithCode("DATABASE_MANIFEST_INVALID"),
    );
  });
});

test("ULC M6 preflight fails closed on extra app manifest fields", async () => {
  await withRepositoryFixture(async (root, fixture) => {
    fixture.appDefinition.productionSecret = "must-not-be-here";
    await writeFixture(root, fixture);

    await assert.rejects(
      evaluateUlcLinzM6ProductionPreflight(root),
      errorWithCode("APP_DEFINITION_INVALID"),
    );
  });
});

async function withRepositoryFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "appbasis-m6-preflight-"));
  try {
    const fixture = {
      appDefinition: JSON.parse(
        await readFile(join(REPOSITORY_ROOT, APP_DEFINITION_PATH), "utf8"),
      ),
      databaseManifest: JSON.parse(
        await readFile(join(REPOSITORY_ROOT, DATABASE_MANIFEST_PATH), "utf8"),
      ),
    };
    await run(root, fixture);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeFixture(root, fixture) {
  const appRoot = join(root, "apps", "ulc-linz");
  await mkdir(appRoot, { recursive: true });
  await Promise.all([
    writeFile(
      join(appRoot, "appbasis.app.json"),
      `${JSON.stringify(fixture.appDefinition, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      join(appRoot, "appbasis.database.json"),
      `${JSON.stringify(fixture.databaseManifest, null, 2)}\n`,
      "utf8",
    ),
  ]);
}

function errorWithCode(code) {
  return (error) => {
    assert.equal(error instanceof UlcLinzM6ProductionPreflightError, true);
    assert.equal(error.code, code);
    return true;
  };
}
