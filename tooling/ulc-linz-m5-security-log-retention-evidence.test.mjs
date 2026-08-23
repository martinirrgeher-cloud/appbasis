import assert from "node:assert/strict";
import test from "node:test";

import {
  readUlcLinzM5SecurityLogRetentionRunEvidence,
  ULC_LINZ_M5_F_RETENTION_RUN_POLICY,
} from "./ulc-linz-m5-security-log-retention-evidence.mjs";
import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";

const MAIN_SHA = "a".repeat(40);
const NOW = Date.parse("2026-08-23T16:00:00.000Z");
const UPDATED_AT = "2026-08-23T15:55:00.000Z";

function run(overrides = {}) {
  return {
    id: 123,
    run_attempt: 1,
    name: ULC_LINZ_M5_F_RETENTION_RUN_POLICY.workflowName,
    path: ULC_LINZ_M5_F_RETENTION_RUN_POLICY.workflowPath,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: MAIN_SHA,
    status: "completed",
    conclusion: "success",
    created_at: "2026-08-23T15:54:00.000Z",
    updated_at: UPDATED_AT,
    repository: { full_name: "martinirrgeher-cloud/appbasis" },
    ...overrides,
  };
}

function githubFetch(latestRun = run(), mainSha = MAIN_SHA) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/commits/main")) {
      return jsonResponse({ sha: mainSha });
    }
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/actions/workflows/m5-ulc-security-log-retention.yml/runs")) {
      return jsonResponse({ total_count: 1, workflow_runs: [latestRun] });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls };
}

function options(fetchImpl, now = () => NOW) {
  return { expectedHeadSha: MAIN_SHA, fetchImpl, now };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("reads only a fresh successful retention run on the exact expected current main head", async () => {
  const { fetchImpl, calls } = githubFetch();
  const evidence = await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl));

  assert.deepEqual(evidence, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "github-actions-controlled-production-retention-run",
    cleanupExecutionBound: true,
    cleanupLastSucceededAt: UPDATED_AT,
    cleanupResultVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    boundaryEventPreserved: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  });
  assert.equal(calls.length, 2);
  const runsUrl = new URL(calls[1].url);
  assert.equal(runsUrl.searchParams.get("branch"), "main");
  assert.equal(runsUrl.searchParams.get("event"), "workflow_dispatch");
  assert.equal(runsUrl.searchParams.get("per_page"), "1");
});

test("fails closed when the local expected head and remote current main differ", async () => {
  const { fetchImpl, calls } = githubFetch(run(), "b".repeat(40));
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
    {},
  );
  assert.equal(calls.length, 1);
});

test("fails closed on run-head drift, stale evidence, reruns, failures or workflow identity drift", async () => {
  const cases = [
    { latestRun: run({ head_sha: "b".repeat(40) }) },
    { latestRun: run({ updated_at: "2026-08-22T15:59:59.999Z" }) },
    { latestRun: run({ run_attempt: 2 }) },
    { latestRun: run({ conclusion: "failure" }) },
    { latestRun: run({ status: "in_progress", conclusion: null }) },
    { latestRun: run({ name: "Other workflow" }) },
    { latestRun: run({ path: ".github/workflows/other.yml" }) },
    { latestRun: run({ event: "push" }) },
    { latestRun: run({ head_branch: "feature" }) },
    { latestRun: run({ repository: { full_name: "other/repo" } }) },
  ];

  for (const value of cases) {
    const { fetchImpl } = githubFetch(value.latestRun);
    assert.deepEqual(
      await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
      {},
    );
  }
});

test("uses only the newest run and never falls back to an older success", async () => {
  const calls = [];
  const fetchImpl = async (url, requestOptions) => {
    calls.push({ url: String(url), options: requestOptions });
    if (String(url).endsWith("/commits/main")) return jsonResponse({ sha: MAIN_SHA });
    return jsonResponse({
      total_count: 2,
      workflow_runs: [run({ id: 999, conclusion: "failure" })],
    });
  };

  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
    {},
  );
  assert.equal(calls.length, 2);
});

test("fails closed before any GitHub request for missing or malformed expected head", async () => {
  for (const expectedHeadSha of [undefined, "", "not-a-sha", "A".repeat(40)]) {
    let calls = 0;
    const { fetchImpl } = githubFetch();
    const countingFetch = async (...args) => {
      calls += 1;
      return fetchImpl(...args);
    };
    assert.deepEqual(
      await readUlcLinzM5SecurityLogRetentionRunEvidence({ expectedHeadSha, fetchImpl: countingFetch, now: () => NOW }),
      {},
    );
    assert.equal(calls, 0);
  }
});

test("fails closed before the run lookup for invalid current main evidence", async () => {
  for (const mainPayload of [{}, { sha: "not-a-sha" }, null]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse(mainPayload);
    };
    assert.deepEqual(
      await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
      {},
    );
    assert.equal(calls, 1);
  }
});

test("fails closed on unavailable, non-json or malformed GitHub evidence and invalid clocks", async () => {
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(async () => new Response("down", { status: 503 }))),
    {},
  );
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } }))),
    {},
  );
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(async () => { throw new Error("network"); })),
    {},
  );
  const { fetchImpl } = githubFetch();
  assert.deepEqual(await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl, () => Number.NaN)), {});
  assert.deepEqual(await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl, () => { throw new Error("clock"); })), {});
});
