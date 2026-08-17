import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadFactorySnapshot } from "./model.mjs";
import { REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY } from "./reference-control-plane-evidence.mjs";

const nowMs = Date.parse("2026-08-17T12:00:00Z");
const withinValidity = () => nowMs;
const observedAt = "2026-08-17T11:36:46Z";
const trustedHeadSha = "e7fb8dbd5e76041109e2f045eabc50fc803c13a0";

function successfulRun(overrides = {}) {
  return {
    id: 32025695514,
    run_attempt: 1,
    name: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowName,
    path: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowPath,
    event: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowRunEvent,
    head_branch: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowRunBranch,
    head_sha: trustedHeadSha,
    created_at: "2026-08-17T11:35:55Z",
    updated_at: observedAt,
    status: "completed",
    conclusion: "success",
    repository: {
      full_name: REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.repository,
    },
    ...overrides,
  };
}

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function evidenceFetch(run = successfulRun()) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/commits/main")) {
      return jsonResponse({ sha: trustedHeadSha });
    }
    if (
      url.pathname.endsWith(
        `/actions/workflows/${REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.workflowFileName}/runs`,
      )
    ) {
      return jsonResponse({ total_count: 1, workflow_runs: [run] });
    }
    throw new Error(`unexpected GitHub evidence URL: ${url}`);
  };
}

async function createReferenceFixture() {
  const root = await mkdtemp(join(tmpdir(), "appbasis-reference-m5-evidence-"));
  await mkdir(join(root, "apps", "reference"), { recursive: true });
  await mkdir(join(root, "modules"), { recursive: true });
  await writeFile(
    join(root, "apps", "reference", "appbasis.app.json"),
    `${JSON.stringify(
      {
        schemaVersion: 2,
        appId: "reference",
        displayName: "Reference",
        modules: [],
        platformServices: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return root;
}

function criterion(app, id) {
  return app.productionReadiness.criteria.find((candidate) => candidate.id === id);
}

test("factory snapshot consumes the latest fresh successful Reference control-plane run without unlocking production", async () => {
  const root = await createReferenceFixture();
  try {
    const snapshot = await loadFactorySnapshot(root, {
      referenceControlPlaneEvidenceFetchImpl: evidenceFetch(),
      referenceControlPlaneEvidenceNow: withinValidity,
    });
    const app = snapshot.apps[0];

    assert.equal(app.appId, "reference");
    assert.equal(app.productionReadiness.verifiedCount, 2);
    assert.equal(app.productionReadiness.requiredCount, 12);
    assert.equal(app.productionReadiness.productionReady, false);
    assert.equal(criterion(app, "secretsOutsideAppManifests").status, "verified");
    assert.equal(criterion(app, "privilegedControlPlaneIsolation").status, "verified");
    assert.equal(criterion(app, "dataRegion").status, "open");
    assert.equal(snapshot.capabilities.releaseProduction, false);
    assert.equal(app.productionReleaseReadiness.technicalEvidenceVerified, false);
    assert.equal(app.productionReleaseReadiness.releaseAuthorized, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("factory snapshot keeps Reference control-plane isolation open when the latest run is not successful", async () => {
  const root = await createReferenceFixture();
  try {
    const snapshot = await loadFactorySnapshot(root, {
      referenceControlPlaneEvidenceFetchImpl: evidenceFetch(
        successfulRun({ conclusion: "failure" }),
      ),
      referenceControlPlaneEvidenceNow: withinValidity,
    });
    const app = snapshot.apps[0];

    assert.equal(app.productionReadiness.verifiedCount, 1);
    assert.equal(app.productionReadiness.productionReady, false);
    assert.equal(criterion(app, "secretsOutsideAppManifests").status, "verified");
    assert.equal(criterion(app, "privilegedControlPlaneIsolation").status, "open");
    assert.equal(snapshot.capabilities.releaseProduction, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("factory snapshot expires stale Reference provider evidence", async () => {
  const root = await createReferenceFixture();
  try {
    const snapshot = await loadFactorySnapshot(root, {
      referenceControlPlaneEvidenceFetchImpl: evidenceFetch(),
      referenceControlPlaneEvidenceNow: () =>
        Date.parse(observedAt) + REFERENCE_CONTROL_PLANE_EVIDENCE_POLICY.maxAgeMs,
    });
    const app = snapshot.apps[0];

    assert.equal(app.productionReadiness.verifiedCount, 1);
    assert.equal(app.productionReadiness.productionReady, false);
    assert.equal(criterion(app, "privilegedControlPlaneIsolation").status, "open");
    assert.equal(snapshot.capabilities.releaseProduction, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
