import assert from "node:assert/strict";
import test from "node:test";

import { validateM3PreviewExecutionReadiness } from "./m3-preview-execution-readiness.mjs";

const validEnv = Object.freeze({
  APPBASIS_DATABASE_URL: "postgresql://preview:secret@ep-example.eu-central-1.aws.neon.tech/appbasis_preview?sslmode=require",
  APPBASIS_BETTER_AUTH_SECRET: "m3-preview-better-auth-secret-1234567890",
  APPBASIS_GENERATED_PREVIEW_URL: "https://appbasis-m3-preview.example.workers.dev",
  APPBASIS_ROOT_ADMIN_PASSWORD: "RootAdmin-123!",
  APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD: "AllowedTemp-123!",
  APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD: "DeniedTemp-123!",
  APPBASIS_SMOKE_ALLOWED_PASSWORD: "AllowedFinal-123!",
  APPBASIS_SMOKE_DENIED_PASSWORD: "DeniedFinal-123!",
});

test("M3 execution readiness reuses all downstream credential contracts", () => {
  const result = validateM3PreviewExecutionReadiness(validEnv);

  assert.deepEqual(result, {
    status: "ready",
    target: "m3-preview",
    validatedContracts: [
      "database-and-auth",
      "root-admin-bootstrap",
      "smoke-principal-bootstrap",
      "acceptance-credentials",
    ],
  });

  const serialized = JSON.stringify(result);
  for (const value of Object.values(validEnv)) {
    assert.equal(serialized.includes(value), false);
  }
});

test("M3 execution readiness fails closed when a downstream secret is missing", () => {
  const env = { ...validEnv };
  delete env.APPBASIS_BETTER_AUTH_SECRET;

  assert.throws(
    () => validateM3PreviewExecutionReadiness(env),
    /APPBASIS_BETTER_AUTH_SECRET/,
  );
});

test("M3 execution readiness rejects unsafe reused smoke credentials", () => {
  const env = {
    ...validEnv,
    APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD:
      validEnv.APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD,
  };

  assert.throws(
    () => validateM3PreviewExecutionReadiness(env),
    /credentials must be distinct/,
  );
});

test("M3 execution readiness rejects a malformed preview database URL", () => {
  assert.throws(
    () =>
      validateM3PreviewExecutionReadiness({
        ...validEnv,
        APPBASIS_DATABASE_URL: "https://example.invalid/not-postgres",
      }),
    /APPBASIS_DATABASE_URL must be a PostgreSQL URL/,
  );
});
