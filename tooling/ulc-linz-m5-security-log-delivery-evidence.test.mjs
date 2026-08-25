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

test("collector binds post-deployment sink activity and observation time to the same database statement", async () => {
  let ended = 0;
  const calls = [];
  const databaseFactory = () => ({
    client: {
      async unsafe(query, params) {
        calls.push({ query, params });
        return [{
          event_count: "1",
          latest_recorded_at: "2026-08-23T22:00:00.500Z",
          observed_at: "2026-08-23T22:00:01.000Z",
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
    { postDeploymentSinkActivityObserved: true },
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
  assert.match(calls[0].query, /statement_timestamp\(\) AS observed_at/);
  assert.match(calls[0].query, /recorded_at <= statement_timestamp\(\)/);
  assert.doesNotMatch(calls[0].query, /actor_principal_id\s*,|organization_id\s*,|target_id\s*,/);
});

test("observes only fresh matching sink activity after the deployed runtime version", () => {
  assert.deepEqual(evaluateUlcLinzM5SecurityLogDeliverySnapshot(validSnapshot()), {
    postDeploymentSinkActivityObserved: true,
  });
});

test("rejects an empty sink or missing latest activity timestamp", () => {
  for (const mutate of [
    (value) => { value.eventCount = 0n; value.latestRecordedAt = null; },
    (value) => { value.latestRecordedAt = null; },
  ]) {
    const value = validSnapshot();
    mutate(value);
    assert.throws(() => evaluateUlcLinzM5SecurityLogDeliverySnapshot(value));
  }
});

test("rejects pre-deployment, future or stale sink activity evidence", () => {
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

test("rejects missing or malformed database observation time", async () => {
  for (const observedAt of [undefined, "not-a-time"]) {
    const databaseFactory = () => ({
      client: {
        async unsafe() {
          return [{
            event_count: "1",
            latest_recorded_at: "2026-08-23T21:59:00.000Z",
            observed_at: observedAt,
          }];
        },
        async end() {},
      },
    });
    await assert.rejects(() => collectUlcLinzM5SecurityLogDeliveryEvidence(
      {
        productionDatabaseUrl:
          "postgresql://app_owner:pw@ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech/neondb",
        deployedAt: DEPLOYED_AT,
      },
      { databaseFactory, now: OBSERVED_AT },
    ));
  }
});

test("rejects decorated or malformed sink activity evidence", () => {
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
