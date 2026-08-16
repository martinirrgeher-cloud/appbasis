import assert from "node:assert/strict";
import test from "node:test";

import { inspectM4NeonBackupReadiness } from "./m4-neon-backup-readiness.mjs";

const validInput = {
  projectId: "quiet-fire-12345678",
  branchId: "br-long-sun-12345678",
  apiKey: "neon-test-api-key",
  minRestoreWindowSeconds: 604800,
  requiredFrequency: "daily",
  minSnapshotRetentionSeconds: 1209600,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFetch({
  historyRetentionSeconds = 2_592_000,
  schedule = [{ frequency: "daily", retention_seconds: 3_024_000 }],
} = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/projects/${validInput.projectId}`)) {
      return jsonResponse({
        project: { history_retention_seconds: historyRetentionSeconds },
      });
    }
    if (
      url.endsWith(
        `/projects/${validInput.projectId}/branches/${validInput.branchId}/backup_schedule`,
      )
    ) {
      return jsonResponse({ schedule });
    }
    return jsonResponse({ message: "unexpected" }, 404);
  };
  return { fetchImpl, calls };
}

test("reports ready only when PITR history and scheduled backup policy both pass", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await inspectM4NeonBackupReadiness({
    ...validInput,
    fetchImpl,
  });

  assert.deepEqual(result, {
    restoreWindowSeconds: 2_592_000,
    matchedFrequency: "daily",
    snapshotRetentionSeconds: 3_024_000,
  });
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.authorization, `Bearer ${validInput.apiKey}`);
  }
});

test("fails closed when PITR history is below policy", async () => {
  const { fetchImpl } = makeFetch({ historyRetentionSeconds: 86_400 });
  await assert.rejects(
    inspectM4NeonBackupReadiness({ ...validInput, fetchImpl }),
    /restore history does not meet the M4 policy/,
  );
});

test("fails closed when scheduled backups are missing", async () => {
  const { fetchImpl } = makeFetch({ schedule: [] });
  await assert.rejects(
    inspectM4NeonBackupReadiness({ ...validInput, fetchImpl }),
    /scheduled backup configuration is missing or invalid/,
  );
});

test("fails closed when the required frequency has insufficient retention", async () => {
  const { fetchImpl } = makeFetch({
    schedule: [
      { frequency: "daily", retention_seconds: 604800 },
      { frequency: "weekly", retention_seconds: 3_024_000 },
    ],
  });
  await assert.rejects(
    inspectM4NeonBackupReadiness({ ...validInput, fetchImpl }),
    /scheduled backup configuration does not meet the M4 policy/,
  );
});

test("does not assume Neon's default retention when the API omits it", async () => {
  const { fetchImpl } = makeFetch({ schedule: [{ frequency: "daily" }] });
  await assert.rejects(
    inspectM4NeonBackupReadiness({ ...validInput, fetchImpl }),
    /scheduled backup configuration does not meet the M4 policy/,
  );
});

test("validates provider ids, token and policy inputs", async () => {
  const { fetchImpl } = makeFetch();
  const cases = [
    [{ projectId: "INVALID" }, /NEON_PROJECT_ID is invalid/],
    [{ branchId: "br ok" }, /NEON_BRANCH_ID is invalid/],
    [{ apiKey: " token " }, /NEON_API_KEY is invalid/],
    [{ minRestoreWindowSeconds: 0 }, /MIN_RESTORE_WINDOW_SECONDS is invalid/],
    [{ requiredFrequency: "hourly" }, /REQUIRED_BACKUP_FREQUENCY is invalid/],
    [{ minSnapshotRetentionSeconds: 3_024_001 }, /MIN_SNAPSHOT_RETENTION_SECONDS is invalid/],
  ];

  for (const [override, pattern] of cases) {
    await assert.rejects(
      inspectM4NeonBackupReadiness({
        ...validInput,
        ...override,
        fetchImpl,
      }),
      pattern,
    );
  }
});

test("sanitizes provider rejection bodies", async () => {
  const sentinel = "never-leak-this-provider-message";
  const fetchImpl = async () => jsonResponse({ message: sentinel }, 403);

  await assert.rejects(
    inspectM4NeonBackupReadiness({ ...validInput, fetchImpl }),
    (error) => {
      assert.match(error.message, /status 403/);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      assert.doesNotMatch(error.message, new RegExp(validInput.apiKey));
      return true;
    },
  );
});

test("rejects non-Response provider results", async () => {
  await assert.rejects(
    inspectM4NeonBackupReadiness({
      ...validInput,
      fetchImpl: async () => ({ ok: true }),
    }),
    /invalid response/,
  );
});
