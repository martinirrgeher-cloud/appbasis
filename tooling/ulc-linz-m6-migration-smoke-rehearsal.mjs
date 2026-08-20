import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

import { loadRepositoryMigrationPlan } from "./database-migration-executor.mjs";
import {
  ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN,
  evaluateUlcLinzM6ProductionPreflight,
} from "./ulc-linz-m6-production-preflight.mjs";

const execFileAsync = promisify(execFile);
const APPLICATION = "ulc-linz";
const ENVIRONMENT = "production";
const MANIFEST_PATH = "apps/ulc-linz/appbasis.database.json";
const APP_DEFINITION_PATH = "apps/ulc-linz/appbasis.app.json";
const APP_RUNTIME_PATH = "apps/ulc-linz/worker/app.ts";
const AUTHORIZATION_PATH = "apps/ulc-linz/worker/authorization.ts";
const EXPECTED_OWNERS = Object.freeze({
  identity: "packages/identity",
  permissions: "packages/permissions",
  "ulc-linz-lifecycle": "apps/ulc-linz",
});
const EXPECTED_OWNER_ORDER = Object.freeze([
  "identity",
  "permissions",
  "ulc-linz-lifecycle",
]);
const EXPECTED_MIGRATIONS = Object.freeze([
  "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
  "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
  "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
  "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
  "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
  "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
  "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
  "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
]);
const EXPECTED_PUBLIC_ROUTES = Object.freeze([
  Object.freeze({ method: "GET", path: "/api/health" }),
  Object.freeze({ method: "POST", path: "/api/auth/sign-in" }),
  Object.freeze({ method: "GET", path: "/api/auth/session" }),
  Object.freeze({ method: "POST", path: "/api/auth/change-required-password" }),
]);
const REQUIRED_SMOKE_CHECKS = Object.freeze([
  "health",
  "auth",
  "permissions",
  "application",
]);

export const ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT = deepFreeze({
  schemaVersion: 1,
  application: APPLICATION,
  environment: ENVIRONMENT,
  mode: "repository-rehearsal-only",
  executionBinding: {
    productionMigrationStepId: "production-migrations",
    productionSmokeStepId: "post-deploy-smokes",
    releaseGateStepId: "release-gate",
    migrationPlanFingerprintRequiredAtExecution: true,
    freshProviderEvidenceRequiredAtExecution: true,
    providerBoundTargetRequiredAtExecution: true,
    verifiedRepositoryHeadRequiredAtExecution: true,
    cleanRepositoryRequiredForRehearsal: true,
    rehearsalMustBeRecomputedOnFinalHead: true,
    smokeContractRequiredAtExecution: true,
    futureExecutorMustConsumeBinding: true,
  },
  migration: {
    manifestPath: MANIFEST_PATH,
    loaderContract:
      "tooling/database-migration-executor.mjs#loadRepositoryMigrationPlan",
    futureExecutorContract:
      "tooling/database-migration-executor.mjs#applyRepositoryMigrationPlan",
    expectedOwnerOrder: EXPECTED_OWNER_ORDER,
    expectedMigrationPaths: EXPECTED_MIGRATIONS,
    expectedInitialPublicSchema: "empty",
    connectionStringAcceptedByRehearsal: false,
    productionDatabaseWriteAllowed: false,
    explicitExecutionApprovalRequired: true,
    backupRecoveryStatePrecheckRequired: true,
    immediateBackupBeforeCriticalMigrationPreferred: true,
    rollbackOrRecoveryPlanRequired: true,
    postMigrationVerificationRequired: true,
    targetDatabaseIdentityMustComeFromProviderEvidence: true,
    targetDatabaseIdentityInRepository: false,
  },
  smoke: {
    checks: REQUIRED_SMOKE_CHECKS,
    executionClass: "production-smoke-write",
    executionAuthorized: false,
    explicitExecutionApprovalRequired: true,
    httpsRequired: true,
    dedicatedSmokePrincipalsRequired: true,
    realUserCredentialsAllowed: false,
    secretValuesInRepository: false,
    passwordChangeDuringSmokeAllowed: false,
    publicRuntime: {
      routes: EXPECTED_PUBLIC_ROUTES,
      healthExpected: { status: "ok", appId: APPLICATION },
      successfulSignInRequired: true,
      authenticatedSessionReadRequired: true,
    },
    permissions: {
      executionBoundary: "protected-operations-runner",
      contract:
        "apps/ulc-linz/worker/authorization.ts#assertUlcLinzModuleAccess",
      publicPermissionProbeRouteAllowed: false,
      allowedCaseRequired: true,
      deniedCaseRequired: true,
      unknownCapabilityDenialRequired: true,
      allowedCaseSemantics: {
        sourceRole: "trainer",
        moduleKey: "countdown",
        action: "view",
        scope: "organization",
        sameOrganizationRequired: true,
      },
      deniedCaseSemantics: {
        moduleKey: "__m6_smoke_unknown__",
        action: "view",
        expected: "deny",
      },
    },
    application: {
      currentModules: [],
      fachmoduleRouteSmokeApplicable: false,
      currentScope: "identity-permissions-foundation",
      existingRoutesOnly: true,
      futureModuleChangeRequiresContractUpdate: true,
    },
    expectedBoundedWrites: [
      "authentication-session-state",
      "security-event-sink-for-denial-cases",
    ],
    fachmoduleDataMutationAllowed: false,
    releaseAuthorizedBySmoke: false,
  },
});

export class UlcLinzM6MigrationSmokeRehearsalError extends Error {
  constructor(code) {
    super("ULC Linz M6 migration/smoke rehearsal failed.");
    this.name = "UlcLinzM6MigrationSmokeRehearsalError";
    this.code = code;
  }
}

export async function evaluateUlcLinzM6MigrationSmokeRehearsal(
  repositoryRoot = process.cwd(),
) {
  const root = resolve(repositoryRoot);
  const verifiedRepositoryHeadSha = await readVerifiedRepositoryHead(root);
  const repositoryPreflight = await evaluateUlcLinzM6ProductionPreflight(root);
  assertRepositoryPreflight(repositoryPreflight);
  assertExecutionPlanContract();

  const plan = await loadRepositoryMigrationPlan({
    repositoryRoot: root,
    manifestPath: join(root, MANIFEST_PATH),
    expectedApplication: APPLICATION,
    expectedOwners: EXPECTED_OWNERS,
    ConfigurationError: UlcLinzM6MigrationSmokeRehearsalError,
  });
  assertMigrationPlan(plan);

  const [manifestRaw, appDefinitionRaw, appRuntimeRaw, authorizationRaw] =
    await Promise.all([
      readBinary(join(root, MANIFEST_PATH), "MIGRATION_PLAN_DRIFT"),
      readBinary(join(root, APP_DEFINITION_PATH), "APP_DEFINITION_INVALID"),
      readBinary(join(root, APP_RUNTIME_PATH), "PUBLIC_RUNTIME_CONTRACT_DRIFT"),
      readBinary(join(root, AUTHORIZATION_PATH), "PERMISSION_SMOKE_CONTRACT_DRIFT"),
    ]);
  const appDefinition = parseJson(appDefinitionRaw, "APP_DEFINITION_INVALID");
  const appRuntimeSource = appRuntimeRaw.toString("utf8");
  const authorizationSource = authorizationRaw.toString("utf8");
  assertApplicationScope(appDefinition);
  assertPublicRuntimeContract(appRuntimeSource);
  assertPermissionSmokeContract(authorizationSource);

  const migrationFiles = [];
  let statementCount = 0;
  for (const migration of plan) {
    const raw = await readBinary(join(root, migration.relativePath), "MIGRATION_PLAN_DRIFT");
    migrationFiles.push({
      ownerId: migration.ownerId,
      relativePath: migration.relativePath,
      statementCount: migration.statements.length,
      digest: digestBytes(raw),
    });
    statementCount += migration.statements.length;
  }

  const validatedInputDigests = deepFreeze({
    repositoryHeadSha: verifiedRepositoryHeadSha,
    manifest: { path: MANIFEST_PATH, digest: digestBytes(manifestRaw) },
    appDefinition: {
      path: APP_DEFINITION_PATH,
      digest: digestBytes(appDefinitionRaw),
    },
    publicRuntime: { path: APP_RUNTIME_PATH, digest: digestBytes(appRuntimeRaw) },
    permissionSmokeContract: {
      path: AUTHORIZATION_PATH,
      digest: digestBytes(authorizationRaw),
    },
    repositoryPreflight: digestJson(repositoryPreflight),
    executionPlan: digestJson(ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN),
    smokeContract: digestJson(ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.smoke),
  });

  const planFingerprint = createUlcLinzM6ExecutionBoundPlanFingerprint({
    migrationFiles,
    validatedInputDigests,
  });

  return deepFreeze({
    schemaVersion: 1,
    application: APPLICATION,
    environment: ENVIRONMENT,
    status: "rehearsed-blocked-before-production-write",
    verifiedRepositoryHeadSha,
    repositoryPreflightVerified: true,
    migrationRehearsalVerified: true,
    productionSmokeContractVerified: true,
    productionDatabaseWriteAllowed: false,
    productionSmokeExecutionAuthorized: false,
    releaseAuthorized: false,
    explicitApprovalStillRequired: true,
    executionBinding:
      ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.executionBinding,
    validatedInputDigests,
    migration: {
      migrationCount: plan.length,
      statementCount,
      ownerOrder: EXPECTED_OWNER_ORDER,
      files: migrationFiles,
      planFingerprint,
      manifestPath: MANIFEST_PATH,
      futureExecutorContract:
        ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.migration
          .futureExecutorContract,
    },
    smoke: ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.smoke,
  });
}

export function createUlcLinzM6ExecutionBoundPlanFingerprint({
  migrationFiles,
  validatedInputDigests,
}) {
  return digestJson({
    schemaVersion: 1,
    migrationFiles,
    validatedInputDigests,
  });
}

function assertRepositoryPreflight(result) {
  if (
    result?.status !== "prepared-blocked-before-provider-write" ||
    result.providerWriteAllowed !== false ||
    result.releaseAuthorized !== false ||
    result.explicitApprovalRequired !== true
  ) {
    fail("M6_REPOSITORY_PREFLIGHT_DRIFT");
  }
}

function assertExecutionPlanContract() {
  const plan = ULC_LINZ_M6_PRODUCTION_EXECUTION_PLAN;
  const migration = plan.steps.find((step) => step.id === "production-migrations");
  const smoke = plan.steps.find((step) => step.id === "post-deploy-smokes");
  const release = plan.steps.at(-1);
  const binding = ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.executionBinding;
  if (
    plan.application !== APPLICATION ||
    plan.environment !== ENVIRONMENT ||
    plan.providerWritesEnabled !== false ||
    binding.productionMigrationStepId !== migration?.id ||
    binding.productionSmokeStepId !== smoke?.id ||
    binding.releaseGateStepId !== release?.id ||
    binding.migrationPlanFingerprintRequiredAtExecution !== true ||
    binding.freshProviderEvidenceRequiredAtExecution !== true ||
    binding.providerBoundTargetRequiredAtExecution !== true ||
    binding.verifiedRepositoryHeadRequiredAtExecution !== true ||
    binding.cleanRepositoryRequiredForRehearsal !== true ||
    binding.rehearsalMustBeRecomputedOnFinalHead !== true ||
    binding.smokeContractRequiredAtExecution !== true ||
    binding.futureExecutorMustConsumeBinding !== true ||
    migration?.kind !== "production-data-write" ||
    migration.approvalRequired !== true ||
    migration.target?.manifest !== MANIFEST_PATH ||
    migration.target?.backupRecoveryStatePrecheckRequired !== true ||
    migration.target?.immediateBackupBeforeCriticalMigrationPreferred !== true ||
    migration.target?.rollbackOrRecoveryPlanRequired !== true ||
    migration.target?.migrationVerificationRequired !== true ||
    smoke?.kind !== "production-smoke-write" ||
    smoke.approvalRequired !== true ||
    !isDeepStrictEqual(smoke.target?.checks, REQUIRED_SMOKE_CHECKS) ||
    release?.id !== "release-gate" ||
    release.target?.automaticRelease !== false
  ) {
    fail("M6_EXECUTION_PLAN_DRIFT");
  }
}

function assertMigrationPlan(plan) {
  if (!Array.isArray(plan) || plan.length !== EXPECTED_MIGRATIONS.length) {
    fail("MIGRATION_PLAN_DRIFT");
  }
  const paths = plan.map((entry) => entry.relativePath);
  const ownerOrder = [...new Set(plan.map((entry) => entry.ownerId))];
  if (
    !isDeepStrictEqual(paths, EXPECTED_MIGRATIONS) ||
    !isDeepStrictEqual(ownerOrder, EXPECTED_OWNER_ORDER)
  ) {
    fail("MIGRATION_PLAN_DRIFT");
  }
}

function assertApplicationScope(app) {
  if (
    app?.appId !== APPLICATION ||
    !isDeepStrictEqual(app.modules, []) ||
    !isDeepStrictEqual(app.platformServices, ["identity", "permissions"])
  ) {
    fail("APPLICATION_SCOPE_DRIFT");
  }
}

function assertPublicRuntimeContract(source) {
  const routes = [];
  const pattern = /\bapp\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  if (!isDeepStrictEqual(routes, EXPECTED_PUBLIC_ROUTES)) {
    fail("PUBLIC_RUNTIME_CONTRACT_DRIFT");
  }
  if (/\/api\/(?:smoke|admin\/smoke|permissions\/probe)/.test(source)) {
    fail("PUBLIC_SMOKE_PROBE_FORBIDDEN");
  }
}

function assertPermissionSmokeContract(source) {
  if (
    !source.includes("export async function assertUlcLinzModuleAccess(") ||
    /\bapp\.(?:get|post|put|patch|delete)\(/.test(source)
  ) {
    fail("PERMISSION_SMOKE_CONTRACT_DRIFT");
  }
}

async function readVerifiedRepositoryHead(root) {
  let head;
  let status;
  try {
    ({ stdout: head } = await execFileAsync(
      "git",
      ["-C", root, "rev-parse", "--verify", "HEAD"],
      { encoding: "utf8" },
    ));
    ({ stdout: status } = await execFileAsync(
      "git",
      ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"],
      { encoding: "utf8" },
    ));
  } catch {
    fail("REPOSITORY_HEAD_UNVERIFIED");
  }

  const sha = head.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) fail("REPOSITORY_HEAD_UNVERIFIED");
  if (status.trim() !== "") fail("REPOSITORY_HEAD_DIRTY");
  return sha;
}

async function readBinary(path, code) {
  try {
    return await readFile(path);
  } catch {
    fail(code);
  }
}

function parseJson(raw, code) {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    fail(code);
  }
}

function digestBytes(raw) {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

function digestJson(value) {
  return digestBytes(Buffer.from(JSON.stringify(value), "utf8"));
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code) {
  throw new UlcLinzM6MigrationSmokeRehearsalError(code);
}
