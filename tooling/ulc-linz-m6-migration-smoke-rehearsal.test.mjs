import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT,
  evaluateUlcLinzM6MigrationSmokeRehearsal,
} from "./ulc-linz-m6-migration-smoke-rehearsal.mjs";

const EXPECTED_MIGRATIONS = [
  "packages/identity/drizzle/0000_appbasis_identity_foundation.sql",
  "packages/identity/drizzle/0001_appbasis_identity_foundation.sql",
  "packages/permissions/migrations/0000_appbasis_permissions_foundation.sql",
  "packages/permissions/migrations/0001_appbasis_permission_role_lifecycle.sql",
  "packages/permissions/migrations/0002_appbasis_permission_administration_audit.sql",
  "packages/permissions/migrations/0003_appbasis_principal_permission_administration_audit.sql",
  "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
];

test("ULC M6 migration rehearsal loads the exact canonical production plan without authorizing a database write", async () => {
  const result = await evaluateUlcLinzM6MigrationSmokeRehearsal();

  assert.equal(result.status, "rehearsed-blocked-before-production-write");
  assert.equal(result.repositoryPreflightVerified, true);
  assert.equal(result.migrationRehearsalVerified, true);
  assert.equal(result.productionSmokeContractVerified, true);
  assert.equal(result.productionDatabaseWriteAllowed, false);
  assert.equal(result.productionSmokeExecutionAuthorized, false);
  assert.equal(result.releaseAuthorized, false);
  assert.equal(result.explicitApprovalStillRequired, true);
  assert.equal(result.migration.migrationCount, 7);
  assert.equal(result.migration.statementCount > 0, true);
  assert.deepEqual(
    result.migration.files.map((entry) => entry.relativePath),
    EXPECTED_MIGRATIONS,
  );
  assert.deepEqual(result.migration.ownerOrder, [
    "identity",
    "permissions",
    "ulc-linz-lifecycle",
  ]);
  assert.match(result.migration.planFingerprint, /^sha256:[0-9a-f]{64}$/);
  for (const entry of result.migration.files) {
    assert.equal(entry.statementCount > 0, true);
    assert.match(entry.digest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(entry, "statements"), false);
    assert.equal(Object.hasOwn(entry, "sql"), false);
  }
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.migration), true);
  assert.equal(Object.isFrozen(result.smoke), true);
});

test("ULC M6 rehearsal binds the future migration and smoke executors back to the exact checked plan", () => {
  const binding =
    ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.executionBinding;

  assert.deepEqual(binding, {
    productionMigrationStepId: "production-migrations",
    productionSmokeStepId: "post-deploy-smokes",
    releaseGateStepId: "release-gate",
    migrationPlanFingerprintRequiredAtExecution: true,
    freshProviderEvidenceRequiredAtExecution: true,
    providerBoundTargetRequiredAtExecution: true,
    rehearsalMustBeRecomputedOnFinalHead: true,
    smokeContractRequiredAtExecution: true,
    futureExecutorMustConsumeBinding: true,
  });
});

test("ULC M6 migration rehearsal reuses the shared executor contract and keeps execution inputs outside the rehearsal", () => {
  const migration = ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.migration;

  assert.equal(
    migration.loaderContract,
    "tooling/database-migration-executor.mjs#loadRepositoryMigrationPlan",
  );
  assert.equal(
    migration.futureExecutorContract,
    "tooling/database-migration-executor.mjs#applyRepositoryMigrationPlan",
  );
  assert.equal(migration.expectedInitialPublicSchema, "empty");
  assert.equal(migration.connectionStringAcceptedByRehearsal, false);
  assert.equal(migration.productionDatabaseWriteAllowed, false);
  assert.equal(migration.explicitExecutionApprovalRequired, true);
  assert.equal(migration.backupRecoveryStatePrecheckRequired, true);
  assert.equal(migration.immediateBackupBeforeCriticalMigrationPreferred, true);
  assert.equal(migration.rollbackOrRecoveryPlanRequired, true);
  assert.equal(migration.postMigrationVerificationRequired, true);
  assert.equal(migration.targetDatabaseIdentityMustComeFromProviderEvidence, true);
  assert.equal(migration.targetDatabaseIdentityInRepository, false);
  assert.deepEqual(migration.expectedMigrationPaths, EXPECTED_MIGRATIONS);
});

test("ULC M6 production smoke contract matches the current identity+permissions app without inventing a Fachmodul route", () => {
  const smoke = ULC_LINZ_M6_MIGRATION_SMOKE_REHEARSAL_CONTRACT.smoke;

  assert.deepEqual(smoke.checks, ["health", "auth", "permissions", "application"]);
  assert.equal(smoke.executionClass, "production-smoke-write");
  assert.equal(smoke.executionAuthorized, false);
  assert.equal(smoke.explicitExecutionApprovalRequired, true);
  assert.equal(smoke.httpsRequired, true);
  assert.equal(smoke.dedicatedSmokePrincipalsRequired, true);
  assert.equal(smoke.realUserCredentialsAllowed, false);
  assert.equal(smoke.secretValuesInRepository, false);
  assert.equal(smoke.passwordChangeDuringSmokeAllowed, false);
  assert.deepEqual(smoke.publicRuntime.routes, [
    { method: "GET", path: "/api/health" },
    { method: "POST", path: "/api/auth/sign-in" },
    { method: "GET", path: "/api/auth/session" },
    { method: "POST", path: "/api/auth/change-required-password" },
  ]);
  assert.deepEqual(smoke.publicRuntime.healthExpected, {
    status: "ok",
    appId: "ulc-linz",
  });
  assert.equal(smoke.permissions.executionBoundary, "protected-operations-runner");
  assert.equal(smoke.permissions.publicPermissionProbeRouteAllowed, false);
  assert.equal(smoke.permissions.allowedCaseRequired, true);
  assert.equal(smoke.permissions.deniedCaseRequired, true);
  assert.equal(smoke.permissions.unknownCapabilityDenialRequired, true);
  assert.deepEqual(smoke.permissions.allowedCaseSemantics, {
    sourceRole: "trainer",
    moduleKey: "countdown",
    action: "view",
    scope: "organization",
    sameOrganizationRequired: true,
  });
  assert.deepEqual(smoke.permissions.deniedCaseSemantics, {
    moduleKey: "__m6_smoke_unknown__",
    action: "view",
    expected: "deny",
  });
  assert.deepEqual(smoke.application.currentModules, []);
  assert.equal(smoke.application.fachmoduleRouteSmokeApplicable, false);
  assert.equal(smoke.application.currentScope, "identity-permissions-foundation");
  assert.equal(smoke.application.futureModuleChangeRequiresContractUpdate, true);
  assert.equal(smoke.fachmoduleDataMutationAllowed, false);
  assert.equal(smoke.releaseAuthorizedBySmoke, false);
});

test("ULC M6 rehearsal source has no database executor invocation, provider call or production credential input", async () => {
  const source = await readFile(
    new URL("./ulc-linz-m6-migration-smoke-rehearsal.mjs", import.meta.url),
    "utf8",
  );

  assert.equal(source.includes("createPostgresDatabase"), false);
  assert.equal(/\bapplyRepositoryMigrationPlan\s*\(/.test(source), false);
  assert.equal(/\bfetch\s*\(/.test(source), false);
  assert.equal(source.includes("APPBASIS_DATABASE_URL"), false);
  assert.equal(source.includes("DATABASE_URL"), false);
  assert.equal(source.includes("NEON_API_KEY"), false);
  assert.equal(source.includes("CLOUDFLARE_API_TOKEN"), false);
});

test("ULC M6 rehearsal output contains hashes and counts, not SQL or connection material", async () => {
  const result = await evaluateUlcLinzM6MigrationSmokeRehearsal();
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("postgres://"), false);
  assert.equal(serialized.includes("postgresql://"), false);
  assert.equal(serialized.includes("CREATE TABLE"), false);
  assert.equal(serialized.includes("ALTER TABLE"), false);
  assert.equal(serialized.includes("BETTER_AUTH_SECRET"), false);
  assert.equal(serialized.includes("HYPERDRIVE.connectionString"), false);
});
