import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

import { renderGeneratedPreviewWranglerConfig } from "./generated-preview-deploy-config.mjs";

const WORKER_NAME_PREFIX = "appbasis-";
const PRODUCTION_WORKER_NAME_SUFFIX = "-production";
const WORKER_NAME_MAX_LENGTH = 63;
const PRODUCTION_COMPATIBILITY_DATE = "2026-08-21";

export function renderGeneratedProductionWranglerConfig(input = {}) {
  assertProductionCompatibilityDate(input.compatibilityDate);
  const previewContract = renderGeneratedPreviewWranglerConfig({
    ...input,
    compatibilityDate: PRODUCTION_COMPATIBILITY_DATE,
  });
  const { secrets: _requiredSecretMetadata, ...runtimeConfig } = previewContract;
  const workerName = requiredProductionWorkerName(input.appId);
  const securityLogHyperdriveId = requiredProviderId(
    input.securityLogHyperdriveId,
    "securityLogHyperdriveId",
  );
  if (securityLogHyperdriveId === input.hyperdriveId) {
    throw new Error("Production security-log Hyperdrive must be distinct from the application Hyperdrive.");
  }

  return Object.freeze({
    ...runtimeConfig,
    name: workerName,
    workers_dev: false,
    preview_urls: false,
    keep_vars: true,
    hyperdrive: Object.freeze([
      ...runtimeConfig.hyperdrive,
      Object.freeze({
        binding: "SECURITY_LOG_HYPERDRIVE",
        id: securityLogHyperdriveId,
      }),
    ]),
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

function assertProductionCompatibilityDate(value) {
  if (value !== undefined && value !== PRODUCTION_COMPATIBILITY_DATE) {
    throw new Error(
      `compatibilityDate must remain ${PRODUCTION_COMPATIBILITY_DATE} for the production Worker contract.`,
    );
  }
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

function requiredProviderId(value, field) {
  if (typeof value !== "string") {
    throw new Error(`${field} is required.`);
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 256 ||
    normalized !== value ||
    /[\u0000-\u001f\u007f\s]/u.test(normalized)
  ) {
    throw new Error(`${field} is invalid.`);
  }
  return normalized;
}
