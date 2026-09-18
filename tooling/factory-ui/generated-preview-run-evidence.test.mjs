import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  deriveGeneratedPreviewRunEvidence,
  GENERATED_PREVIEW_OPERATIONS,
  generatedPreviewRunTitle,
  verifyGeneratedPreviewCurrentMainHead,
} from "./generated-preview-run-evidence.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HEAD = "a".repeat(40);

function run(operation, id, startedAt, completedAt, overrides = {}) {
  return {
    id,
    name: "Generated App Preview Lifecycle",
    path: ".github/workflows/generated-app-preview-lifecycle.yml",
    display_title: generatedPreviewRunTitle("checklist", operation),
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: HEAD,
    run_attempt: 1,
    status: "completed",
    conclusion: "success",
    run_started_at: startedAt,
    updated_at: completedAt,
    repository: { full_name: "martinirrgeher-cloud/appbasis" },
    ...overrides,
  };
}

function githubFetch(runs, { head = HEAD, totalCount = runs.length } = {}) {
  return async (url, options) => {
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);

    if (url.endsWith("/branches/main")) {
      return Response.json({ commit: { sha: head } });
    }
    if (url.includes("/actions/workflows/generated-app-preview-lifecycle.yml/runs")) {
      return Response.json({
        total_count: totalCount,
        workflow_runs: runs,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test("generic preview run evidence starts at Hyperdrive when the exact head has no successful runs", async () => {
  const evidence = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: githubFetch([]),
  });

  assert.equal(evidence.status, "available");
  assert.equal(evidence.exactHeadSha, HEAD);
  assert.deepEqual(evidence.completedOperations, []);
  assert.equal(evidence.nextOperation, "hyperdrive");
  assert.equal(evidence.previewVerified, false);
  assert.deepEqual(evidence.runs, []);
});

test("generic preview run evidence advances only through one ordered exact-head first-attempt chain", async () => {
  const evidence = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: githubFetch([
      run("deploy", 14, "2026-09-18T19:04:00Z", "2026-09-18T19:05:00Z"),
      run("migrate", 12, "2026-09-18T19:01:00Z", "2026-09-18T19:02:00Z"),
      run("hyperdrive", 11, "2026-09-18T19:00:00Z", "2026-09-18T19:01:00Z"),
      run("bootstrap", 13, "2026-09-18T19:02:00Z", "2026-09-18T19:03:00Z"),
    ]),
  });

  assert.equal(evidence.status, "available");
  assert.deepEqual(evidence.completedOperations, GENERATED_PREVIEW_OPERATIONS);
  assert.equal(evidence.nextOperation, null);
  assert.equal(evidence.previewVerified, true);
  assert.deepEqual(
    evidence.runs.map(({ operation, runId }) => ({ operation, runId })),
    [
      { operation: "hyperdrive", runId: 11 },
      { operation: "migrate", runId: 12 },
      { operation: "bootstrap", runId: 13 },
      { operation: "deploy", runId: 14 },
    ],
  );
  assert.equal(
    evidence.runs[3].runUrl,
    "https://github.com/martinirrgeher-cloud/appbasis/actions/runs/14",
  );
});

test("generic preview run evidence ignores wrong-head rerun spoofed and out-of-order runs fail-closed", async () => {
  const evidence = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: githubFetch([
      run("hyperdrive", 20, "2026-09-18T19:00:00Z", "2026-09-18T19:01:00Z"),
      run("migrate", 21, "2026-09-18T19:00:30Z", "2026-09-18T19:00:45Z"),
      run("migrate", 22, "2026-09-18T19:01:10Z", "2026-09-18T19:02:00Z", {
        run_attempt: 2,
      }),
      run("migrate", 23, "2026-09-18T19:01:10Z", "2026-09-18T19:02:00Z", {
        head_sha: "b".repeat(40),
      }),
      run("migrate", 24, "2026-09-18T19:01:10Z", "2026-09-18T19:02:00Z", {
        display_title: "Generated Preview · another-app · migrate",
      }),
      run("migrate", 25, "2026-09-18T19:01:10Z", "2026-09-18T19:02:00Z", {
        repository: { full_name: "other/repo" },
      }),
    ]),
  });

  assert.deepEqual(evidence.completedOperations, ["hyperdrive"]);
  assert.equal(evidence.nextOperation, "migrate");
  assert.equal(evidence.previewVerified, false);
});

test("generic preview run evidence invalidates downstream completion after a newer failed operation", async () => {
  const evidence = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: githubFetch([
      run("hyperdrive", 31, "2026-09-18T19:00:00Z", "2026-09-18T19:01:00Z"),
      run("migrate", 32, "2026-09-18T19:01:00Z", "2026-09-18T19:02:00Z"),
      run("bootstrap", 33, "2026-09-18T19:02:00Z", "2026-09-18T19:03:00Z"),
      run("deploy", 34, "2026-09-18T19:03:00Z", "2026-09-18T19:04:00Z"),
      run("deploy", 35, "2026-09-18T19:05:00Z", "2026-09-18T19:06:00Z", {
        conclusion: "failure",
      }),
    ]),
  });

  assert.deepEqual(evidence.completedOperations, [
    "hyperdrive",
    "migrate",
    "bootstrap",
  ]);
  assert.equal(evidence.nextOperation, "deploy");
  assert.equal(evidence.previewVerified, false);
  assert.deepEqual(
    evidence.runs.map(({ runId }) => runId),
    [31, 32, 33],
  );
});

test("generic preview run evidence fails closed when GitHub evidence is unavailable or pagination is incomplete", async () => {
  const unavailable = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: async () => Response.json({ message: "down" }, { status: 503 }),
  });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.nextOperation, null);

  const page = Array.from({ length: 100 }, (_, index) =>
    run(
      "hyperdrive",
      1000 + index,
      "2026-09-18T19:00:00Z",
      "2026-09-18T19:00:01Z",
    ),
  );
  const incomplete = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: async (url) => {
      if (url.endsWith("/branches/main")) {
        return Response.json({ commit: { sha: HEAD } });
      }
      return Response.json({
        total_count: 400,
        workflow_runs: page,
      });
    },
  });
  assert.equal(incomplete.status, "unavailable");
  assert.equal(incomplete.exactHeadSha, null);
});

test("generic preview run evidence fails closed if main moves during observation", async () => {
  let branchReads = 0;
  const evidence = await deriveGeneratedPreviewRunEvidence("checklist", {
    fetchImpl: async (url) => {
      if (url.endsWith("/branches/main")) {
        branchReads += 1;
        return Response.json({
          commit: { sha: branchReads === 1 ? HEAD : "b".repeat(40) },
        });
      }
      return Response.json({
        total_count: 0,
        workflow_runs: [],
      });
    },
  });

  assert.equal(evidence.status, "unavailable");
  assert.equal(evidence.exactHeadSha, null);
  assert.equal(evidence.nextOperation, null);
});

test("final Preview main-head verification accepts only the exact expected SHA", async () => {
  assert.equal(
    await verifyGeneratedPreviewCurrentMainHead(HEAD, {
      fetchImpl: async (url) => {
        assert.ok(url.endsWith("/branches/main"));
        return Response.json({ commit: { sha: HEAD } });
      },
    }),
    true,
  );

  assert.equal(
    await verifyGeneratedPreviewCurrentMainHead(HEAD, {
      fetchImpl: async () =>
        Response.json({ commit: { sha: "b".repeat(40) } }),
    }),
    false,
  );
  assert.equal(
    await verifyGeneratedPreviewCurrentMainHead("../main", {
      fetchImpl: async () => {
        throw new Error("invalid SHA must fail before fetch");
      },
    }),
    false,
  );
});

test("generated preview workflow title pins app and operation correlation", async () => {
  assert.equal(
    generatedPreviewRunTitle("checklist", "deploy"),
    "Generated Preview · checklist · deploy",
  );
  assert.throws(
    () => generatedPreviewRunTitle("../checklist", "deploy"),
    /invalid/,
  );

  const workflow = await readFile(
    join(repositoryRoot, ".github", "workflows", "generated-app-preview-lifecycle.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /run-name: Generated Preview · \$\{\{ inputs\.app_id \}\} · \$\{\{ inputs\.operation \}\}/,
  );
});
