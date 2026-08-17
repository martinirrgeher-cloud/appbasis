import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveReferenceControlPlaneEvidence,
  REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY,
  verifyReferenceControlPlaneEvidenceRun,
} from "./reference-control-plane-evidence.mjs";

const nowMs = Date.parse("2026-08-17T12:00:00Z");
const withinValidity = () => nowMs;
const observedAt = "2026-08-17T11:36:46Z";
const createdAt = "2026-08-17T11:35:55Z";
const trustedHeadSha = "e7fb8dbd5e76041109e2f045eabc50fc803c13a0";

function expectedRun(overrides = {}) {
  return {
    id: 32025695514,
    run_attempt: 1,
    name: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowName,
    path: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowPath,
    event: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowRunEvent,
    head_branch: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowRunBranch,
    head_sha: trustedHeadSha,
    created_at: createdAt,
    updated_at: observedAt,
    status: "completed",
    conclusion: "success",
    repository: {
      full_name: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.repository,
    },
    ...overrides,
  };
}

function jsonResponse(payload, { status = 200, contentType = "application/json; charset=utf-8" } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": contentType },
  });
}

function evidenceFetch({
  headPayload = { sha: trustedHeadSha },
  runsPayload = { total_count: 1, workflow_runs: [expectedRun()] },
  onRequest,
} = {}) {
  return async (input, init) => {
    const url = new URL(String(input));
    onRequest?.(url, init);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.accept, "application/vnd.github+json");
    assert.equal(init.headers["x-github-api-version"], "2022-11-28");

    if (url.pathname.endsWith("/commits/main")) {
      return jsonResponse(headPayload);
    }
    if (url.pathname.endsWith("/actions/workflows/m5-reference-control-plane-evidence.yml/runs")) {
      assert.equal(url.searchParams.get("branch"), "main");
      assert.equal(url.searchParams.get("event"), "workflow_dispatch");
      assert.equal(url.searchParams.get("per_page"), "1");
      return jsonResponse(runsPayload);
    }
    throw new Error(`unexpected GitHub evidence URL: ${url}`);
  };
}

test("discovers the latest fresh successful provider run only for the Reference app", async () => {
  const requestedPaths = [];
  const fetchImpl = evidenceFetch({
    onRequest: (url) => requestedPaths.push(url.pathname),
  });

  assert.deepEqual(
    await deriveReferenceControlPlaneEvidence(
      { appId: "reference" },
      { fetchImpl, now: withinValidity },
    ),
    { privilegedControlPlaneIsolation: true },
  );
  assert.deepEqual(requestedPaths, [
    `/repos/${REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.repository}/commits/main`,
    `/repos/${REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.repository}/actions/workflows/${REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowFileName}/runs`,
  ]);

  assert.deepEqual(
    await deriveReferenceControlPlaneEvidence(
      { appId: "m3-preview" },
      {
        fetchImpl: async () => {
          throw new Error("non-Reference apps must not query Reference evidence");
        },
        now: withinValidity,
      },
    ),
    {},
  );
});

test("binds the evidence run to the current trusted main revision", async () => {
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      evidenceFetch({ headPayload: { sha: "a".repeat(40) } }),
      withinValidity,
    ),
    false,
  );

  for (const headPayload of [null, {}, { sha: "not-a-sha" }, { sha: "A".repeat(40) }]) {
    let requests = 0;
    assert.equal(
      await verifyReferenceControlPlaneEvidenceRun(
        evidenceFetch({
          headPayload,
          onRequest: () => {
            requests += 1;
          },
        }),
        withinValidity,
      ),
      false,
    );
    assert.equal(requests, 1);
  }
});

test("fails closed when the latest run identity or outcome is not the expected Reference evidence", async () => {
  const mismatches = [
    { id: 0 },
    { run_attempt: 2 },
    { name: "other" },
    { path: ".github/workflows/other.yml" },
    { event: "push" },
    { head_branch: "feature" },
    { head_sha: "b".repeat(40) },
    { status: "in_progress", conclusion: null },
    { conclusion: "failure" },
    { repository: { full_name: "other/repository" } },
    { repository: null },
    { created_at: "invalid" },
    { updated_at: "invalid" },
    { created_at: "2026-08-17T11:37:00Z", updated_at: observedAt },
  ];

  for (const mismatch of mismatches) {
    assert.equal(
      await verifyReferenceControlPlaneEvidenceRun(
        evidenceFetch({
          runsPayload: {
            total_count: 1,
            workflow_runs: [expectedRun(mismatch)],
          },
        }),
        withinValidity,
      ),
      false,
    );
  }
});

test("uses the newest run outcome instead of falling back to an older success", async () => {
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      evidenceFetch({
        runsPayload: {
          total_count: 4,
          workflow_runs: [
            expectedRun({
              id: 32025695515,
              status: "completed",
              conclusion: "failure",
              updated_at: "2026-08-17T11:50:00Z",
            }),
          ],
        },
      }),
      withinValidity,
    ),
    false,
  );
});

test("expires provider evidence using the stable Reference freshness window", async () => {
  const fetchImpl = evidenceFetch();
  const observedAtMs = Date.parse(observedAt);

  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(fetchImpl, () => observedAtMs),
    true,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      fetchImpl,
      () => observedAtMs + REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.maxAgeMs - 1,
    ),
    true,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      fetchImpl,
      () => observedAtMs + REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.maxAgeMs,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(fetchImpl, () => observedAtMs - 1),
    false,
  );
});

test("fails closed on malformed run listings, GitHub failures and invalid clocks", async () => {
  const malformedPayloads = [
    null,
    {},
    { total_count: 0, workflow_runs: [] },
    { total_count: 1, workflow_runs: [] },
    { total_count: 1, workflow_runs: [expectedRun(), expectedRun()] },
    { total_count: "1", workflow_runs: [expectedRun()] },
  ];

  for (const payload of malformedPayloads) {
    assert.equal(
      await verifyReferenceControlPlaneEvidenceRun(
        evidenceFetch({ runsPayload: payload }),
        withinValidity,
      ),
      false,
    );
  }

  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(async () => {
      throw new Error("network unavailable");
    }, withinValidity),
    false,
  );

  const badSecondResponse = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/commits/main")) {
      return jsonResponse({ sha: trustedHeadSha });
    }
    return new Response("unavailable", { status: 503 });
  };
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(badSecondResponse, withinValidity),
    false,
  );

  const wrongContentType = async (input) => {
    const url = new URL(String(input));
    const payload = url.pathname.endsWith("/commits/main")
      ? { sha: trustedHeadSha }
      : { total_count: 1, workflow_runs: [expectedRun()] };
    return jsonResponse(payload, { contentType: "text/plain" });
  };
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(wrongContentType, withinValidity),
    false,
  );

  let fetchCalls = 0;
  for (const now of [null, () => Number.NaN, () => { throw new Error("clock unavailable"); }]) {
    assert.equal(
      await verifyReferenceControlPlaneEvidenceRun(
        async () => {
          fetchCalls += 1;
          return jsonResponse({ sha: trustedHeadSha });
        },
        now,
      ),
      false,
    );
  }
  assert.equal(fetchCalls, 0);
});
