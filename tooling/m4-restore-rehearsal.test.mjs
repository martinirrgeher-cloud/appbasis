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

function sourceBranch(overrides = {}) {
  return {
    id: input.sourceBranchId,
    project_id: input.projectId,
    name: "main",
    current_state: "ready",
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    id: input.snapshotId,
    name: "appbasis-pre-migration-m4-test",
    source_branch_id: input.sourceBranchId,
    created_at: "2026-08-16T07:00:00Z",
    ...overrides,
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

function makeFetch({
  sourcePayload = sourceBranch(),
  snapshots = [snapshot()],
  branchReads = [[]],
  postStatus = 200,
  postThrows = false,
  postPayload = { branch: restoredBranch(), operations: [] },
} = {}) {
  const calls = [];
  let branchReadIndex = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (
      parsed.pathname.endsWith(
        `/projects/${input.projectId}/branches/${input.sourceBranchId}`,
      )
    ) {
      return jsonResponse({ branch: sourcePayload });
    }
    if (
      parsed.pathname.endsWith(`/projects/${input.projectId}/snapshots`) &&
      options.method === "GET"
    ) {
      return jsonResponse({ snapshots });
    }
    if (
      parsed.pathname.endsWith(`/projects/${input.projectId}/branches`) &&
      options.method === "GET"
    ) {
      const branches =
        branchReads[Math.min(branchReadIndex, branchReads.length - 1)];
      branchReadIndex += 1;
      return jsonResponse({ branches });
    }
    if (
      parsed.pathname.endsWith(
        `/projects/${input.projectId}/snapshots/${input.snapshotId}/restore`,
      ) &&
      options.method === "POST"
    ) {
      if (postThrows) throw new Error("provider timeout sentinel");
      return jsonResponse(postPayload, postStatus);
    }
    return jsonResponse({ message: "unexpected" }, 404);
  };
  return { fetchImpl, calls };
}

test("preflight is fully read-only and reports the required isolated restore", async () => {
  const { fetchImpl, calls } = makeFetch();
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: false,
    fetchImpl,
  });

  assert.deepEqual(result, {
    status: "restore-required",
    writeOutcome: "not-requested",
    snapshotId: input.snapshotId,
    sourceBranchId: input.sourceBranchId,
    restoreBranchName: input.restoreBranchName,
    finalizeRestore: false,
  });
  assert.deepEqual(calls.map((call) => call.options.method), ["GET", "GET", "GET"]);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  const branchListUrl = new URL(calls[2].url);
  assert.equal(branchListUrl.searchParams.get("search"), input.restoreBranchName);
  assert.equal(branchListUrl.searchParams.get("limit"), "10000");
});

test("an exact existing preview restore is reused without a second POST", async () => {
  for (const currentState of ["ready", "init"]) {
    const existing = restoredBranch({ current_state: currentState });
    const { fetchImpl, calls } = makeFetch({ branchReads: [[existing]] });
    const result = await ensureM4RestoreRehearsal({
      ...input,
      apply: true,
      fetchImpl,
    });

    assert.equal(
      result.status,
      currentState === "ready" ? "restore-preview-ready" : "restore-preview-pending",
    );
    assert.equal(result.writeOutcome, "not-needed");
    assert.equal(result.restoreBranchId, existing.id);
    assert.equal(result.finalizeRestore, false);
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  }
});

test("same-name branch is refused unless it proves the exact snapshot restore relationship", async () => {
  for (const existing of [
    restoredBranch({ restored_from: "snap-other-12345678" }),
    restoredBranch({ project_id: "other-project-12345678" }),
    restoredBranch({ id: input.sourceBranchId }),
  ]) {
    const { fetchImpl, calls } = makeFetch({ branchReads: [[existing]] });
    await assert.rejects(
      ensureM4RestoreRehearsal({ ...input, apply: true, fetchImpl }),
      /does not match the M4 restore rehearsal contract/,
    );
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  }
});

test("ambiguous exact restore branch names fail closed before any write", async () => {
  const { fetchImpl, calls } = makeFetch({
    branchReads: [[restoredBranch(), restoredBranch({ id: "br-second-12345678" })]],
  });
  await assert.rejects(
    ensureM4RestoreRehearsal({ ...input, apply: true, fetchImpl }),
    /restore branch state is ambiguous/,
  );
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
});

test("apply sends exactly one non-finalizing restore POST and requires authoritative readback", async () => {
  const created = restoredBranch();
  const { fetchImpl, calls } = makeFetch({
    branchReads: [[], [created]],
    postPayload: { branch: created, operations: [{ id: "op-restore-1" }] },
  });
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.status, "restore-preview-ready");
  assert.equal(result.writeOutcome, "confirmed");
  assert.equal(result.restoreBranchId, created.id);
  assert.equal(result.finalizeRestore, false);
  assert.deepEqual(calls.map((call) => call.options.method), [
    "GET",
    "GET",
    "GET",
    "POST",
    "GET",
  ]);
  const posts = calls.filter((call) => call.options.method === "POST");
  assert.equal(posts.length, 1);
  assert.match(posts[0].url, new RegExp(`/snapshots/${input.snapshotId}/restore$`));
  assert.equal(posts[0].options.headers.authorization, `Bearer ${input.apiKey}`);
  assert.equal(posts[0].options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(posts[0].options.body), {
    name: input.restoreBranchName,
    target_branch_id: input.sourceBranchId,
    finalize_restore: false,
  });
  assert.doesNotMatch(posts[0].url, /finalize_restore/);
});

test("an asynchronous restored branch is reported pending without finalization", async () => {
  const created = restoredBranch({ current_state: "init" });
  const { fetchImpl, calls } = makeFetch({
    branchReads: [[], [created]],
    postPayload: { branch: created, operations: [{ id: "op-restore-1" }] },
  });
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl,
  });

  assert.equal(result.status, "restore-preview-pending");
  assert.equal(result.restoreBranchState, "init");
  assert.equal(result.finalizeRestore, false);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("timeout or invalid create response reconciles once and never blindly repeats POST", async () => {
  const restored = restoredBranch();
  const timedOut = makeFetch({
    branchReads: [[], [restored]],
    postThrows: true,
  });
  const timeoutResult = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl: timedOut.fetchImpl,
  });
  assert.equal(timeoutResult.writeOutcome, "reconciled");
  assert.equal(timedOut.calls.filter((call) => call.options.method === "POST").length, 1);

  const calls = [];
  let branchRead = 0;
  const invalidResponseFetch = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    if (parsed.pathname.endsWith(`/branches/${input.sourceBranchId}`)) {
      return jsonResponse({ branch: sourceBranch() });
    }
    if (parsed.pathname.endsWith(`/snapshots`) && options.method === "GET") {
      return jsonResponse({ snapshots: [snapshot()] });
    }
    if (parsed.pathname.endsWith(`/branches`) && options.method === "GET") {
      branchRead += 1;
      return jsonResponse({ branches: branchRead === 1 ? [] : [restored] });
    }
    if (options.method === "POST") return { ok: true };
    return jsonResponse({}, 404);
  };
  const invalidResult = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl: invalidResponseFetch,
  });
  assert.equal(invalidResult.writeOutcome, "reconciled");
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("unknown write outcome without exact readback fails closed", async () => {
  const { fetchImpl, calls } = makeFetch({
    branchReads: [[], []],
    postThrows: true,
  });
  await assert.rejects(
    ensureM4RestoreRehearsal({ ...input, apply: true, fetchImpl }),
    /outcome is unknown; do not retry blindly/,
  );
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
});

test("provider rejection is sanitized and is accepted only after exact readback", async () => {
  const rejected = makeFetch({ branchReads: [[], []], postStatus: 403 });
  await assert.rejects(
    ensureM4RestoreRehearsal({
      ...input,
      apply: true,
      fetchImpl: rejected.fetchImpl,
    }),
    /create outcome is unconfirmed \(status 403\); do not retry blindly/,
  );
  assert.equal(rejected.calls.filter((call) => call.options.method === "POST").length, 1);

  const restored = restoredBranch();
  const reconciled = makeFetch({
    branchReads: [[], [restored]],
    postStatus: 503,
  });
  const result = await ensureM4RestoreRehearsal({
    ...input,
    apply: true,
    fetchImpl: reconciled.fetchImpl,
  });
  assert.equal(result.writeOutcome, "reconciled");
  assert.equal(reconciled.calls.filter((call) => call.options.method === "POST").length, 1);
});

test("successful POST with mismatched or missing authoritative readback never triggers another restore", async () => {
  const created = restoredBranch();
  const missing = makeFetch({
    branchReads: [[], []],
    postPayload: { branch: created, operations: [] },
  });
  await assert.rejects(
    ensureM4RestoreRehearsal({ ...input, apply: true, fetchImpl: missing.fetchImpl }),
    /authoritative readback is not yet exact; do not create another restore branch/,
  );
  assert.equal(missing.calls.filter((call) => call.options.method === "POST").length, 1);

  const other = restoredBranch({ id: "br-other-restored-12345678" });
  const mismatch = makeFetch({
    branchReads: [[], [other]],
    postPayload: { branch: created, operations: [] },
  });
  await assert.rejects(
    ensureM4RestoreRehearsal({ ...input, apply: true, fetchImpl: mismatch.fetchImpl }),
    /authoritative readback is not yet exact; do not create another restore branch/,
  );
  assert.equal(mismatch.calls.filter((call) => call.options.method === "POST").length, 1);
});

test("requires one snapshot from the exact configured ready root source branch", async () => {
  for (const snapshots of [
    [],
    [snapshot({ source_branch_id: "br-other-12345678" })],
    [snapshot(), snapshot()],
  ]) {
    const { fetchImpl, calls } = makeFetch({ snapshots });
    await assert.rejects(
      ensureM4RestoreRehearsal({ ...input, apply: true, fetchImpl }),
      /restore snapshot (?:is missing or ambiguous|does not match)/,
    );
    assert.equal(calls.filter((call) => call.options.method === "POST").length, 0);
  }

  await assert.rejects(
    ensureM4RestoreRehearsal({
      ...input,
      apply: false,
      fetchImpl: makeFetch({
        sourcePayload: sourceBranch({ parent_id: "br-parent-12345678" }),
      }).fetchImpl,
    }),
    /requires the configured root source branch/,
  );
  await assert.rejects(
    ensureM4RestoreRehearsal({
      ...input,
      apply: false,
      fetchImpl: makeFetch({
        sourcePayload: sourceBranch({ current_state: "init" }),
      }).fetchImpl,
    }),
    /missing, mismatched, or not ready/,
  );
});

test("validates all restore inputs before provider calls", async () => {
  const neverFetch = async () => {
    throw new Error("must not fetch");
  };
  const cases = [
    [{ projectId: "INVALID" }, /NEON_PROJECT_ID is invalid/],
    [{ sourceBranchId: "br ok" }, /NEON_BRANCH_ID is invalid/],
    [{ snapshotId: "snap ok" }, /RESTORE_SNAPSHOT_ID is invalid/],
    [{ restoreBranchName: "Restore Preview" }, /RESTORE_BRANCH_NAME is invalid/],
    [{ apiKey: " token " }, /NEON_API_KEY is invalid/],
    [{ apply: "1" }, /APPLY_RESTORE_REHEARSAL is invalid/],
  ];
  for (const [override, pattern] of cases) {
    await assert.rejects(
      ensureM4RestoreRehearsal({
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
    ensureM4RestoreRehearsal({ ...input, apply: false, fetchImpl }),
    (error) => {
      assert.match(error.message, /status 403/);
      assert.doesNotMatch(error.message, new RegExp(sentinel));
      assert.doesNotMatch(error.message, new RegExp(input.apiKey));
      return true;
    },
  );
});
