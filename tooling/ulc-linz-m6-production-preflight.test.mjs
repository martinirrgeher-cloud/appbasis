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

const EXPECTED_STEPS = [
  [
    "neon-production-database",
    "provider-write",
    ["prerequisite:M3_DONE"],
  ],
  ["production-worker", "provider-write", ["neon-production-database"]],
  [
    "database-binding",
    "provider-write",
    ["neon-production-database", "production-worker"],
  ],
  ["production-domain-selection", "operator-input", ["production-worker"]],
  [
    "runtime-configuration",
    "provider-write",
    ["database-binding", "production-worker"],
  ],
  [
    "production-security-logging-sink",
    "provider-write",
    ["production-worker", "runtime-configuration"],
  ],
  [
    "production-migrations",
    "production-data-write",
    ["neon-production-database"],
  ],
  [
    "production-worker-deploy",
    "provider-write",
    [
      "database-binding",
      "runtime-configuration",
      "production-security-logging-sink",
      "production-migrations",
    ],
  ],
  [
    "production-access-bootstrap",
    "application-write",
    ["production-migrations", "production-worker-deploy"],
  ],
  [
    "backup-recovery-validation",
    "recovery-validation-write",
    [
      "production-migrations",
      "production-worker-deploy",
      "production-access-bootstrap",
    ],
  ],
  [
    "m5-production-evidence",
    "read-only-evidence",
    [
      "production-worker-deploy",
      "production-access-bootstrap",
      "production-security-logging-sink",
      "backup-recovery-validation",
    ],
  ],
  [
    "production-domain-activation",
    "public-exposure-write",
    [
      "production-domain-selection",
      "production-worker-deploy",
      "production-access-bootstrap",
      "backup-recovery-validation",
      "m5-production-evidence",
      "prerequisite:M4_DONE",
    ],
  ],
  [
    "post-deploy-smokes",
    "production-smoke-write",
    [
      "backup-recovery-validation",
      "m5-production-evidence",
      "production-domain-activation",
    ],
  ],
  [
    "release-gate",
    "authorization-gate",
    [
      "backup-recovery-validation",
      "m5-production-evidence",
      "post-deploy-smokes",
    ],
  ],
];
const MUTATING_STEP_KINDS = new Set([
  "provider-write",
  "production-data-write",
  "application-write",
  "public-exposure-write",
  "recovery-validation-write",
  "production-smoke-write",
  "authorization-gate",
]);
const ALLOWED_EXTERNAL_PREREQUISITES = new Set([
  "prerequisite:M3_DONE",
  "prerequisite:M4_DONE",
]);

test("ULC M6 preflight separates controlled production preparation from Production Ready", async () => {
  const result = await evaluateUlcLinzM6ProductionPreflight(REPOSITORY_ROOT);

  assert.equal(result.application, "ulc-linz");
  assert.equal(result.environment, "production");
  assert.equal(result.status, "prepared-blocked-before-provider-write");
  assert.equal(result.repositoryPreflightVerified, true);
  assert.equal(result.providerWriteAllowed, false);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.explicitApprovalRequired, true);
  assert.equal(result.firstProviderWriteStepId, "neon-production-database");
  assert.deepEqual(result.productionPreparationPrerequisiteGates, ["M3_DONE"]);
  assert.deepEqual(result.productionReadyRequiredGates, ["M4_DONE", "M5_DONE"]);
  assert.equal(result.publicExposureBeforeProductionReadyGatesAllowed, false);
  assert.deepEqual(result.nextAction, {
    phase: "production-preparation",
    stepId: "neon-production-database",
    actionClass: "provider-write",
    approvalRequired: true,
    executionAuthorized: false,
  });

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
    runtimeBindingDigestContractVerified: true,
    resourceBindingValidationContractVerified: true,
    permissionProvisioningContractVerified: true,
    m6CriterionCoverageVerified: true,
    productionPreparationSeparatedFromProductionReady: true,
    recoveryEvidencePrecedesFinalM5Gate: true,
    publicExposureBlockedUntilM4M5: true,
    liveProductionEvidenceConsumed: false,
    secretValuesInRepository: false,
    automaticProviderWrites: false,
    automaticProductionRelease: false,
  });

  assert.equal(result.executionPlan, ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.nextAction), true);
  assert.equal(Object.isFrozen(result.executionPlan), true);
});

test("ULC M6 phase model permits approved non-public preparation before M4/M5 but requires them for Production Ready", () => {
  const phaseModel = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.phaseModel;

  assert.deepEqual(phaseModel.productionPreparation, {
    requiredGateEvidence: ["M3_DONE"],
    m4RequiredBeforePreparationWrite: false,
    m5RequiredBeforePreparationWrite: false,
    explicitApprovalRequiredPerMutatingStep: true,
    publicExposureAllowed: false,
  });
  assert.deepEqual(phaseModel.productionReady, {
    requiredGateEvidence: ["M4_DONE", "M5_DONE"],
    publicExposureAllowedAfterGates: true,
    postDeploySmokeRequired: true,
  });
  assert.deepEqual(phaseModel.release, {
    productionReadyRequired: true,
    explicitUserReleaseApprovalRequired: true,
    automaticRelease: false,
  });
});

test("ULC M6 execution plan pins every step id, step kind and exact dependency", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;

  assert.equal(plan.steps.length, EXPECTED_STEPS.length);
  const seen = new Set();
  for (const [index, step] of plan.steps.entries()) {
    assert.deepEqual([step.id, step.kind, step.requires], EXPECTED_STEPS[index]);
    assert.equal(step.sequence, index + 1);
    for (const requirement of step.requires) {
      if (requirement.startsWith("prerequisite:")) {
        assert.equal(
          ALLOWED_EXTERNAL_PREREQUISITES.has(requirement),
          true,
          `${step.id} -> ${requirement}`,
        );
      } else {
        assert.equal(seen.has(requirement), true, `${step.id} -> ${requirement}`);
      }
    }
    seen.add(step.id);
  }
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
    ["production-security-logging-sink", "m5-production-evidence"],
  );
  assert.deepEqual(
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.m6CriterionCoverage.previewAccepted,
    ["prerequisite:M3_DONE"],
  );
});

test("ULC M6 plan keeps every mutating or release action behind explicit approval", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;

  assert.equal(plan.providerWritesEnabled, false);
  assert.equal(plan.firstProviderWriteStepId, "neon-production-database");

  for (const step of plan.steps) {
    if (MUTATING_STEP_KINDS.has(step.kind)) {
      assert.equal(step.approvalRequired, true, step.id);
    }
  }

  const firstStep = plan.steps[0];
  assert.deepEqual(firstStep.requires, ["prerequisite:M3_DONE"]);
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

test("ULC M6 keeps worker creation and deploy private and blocks public domain activation until M4/M5 evidence", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  const worker = plan.steps.find((step) => step.id === "production-worker");
  const deploy = plan.steps.find(
    (step) => step.id === "production-worker-deploy",
  );
  const selection = plan.steps.find(
    (step) => step.id === "production-domain-selection",
  );
  const activation = plan.steps.find(
    (step) => step.id === "production-domain-activation",
  );

  assert.equal(worker.target.workersDev, false);
  assert.equal(worker.target.publicIngress, false);
  assert.equal(deploy.target.publicIngress, false);
  assert.equal(selection.kind, "operator-input");
  assert.equal(selection.target.providerWrite, false);
  assert.equal(selection.target.publicIngress, false);
  assert.equal(activation.kind, "public-exposure-write");
  assert.equal(activation.approvalRequired, true);
  assert.equal(activation.target.publicIngress, true);
  assert.equal(activation.requires.includes("m5-production-evidence"), true);
  assert.equal(activation.requires.includes("backup-recovery-validation"), true);
  assert.equal(activation.requires.includes("prerequisite:M4_DONE"), true);
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

test("ULC M6 security logging sink is a separate approved preparation write and blocks deploy and final M5 evidence until its real contract can be evidenced", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  const logging = plan.steps.find(
    (entry) => entry.id === "production-security-logging-sink",
  );
  const deploy = plan.steps.find(
    (entry) => entry.id === "production-worker-deploy",
  );
  const m5 = plan.steps.find((entry) => entry.id === "m5-production-evidence");

  assert.equal(logging.kind, "provider-write");
  assert.equal(logging.approvalRequired, true);
  assert.equal(logging.target.providerNeutralContract, true);
  assert.equal(logging.target.providerSelectionMustBeExplicit, true);
  assert.equal(logging.target.structuredEventCaptureRequired, true);
  assert.equal(logging.target.protectedOperationalAccessRequired, true);
  assert.equal(logging.target.retentionMonths, 12);
  assert.equal(logging.target.retentionMustBeProviderVerified, true);
  assert.equal(logging.target.sinkInventoryMustBeComplete, true);
  assert.equal(logging.target.publicReadEndpointAllowed, false);
  assert.equal(logging.target.runtimeDeliveryIntegrationRequired, true);
  assert.equal(deploy.requires.includes("production-security-logging-sink"), true);
  assert.equal(m5.requires.includes("production-security-logging-sink"), true);
  assert.equal(m5.requires.includes("production-worker-deploy"), true);
  assert.equal(m5.requires.includes("production-access-bootstrap"), true);
  assert.equal(m5.requires.includes("backup-recovery-validation"), true);
  assert.equal(
    m5.target.auditSecurityLoggingEvidenceOwner,
    "tooling/ulc-linz-m5-audit-security-logging-evidence.mjs",
  );
});

test("ULC M6 production access bootstrap reuses existing identity and principal-access writers", () => {
  const step = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.find(
    (entry) => entry.id === "production-access-bootstrap",
  );

  assert.equal(step.kind, "application-write");
  assert.equal(step.approvalRequired, true);
  assert.equal(
    step.target.identityBootstrapContract,
    "@appbasis/identity/root-admin#createInitialTechnicalAdmin",
  );
  assert.equal(step.target.requiresEmptyOrRecoverableIdentitySet, true);
  assert.equal(
    step.target.principalAccessOrchestration,
    "tooling/ulc-linz-m5-principal-access-orchestration.mjs#replaceUlcLinzPrincipalAccess",
  );
  assert.equal(
    step.target.principalAccessAdministration,
    "PostgresPrincipalAccessAdministration",
  );
  assert.equal(step.target.principalAssignmentsMustBeExplicit, true);
  assert.equal(step.target.defaultPrincipalAssignments, 0);
  assert.equal(step.target.leastPrivilegeRequired, true);
  assert.equal(step.target.noSecondProvisioningContract, true);
});

test("ULC M6 recovery precedes the final M5 gate and both precede public exposure", () => {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  const recovery = plan.steps.find(
    (step) => step.id === "backup-recovery-validation",
  );
  const m5 = plan.steps.find((step) => step.id === "m5-production-evidence");
  const activation = plan.steps.find(
    (step) => step.id === "production-domain-activation",
  );
  const smokes = plan.steps.find((step) => step.id === "post-deploy-smokes");

  assert.equal(recovery.sequence, 10);
  assert.equal(recovery.requires.includes("m5-production-evidence"), false);
  assert.equal(recovery.requires.includes("production-migrations"), true);
  assert.equal(recovery.requires.includes("production-worker-deploy"), true);
  assert.equal(recovery.requires.includes("production-access-bootstrap"), true);
  assert.equal(recovery.target.automaticBackupRequired, true);
  assert.equal(recovery.target.retentionRequired, true);
  assert.equal(recovery.target.realRestoreRequired, true);
  assert.equal(recovery.target.restoreDataIntegrityCheckRequired, true);
  assert.equal(recovery.target.restoreAuthCheckRequired, true);
  assert.equal(recovery.target.restorePermissionsCheckRequired, true);
  assert.equal(recovery.target.restoreApplicationSmokeRequired, true);

  assert.equal(m5.sequence, 11);
  assert.equal(m5.approvalRequired, false);
  assert.equal(m5.requires.includes("backup-recovery-validation"), true);
  assert.equal(m5.target.gate, "Security & Privacy Ready v0.1");
  assert.equal(m5.target.backupRestoreEvidenceRequiredForHighPrivacyProfile, true);
  assert.equal(m5.target.allRequired, true);
  assert.equal(m5.target.failClosed, true);
  assert.equal(
    m5.target.resourceBindingConsumer,
    "tooling/ulc-linz-m6-production-resource-binding.mjs",
  );
  assert.equal(
    m5.target.auditSecurityLoggingEvidenceOwner,
    "tooling/ulc-linz-m5-audit-security-logging-evidence.mjs",
  );

  assert.equal(activation.requires.includes("backup-recovery-validation"), true);
  assert.equal(activation.requires.includes("m5-production-evidence"), true);
  assert.equal(activation.requires.includes("prerequisite:M4_DONE"), true);
  assert.deepEqual(smokes.target.checks, [
    "health",
    "auth",
    "permissions",
    "application",
  ]);
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
