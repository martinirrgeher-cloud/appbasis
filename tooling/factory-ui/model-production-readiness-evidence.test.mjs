import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadFactorySnapshot } from "./model.mjs";
import { REFERENCE_CONTROL_PLANE_EVIDENCE_RUN } from "./reference-control-plane-evidence.mjs";

function successfulRun(overrides = {}) {
  return {
    id: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunId,
    run_attempt: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunAttempt,
    name: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowName,
    path: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowPath,
    event: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunEvent,
    head_branch: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunBranch,
    head_sha: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.workflowRunHeadSha,
    status: "completed",
    conclusion: "success",
    repository: {
      full_name: REFERENCE_CONTROL_PLANE_EVIDENCE_RUN.repository,
    },
    ...overrides,
  };
}

function runResponse(run) {
  return new Response(JSON.stringify(run), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

test("factory snapshot consumes the pinned successful Reference control-plane run without unlocking production", async () => {
  const root = await createReferenceFixture();
  try {
    const snapshot = await loadFactorySnapshot(root, {
      referenceControlPlaneEvidenceFetchImpl: async () =>
        runResponse(successfulRun()),
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

test("factory snapshot keeps Reference control-plane isolation open when the pinned run is not successful", async () => {
  const root = await createReferenceFixture();
  try {
    const snapshot = await loadFactorySnapshot(root, {
      referenceControlPlaneEvidenceFetchImpl: async () =>
        runResponse(successfulRun({ conclusion: "failure" })),
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
