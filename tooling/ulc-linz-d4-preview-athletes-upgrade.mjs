import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  applyModuleUpdateMigrations,
  ModuleUpdateMigrationConfigurationError,
  ModuleUpdateMigrationExecutionError,
} from "./module-update-migration-executor.mjs";
import {
  ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
} from "./ulc-linz-d4-preview-hyperdrive.mjs";
import { parseGeneratedPreviewDatabaseUrl } from "./generated-preview-hyperdrive.mjs";

const EXPECTED_DATABASE = ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE.database;

export async function applyUlcLinzD4PreviewAthletesUpgrade(
  { connectionString } = {},
  { applyMigrations = applyModuleUpdateMigrations } = {},
) {
  if (typeof applyMigrations !== "function") {
    throw new ModuleUpdateMigrationConfigurationError(
      "ULC D4 preview athletes upgrade executor is unavailable.",
    );
  }
  const origin = parseGeneratedPreviewDatabaseUrl(
    connectionString,
    ULC_LINZ_D4_PREVIEW_APPLICATION_HYPERDRIVE,
  );
  const result = await applyMigrations({
    appId: "ulc-linz",
    moduleId: "athletes",
    connectionString,
    expectedDatabase: EXPECTED_DATABASE,
    expectedPrincipal: origin.user,
  });
  if (
    result?.state !== "applied" ||
    result?.application !== "ulc-linz" ||
    result?.moduleId !== "athletes" ||
    result?.repositoryState !== "published-target"
  ) {
    throw new ModuleUpdateMigrationExecutionError(
      "ULC D4 preview athletes upgrade returned an unexpected result.",
    );
  }
  return result;
}

export function assertUlcLinzD4PreviewAthletesUpgradeEnvironment(
  environment = process.env,
) {
  if (environment.APPBASIS_GENERATED_APP_ID !== "ulc-linz") {
    throw new ModuleUpdateMigrationConfigurationError(
      "ULC D4 preview athletes upgrade requires appId ulc-linz.",
    );
  }
  if (environment.APPBASIS_MIGRATION_TARGET !== EXPECTED_DATABASE) {
    throw new ModuleUpdateMigrationConfigurationError(
      "ULC D4 preview athletes upgrade targets the wrong database.",
    );
  }
  if (environment.APPBASIS_APPLY_MIGRATIONS !== "1") {
    throw new ModuleUpdateMigrationConfigurationError(
      "ULC D4 preview athletes upgrade requires explicit migration approval.",
    );
  }
}

function isMainModule() {
  if (typeof process.argv[1] !== "string") return false;
  return import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    assertUlcLinzD4PreviewAthletesUpgradeEnvironment();
    const result = await applyUlcLinzD4PreviewAthletesUpgrade({
      connectionString: process.env.APPBASIS_DATABASE_URL,
    });
    console.log(
      `ULC D4 preview Stammdaten upgrade PASS: ${result.migrationCount} module migrations applied.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC D4 preview Stammdaten upgrade failed.",
    );
    process.exitCode = 1;
  }
}
