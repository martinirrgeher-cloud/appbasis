import assert from "node:assert/strict";
import test from "node:test";

import { ensureM4PreMigrationSnapshot } from "./m4-pre-migration-snapshot.mjs";

const input = Object.freeze({
  projectId: "quiet-fire-12345678",
  branchId: "br-long-sun-12345678",
  apiKey: "neon-test-api-key",
  migrationId: "20260816-permissions-v4",
  expiresAt: "2026-08-23T08:00:00Z",
  now: Date.parse("2026-08-16T08:00:00Z"),
});
const snapshotName = "appbasis-pre-migration-20260816-permissions-v4";
const snapshotId = "ss-bright-cloud-12345678";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function exactSnapshot(overrides = {}) {
  return {
    id: snapshotId,
    name: snapshotName,
    source_branch_id: input.branchId,
    created_at: "2026-08-16T08:01:00Z",
    expires_at: input.expiresAt,
    manual: true,
    ...overrides,
  };
}

function createdSnapshot(overrides = {}) {
  return {
    id: snapshotId,
    name: snapshotName,
    created_at: "2026-08-16T08:01:00Z",
    ...overrides,
  };
}

function makeFetch({
  branch = {
    id: input.branchId,
    project_id: input.projectId,
    current_state: "ready",
  },
  snapshotLists = [[]],
  createPayload = { snapshot: createdSnapshot(), operations: [] },
  createStatus = 200,
  createThrows = false,
} = {}) {
  const calls = [];
  let listIndex = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith(`/projects/${input.projectId}/branches/${input.branchId}`)) {
      return jsonResponse({ branch });
    }
    if (url.endsWith(`/projects/${input.projectId}/snapshots`)) {
      const snapshots = snapshotLists[Math.min(listIndex, snapshotLists.length - 1)];
      listIndex += 1;
      return jsonResponse({ snapshots });
    }
    if (url.includes(`/projects/${input.projectId}/branches/${input.branchId}/snapshot?`)) {
      if (createThrows) throw new Error("provider timeout sentinel");
      return jsonResponse(createPayload, createStatus);
    }
    return jsonResponse({ message: "unexpected" }, 404);
  };
  return { fetchImpl, calls };
}

test("preflight is read-only and reports a required snapshot without apply", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await ensureM4PreMigrationSnapshot({
    ...input,
    apply: false,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "snapshot-required",
    created: false,
    snapshotId: null,
    snapshotName,
    expiresAt: input.expiresAt,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET"]);
});

test("an exact existing snapshot makes reruns idempotent without POST", async () => {
  const { fetchImpl, calls } = makeFetch({ snapshotLists: [[exactSnapshot()]] });
  const result = await ensureM4PreMigrationSnapshot({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "snapshot-ready",
    created: false,
    snapshotId,
    snapshotName,
    expiresAt: input.expiresAt,
  });
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET"]);
});

test("apply performs one POST and requires authoritative readback", async () => {
  const { fetchImpl, calls } = makeFetch({
    snapshotLists: [[], [exactSnapshot()]],
  });
  const result = await ensureM4PreMigrationSnapshot({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "snapshot-ready",
    created: true,
    snapshotId,
    snapshotName,
    expiresAt: input.expiresAt,
  });
  assert.deepEqual(calls.map((call) => call.options.method), [
    "GET",
    "GET",
    "POST",
    "GET",
  ]);
  const post = calls[2];
  const postUrl = new URL(post.url);
  assert.equal(postUrl.searchParams.get("name"), snapshotName);
  assert.equal(postUrl.searchParams.get("expires_at"), input.expiresAt);
  assert.equal(postUrl.searchParams.has("lsn"), false);
  assert.equal(postUrl.searchParams.has("timestamp"), false);
  assert.equal(post.options.headers.authorization, `Bearer ${input.apiKey}`);
});

test("a failed or timed-out POST is reconciled with GET and never blindly retried", async () => {
  const timeout = makeFetch({
    snapshotLists: [[], [exactSnapshot()]],
    createThrows: true,
  });
  const timeoutResult = await ensureM4PreMigrationSnapshot({
    ...input,
    apply: true,
    fetchImpl: timeout.fetchImpl,
  });
  assert.equal(timeoutResult.snapshotId, snapshotId);
  assert.equal(
    timeout.calls.filter((call) => call.options.method === "POST").length,
    1,
  );

  const unresolved = makeFetch({
    snapshotLists: [[], []],
    createThrows: true,
  });
  await assert.rejects(
    ensureM4PreMigrationSnapshot({
      ...input,
      apply: true,
      fetchImpl: unresolved.fetchImpl,
    }),
    /outcome is unknown; do not retry blindly/,
  );
  assert.equal(
    unresolved.calls.filter((call) => call.options.method === "POST").length,
    1,
  );
});

test("rejects non-root, non-ready, duplicate, or mismatched snapshot state", async () => {
  const cases = [
    [
      makeFetch({
        branch: {
          id: input.branchId,
          project_id: input.projectId,
          current_state: "ready",
          parent_id: "br-parent-12345678",
        },
      }).fetchImpl,
      /require the configured root branch/,
    ],
    [
      makeFetch({
        branch: {
          id: input.branchId,
          project_id: input.projectId,
          current_state: "initializing",
        },
      }).fetchImpl,
      /missing, mismatched, or not ready/,
    ],
    [
      makeFetch({ snapshotLists: [[exactSnapshot(), exactSnapshot({ id: "ss-other-123" })]] }).fetchImpl,
      /state is ambiguous/,
    ],
    [
      makeFetch({ snapshotLists: [[exactSnapshot({ source_branch_id: "br-other-123" })]] }).fetchImpl,
      /does not match the M4 pre-migration snapshot contract/,
    ],
    [
      makeFetch({ snapshotLists: [[exactSnapshot({ expires_at: "2026-08-24T08:00:00Z" })]] }).fetchImpl,
      /does not match the M4 pre-migration snapshot contract/,
    ],
  ];

  for (const [fetchImpl, pattern] of cases) {
    await assert.rejects(
      ensureM4PreMigrationSnapshot({ ...input, apply: false, fetchImpl }),
      pattern,
    );
  }
});

test("rejects invalid inputs before any provider call", async () => {
  const neverFetch = async () => {
    throw new Error("must not fetch");
  };
  const cases = [
    [{ projectId: "INVALID" }, /NEON_PROJECT_ID is invalid/],
    [{ branchId: "br ok" }, /NEON_BRANCH_ID is invalid/],
    [{ apiKey: " token " }, /NEON_API_KEY is invalid/],
    [{ migrationId: "Migration 1" }, /MIGRATION_ID is invalid/],
    [{ expiresAt: "2026-08-23T10:00:00+02:00" }, /SNAPSHOT_EXPIRES_AT is invalid/],
    [{ expiresAt: "2026-08-16T07:59:59Z" }, /SNAPSHOT_EXPIRES_AT is invalid/],
    [{ apply: "1" }, /APPLY_PRE_MIGRATION_SNAPSHOT is invalid/],
  ];

  for (const [override, pattern] of cases) {
    await assert.rejects(
      ensureM4PreMigrationSnapshot({
        ...input,
        apply: false,
        ...override,
        fetchImpl: neverFetch,
      }),
      pattern,
    );
  }
});

test("sanitizes provider failures without response bodies or credentials", async () => {
  const sentinel = "never-leak-provider-secret";
  const fetchImpl = async () =>
    jsonResponse({ message: sentinel, token: input.apiKey }, 403);

  await assert.rejects(
    ensureM4PreMigrationSnapshot({ ...input, apply: false, fetchImpl }),
    (error) => {
      assert.match(error.message, /status 403/);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      assert.doesNotMatch(error.message, new RegExp(input.apiKey));
      return true;
    },
  );
});

test("fails closed when create response or authoritative readback is not exact", async () => {
  const invalidCreate = makeFetch({
    snapshotLists: [[], [exactSnapshot()]],
    createPayload: {
      snapshot: createdSnapshot({ id: "INVALID" }),
      operations: [],
    },
  });
  await assert.rejects(
    ensureM4PreMigrationSnapshot({
      ...input,
      apply: true,
      fetchImpl: invalidCreate.fetchImpl,
    }),
    /create response is invalid/,
  );

  const missingReadback = makeFetch({ snapshotLists: [[], []] });
  await assert.rejects(
    ensureM4PreMigrationSnapshot({
      ...input,
      apply: true,
      fetchImpl: missingReadback.fetchImpl,
    }),
    /authoritative readback is not yet exact; do not create another snapshot/,
  );
  assert.equal(
    missingReadback.calls.filter((call) => call.options.method === "POST").length,
    1,
  );
});
