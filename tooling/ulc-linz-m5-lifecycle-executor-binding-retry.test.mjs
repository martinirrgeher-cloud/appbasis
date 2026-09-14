import assert from "node:assert/strict";
import test from "node:test";

import { verifyUlcLinzM5LifecycleExecutorBinding } from "./ulc-linz-m5-lifecycle-executor-binding.mjs";

const HEAD = "a".repeat(40);
const UPDATED_AT = "2026-09-14T16:29:15.000Z";
const NOW = Date.parse("2026-09-14T16:35:00.000Z");

function successfulLifecycleRun() {
  return {
    total_count: 1,
    workflow_runs: [
      {
        id: 123,
        run_attempt: 1,
        name: "M5 ULC Protected Lifecycle Operations",
        path: ".github/workflows/m5-ulc-protected-lifecycle-operations.yml",
        event: "workflow_dispatch",
        head_branch: "main",
        head_sha: HEAD,
        status: "completed",
        conclusion: "success",
        created_at: "2026-09-14T16:27:47.000Z",
        updated_at: UPDATED_AT,
        repository: { full_name: "martinirrgeher-cloud/appbasis" },
      },
    ],
  };
}

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
