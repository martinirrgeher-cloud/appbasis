import assert from "node:assert/strict";
import test from "node:test";

import { ensureM4RestoreRehearsal } from "./m4-restore-rehearsal.mjs";

const input = Object.freeze({
  projectId: "quiet-fire-12345678",
  sourceBranchId: "br-long-sun-12345678",
  snapshotId: "snap-calm-river-12345678",
  restoreBranchName: "appbasis-m4-restore-rehearsal-20260816",
  apiKey: "neon-test-api-key",
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sourceBranch() {
  return {
    id: input.sourceBranchId,
    project_id: input.projectId,
    name: "main",
    current_state: "ready",
  };
}

function snapshot() {
  return {
    id: input.snapshotId,
    name: "appbasis-pre-migration-m4-test",
    source_branch_id: input.sourceBranchId,
    created_at: "2026-08-16T07:00:00Z",
  };
}

function restoredBranch() {
  return {
    id: "br-restored-sun-12345678",
    project_id: input.projectId,
    name: input.restoreBranchName,
    current_state: "ready",
    restored_from: input.snapshotId,
  };
}

function operation(status, overrides = {}) {
  return {
    id: `operation-${status}`,
    project_id: input.projectId,
    branch_id: restoredBranch().id,
    status,
    ...overrides,
  };
}

function makeExistingRestoreFetch(operationPages) {
  const calls = [];
  let operationsRead = 0;
  const existing = restoredBranch();
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);

    if (parsed.pathname.endsWith(`/branches/${input.sourceBranchId}`)) {
      return jsonResponse({ branch: sourceBranch() });
    }
    if (parsed.pathname.endsWith(`/snapshots`) && options.method === "GET") {
      return jsonResponse({ snapshots: [snapshot()] });
    }
    if (parsed.pathname.endsWith(`/branches`) && options.method === "GET") {
      return jsonResponse({ branches: [existing] });
    }
    if (parsed.pathname.endsWith(`/operations`) && options.method === "GET") {
      const page = operationPages[Math.min(operationsRead, operationPages.length - 1)];
      operationsRead += 1;
      return jsonResponse(page);
    }
    if (options.method === "POST") {
      throw new Error("restore POST must not run for an existing exact restore branch");
    }
    return jsonResponse({}, 404);
  };

  return { fetchImpl, calls };
}

test("reused restore branch rechecks operations and unlocks verification after completion", async () => {
  const { fetchImpl, calls } = makeExistingRestoreFetch([
    {
      operations: [operation("finished"), operation("skipped")],
      pagination: {},
    },
  ]);

  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.writeOutcome, "not-needed");
  assert.equal(result.restoreOperationsState, "complete");
  assert.equal(result.verificationReady, true);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  const operationsCall = calls.find((call) => new URL(call.url).pathname.endsWith("/operations"));
  assert.ok(operationsCall);
  assert.equal(new URL(operationsCall.url).searchParams.get("limit"), "1000");
});

test("reused restore branch remains blocked while any matching operation is pending", async () => {
  for (const status of ["scheduling", "running", "failed", "cancelling", "cancelled"]) {
    const { fetchImpl } = makeExistingRestoreFetch([
      { operations: [operation(status)], pagination: {} },
    ]);
    const result = await ensureM4RestoreRehearsal({
      ...input,
      apply: true,
      fetchImpl,
    });

    assert.equal(result.restoreOperationsState, "pending");
    assert.equal(result.verificationReady, false);
  }
});

test("operation recheck follows read-only pagination before accepting completion", async () => {
  const unrelated = operation("finished", { branch_id: "br-unrelated-12345678" });
  const { fetchImpl, calls } = makeExistingRestoreFetch([
    {
      operations: [unrelated],
      pagination: { cursor: "next-page-token" },
    },
    {
      operations: [operation("finished")],
      pagination: {},
    },
  ]);

  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.restoreOperationsState, "complete");
  assert.equal(result.verificationReady, true);
  const operationCalls = calls.filter((call) =>
    new URL(call.url).pathname.endsWith("/operations"),
  );
  assert.equal(operationCalls.length, 2);
  assert.equal(new URL(operationCalls[1].url).searchParams.get("cursor"), "next-page-token");
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
});

test("short pages still accept explicit terminal cursor absence", async () => {
  for (const pagination of [{}, { cursor: null }, { cursor: "" }]) {
    const { fetchImpl, calls } = makeExistingRestoreFetch([
      {
        operations: [operation("finished")],
        pagination,
      },
    ]);

    const result = await ensureM4RestoreRehearsal({
      ...input,
      apply: false,
      fetchImpl,
    });

    assert.equal(result.restoreOperationsState, "complete");
    assert.equal(result.verificationReady, true);
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  }
});

test("short-page cursor anomalies stay fail closed but report a safe diagnostic class", async () => {
  for (const [pagination, expected] of [
    [{ cursor: 42 }, /non-string cursor on a short page/],
    [{ cursor: " next-page-token" }, /non-canonical cursor on a short page/],
  ]) {
    const { fetchImpl, calls } = makeExistingRestoreFetch([
      {
        operations: [operation("finished")],
        pagination,
      },
    ]);

    await assert.rejects(
      ensureM4RestoreRehearsal({
        ...input,
        apply: false,
        fetchImpl,
      }),
      expected,
    );
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  }
});

test("non-advancing cursor on a short page is accepted as the observed terminal provider variant", async () => {
  const fullPage = Array.from({ length: 1000 }, (_, index) =>
    operation("finished", {
      id: `operation-unrelated-${index}`,
      branch_id: "br-unrelated-12345678",
    }),
  );
  const { fetchImpl, calls } = makeExistingRestoreFetch([
    {
      operations: fullPage,
      pagination: { cursor: "next-page-token" },
    },
    {
      operations: [operation("finished")],
      pagination: { cursor: "next-page-token" },
    },
  ]);

  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: false,
    fetchImpl,
  });

  assert.equal(result.writeOutcome, "not-needed");
  assert.equal(result.restoreOperationsState, "complete");
  assert.equal(result.verificationReady, true);
  const operationCalls = calls.filter((call) =>
    new URL(call.url).pathname.endsWith("/operations"),
  );
  assert.equal(operationCalls.length, 2);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
});

test("non-advancing cursor on a full page remains fail closed", async () => {
  const firstFullPage = Array.from({ length: 1000 }, (_, index) =>
    operation("finished", {
      id: `operation-first-${index}`,
      branch_id: "br-unrelated-12345678",
    }),
  );
  const secondFullPage = Array.from({ length: 1000 }, (_, index) =>
    operation("finished", {
      id: `operation-second-${index}`,
      branch_id: "br-unrelated-12345678",
    }),
  );
  const { fetchImpl, calls } = makeExistingRestoreFetch([
    {
      operations: firstFullPage,
      pagination: { cursor: "next-page-token" },
    },
    {
      operations: secondFullPage,
      pagination: { cursor: "next-page-token" },
    },
  ]);

  await assert.rejects(
    ensureM4RestoreRehearsal({
      ...input,
      apply: false,
      fetchImpl,
    }),
    /non-advancing cursor on a full page/,
  );
  const operationCalls = calls.filter((call) =>
    new URL(call.url).pathname.endsWith("/operations"),
  );
  assert.equal(operationCalls.length, 2);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
});

test("full operation pages remain fail closed for invalid cursor metadata", async () => {
  const fullPage = Array.from({ length: 1000 }, (_, index) =>
    operation("finished", {
      id: `operation-unrelated-${index}`,
      branch_id: "br-unrelated-12345678",
    }),
  );
  const { fetchImpl } = makeExistingRestoreFetch([
    {
      operations: fullPage,
      pagination: { cursor: 42 },
    },
  ]);

  await assert.rejects(
    ensureM4RestoreRehearsal({
      ...input,
      apply: false,
      fetchImpl,
    }),
    /non-string cursor on a full page/,
  );
});

test("missing exact operation evidence stays fail closed", async () => {
  const { fetchImpl } = makeExistingRestoreFetch([
    { operations: [], pagination: {} },
  ]);
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.restoreOperationsState, "unknown");
  assert.equal(result.verificationReady, false);
});
