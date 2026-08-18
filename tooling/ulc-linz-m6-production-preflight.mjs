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
  { id: "neon-production-database", kind: "provider-write" },
  { id: "production-worker", kind: "provider-write" },
  { id: "database-binding", kind: "provider-write" },
  { id: "production-domain-selection", kind: "operator-input" },
  { id: "runtime-configuration", kind: "provider-write" },
  { id: "production-migrations", kind: "production-data-write" },
  { id: "production-worker-deploy", kind: "provider-write" },
  { id: "production-access-bootstrap", kind: "application-write" },
  { id: "production-domain-activation", kind: "public-exposure-write" },
  { id: "m5-production-evidence", kind: "read-only-evidence" },
  { id: "backup-recovery-validation", kind: "recovery-validation-write" },
  { id: "post-deploy-smokes", kind: "production-smoke-write" },
  { id: "release-gate", kind: "authorization-gate" },
]);

const M6_CRITERION_COVERAGE = deepFreeze({
  previewAccepted: ["prerequisite:M3_DONE"],
  productionDatabaseReady: ["neon-production-database", "database-binding"],
  productionWorkerReady: ["production-worker", "production-worker-deploy"],
  productionDomainReady: ["production-domain-activation"],
  productionUsersAndPermissionsReady: ["production-access-bootstrap"],
  backupRecoveryReady: ["backup-recovery-validation"],
  securityPrivacyReady: ["m5-production-evidence"],
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
      sequence: 7,
      id: "production-worker-deploy",
      kind: "provider-write",
      approvalRequired: true,
      requires: [
        "database-binding",
        "runtime-configuration",
        "production-migrations",
      ],
      target: {
        provider: "cloudflare",
        runtimeEntrypoint: "./worker/index.ts",
        publicIngress: false,
      },
    },
    {
      sequence: 8,
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
      sequence: 9,
      id: "production-domain-activation",
      kind: "public-exposure-write",
      approvalRequired: true,
      requires: [
        "production-domain-selection",
        "production-worker-deploy",
        "production-access-bootstrap",
      ],
      target: {
        provider: "cloudflare",
        hostnameSource: "operator-supplied",
        publicIngress: true,
      },
    },
    {
      sequence: 10,
      id: "m5-production-evidence",
      kind: "read-only-evidence",
      approvalRequired: false,
      requires: ["production-domain-activation"],
      target: {
        gate: "Production Security & Privacy Ready v0.1",
        resourceBindingConsumer:
          "tooling/ulc-linz-m6-production-resource-binding.mjs",
        allRequired: true,
        failClosed: true,
      },
    },
    {
      sequence: 11,
      id: "backup-recovery-validation",
      kind: "recovery-validation-write",
      approvalRequired: true,
      requires: ["m5-production-evidence", "production-migrations"],
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
      sequence: 12,
      id: "post-deploy-smokes",
      kind: "production-smoke-write",
      approvalRequired: true,
      requires: [
        "m5-production-evidence",
        "backup-recovery-validation",
        "production-domain-activation",
      ],
      target: {
        checks: ["health", "auth", "permissions", "application"],
      },
    },
    {
      sequence: 13,
      id: "release-gate",
      kind: "authorization-gate",
      approvalRequired: true,
      requires: [
        "m5-production-evidence",
        "backup-recovery-validation",
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
    requiredPrerequisiteGates: ["M3_DONE", "M4_DONE", "M5_DONE"],
    firstProviderWriteStepId:
      ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN.firstProviderWriteStepId,
    nextAction: {
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
      !Array.isArray(step.requires) ||
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

  const domainSelection = stepById(plan, "production-domain-selection");
  if (
    domainSelection.target?.providerWrite !== false ||
    domainSelection.target?.publicIngress !== false
  ) {
    fail("DOMAIN_SELECTION_BOUNDARY_DRIFT");
  }

  const domainActivation = stepById(plan, "production-domain-activation");
  if (
    domainActivation.target?.publicIngress !== true ||
    domainActivation.approvalRequired !== true
  ) {
    fail("PUBLIC_EXPOSURE_BOUNDARY_DRIFT");
  }

  const migration = stepById(plan, "production-migrations");
  if (
    migration.target?.backupRecoveryStatePrecheckRequired !== true ||
    migration.target?.immediateBackupBeforeCriticalMigrationPreferred !== true ||
    migration.target?.rollbackOrRecoveryPlanRequired !== true ||
    migration.target?.migrationVerificationRequired !== true
  ) {
    fail("MIGRATION_SAFETY_DRIFT");
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
