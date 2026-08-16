import assert from "node:assert/strict";
import test from "node:test";

import {
  bindUlcLinzM5TargetPolicy,
  ULC_LINZ_M5_TARGET_POLICY,
} from "./ulc-linz-m5-target-policy.mjs";

const VALID_ULC_DEFINITION = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze([]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

test("binds the approved ULC Linz Verein and High-Privacy target", () => {
  const policy = bindUlcLinzM5TargetPolicy(VALID_ULC_DEFINITION);

  assert.strictEqual(policy, ULC_LINZ_M5_TARGET_POLICY);
  assert.deepEqual(policy, {
    appId: "ulc-linz",
    operatorProfile: "Verein",
    highPrivacyProfileId: "appbasis-high-privacy-v0.1",
    productionDatabaseRegionTarget: "EU / Frankfurt",
  });
  assert.equal(Object.isFrozen(policy), true);
});

test("rejects binding the ULC target policy to another app", () => {
  assert.throws(
    () =>
      bindUlcLinzM5TargetPolicy({
        ...VALID_ULC_DEFINITION,
        appId: "reference",
        displayName: "Reference",
      }),
    /requires appId ulc-linz/,
  );
});

test("rejects ULC target definitions without the permissions service", () => {
  assert.throws(
    () =>
      bindUlcLinzM5TargetPolicy({
        ...VALID_ULC_DEFINITION,
        platformServices: ["identity"],
      }),
    /requires platform service permissions/,
  );
});

test("rejects ULC target definitions without the identity service", () => {
  assert.throws(
    () =>
      bindUlcLinzM5TargetPolicy({
        ...VALID_ULC_DEFINITION,
        platformServices: ["permissions"],
      }),
    /requires platform service identity/,
  );
});
