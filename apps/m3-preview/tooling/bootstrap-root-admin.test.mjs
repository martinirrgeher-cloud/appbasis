import assert from "node:assert/strict";
import test from "node:test";

import {
  bootstrapM3PreviewRootAdmin,
  M3PreviewRootAdminEnvironmentError,
  readM3PreviewRootAdminEnvironment,
} from "./bootstrap-root-admin.mjs";

const ENV = Object.freeze({
  APPBASIS_M3_ROOT_ADMIN_TARGET: "m3-preview",
  APPBASIS_M3_ROOT_ADMIN_APPLY: "1",
  APPBASIS_DATABASE_URL: "postgresql://user:pass@db.example/appbasis_m3_preview",
  APPBASIS_BETTER_AUTH_SECRET: "m3-preview-auth-secret-0000000000000000",
  APPBASIS_GENERATED_PREVIEW_URL: "https://appbasis-m3-preview.example.workers.dev",
  APPBASIS_ROOT_ADMIN_PASSWORD: "m3-root-password-000000000000",
});

test("pins the one-time m3-preview root administrator environment", () => {
  assert.deepEqual(readM3PreviewRootAdminEnvironment(ENV), {
    connectionString: ENV.APPBASIS_DATABASE_URL,
    secret: ENV.APPBASIS_BETTER_AUTH_SECRET,
    baseURL: ENV.APPBASIS_GENERATED_PREVIEW_URL,
    username: "m3.root.admin",
    displayName: "M3 Preview Root Admin",
    password: ENV.APPBASIS_ROOT_ADMIN_PASSWORD,
  });
});

test("fails closed without the exact root administrator target and confirmation", () => {
  for (const env of [
    { ...ENV, APPBASIS_M3_ROOT_ADMIN_TARGET: "reference-preview" },
    { ...ENV, APPBASIS_M3_ROOT_ADMIN_APPLY: "0" },
  ]) {
    assert.throws(
      () => readM3PreviewRootAdminEnvironment(env),
      M3PreviewRootAdminEnvironmentError,
    );
  }
});

test("delegates only normalized m3-preview root administrator options", async () => {
  let captured;
  const result = await bootstrapM3PreviewRootAdmin(ENV, async (options) => {
    captured = options;
    return { identityId: "root-id", username: options.username, role: "admin" };
  });
  assert.equal(captured.username, "m3.root.admin");
  assert.equal(captured.displayName, "M3 Preview Root Admin");
  assert.equal(captured.connectionString, ENV.APPBASIS_DATABASE_URL);
  assert.equal(captured.secret, ENV.APPBASIS_BETTER_AUTH_SECRET);
  assert.equal(captured.password, ENV.APPBASIS_ROOT_ADMIN_PASSWORD);
  assert.deepEqual(result, {
    identityId: "root-id",
    username: "m3.root.admin",
    role: "admin",
  });
});
