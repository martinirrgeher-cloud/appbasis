import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveM3PreviewAcceptanceEvidence,
  M3_PREVIEW_ACCEPTANCE_RUN,
  verifyAcceptanceRun,
} from "./m3-preview-acceptance-evidence.mjs";

const definition = Object.freeze({
  schemaVersion: 2,
  appId: "m3-preview",
  displayName: "AppBasis M3 Preview",
  modules: Object.freeze(["tasks"]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

function successfulRun(overrides = {}) {
  return {
    id: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunId,
    run_attempt: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunAttempt,
    name: M3_PREVIEW_ACCEPTANCE_RUN.workflowName,
    path: M3_PREVIEW_ACCEPTANCE_RUN.workflowPath,
    event: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunEvent,
    head_branch: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunBranch,
    head_sha: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunHeadSha,
    status: "completed",
    conclusion: "success",
    repository: { full_name: M3_PREVIEW_ACCEPTANCE_RUN.repository },
    ...overrides,
  };
}

function jsonResponse(body, { status = 200, contentType = "application/json; charset=utf-8" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? contentType : null;
      },
    },
    async json() {
      return body;
    },
  };
}

function successfulGitHubFetch(run = successfulRun()) {
  return async (url, options) => {
    assert.equal(
      url,
      `https://api.github.com/repos/${M3_PREVIEW_ACCEPTANCE_RUN.repository}/actions/runs/${M3_PREVIEW_ACCEPTANCE_RUN.workflowRunId}`,
    );
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.accept, "application/vnd.github+json");
    assert.equal(options.headers["x-github-api-version"], "2022-11-28");
    return jsonResponse(run);
  };
}

test("M3 preview evidence verifies the exact accepted generated app from GitHub", async () => {
  assert.deepEqual(
    await deriveM3PreviewAcceptanceEvidence(definition, {
      fetchImpl: successfulGitHubFetch(),
    }),
    { previewAccepted: true },
  );
});

test("M3 preview evidence does not query GitHub for a different app or drifted definition", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return jsonResponse(successfulRun());
  };

  assert.deepEqual(
    await deriveM3PreviewAcceptanceEvidence({ ...definition, appId: "reference" }, { fetchImpl }),
    {},
  );
  assert.deepEqual(
    await deriveM3PreviewAcceptanceEvidence({ ...definition, displayName: "Changed Preview" }, { fetchImpl }),
    {},
  );
  assert.deepEqual(
    await deriveM3PreviewAcceptanceEvidence({ ...definition, modules: ["tasks", "future-module"] }, { fetchImpl }),
    {},
  );
  assert.deepEqual(
    await deriveM3PreviewAcceptanceEvidence({ ...definition, platformServices: ["identity"] }, { fetchImpl }),
    {},
  );
  assert.deepEqual(
    await deriveM3PreviewAcceptanceEvidence({ ...definition, futureSchemaField: true }, { fetchImpl }),
    {},
  );
  assert.equal(calls, 0);
});

test("M3 preview evidence fails closed when GitHub run identity or outcome differs", async () => {
  for (const run of [
    successfulRun({ conclusion: "failure" }),
    successfulRun({ status: "in_progress", conclusion: null }),
    successfulRun({ id: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunId + 1 }),
    successfulRun({ run_attempt: M3_PREVIEW_ACCEPTANCE_RUN.workflowRunAttempt + 1 }),
    successfulRun({ event: "push" }),
    successfulRun({ head_branch: "feature/test" }),
    successfulRun({ head_sha: "0".repeat(40) }),
    successfulRun({ name: "Different Workflow" }),
    successfulRun({ path: ".github/workflows/other.yml" }),
    successfulRun({ repository: { full_name: "other/repository" } }),
  ]) {
    assert.equal(await verifyAcceptanceRun(successfulGitHubFetch(run)), false);
    assert.deepEqual(
      await deriveM3PreviewAcceptanceEvidence(definition, {
        fetchImpl: successfulGitHubFetch(run),
      }),
      {},
    );
  }
});

test("M3 preview evidence fails closed when GitHub evidence is unavailable or malformed", async () => {
  const unavailable = async () => jsonResponse({}, { status: 503 });
  const wrongContentType = async () =>
    jsonResponse(successfulRun(), { contentType: "text/html" });
  const invalidJson = async () => ({
    ok: true,
    headers: { get: () => "application/json" },
    async json() {
      throw new Error("invalid JSON");
    },
  });
  const networkFailure = async () => {
    throw new Error("network unavailable");
  };

  for (const fetchImpl of [unavailable, wrongContentType, invalidJson, networkFailure]) {
    assert.equal(await verifyAcceptanceRun(fetchImpl), false);
    assert.deepEqual(
      await deriveM3PreviewAcceptanceEvidence(definition, { fetchImpl }),
      {},
    );
  }

  assert.equal(await verifyAcceptanceRun(null), false);
});
