import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExactM3PreviewSmokePermissionState,
  assertM3PreviewSmokePermissionStateReadyForProvisioning,
  M3PreviewSmokeBootstrapEnvironmentError,
  M3PreviewSmokeBootstrapStateError,
  readM3PreviewSmokeBootstrapEnvironment,
} from "./bootstrap-smoke-principals-contract.mjs";

const ENV = Object.freeze({
  APPBASIS_M3_SMOKE_BOOTSTRAP_TARGET: "m3-preview",
  APPBASIS_M3_SMOKE_BOOTSTRAP_APPLY: "1",
  APPBASIS_DATABASE_URL: "postgresql://user:pass@db.example/appbasis_m3_preview",
  APPBASIS_BETTER_AUTH_SECRET: "m3-preview-auth-secret-0000000000000000",
  APPBASIS_GENERATED_PREVIEW_URL: "https://appbasis-m3-preview.example.workers.dev",
  APPBASIS_ROOT_ADMIN_PASSWORD: "m3-root-password-000000000000",
  APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD: "m3-allowed-temporary-0000000000",
  APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD: "m3-denied-temporary-00000000000",
});

function permissionState({ roleIds = [], grants = [], revokes = [] } = {}) {
  return { principalId: "ignored", roleIds, grants, revokes };
}

function permissionStore(states) {
  return {
    async findPrincipal(id) {
      return states.get(id) ?? null;
    },
  };
}

test("pins distinct m3-preview smoke bootstrap credentials", () => {
  const result = readM3PreviewSmokeBootstrapEnvironment(ENV);
  assert.equal(result.connectionString, ENV.APPBASIS_DATABASE_URL);
  assert.equal(result.baseURL, ENV.APPBASIS_GENERATED_PREVIEW_URL);
  assert.equal(
    result.allowedTemporaryPassword,
    ENV.APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD,
  );
  assert.equal(
    result.deniedTemporaryPassword,
    ENV.APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD,
  );

  assert.throws(
    () =>
      readM3PreviewSmokeBootstrapEnvironment({
        ...ENV,
        APPBASIS_SMOKE_DENIED_TEMPORARY_PASSWORD:
          ENV.APPBASIS_SMOKE_ALLOWED_TEMPORARY_PASSWORD,
      }),
    /credentials must be distinct/,
  );
});

test("fails closed without the exact smoke bootstrap target and confirmation", () => {
  for (const env of [
    { ...ENV, APPBASIS_M3_SMOKE_BOOTSTRAP_TARGET: "reference-preview" },
    { ...ENV, APPBASIS_M3_SMOKE_BOOTSTRAP_APPLY: "0" },
  ]) {
    assert.throws(
      () => readM3PreviewSmokeBootstrapEnvironment(env),
      M3PreviewSmokeBootstrapEnvironmentError,
    );
  }
});

test("permits only missing, empty or exact permission state before provisioning", async () => {
  const states = new Map([["allowed-id", permissionState()]]);
  const store = permissionStore(states);
  await assert.doesNotReject(
    assertM3PreviewSmokePermissionStateReadyForProvisioning(store, {
      allowedIdentityId: "allowed-id",
      deniedIdentityId: "denied-id",
    }),
  );

  states.set("allowed-id", permissionState({ roleIds: ["demo:member"] }));
  states.set("denied-id", permissionState());
  await assert.doesNotReject(
    assertM3PreviewSmokePermissionStateReadyForProvisioning(store, {
      allowedIdentityId: "allowed-id",
      deniedIdentityId: "denied-id",
    }),
  );
});

test("rejects unsafe pre-existing permission state before provisioning", async () => {
  const states = new Map([
    ["allowed-id", permissionState({ grants: ["tasks:manage"] })],
    ["denied-id", permissionState()],
  ]);
  const store = permissionStore(states);
  await assert.rejects(
    assertM3PreviewSmokePermissionStateReadyForProvisioning(store, {
      allowedIdentityId: "allowed-id",
      deniedIdentityId: "denied-id",
    }),
    /unsafe pre-existing permission state/,
  );

  states.set("allowed-id", permissionState());
  states.set("denied-id", permissionState({ roleIds: ["demo:member"] }));
  await assert.rejects(
    assertM3PreviewSmokePermissionStateReadyForProvisioning(store, {
      allowedIdentityId: "allowed-id",
      deniedIdentityId: "denied-id",
    }),
    /unsafe pre-existing permission state/,
  );
});

test("accepts only the exact allowed and denied permission state after provisioning", async () => {
  const states = new Map([
    ["allowed-id", permissionState({ roleIds: ["demo:member"] })],
    ["denied-id", permissionState()],
  ]);
  const store = permissionStore(states);

  await assert.doesNotReject(
    assertExactM3PreviewSmokePermissionState(store, {
      allowedIdentityId: "allowed-id",
      deniedIdentityId: "denied-id",
    }),
  );

  states.set("denied-id", permissionState({ roleIds: ["demo:member"] }));
  await assert.rejects(
    assertExactM3PreviewSmokePermissionState(store, {
      allowedIdentityId: "allowed-id",
      deniedIdentityId: "denied-id",
    }),
    M3PreviewSmokeBootstrapStateError,
  );
});
