import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

import { renderGeneratedPreviewWranglerConfig } from "./generated-preview-deploy-config.mjs";

const WORKER_NAME_PREFIX = "appbasis-";
const PRODUCTION_WORKER_NAME_SUFFIX = "-production";
const WORKER_NAME_MAX_LENGTH = 63;

export function renderGeneratedProductionWranglerConfig(input = {}) {
  const previewContract = renderGeneratedPreviewWranglerConfig(input);
  const workerName = requiredProductionWorkerName(input.appId);

  return Object.freeze({
    ...previewContract,
    name: workerName,
    workers_dev: false,
    preview_urls: false,
    keep_vars: true,
  });
}

export async function writeGeneratedProductionWranglerConfig({
  outputPath,
  ...input
} = {}) {
  const config = renderGeneratedProductionWranglerConfig(input);
  if (typeof outputPath !== "string" || outputPath.trim().length === 0) {
    throw new Error("outputPath is required.");
  }
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return outputPath;
}

function requiredProductionWorkerName(appId) {
  const workerName = `${WORKER_NAME_PREFIX}${appId}${PRODUCTION_WORKER_NAME_SUFFIX}`;
  if (
    typeof appId !== "string" ||
    workerName.length > WORKER_NAME_MAX_LENGTH ||
    workerName.endsWith("-")
  ) {
    throw new Error("Derived Cloudflare production Worker name is invalid.");
  }
  return workerName;
}
