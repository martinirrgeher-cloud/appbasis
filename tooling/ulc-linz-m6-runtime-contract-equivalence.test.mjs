import assert from "node:assert/strict";
import test from "node:test";

import { verifyUlcLinzProductionRuntimeEquivalence } from "./ulc-linz-m6-runtime-contract-equivalence.mjs";

const DEPLOYED = "a".repeat(40);
const CURRENT = "b".repeat(40);
const COMMIT = "c".repeat(40);

function comparison(overrides = {}) {
  return {
    status: "ahead",
    ahead_by: 1,
    behind_by: 0,
    total_commits: 1,
    base_commit: { sha: DEPLOYED },
    merge_base_commit: { sha: DEPLOYED },
    head_commit: { sha: CURRENT },
    commits: [{ sha: COMMIT }],
    files: [{ filename: "tooling/example-evidence-only.mjs", status: "modified" }],
    ...overrides,
  };
}

test("accepts an exact-head deployment without a GitHub comparison", async () => {
  let calls = 0;
  const result = await verifyUlcLinzProductionRuntimeEquivalence(process.cwd(), {
    deployedGithubSha: CURRENT,
    currentGithubSha: CURRENT,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not fetch");
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.equivalent, true);
  assert.equal(result.mode, "exact-head");
  assert.match(result.runtimeContractDigest, /^sha256:[0-9a-f]{64}$/);
});

test("accepts an ancestor deployment when the aggregate diff leaves the runtime contract unchanged", async () => {
  const headers = [];
  const result = await verifyUlcLinzProductionRuntimeEquivalence(process.cwd(), {
    deployedGithubSha: DEPLOYED,
    currentGithubSha: CURRENT,
    token: "read-only-token",
    fetchImpl: async (_input, init = {}) => {
      headers.push(init.headers?.authorization ?? null);
      return Response.json(comparison());
    },
    sleep: async () => {},
  });

  assert.equal(result.equivalent, true);
  assert.equal(result.mode, "runtime-contract-unchanged");
  assert.deepEqual(headers, ["Bearer read-only-token"]);
});

test("fails closed when any current runtime-contract input changed", async () => {
  for (const filename of [
    "pnpm-lock.yaml",
    "apps/ulc-linz/worker/index.ts",
    "apps/ulc-linz/privacy/m5-data-inventory.json",
    "modules/countdown/src/countdown.ts",
    "packages/identity/src/http.ts",
  ]) {
    await assert.rejects(
      () =>
        verifyUlcLinzProductionRuntimeEquivalence(process.cwd(), {
          deployedGithubSha: DEPLOYED,
          currentGithubSha: CURRENT,
          fetchImpl: async () =>
            Response.json(comparison({ files: [{ filename, status: "modified" }] })),
          sleep: async () => {},
        }),
      /runtime contract changed/,
      filename,
    );
  }
});

test("fails closed on a rename into or out of the runtime contract", async () => {
  await assert.rejects(
    () =>
      verifyUlcLinzProductionRuntimeEquivalence(process.cwd(), {
        deployedGithubSha: DEPLOYED,
        currentGithubSha: CURRENT,
        fetchImpl: async () =>
          Response.json(
            comparison({
              files: [{
                filename: "tooling/non-runtime.mjs",
                previous_filename: "apps/ulc-linz/worker/index.ts",
                status: "renamed",
              }],
            }),
          ),
        sleep: async () => {},
      }),
    /runtime contract changed/,
  );
});

test("fails closed when deployed SHA is not the exact ancestor or compare evidence is incomplete", async () => {
  for (const value of [
    comparison({ status: "diverged" }),
    comparison({ merge_base_commit: { sha: "d".repeat(40) } }),
    comparison({ behind_by: 1 }),
    comparison({ total_commits: 2 }),
    comparison({ commits: [] }),
    comparison({ files: [] }),
    comparison({ files: Array.from({ length: 300 }, (_, index) => ({ filename: `tooling/evidence-${index}.mjs` })) }),
  ]) {
    await assert.rejects(
      () =>
        verifyUlcLinzProductionRuntimeEquivalence(process.cwd(), {
          deployedGithubSha: DEPLOYED,
          currentGithubSha: CURRENT,
          fetchImpl: async () => Response.json(value),
          sleep: async () => {},
        }),
      /cannot be proven equivalent/,
    );
  }
});

test("retries transient GitHub comparison failures and then succeeds", async () => {
  let calls = 0;
  const delays = [];
  const result = await verifyUlcLinzProductionRuntimeEquivalence(process.cwd(), {
    deployedGithubSha: DEPLOYED,
    currentGithubSha: CURRENT,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response(null, { status: 503 });
      if (calls === 2) throw new Error("transient");
      return Response.json(comparison());
    },
    sleep: async (milliseconds) => delays.push(milliseconds),
  });

  assert.equal(result.equivalent, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [250, 500]);
});
