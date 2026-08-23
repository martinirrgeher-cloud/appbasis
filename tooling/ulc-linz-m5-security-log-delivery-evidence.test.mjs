import assert from "node:assert/strict";
import test from "node:test";

import { evaluateUlcLinzM5SecurityLogDeliverySnapshot } from "./ulc-linz-m5-security-log-delivery-evidence.mjs";

function validSnapshot() {
  return {
    eventCount: 2n,
    latestRecordedAt: "2026-08-23T21:59:00.000Z",
    deployedAt: "2026-08-23T21:30:00.000Z",
    observedAt: "2026-08-23T22:00:00.000Z",
  };
}

test("verifies only a fresh real sink event produced after the deployed runtime version", () => {
  assert.deepEqual(evaluateUlcLinzM5SecurityLogDeliverySnapshot(validSnapshot()), {
    runtimeDeliveryVerified: true,
  });
});

test("rejects an empty sink or missing latest delivery timestamp", () => {
  for (const mutate of [
    (value) => { value.eventCount = 0n; value.latestRecordedAt = null; },
    (value) => { value.latestRecordedAt = null; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogDeliverySnapshot(value));
  }
});

test("rejects pre-deployment, future or stale delivery evidence", () => {
  for (const latestRecordedAt of [
    "2026-08-23T21:29:59.999Z",
    "2026-08-23T22:00:00.001Z",
    "2026-08-22T22:00:00.000Z",
  ]) {
    const value = validSnapshot();
    value.latestRecordedAt = latestRecordedAt;
    assert.throws(() => evaluateUlcLinzM5SecurityLogDeliverySnapshot(value));
  }
});

test("rejects decorated or malformed delivery evidence", () => {
  const extra = validSnapshot();
  extra.extra = true;
  assert.throws(() => evaluateUlcLinzM5SecurityLogDeliverySnapshot(extra));

  const accessor = validSnapshot();
  Object.defineProperty(accessor, "eventCount", {
    enumerable: true,
    get() { return 2n; },
  });
  assert.throws(() => evaluateUlcLinzM5SecurityLogDeliverySnapshot(accessor));

  const badCount = validSnapshot();
  badCount.eventCount = "-1";
  assert.throws(() => evaluateUlcLinzM5SecurityLogDeliverySnapshot(badCount));
});
