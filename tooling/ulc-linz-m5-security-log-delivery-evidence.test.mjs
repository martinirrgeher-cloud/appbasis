import assert from "node:assert/strict";
import test from "node:test";

import {
  collectUlcLinzM5SecurityLogDeliveryEvidence,
  evaluateUlcLinzM5SecurityLogDeliverySnapshot,
} from "./ulc-linz-m5-security-log-delivery-evidence.mjs";

const DEPLOYED_AT = "2026-08-23T21:30:00.000Z";
const OBSERVED_AT = new Date("2026-08-23T22:00:00.000Z");

function validSnapshot() {
  return {
    eventCount: 2n,
    latestRecordedAt: "2026-08-23T21:59:00.000Z",
    deployedAt: DEPLOYED_AT,
    observedAt: OBSERVED_AT.toISOString(),
  };
}

test("collector reads only canonical current-runtime security deliveries without payloads", async () => {
  let ended = 0;
  const calls = [];
  const databaseFactory = () => ({
    client: {
      async unsafe(query, params) {
        calls.push({ query, params });
        return [{
          event_count: "1",
          latest_recorded_at: "2026-08-23T21:59:00.000Z",
        }];
      },
      async end() { ended += 1; },
    },
  });

  assert.deepEqual(
    await collectUlcLinzM5SecurityLogDeliveryEvidence(
      {
        productionDatabaseUrl:
          "postgresql://app_owner:pw@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb",
        deployedAt: DEPLOYED_AT,
      },
      { databaseFactory, now: OBSERVED_AT },
    ),
    { runtimeDeliveryVerified: true },
  );
  assert.equal(ended, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [DEPLOYED_AT]);
  assert.match(calls[0].query, /app_id = 'ulc-linz'/);
  assert.match(calls[0].query, /schema_version = 1/);
  assert.match(calls[0].query, /category = 'security'/);
  assert.match(calls[0].query, /identity\.request\.denied/);
  assert.match(calls[0].query, /authorization\.denied/);
  assert.match(calls[0].query, /occurred_at >= \$1::timestamptz/);
  assert.match(calls[0].query, /recorded_at >= \$1::timestamptz/);
  assert.doesNotMatch(calls[0].query, /actor_principal_id\s*,|organization_id\s*,|target_id\s*,/);
});

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
