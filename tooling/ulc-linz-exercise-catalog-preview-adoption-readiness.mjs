import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";
import { loadModuleUpdateMigrationExecutionPlan } from "./module-update-migration-executor.mjs";
import { planModuleUpdate } from "./module-update-plan.mjs";
import { planUlcExerciseCatalogAdoption } from "./ulc-linz-exercise-catalog-adoption-plan.mjs";

const DEFAULT_REPOSITORY_ROOT = resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);
const APP_ID = "ulc-linz";
const MODULE_ID = "exercise-catalog";
const EXPECTED_PREVIEW_ENVIRONMENT = "generated-preview-ulc-linz";
const EXPECTED_PREVIEW_DATABASE = "appbasis_ulc_linz_preview";

export async function planUlcExerciseCatalogPreviewAdoptionReadiness(
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {},
) {
  const root = resolve(repositoryRoot);
  const [modulePlan, migrationPlan, adoptionPlan, previewContract] =
    await Promise.all([
      planModuleUpdate(
        { appId: APP_ID, moduleId: MODULE_ID },
        { repositoryRoot: root },
      ),
      loadModuleUpdateMigrationExecutionPlan(
        { appId: APP_ID, moduleId: MODULE_ID },
        { repositoryRoot: root },
      ),
      planUlcExerciseCatalogAdoption({ repositoryRoot: root }),
      loadGeneratedAppPreviewContract(root, APP_ID),
    ]);

  assertPublishedRepositoryState({
    modulePlan,
    migrationPlan,
    adoptionPlan,
    previewContract,
  });

  return deepFreeze({
    schemaVersion: 1,
    operation: "ulc-exercise-catalog-preview-adoption-readiness",
    state: "ready-for-explicit-preview-schema-copy-gate",
    application: APP_ID,
    moduleId: MODULE_ID,
    repositoryState: "published-target",
    preview: {
      environment: previewContract.target.environment,
      database: previewContract.target.database,
      workerName: previewContract.target.workerName,
    },
    targetSchemaMigration: {
      executor: "FC6 incremental module migration executor",
      repositoryState: migrationPlan.repositoryState,
      targetOwner: {
        id: migrationPlan.targetOwner.id,
        root: migrationPlan.targetOwner.root,
        schemaVersion: migrationPlan.targetOwner.schemaVersion,
        migrations: [...migrationPlan.targetOwner.migrations],
      },
      migrationCount: migrationPlan.migrations.length,
      approval: "explicit-preview-apply-required",
      executed: false,
    },
    copyAndVerify: {
      contract: adoptionPlan.operation,
      tableCount: adoptionPlan.copy.tables.length,
      sourceTables: adoptionPlan.copy.tables.map((table) => table.sourceTable),
      targetTables: adoptionPlan.copy.tables.map((table) => table.targetTable),
      isolatedProofExecutorReusableOnPreview: false,
      previewBoundExecutorRequired: true,
      approval: "explicit-preview-apply-required",
      executed: false,
    },
    runtimeCutover: {
      eligible: false,
      blockedUntil: [
        "preview-target-schema-migration-pass",
        "preview-copy-and-verify-pass",
        "source-writes-quiesced",
        "final-source-target-equality-pass",
      ],
      separateGate: true,
    },
    providerAccess: false,
    databaseAccess: false,
    writes: [],
  });
}

export function renderUlcExerciseCatalogPreviewAdoptionReadiness(plan) {
  return JSON.stringify(plan, null, 2) + "\n";
}

function assertPublishedRepositoryState({
  modulePlan,
  migrationPlan,
  adoptionPlan,
  previewContract,
}) {
  if (
    modulePlan?.schemaVersion !== 1 ||
    modulePlan.operation !== "module-install" ||
    modulePlan.state !== "already-installed" ||
    modulePlan.app?.appId !== APP_ID ||
    modulePlan.module?.moduleId !== MODULE_ID ||
    !Array.isArray(modulePlan.writes) ||
    modulePlan.writes.length !== 0
  ) {
    throw new Error(
      "ULC exercise-catalog repository adoption is not canonically published.",
    );
  }

  if (
    migrationPlan?.schemaVersion !== 1 ||
    migrationPlan.operation !== "module-install-migrations" ||
    migrationPlan.application !== APP_ID ||
    migrationPlan.moduleId !== MODULE_ID ||
    migrationPlan.repositoryState !== "published-target" ||
    migrationPlan.targetOwner?.id !== MODULE_ID ||
    migrationPlan.targetOwner?.root !== "modules/exercise-catalog" ||
    migrationPlan.targetOwner?.schemaVersion !== 2 ||
    !Array.isArray(migrationPlan.targetOwner?.migrations) ||
    migrationPlan.targetOwner.migrations.length !== 2 ||
    !Array.isArray(migrationPlan.migrations) ||
    migrationPlan.migrations.length !== 2
  ) {
    throw new Error(
      "ULC exercise-catalog published target cannot reconstruct the FC6 schema delta.",
    );
  }

  if (
    adoptionPlan?.operation !== "ulc-exercise-catalog-adoption" ||
    adoptionPlan.repositoryState !== "published-target" ||
    adoptionPlan.target?.moduleId !== MODULE_ID ||
    !Array.isArray(adoptionPlan.copy?.tables) ||
    adoptionPlan.copy.tables.length !== 4 ||
    adoptionPlan.cutoverGuard?.strategy !== "quiesce-and-verify"
  ) {
    throw new Error(
      "ULC exercise-catalog adoption contract is not ready for preview planning.",
    );
  }

  if (
    previewContract?.definition?.appId !== APP_ID ||
    previewContract.target?.environment !== EXPECTED_PREVIEW_ENVIRONMENT ||
    previewContract.target?.database !== EXPECTED_PREVIEW_DATABASE
  ) {
    throw new Error(
      "ULC exercise-catalog preview target does not match the dedicated ULC preview contract.",
    );
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

async function runCli() {
  if (process.argv.length !== 2) {
    throw new Error(
      "ULC exercise-catalog preview readiness planner does not accept CLI arguments.",
    );
  }
  const plan = await planUlcExerciseCatalogPreviewAdoptionReadiness();
  process.stdout.write(renderUlcExerciseCatalogPreviewAdoptionReadiness(plan));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    process.stderr.write(
      (error instanceof Error ? error.message : "Preview adoption readiness failed.") +
        "\n",
    );
    process.exitCode = 1;
  });
}
