import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA } from "./factory-ui/production-release-readiness.mjs";
import {
  ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE,
  isCanonicalUlcLinzM5PermissionProvisioningBundle,
} from "./ulc-linz-m5-permission-provisioning.mjs";
import { ULC_LINZ_M5_TARGET_POLICY } from "./ulc-linz-m5-target-policy.mjs";
import { createExpectedUlcLinzDatabaseManifest } from "./ulc-linz-database-contract.mjs";
import { ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT } from "./ulc-linz-m6-production-resource-binding.mjs";

const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const NEON_REGION = "aws-eu-central-1";
const HUMAN_REGION = "EU / Frankfurt";
const PROVIDER_MODEL = "standard-workers-global-transient";

const APP_DEFINITION_FIELDS = Object.freeze([
  "schemaVersion",
  "appId",
  "displayName",
  "modules",
  "platformServices",
]);
const RESOURCE_BINDING_CONTRACT_FIELDS = Object.freeze([
  "schemaVersion",
  "application",
  "environment",
  "runtimeEntrypoint",
  "runtimeContractDigest",
  "providerModel",
  "euOnly",
  "neonRegion",
]);
const MUTATING_STEP_KINDS = new Set([
  "provider-write",
  "production-data-write",
  "application-write",
  "public-exposure-write",
  "recovery-validation-write",
  "production-smoke-write",
  "authorization-gate",
]);
const ALLOWED_PREREQUISITE_REFERENCES = Object.freeze([
  "prerequisite:M3_DONE",
]);

const EXPECTED_EXECUTION_STEPS = deepFreeze([
  { id: "neon-production-database", kind: "provider-write", requires: [] },
  {
    id: "production-worker",
    kind: "provider-write",
    requires: ["neon-production-database"],
  },
  {
    id: "database-binding",
    kind: "provider-write",
    requires: ["neon-production-database", "production-worker"],
  },
  {
    id: "production-domain-selection",
    kind: "operator-input",
    requires: ["production-worker"],
  },
  {
    id: "runtime-configuration",
    kind: "provider-write",
    requires: ["database-binding", "production-worker"],
  },
  {
    id: "production-security-logging-sink",
    kind: "provider-write",
    requires: ["production-worker", "runtime-configuration"],
  },
  {
    id: "production-migrations",
    kind: "production-data-write",
    requires: ["neon-production-database"],
  },
  {
    id: "production-worker-deploy",
    kind: "provider-write",
    requires: [
      "database-binding",
      "runtime-configuration",
      "production-security-logging-sink",
      "production-migrations",
    ],
  },
  {
    id: "production-access-bootstrap",
    kind: "application-write",
    requires: ["production-migrations", "production-worker-deploy"],
  },
  {
    id: "backup-recovery-validation",
    kind: "recovery-validation-write",
    requires: [
      "production-migrations",
      "production-worker-deploy",
      "production-access-bootstrap",
    ],
  },
  {
    id: "m5-production-evidence",
    kind: "read-only-evidence",
    requires: [
      "production-worker-deploy",
      "production-access-bootstrap",
      "production-security-logging-sink",
      "backup-recovery-validation",
    ],
  },
  {
    id: "production-domain-activation",
    kind: "public-exposure-write",
    requires: [
      "production-domain-selection",
      "production-worker-deploy",
      "production-access-bootstrap",
      "backup-recovery-validation",
      "m5-production-evidence",
    ],
  },
  {
    id: "post-deploy-smokes",
    kind: "production-smoke-write",
    requires: [
      "backup-recovery-validation",
      "m5-production-evidence",
      "production-domain-activation",
    ],
  },
  {
    id: "release-gate",
    kind: "authorization-gate",
    requires: [
      "backup-recovery-validation",
      "m5-production-evidence",
      "post-deploy-smokes",
    ],
  },
]);

const M6_CRITERION_COVERAGE = deepFreeze({
  previewAccepted: ["prerequisite:M3_DONE"],
  productionDatabaseReady: ["neon-production-database", "database-binding"],
  productionWorkerReady: ["production-worker", "production-worker-deploy"],
  productionDomainReady: ["production-domain-activation"],
  productionUsersAndPermissionsReady: ["production-access-bootstrap"],
  backupRecoveryReady: ["backup-recovery-validation"],
  securityPrivacyReady: [
    "production-security-logging-sink",
    "m5-production-evidence",
  ],
  productionMigrationsApplied: ["production-migrations"],
  productionDeploymentCompleted: ["production-worker-deploy"],
  postDeploySmokePassed: ["post-deploy-smokes"],
});

export const ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN = deepFreeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  mode: "preflight-only",
  providerWritesEnabled: false,
  firstProviderWriteStepId: "neon-production-database",
  phaseModel: {
    productionPreparation: {
      requiredGateEvidence: ["M3_DONE"],
      m4RequiredBeforePreparationWrite: false,
      m5RequiredBeforePreparationWrite: false,
      explicitApprovalRequiredPerMutatingStep: true,
      publicExposureAllowed: false,
    },
    productionReady: {
      requiredGateEvidence: ["M4_DONE", "M5_DONE"],
      publicExposureAllowedAfterGates: true,
      postDeploySmokeRequired: true,
    },
    release: {
      productionReadyRequired: true,
      explicitUserReleaseApprovalRequired: true,
      automaticRelease: false,
    },
  },
  m6CriterionCoverage: M6_CRITERION_COVERAGE,
  steps: [
    {
      sequence: 1,
      id: "neon-production-database",
      kind: "provider-write",
      approvalRequired: true,
      requires: [],
      target: {
        provider: "neon",
        dedicatedProductionResource: true,
        region: NEON_REGION,
      },
    },
    {
      sequence: 2,
      id: "production-worker",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["neon-production-database"],
      target: {
        provider: "cloudflare",
        dedicatedProductionResource: true,
        workersDev: false,
        publicIngress: false,
      },
    },
    {
      sequence: 3,
      id: "database-binding",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["neon-production-database", "production-worker"],
      target: {
        provider: "cloudflare",
        bindingType: "hyperdrive-or-equivalent-database-binding",
      },
    },
    {
      sequence: 4,
      id: "production-domain-selection",
      kind: "operator-input",
      approvalRequired: true,
      requires: ["production-worker"],
      target: {
        hostnameSource: "operator-supplied",
        providerWrite: false,
        publicIngress: false,
      },
    },
    {
      sequence: 5,
      id: "runtime-configuration",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["database-binding", "production-worker"],
      target: {
        provider: "cloudflare",
        secretNames: ["BETTER_AUTH_SECRET"],
        plainConfigurationNames: ["APPBASIS_BASE_URL"],
        requiredBindings: ["HYPERDRIVE"],
        secretValuesInRepository: false,
      },
    },
    {
      sequence: 6,
      id: "production-security-logging-sink",
      kind: "provider-write",
      approvalRequired: true,
      requires: ["production-worker", "runtime-configuration"],
      target: {
        providerNeutralContract: true,
        providerSelectionMustBeExplicit: true,
        structuredEventCaptureRequired: true,
        protectedOperationalAccessRequired: true,
        retentionMonths: 12,
        retentionMustBeProviderVerified: true,
        sinkInventoryMustBeComplete: true,
        publicReadEndpointAllowed: false,
        runtimeDeliveryIntegrationRequired: true,
      },
    },
    {
      sequence: 7,
      id: "production-migrations",
      kind: "production-data-write",
      approvalRequired: true,
      requires: ["neon-production-database"],
      target: {
        dialect: "postgresql",
        manifest: "apps/ulc-linz/appbasis.database.json",
        backupRecoveryStatePrecheckRequired: true,
        immediateBackupBeforeCriticalMigrationPreferred: true,
        rollbackOrRecoveryPlanRequired: true,
        migrationVerificationRequired: true,
      },
    },
    {
      sequence: 8,
      id: "production-worker-deploy",
      kind: "provider-write",
      approvalRequired: true,
      requires: [
        "database-binding",
        "runtime-configuration",
        "production-security-logging-sink",
        "production-migrations",
      ],
      target: {
        provider: "cloudflare",
        runtimeEntrypoint: "./worker/index.ts",
        publicIngress: false,
      },
    },
    {
      sequence: 9,
      id: "production-access-bootstrap",
      kind: "application-write",
      approvalRequired: true,
      requires: ["production-migrations", "production-worker-deploy"],
      target: {
        identityBootstrapContract:
          "@appbasis/identity/root-admin#createInitialTechnicalAdmin",
        requiresEmptyOrRecoverableIdentitySet: true,
        canonicalPermissionBundle:
          "tooling/ulc-linz-m5-permission-provisioning.mjs",
        principalAccessOrchestration:
          "tooling/ulc-linz-m5-principal-access-orchestration.mjs#replaceUlcLinzPrincipalAccess",
        principalAccessAdministration: "PostgresPrincipalAccessAdministration",
        principalAssignmentsMustBeExplicit: true,
        defaultPrincipalAssignments: 0,
        leastPrivilegeRequired: true,
        noSecondProvisioningContract: true,
      },
    },
    {
      sequence: 10,
      id: "backup-recovery-validation",
      kind: "recovery-validation-write",
      approvalRequired: true,
      requires: [
        "production-migrations",
        "production-worker-deploy",
        "production-access-bootstrap",
      ],
      target: {
        gate: "Backup & Disaster Recovery v0.1",
        automaticBackupRequired: true,
        retentionRequired: true,
        pointInTimeRecoveryPreferred: true,
        realRestoreRequired: true,
        restoreDataIntegrityCheckRequired: true,
        restoreAuthCheckRequired: true,
        restorePermissionsCheckRequired: true,
        restoreApplicationSmokeRequired: true,
      },
    },
    {
      sequence: 11,
      id: "m5-production-evidence",
      kind: "read-only-evidence",
      approvalRequired: false,
      requires: [
        "production-worker-deploy",
        "production-access-bootstrap",
        "production-security-logging-sink",
        "backup-recovery-validation",
      ],
      target: {
        gate: "Security & Privacy Ready v0.1",
        resourceBindingConsumer:
          "tooling/ulc-linz-m6-production-resource-binding.mjs",
        auditSecurityLoggingEvidenceOwner:
          "tooling/ulc-linz-m5-audit-security-logging-evidence.mjs",
        backupRestoreEvidenceRequiredForHighPrivacyProfile: true,
        allRequired: true,
        failClosed: true,
      },
    },
    {
      sequence: 12,
      id: "production-domain-activation",
      kind: "public-exposure-write",
      approvalRequired: true,
      requires: [
        "production-domain-selection",
        "production-worker-deploy",
        "production-access-bootstrap",
        "backup-recovery-validation",
        "m5-production-evidence",
      ],
      target: {
        provider: "cloudflare",
        hostnameSource: "operator-supplied",
        publicIngress: true,
      },
    },
    {
      sequence: 13,
      id: "post-deploy-smokes",
      kind: "production-smoke-write",
      approvalRequired: true,
      requires: [
        "backup-recovery-validation",
        "m5-production-evidence",
        "production-domain-activation",
      ],
      target: {
        checks: ["health", "auth", "permissions", "application"],
      },
    },
    {
      sequence: 14,
      id: "release-gate",
      kind: "authorization-gate",
      approvalRequired: true,
      requires: [
        "backup-recovery-validation",
        "m5-production-evidence",
        "post-deploy-smokes",
      ],
      target: {
        explicitUserReleaseApprovalRequired: true,
        automaticRelease: false,
      },
    },
  ],
});

export class UlcLinzM6ProductionPreflightError extends Error {
  constructor(code) {
    super("ULC Linz M6 production preflight failed.");
    this.name = "UlcLinzM6ProductionPreflightError";
    this.code = code;
  }
}

export async function evaluateUlcLinzM6ProductionPreflight(
  repositoryRoot = process.cwd(),
) {
  assertCanonicalTargetContract();
  assertExecutionPlanContract();
  assertM6CoverageContract();
  assertPermissionProvisioningContract();

  const root = resolve(repositoryRoot);
  const [appDefinition, databaseManifest] = await Promise.all([
    readJson(
      join(root, "apps", APPLICATION, "appbasis.app.json"),
      "APP_DEFINITION_INVALID",
    ),
    readJson(
      join(root, "apps", APPLICATION, "appbasis.database.json"),
      "DATABASE_MANIFEST_INVALID",
    ),
  ]);

  assertAppDefinition(appDefinition);
  assertDatabaseManifest(appDefinition, databaseManifest);
  assertResourceBindingContract();

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    status: "prepared-blocked-before-provider-write",
    repositoryPreflightVerified: true,
    providerWriteAllowed: false,
    releaseAuthorized: false,
    explicitApprovalRequired: true,
    productionPreparationPrerequisiteGates: ["M3_DONE"],
    productionReadyRequiredGates: ["M4_DONE", "M5_DONE"],
    publicExposureBeforeProductionReadyGatesAllowed: false,
    firstProviderWriteStepId:
      ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.firstProviderWriteStepId,
    nextAction: {
      phase: "production-preparation",
      stepId: ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.firstProviderWriteStepId,
      actionClass: "provider-write",
      approvalRequired: true,
      executionAuthorized: false,
    },
    productionTarget: {
      databaseRegion: HUMAN_REGION,
      providerRegion: NEON_REGION,
      providerModel: PROVIDER_MODEL,
      euOnly: false,
      dedicatedProductionDatabase: true,
      dedicatedProductionWorker: true,
    },
    contracts: {
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
    },
    executionPlan: ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN,
  });
}

function assertCanonicalTargetContract() {
  if (
    ULC_LINZ_M5_TARGET_POLICY.appId !== APPLICATION ||
    ULC_LINZ_M5_TARGET_POLICY.productionDatabaseRegionTarget !== HUMAN_REGION
  ) {
    fail("TARGET_POLICY_DRIFT");
  }
}

function assertExecutionPlanContract() {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  if (
    plan.application !== APPLICATION ||
    plan.environment !== ENVIRONMENT ||
    plan.mode !== "preflight-only" ||
    plan.providerWritesEnabled !== false ||
    plan.firstProviderWriteStepId !== "neon-production-database" ||
    !isDeepStrictEqual(plan.phaseModel?.productionPreparation?.requiredGateEvidence, [
      "M3_DONE",
    ]) ||
    plan.phaseModel?.productionPreparation?.m4RequiredBeforePreparationWrite !== false ||
    plan.phaseModel?.productionPreparation?.m5RequiredBeforePreparationWrite !== false ||
    plan.phaseModel?.productionPreparation?.explicitApprovalRequiredPerMutatingStep !== true ||
    plan.phaseModel?.productionPreparation?.publicExposureAllowed !== false ||
    !isDeepStrictEqual(plan.phaseModel?.productionReady?.requiredGateEvidence, [
      "M4_DONE",
      "M5_DONE",
    ]) ||
    plan.phaseModel?.productionReady?.publicExposureAllowedAfterGates !== true ||
    plan.phaseModel?.productionReady?.postDeploySmokeRequired !== true ||
    plan.phaseModel?.release?.productionReadyRequired !== true ||
    plan.phaseModel?.release?.explicitUserReleaseApprovalRequired !== true ||
    plan.phaseModel?.release?.automaticRelease !== false ||
    !Array.isArray(plan.steps) ||
    plan.steps.length !== EXPECTED_EXECUTION_STEPS.length
  ) {
    fail("EXECUTION_PLAN_DRIFT");
  }

  const priorStepIds = new Set();
  for (const [index, step] of plan.steps.entries()) {
    const expected = EXPECTED_EXECUTION_STEPS[index];
    if (
      expected === undefined ||
      step.sequence !== index + 1 ||
      step.id !== expected.id ||
      step.kind !== expected.kind ||
      !isDeepStrictEqual(step.requires, expected.requires) ||
      typeof step.approvalRequired !== "boolean"
    ) {
      fail("EXECUTION_PLAN_DRIFT");
    }

    if (step.requires.some((requiredStepId) => !priorStepIds.has(requiredStepId))) {
      fail("EXECUTION_DEPENDENCY_DRIFT");
    }
    priorStepIds.add(step.id);

    if (MUTATING_STEP_KINDS.has(step.kind) && step.approvalRequired !== true) {
      fail("WRITE_BOUNDARY_DRIFT");
    }
  }

  const neonDatabase = stepById(plan, "neon-production-database");
  if (
    neonDatabase.target?.provider !== "neon" ||
    neonDatabase.target?.dedicatedProductionResource !== true ||
    neonDatabase.target?.region !== NEON_REGION
  ) {
    fail("NEON_TARGET_DRIFT");
  }

  const productionWorker = stepById(plan, "production-worker");
  if (
    productionWorker.target?.provider !== "cloudflare" ||
    productionWorker.target?.dedicatedProductionResource !== true ||
    productionWorker.target?.workersDev !== false ||
    productionWorker.target?.publicIngress !== false
  ) {
    fail("WORKER_TARGET_DRIFT");
  }

  const databaseBinding = stepById(plan, "database-binding");
  if (
    databaseBinding.target?.provider !== "cloudflare" ||
    databaseBinding.target?.bindingType !==
      "hyperdrive-or-equivalent-database-binding"
  ) {
    fail("DATABASE_BINDING_TARGET_DRIFT");
  }

  const domainSelection = stepById(plan, "production-domain-selection");
  if (
    domainSelection.target?.hostnameSource !== "operator-supplied" ||
    domainSelection.target?.providerWrite !== false ||
    domainSelection.target?.publicIngress !== false
  ) {
    fail("DOMAIN_SELECTION_BOUNDARY_DRIFT");
  }

  const runtimeConfiguration = stepById(plan, "runtime-configuration");
  if (
    runtimeConfiguration.target?.provider !== "cloudflare" ||
    !isDeepStrictEqual(runtimeConfiguration.target?.secretNames, [
      "BETTER_AUTH_SECRET",
    ]) ||
    !isDeepStrictEqual(runtimeConfiguration.target?.plainConfigurationNames, [
      "APPBASIS_BASE_URL",
    ]) ||
    !isDeepStrictEqual(runtimeConfiguration.target?.requiredBindings, [
      "HYPERDRIVE",
    ]) ||
    runtimeConfiguration.target?.secretValuesInRepository !== false
  ) {
    fail("RUNTIME_CONFIGURATION_DRIFT");
  }

  const securityLogging = stepById(plan, "production-security-logging-sink");
  if (
    securityLogging.target?.providerNeutralContract !== true ||
    securityLogging.target?.providerSelectionMustBeExplicit !== true ||
    securityLogging.target?.structuredEventCaptureRequired !== true ||
    securityLogging.target?.protectedOperationalAccessRequired !== true ||
    securityLogging.target?.retentionMonths !== 12 ||
    securityLogging.target?.retentionMustBeProviderVerified !== true ||
    securityLogging.target?.sinkInventoryMustBeComplete !== true ||
    securityLogging.target?.publicReadEndpointAllowed !== false ||
    securityLogging.target?.runtimeDeliveryIntegrationRequired !== true ||
    securityLogging.approvalRequired !== true
  ) {
    fail("SECURITY_LOGGING_SINK_DRIFT");
  }

  const migration = stepById(plan, "production-migrations");
  if (
    migration.target?.dialect !== "postgresql" ||
    migration.target?.manifest !== "apps/ulc-linz/appbasis.database.json" ||
    migration.target?.backupRecoveryStatePrecheckRequired !== true ||
    migration.target?.immediateBackupBeforeCriticalMigrationPreferred !== true ||
    migration.target?.rollbackOrRecoveryPlanRequired !== true ||
    migration.target?.migrationVerificationRequired !== true
  ) {
    fail("MIGRATION_SAFETY_DRIFT");
  }

  const workerDeploy = stepById(plan, "production-worker-deploy");
  if (
    workerDeploy.target?.provider !== "cloudflare" ||
    workerDeploy.target?.runtimeEntrypoint !== "./worker/index.ts" ||
    workerDeploy.target?.publicIngress !== false
  ) {
    fail("WORKER_DEPLOYMENT_DRIFT");
  }

  const accessBootstrap = stepById(plan, "production-access-bootstrap");
  if (
    accessBootstrap.target?.identityBootstrapContract !==
      "@appbasis/identity/root-admin#createInitialTechnicalAdmin" ||
    accessBootstrap.target?.requiresEmptyOrRecoverableIdentitySet !== true ||
    accessBootstrap.target?.canonicalPermissionBundle !==
      "tooling/ulc-linz-m5-permission-provisioning.mjs" ||
    accessBootstrap.target?.principalAccessOrchestration !==
      "tooling/ulc-linz-m5-principal-access-orchestration.mjs#replaceUlcLinzPrincipalAccess" ||
    accessBootstrap.target?.principalAccessAdministration !==
      "PostgresPrincipalAccessAdministration" ||
    accessBootstrap.target?.principalAssignmentsMustBeExplicit !== true ||
    accessBootstrap.target?.defaultPrincipalAssignments !== 0 ||
    accessBootstrap.target?.leastPrivilegeRequired !== true ||
    accessBootstrap.target?.noSecondProvisioningContract !== true
  ) {
    fail("PRODUCTION_ACCESS_CONTRACT_DRIFT");
  }

  const recovery = stepById(plan, "backup-recovery-validation");
  if (
    recovery.target?.gate !== "Backup & Disaster Recovery v0.1" ||
    recovery.target?.automaticBackupRequired !== true ||
    recovery.target?.retentionRequired !== true ||
    recovery.target?.pointInTimeRecoveryPreferred !== true ||
    recovery.target?.realRestoreRequired !== true ||
    recovery.target?.restoreDataIntegrityCheckRequired !== true ||
    recovery.target?.restoreAuthCheckRequired !== true ||
    recovery.target?.restorePermissionsCheckRequired !== true ||
    recovery.target?.restoreApplicationSmokeRequired !== true ||
    recovery.requires.includes("m5-production-evidence")
  ) {
    fail("BACKUP_RECOVERY_GATE_DRIFT");
  }

  const m5Evidence = stepById(plan, "m5-production-evidence");
  if (
    m5Evidence.target?.gate !== "Security & Privacy Ready v0.1" ||
    m5Evidence.target?.resourceBindingConsumer !==
      "tooling/ulc-linz-m6-production-resource-binding.mjs" ||
    m5Evidence.target?.auditSecurityLoggingEvidenceOwner !==
      "tooling/ulc-linz-m5-audit-security-logging-evidence.mjs" ||
    m5Evidence.target?.backupRestoreEvidenceRequiredForHighPrivacyProfile !== true ||
    !m5Evidence.requires.includes("backup-recovery-validation") ||
    m5Evidence.target?.allRequired !== true ||
    m5Evidence.target?.failClosed !== true ||
    m5Evidence.approvalRequired !== false
  ) {
    fail("M5_EVIDENCE_GATE_DRIFT");
  }

  const domainActivation = stepById(plan, "production-domain-activation");
  if (
    domainActivation.target?.provider !== "cloudflare" ||
    domainActivation.target?.hostnameSource !== "operator-supplied" ||
    domainActivation.target?.publicIngress !== true ||
    domainActivation.approvalRequired !== true ||
    !domainActivation.requires.includes("m5-production-evidence") ||
    !domainActivation.requires.includes("backup-recovery-validation")
  ) {
    fail("PUBLIC_EXPOSURE_BOUNDARY_DRIFT");
  }

  const smokes = stepById(plan, "post-deploy-smokes");
  if (
    !isDeepStrictEqual(smokes.target?.checks, [
      "health",
      "auth",
      "permissions",
      "application",
    ])
  ) {
    fail("POST_DEPLOY_SMOKE_DRIFT");
  }

  const releaseGate = plan.steps.at(-1);
  if (
    releaseGate?.id !== "release-gate" ||
    releaseGate.target?.automaticRelease !== false ||
    releaseGate.target?.explicitUserReleaseApprovalRequired !== true ||
    releaseGate.approvalRequired !== true
  ) {
    fail("RELEASE_GATE_DRIFT");
  }
}

function assertM6CoverageContract() {
  const requiredIds = REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map(
    (criterion) => criterion.id,
  ).sort();
  const coveredIds = Object.keys(M6_CRITERION_COVERAGE).sort();
  if (!isDeepStrictEqual(coveredIds, requiredIds)) {
    fail("M6_CRITERION_COVERAGE_DRIFT");
  }

  const stepIds = new Set(
    ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.steps.map((step) => step.id),
  );
  for (const references of Object.values(M6_CRITERION_COVERAGE)) {
    if (
      !Array.isArray(references) ||
      references.length < 1 ||
      references.some((reference) => {
        if (typeof reference !== "string") return true;
        if (reference.startsWith("prerequisite:")) {
          return !ALLOWED_PREREQUISITE_REFERENCES.includes(reference);
        }
        return !stepIds.has(reference);
      })
    ) {
      fail("M6_CRITERION_COVERAGE_DRIFT");
    }
  }
}

function assertPermissionProvisioningContract() {
  if (
    !isCanonicalUlcLinzM5PermissionProvisioningBundle() ||
    ULC_LINZ_M5_PERMISSION_PROVISIONING_BUNDLE.principalRoleAssignments.length !== 0
  ) {
    fail("PERMISSION_PROVISIONING_CONTRACT_DRIFT");
  }
}

function assertAppDefinition(value) {
  const app = exactRecord(value, APP_DEFINITION_FIELDS, "APP_DEFINITION_INVALID");
  if (
    app.schemaVersion !== 2 ||
    app.appId !== APPLICATION ||
    typeof app.displayName !== "string" ||
    app.displayName.length < 1 ||
    !isDeepStrictEqual(app.modules, []) ||
    !isDeepStrictEqual(app.platformServices, ["identity", "permissions"])
  ) {
    fail("APP_DEFINITION_INVALID");
  }
}

function assertDatabaseManifest(definition, value) {
  let expected;
  try {
    expected = createExpectedUlcLinzDatabaseManifest(definition);
  } catch {
    fail("DATABASE_MANIFEST_INVALID");
  }
  if (!isDeepStrictEqual(value, expected)) {
    fail("DATABASE_MANIFEST_INVALID");
  }
}

function assertResourceBindingContract() {
  const contract = exactRecord(
    ULC_LINZ_M6_PRODUCTION_RESOURCE_BINDING_CONTRACT,
    RESOURCE_BINDING_CONTRACT_FIELDS,
    "RESOURCE_BINDING_CONTRACT_DRIFT",
  );
  if (
    contract.schemaVersion !== 1 ||
    contract.application !== APPLICATION ||
    contract.environment !== ENVIRONMENT ||
    contract.runtimeEntrypoint !== "./worker/index.ts" ||
    contract.providerModel !== PROVIDER_MODEL ||
    contract.euOnly !== false ||
    contract.neonRegion !== NEON_REGION ||
    typeof contract.runtimeContractDigest !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(contract.runtimeContractDigest)
  ) {
    fail("RESOURCE_BINDING_CONTRACT_DRIFT");
  }
}

function stepById(plan, id) {
  const step = plan.steps.find((entry) => entry.id === id);
  if (step === undefined) fail("EXECUTION_PLAN_DRIFT");
  return step;
}

async function readJson(path, code) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    fail(code);
  }

  try {
    const parsed = JSON.parse(content);
    if (!isPlainRecord(parsed)) fail(code);
    return parsed;
  } catch (error) {
    if (error instanceof UlcLinzM6ProductionPreflightError) throw error;
    fail(code);
  }
}

function exactRecord(value, fields, code) {
  if (!isPlainRecord(value)) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors);
  const expected = new Set(fields);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(descriptors, field)) ||
    keys.some((field) => !expected.has(field))
  ) {
    fail(code);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (!("value" in descriptor) || descriptor.get !== undefined || descriptor.set !== undefined) {
      fail(code);
    }
  }
  return value;
}

function isPlainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6ProductionPreflightError(code);
}
