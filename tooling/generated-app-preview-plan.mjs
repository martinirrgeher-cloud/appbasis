import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadGeneratedAppPreviewContract } from "./generated-app-preview-contract.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

export async function buildGeneratedAppPreviewPlan({ appId } = {}) {
  if (appId === "ulc-linz") {
    throw new Error(
      "ULC Linz preview must use the dedicated D4 preview lifecycle.",
    );
  }
  const contract = await loadGeneratedAppPreviewContract(repositoryRoot, appId);
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
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    const plan = await buildGeneratedAppPreviewPlan({
      appId: process.env.APPBASIS_GENERATED_APP_ID,
    });
    process.stdout.write(`${JSON.stringify(plan)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Generated app preview plan failed.");
    process.exitCode = 1;
  }
}
