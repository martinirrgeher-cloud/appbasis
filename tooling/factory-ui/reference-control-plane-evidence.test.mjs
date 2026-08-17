import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveReferenceControlPlaneEvidence,
  REFERENCE_CONTROL_PLANE_EVIDENCE_RUN,
  verifyReferenceControlPlaneEvidenceRun,
} from "./reference-control-plane-evidence.mjs";

const withinValidity = () => Date.parse("2026-08-17T12:00:00Z");

function expectedRun(overrides = {}) {
  return {
    id: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunId,
    run_attempt: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunAttempt,
    name: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowName,
    path: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowPath,
    event: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunEvent,
    head_branch: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunBranch,
    head_sha: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunHeadSha,
    updated_at: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.observedAt,
    status: "completed",
    conclusion: "success",
    repository: {
      full_name: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.repository,
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

test("binds the pinned fresh successful provider run only to the Reference app", async () => {
  let calls = 0;
  const fetchImpl = async (input, init) => {
    calls += 1;
    assert.equal(
      String(input),
      `https://api.github.com/repos/${REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.repository}/actions/runs/${REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunId}`,
    );
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.accept, "application/vnd.github+json");
    assert.equal(init.headers["x-github-api-version"], "2022-11-28");
    return jsonResponse(expectedRun());
  };

  assert.deepEqual(
    await deriveReferenceControlPlaneEvidence(
      { appId: "reference" },
      { fetchImpl, now: withinValidity },
    ),
    { privilegedControlPlaneIsolation: true },
  );
  assert.equal(calls, 1);

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

test("fails closed when any pinned run identity or success field does not match", async () => {
  const mismatches = [
    { id: 1 },
    { run_attempt: 2 },
    { name: "other" },
    { path: ".github/workflows/other.yml" },
    { event: "push" },
    { head_branch: "feature" },
    { head_sha: "0".repeat(40) },
    { updated_at: "2026-08-17T11:36:45Z" },
    { status: "in_progress" },
    { conclusion: "failure" },
    { repository: { full_name: "other/repository" } },
    { repository: null },
  ];

  for (const mismatch of mismatches) {
    assert.equal(
      await verifyReferenceControlPlaneEvidenceRun(
        async () => jsonResponse(expectedRun(mismatch)),
        withinValidity,
      ),
      false,
    );
  }
});

test("expires the provider observation at its explicit review point", async () => {
  const fetchImpl = async () => jsonResponse(expectedRun());

  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      fetchImpl,
      () => Date.parse(REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.observedAt),
    ),
    true,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      fetchImpl,
      () => Date.parse(REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.validUntilOrReviewAt) - 1,
    ),
    true,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      fetchImpl,
      () => Date.parse(REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.validUntilOrReviewAt),
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      fetchImpl,
      () => Date.parse(REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.observedAt) - 1,
    ),
    false,
  );
});

test("fails closed on unreadable, non-JSON, malformed or untimeable GitHub evidence", async () => {
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(async () => {
      throw new Error("network unavailable");
    }, withinValidity),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () => jsonResponse(expectedRun(), { status: 503 }),
      withinValidity,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () => jsonResponse(expectedRun(), { contentType: "text/plain" }),
      withinValidity,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      withinValidity,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () => jsonResponse(null),
      withinValidity,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(null, withinValidity),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () => jsonResponse(expectedRun()),
      null,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () => jsonResponse(expectedRun()),
      () => Number.NaN,
    ),
    false,
  );
  assert.equal(
    await verifyReferenceControlPlaneEvidenceRun(
      async () => jsonResponse(expectedRun()),
      () => {
        throw new Error("clock unavailable");
      },
    ),
    false,
  );
});
