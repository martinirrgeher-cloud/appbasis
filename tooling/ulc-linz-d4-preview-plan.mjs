import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

export async function buildUlcLinzD4PreviewPlan() {
  const contract = await loadGeneratedAppPreviewContract(
    repositoryRoot,
    "ulc-linz",
  );
  return Object.freeze({
    appId: contract.definition.appId,
    packageName: contract.packageName,
    environment: contract.target.environment,
    migrationTarget: contract.target.migrationTarget,
    workerName: contract.target.workerName,
    hyperdriveName: contract.target.hyperdriveName,
    database: contract.target.database,
    entrypoint: "./worker/preview.ts",
  });
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  path.resolve(invokedPath) === fileURLToPath(import.meta.url)
) {
  try {
    const plan = await buildUlcLinzD4PreviewPlan();
    process.stdout.write(`${JSON.stringify(plan)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "ULC Linz D4 preview plan failed.",
    );
    process.exitCode = 1;
  }
}
