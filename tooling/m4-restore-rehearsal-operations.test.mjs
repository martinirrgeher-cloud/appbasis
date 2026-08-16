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

function restoredBranch(overrides = {}) {
  return {
    id: "br-restored-sun-12345678",
    project_id: input.projectId,
    name: input.restoreBranchName,
    current_state: "ready",
    restored_from: input.snapshotId,
    ...overrides,
  };
}

function makeFetch({ operations, existing = null, restored = restoredBranch() }) {
  const calls = [];
  let branchReads = 0;
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
      branchReads += 1;
      if (branchReads === 1 && existing !== null) {
        return jsonResponse({ branches: [existing] });
      }
      return jsonResponse({ branches: branchReads === 1 ? [] : [restored] });
    }
    if (
      parsed.pathname.endsWith(`/snapshots/${input.snapshotId}/restore`) &&
      options.method === "POST"
    ) {
      return jsonResponse({ branch: restored, operations });
    }
    return jsonResponse({}, 404);
  };
  return { fetchImpl, calls };
}

test("restore verification is ready only after all returned operations succeeded", async () => {
  const { fetchImpl } = makeFetch({
    operations: [
      { id: "op-restore-1", status: "finished" },
      { id: "op-restore-2", status: "skipped" },
    ],
  });

  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.restoreBranchState, "ready");
  assert.equal(result.restoreOperationsState, "complete");
  assert.equal(result.verificationReady, true);
  assert.equal(result.finalizeRestore, false);
});

test("running, scheduling, failed, cancelling or cancelled operations never unlock verification", async () => {
  for (const status of ["running", "scheduling", "failed", "cancelling", "cancelled"]) {
    const { fetchImpl, calls } = makeFetch({
      operations: [{ id: `op-${status}`, status }],
    });

    const result = await ensureM4RestoreRehearsal({
      ...input,
      apply: true,
      fetchImpl,
    });

    assert.equal(result.restoreOperationsState, "pending");
    assert.equal(result.verificationReady, false);
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
  }
});

test("missing or malformed operation evidence remains fail closed", async () => {
  for (const operations of [undefined, [{ id: "op-without-status" }]]) {
    const { fetchImpl } = makeFetch({ operations });
    const result = await ensureM4RestoreRehearsal({
      ...input,
      apply: true,
      fetchImpl,
    });

    assert.equal(result.restoreOperationsState, "unknown");
    assert.equal(result.verificationReady, false);
  }
});

test("a ready branch is still pending for verification when restore operations are not complete", async () => {
  const { fetchImpl } = makeFetch({
    operations: [{ id: "op-restore-1", status: "running" }],
  });
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.status, "restore-preview-ready");
  assert.equal(result.restoreBranchState, "ready");
  assert.equal(result.restoreOperationsState, "pending");
  assert.equal(result.verificationReady, false);
});

test("reused existing restore branch never invents operation completion evidence", async () => {
  const existing = restoredBranch();
  const { fetchImpl, calls } = makeFetch({ operations: [], existing });
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.writeOutcome, "not-needed");
  assert.equal(result.restoreBranchState, "ready");
  assert.equal(result.restoreOperationsState, "unknown");
  assert.equal(result.verificationReady, false);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
});
