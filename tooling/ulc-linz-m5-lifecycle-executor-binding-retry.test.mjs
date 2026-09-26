import assert from "node:assert/strict";
import test from "node:test";

import { verifyUlcLinzM5LifecycleExecutorBinding } from "./ulc-linz-m5-lifecycle-executor-binding.mjs";

const HEAD = "a".repeat(40);
const PARENT = "b".repeat(40);
const UPDATED_AT = "2026-09-14T16:29:15.000Z";
const NOW = Date.parse("2026-09-14T16:35:00.000Z");

function successfulLifecycleRun({ head = HEAD, name = "M5 ULC Protected Lifecycle Operations" } = {}) {
  return {
    total_count: 1,
    workflow_runs: [
      {
        id: 123,
        run_attempt: 1,
        name,
        path: ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: head,
        status: "completed",
        conclusion: "success",
        created_at: "2026-09-14T16:27:47.000Z",
        updated_at: UPDATED_AT,
        repository: { full_name: "martinirrgeher-cloud/appbasis" },
      },
    ],
  };
}

function currentCommit({ head = HEAD, parent = null, files = [] } = {}) {
  return {
    sha: head,
    parents: parent === null ? [] : [{ sha: parent }],
    files: files.map((filename) => ({ filename })),
  };
}

test("authenticates GitHub evidence reads when the workflow token is available", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-github-token";
  const authorizationHeaders = [];

  try {
    const fetchImpl = async (input, init = {}) => {
      authorizationHeaders.push(init.headers?.authorization ?? null);
      const url = String(input);
      if (url.endsWith("/commits/main")) return Response.json({ sha: HEAD });
      if (url.endsWith(`/commits/${HEAD}`)) return Response.json(currentCommit());
      if (url.includes("/actions/workflows/m5-ulc-protected-lifecycle-operations.yml/runs")) {
        return Response.json(successfulLifecycleRun());
      }
      throw new Error(`Unexpected GitHub evidence URL: ${url}`);
    };

    const result = await verifyUlcLinzM5LifecycleExecutorBinding(process.cwd(), {
      fetchImpl,
      now: () => NOW,
      sleep: async () => {},
    });

    assert.equal(result.verifiedHeadSha, HEAD);
    assert.ok(authorizationHeaders.length >= 3);
    assert.deepEqual(new Set(authorizationHeaders), new Set(["Bearer test-github-token"]));
  } finally {
    if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = previousToken;
  }
});

test("retries transient GitHub main-head evidence failures without weakening exact-head binding", async () => {
  let mainHeadCalls = 0;
  let lifecycleCalls = 0;
  const delays = [];

  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/repos/martinirrgeher-cloud/appbasis/commits/main")) {
      mainHeadCalls += 1;
      if (mainHeadCalls === 1) return new Response(null, { status: 503 });
      if (mainHeadCalls === 2) throw new Error("transient network failure");
      return Response.json({ sha: HEAD });
    }
    if (url.endsWith(`/repos/martinirrgeher-cloud/appbasis/commits/${HEAD}`)) {
      return Response.json(currentCommit());
    }
    if (url.includes("/actions/workflows/m5-ulc-protected-lifecycle-operations.yml/runs")) {
      lifecycleCalls += 1;
      return Response.json(successfulLifecycleRun());
    }
    throw new Error(`Unexpected GitHub evidence URL: ${url}`);
  };

  const result = await verifyUlcLinzM5LifecycleExecutorBinding(process.cwd(), {
    fetchImpl,
    now: () => NOW,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });

  assert.equal(mainHeadCalls, 3);
  assert.equal(lifecycleCalls, 1);
  assert.deepEqual(delays, [250, 500]);
  assert.equal(result.verifiedHeadSha, HEAD);
  assert.equal(result.verifiedAt, UPDATED_AT);
  assert.equal(result.deletionExecutorBound, true);
  assert.equal(result.retentionExecutorBound, true);
});

test("accepts the exact M6-correlated lifecycle preflight run name", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/commits/main")) return Response.json({ sha: HEAD });
    if (url.endsWith(`/commits/${HEAD}`)) return Response.json(currentCommit());
    if (url.includes("/actions/workflows/m5-ulc-protected-lifecycle-operations.yml/runs")) {
      return Response.json(successfulLifecycleRun({
        name: "m6-chain-34873471771-1-lifecycle_preflight",
      }));
    }
    throw new Error(`Unexpected GitHub evidence URL: ${url}`);
  };

  const result = await verifyUlcLinzM5LifecycleExecutorBinding(process.cwd(), {
    fetchImpl,
    now: () => NOW,
    sleep: async () => {},
  });

  assert.equal(result.verifiedHeadSha, HEAD);
  assert.equal(result.verifiedAt, UPDATED_AT);
});

test("bridges one direct parent lifecycle checkpoint only across evidence-verifier-only changes", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/commits/main")) return Response.json({ sha: HEAD });
    if (url.endsWith(`/commits/${HEAD}`)) {
      return Response.json(currentCommit({
        parent: PARENT,
        files: [
          "tooling/ulc-linz-m5-lifecycle-executor-binding.mjs",
          "tooling/ulc-linz-m5-lifecycle-executor-binding-retry.test.mjs",
        ],
      }));
    }
    if (url.includes("/actions/workflows/m5-ulc-protected-lifecycle-operations.yml/runs")) {
      return Response.json(successfulLifecycleRun({
        head: PARENT,
        name: "m6-chain-34873471771-1-lifecycle_preflight",
      }));
    }
    throw new Error(`Unexpected GitHub evidence URL: ${url}`);
  };

  const result = await verifyUlcLinzM5LifecycleExecutorBinding(process.cwd(), {
    fetchImpl,
    now: () => NOW,
    sleep: async () => {},
  });

  assert.equal(result.verifiedHeadSha, HEAD);
  assert.equal(result.verifiedAt, UPDATED_AT);
});

test("refuses parent checkpoint reuse when the current commit changes any runtime or workflow file", async () => {
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith("/commits/main")) return Response.json({ sha: HEAD });
    if (url.endsWith(`/commits/${HEAD}`)) {
      return Response.json(currentCommit({
        parent: PARENT,
        files: ["apps/ulc-linz/worker/index.ts"],
      }));
    }
    if (url.includes("/actions/workflows/m5-ulc-protected-lifecycle-operations.yml/runs")) {
      return Response.json(successfulLifecycleRun({
        head: PARENT,
        name: "m6-chain-34873471771-1-lifecycle_preflight",
      }));
    }
    throw new Error(`Unexpected GitHub evidence URL: ${url}`);
  };

  await assert.rejects(
    () =>
      verifyUlcLinzM5LifecycleExecutorBinding(process.cwd(), {
        fetchImpl,
        now: () => NOW,
        sleep: async () => {},
      }),
    /live binding preflight is not verified/,
  );
});

test("still fails closed after the bounded GitHub evidence retry budget is exhausted", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response(null, { status: 503 });
  };

  await assert.rejects(
    () =>
      verifyUlcLinzM5LifecycleExecutorBinding(process.cwd(), {
        fetchImpl,
        now: () => NOW,
        sleep: async () => {},
      }),
    /current main head is unavailable/,
  );
  assert.equal(calls, 3);
});
