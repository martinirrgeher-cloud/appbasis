import assert from "node:assert/strict";
import test from "node:test";

import { ensureM4NeonBackupSchedule } from "./m4-neon-backup-schedule.mjs";

const input = Object.freeze({
  projectId: "quiet-fire-12345678",
  branchId: "br-long-sun-12345678",
  apiKey: "neon-test-api-key",
  requiredFrequency: "daily",
  retentionSeconds: 1_209_600,
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function branch(overrides = {}) {
  return {
    id: input.branchId,
    project_id: input.projectId,
    current_state: "ready",
    ...overrides,
  };
}

function matchingSchedule(overrides = {}) {
  return [
    {
      frequency: input.requiredFrequency,
      retention_seconds: input.retentionSeconds,
      hour: 3,
      ...overrides,
    },
  ];
}

function makeFetch({
  branchPayload = branch(),
  scheduleReads = [[]],
  putStatus = 200,
  putThrows = false,
} = {}) {
  const calls = [];
  let scheduleIndex = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/projects/${input.projectId}/branches/${input.branchId}`)) {
      return jsonResponse({ branch: branchPayload });
    }
    if (url.endsWith(`/projects/${input.projectId}/branches/${input.branchId}/backup_schedule`)) {
      if (options.method === "GET") {
        const schedule = scheduleReads[Math.min(scheduleIndex, scheduleReads.length - 1)];
        scheduleIndex += 1;
        return jsonResponse({ schedule });
      }
      if (options.method === "PUT") {
        if (putThrows) throw new Error("provider timeout sentinel");
        return jsonResponse({}, putStatus);
      }
    }
    return jsonResponse({ message: "unexpected" }, 404);
  };
  return { fetchImpl, calls };
}

test("preflight is read-only and reports when the explicit policy is missing", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await ensureM4NeonBackupSchedule({
    ...input,
    apply: false,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "schedule-update-required",
    writeOutcome: "not-requested",
    frequency: "daily",
    retentionSeconds: 1_209_600,
  });
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET"]);
});

test("an exact existing policy makes apply idempotent without PUT", async () => {
  const { fetchImpl, calls } = makeFetch({
    scheduleReads: [matchingSchedule()],
  });
  const result = await ensureM4NeonBackupSchedule({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "schedule-ready",
    writeOutcome: "not-needed",
    frequency: "daily",
    retentionSeconds: 1_209_600,
  });
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET"]);
});

test("apply sends exactly one PUT and requires authoritative readback", async () => {
  const { fetchImpl, calls } = makeFetch({
    scheduleReads: [[], matchingSchedule()],
  });
  const result = await ensureM4NeonBackupSchedule({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "schedule-ready",
    writeOutcome: "confirmed",
    frequency: "daily",
    retentionSeconds: 1_209_600,
  });
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET", "PUT", "GET"]);
  const put = calls[2];
  assert.equal(put.options.headers.authorization, `Bearer ${input.apiKey}`);
  assert.equal(put.options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(put.options.body), {
    schedule: [
      {
        frequency: input.requiredFrequency,
        retention_seconds: input.retentionSeconds,
      },
    ],
  });
});

test("timeout or invalid response reconciles once and never blindly repeats PUT", async () => {
  const reconciled = makeFetch({
    scheduleReads: [[], matchingSchedule()],
    putThrows: true,
  });
  const result = await ensureM4NeonBackupSchedule({
    ...input,
    apply: true,
    fetchImpl: reconciled.fetchImpl,
  });
  assert.equal(result.writeOutcome, "reconciled");
  assert.equal(reconciled.calls.filter((call) => call.options.method === "PUT").length, 1);

  const calls = [];
  let getCount = 0;
  const invalidResponseFetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/projects/${input.projectId}/branches/${input.branchId}`)) {
      return jsonResponse({ branch: branch() });
    }
    if (options.method === "GET") {
      getCount += 1;
      return jsonResponse({ schedule: getCount === 1 ? [] : matchingSchedule() });
    }
    return { ok: true };
  };
  const invalidResult = await ensureM4NeonBackupSchedule({
    ...input,
    apply: true,
    fetchImpl: invalidResponseFetch,
  });
  assert.equal(invalidResult.writeOutcome, "reconciled");
  assert.equal(calls.filter((call) => call.options.method === "PUT").length, 1);
});

test("unknown write outcome without exact readback fails closed", async () => {
  const { fetchImpl, calls } = makeFetch({
    scheduleReads: [[], []],
    putThrows: true,
  });
  await assert.rejects(
    ensureM4NeonBackupSchedule({ ...input, apply: true, fetchImpl }),
    /outcome is unknown; do not retry blindly/,
  );
  assert.equal(calls.filter((call) => call.options.method === "PUT").length, 1);
});

test("provider rejection is sanitized and may only be accepted after exact readback", async () => {
  const rejected = makeFetch({
    scheduleReads: [[], []],
    putStatus: 403,
  });
  await assert.rejects(
    ensureM4NeonBackupSchedule({
      ...input,
      apply: true,
      fetchImpl: rejected.fetchImpl,
    }),
    /update is unconfirmed \(status 403\); do not retry blindly/,
  );
  assert.equal(rejected.calls.filter((call) => call.options.method === "PUT").length, 1);

  const reconciled = makeFetch({
    scheduleReads: [[], matchingSchedule()],
    putStatus: 503,
  });
  const result = await ensureM4NeonBackupSchedule({
    ...input,
    apply: true,
    fetchImpl: reconciled.fetchImpl,
  });
  assert.equal(result.writeOutcome, "reconciled");
});

test("successful PUT without exact readback does not trigger another write", async () => {
  const { fetchImpl, calls } = makeFetch({ scheduleReads: [[], []] });
  await assert.rejects(
    ensureM4NeonBackupSchedule({ ...input, apply: true, fetchImpl }),
    /authoritative readback is not exact; do not write again automatically/,
  );
  assert.equal(calls.filter((call) => call.options.method === "PUT").length, 1);
});

test("requires a ready root branch and an exact single-entry schedule", async () => {
  await assert.rejects(
    ensureM4NeonBackupSchedule({
      ...input,
      apply: false,
      fetchImpl: makeFetch({ branchPayload: branch({ parent_id: "br-parent-123" }) }).fetchImpl,
    }),
    /require the configured root branch/,
  );
  await assert.rejects(
    ensureM4NeonBackupSchedule({
      ...input,
      apply: false,
      fetchImpl: makeFetch({ branchPayload: branch({ current_state: "initializing" }) }).fetchImpl,
    }),
    /missing, mismatched, or not ready/,
  );

  const extraEntry = makeFetch({
    scheduleReads: [[...matchingSchedule(), { frequency: "weekly", retention_seconds: 604800 }]],
  });
  const result = await ensureM4NeonBackupSchedule({
    ...input,
    apply: false,
    fetchImpl: extraEntry.fetchImpl,
  });
  assert.equal(result.status, "schedule-update-required");
});

test("validates policy inputs before provider calls", async () => {
  const neverFetch = async () => {
    throw new Error("must not fetch");
  };
  const cases = [
    [{ projectId: "INVALID" }, /NEON_PROJECT_ID is invalid/],
    [{ branchId: "br ok" }, /NEON_BRANCH_ID is invalid/],
    [{ apiKey: " token " }, /NEON_API_KEY is invalid/],
    [{ requiredFrequency: "hourly" }, /REQUIRED_BACKUP_FREQUENCY is invalid/],
    [{ retentionSeconds: 3599 }, /MIN_SNAPSHOT_RETENTION_SECONDS is invalid/],
    [{ retentionSeconds: 3_024_001 }, /MIN_SNAPSHOT_RETENTION_SECONDS is invalid/],
    [{ apply: "1" }, /APPLY_BACKUP_SCHEDULE is invalid/],
  ];
  for (const [override, pattern] of cases) {
    await assert.rejects(
      ensureM4NeonBackupSchedule({
        ...input,
        apply: false,
        ...override,
        fetchImpl: neverFetch,
      }),
      pattern,
    );
  }
});

test("does not leak provider response bodies or API credentials", async () => {
  const sentinel = "never-leak-provider-message";
  const fetchImpl = async () =>
    jsonResponse({ message: sentinel, credential: input.apiKey }, 403);
  await assert.rejects(
    ensureM4NeonBackupSchedule({ ...input, apply: false, fetchImpl }),
    (error) => {
      assert.match(error.message, /status 403/);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      assert.doesNotMatch(error.message, new RegExp(input.apiKey));
      return true;
    },
  );
});
