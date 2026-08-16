import { pathToFileURL } from "node:url";

import { readM3PreviewRootAdminEnvironment } from "../apps/m3-preview/tooling/bootstrap-root-admin.mjs";
import { readM3PreviewSmokeBootstrapEnvironment } from "../apps/m3-preview/tooling/bootstrap-smoke-principals-contract.mjs";
import { readM3PreviewAcceptanceEnvironment } from "./m3-preview-acceptance-smoke.mjs";
import { parseM3PreviewDatabaseUrl } from "./m3-preview-hyperdrive.mjs";

export function validateM3PreviewExecutionReadiness(env = process.env) {
  const validationEnv = {
    ...env,
    APPBASIS_M3_ROOT_ADMIN_TARGET: "m3-preview",
    APPBASIS_M3_ROOT_ADMIN_APPLY: "1",
    APPBASIS_M3_SMOKE_BOOTSTRAP_TARGET: "m3-preview",
    APPBASIS_M3_SMOKE_BOOTSTRAP_APPLY: "1",
  };

  parseM3PreviewDatabaseUrl(validationEnv.APPBASIS_DATABASE_URL);
  readM3PreviewRootAdminEnvironment(validationEnv);
  readM3PreviewSmokeBootstrapEnvironment(validationEnv);
  readM3PreviewAcceptanceEnvironment(validationEnv);

  return Object.freeze({
    status: "ready",
    target: "m3-preview",
    validatedContracts: Object.freeze([
      "dedicated-preview-database",
      "database-and-auth",
      "root-admin-bootstrap",
      "smoke-principal-bootstrap",
      "acceptance-credentials",
    ]),
  });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    const result = validateM3PreviewExecutionReadiness();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(
      error instanceof Error
        ? `m3-preview execution readiness failed: ${error.message}`
        : "m3-preview execution readiness failed.",
    );
    process.exitCode = 1;
  }
}
