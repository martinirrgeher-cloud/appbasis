import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { M3_PREVIEW_ACCEPTANCE_RUN } from "./m3-preview-acceptance-evidence.mjs";
import { loadFactorySnapshot } from "./model.mjs";
import {
  evaluateM6ProductionReleaseReadiness,
  REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA,
} from "./production-release-readiness.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const expectedIds = [
  "previewAccepted",
  "productionDatabaseReady",
  "productionWorkerReady",
  "productionDomainReady",
  "productionUsersAndPermissionsReady",
  "backupRecoveryReady",
  "securityPrivacyReady",
  "productionMigrationsApplied",
  "productionDeploymentCompleted",
  "postDeploySmokePassed",
];

const allEvidence = () => Object.fromEntries(expectedIds.map((id) => [id, true]));

function verifiedM3GitHubFetch() {
  return async () => ({
    ok: true,
    headers: { get: () => "application/json; charset=utf-8" },
    async json() {
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
      };
    },
  });
}

test("M6 release readiness pins only the semantic per-app production gates", () => {
  assert.deepEqual(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map((criterion) => criterion.id),
    expectedIds,
  );
  assert.ok(
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.every(
      (criterion) => !Object.hasOwn(criterion, "stage"),
    ),
  );
});

test("M6 release readiness is blocked when evidence is missing", () => {
  const readiness = evaluateM6ProductionReleaseReadiness();

  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.technicalEvidenceVerified, false);
  assert.equal(readiness.verifiedCount, 0);
  assert.equal(readiness.requiredCount, expectedIds.length);
  assert.equal(readiness.explicitApprovalRequired, true);
  assert.equal(readiness.releaseAuthorized, false);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "open"));
});

test("M6 release readiness remains fail-closed for truthy or unknown evidence", () => {
  const evidence = allEvidence();
  evidence.previewAccepted = "yes";
  evidence.releaseProduction = true;

  const readiness = evaluateM6ProductionReleaseReadiness(evidence);

  assert.equal(readiness.technicalEvidenceVerified, false);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(readiness.verifiedCount, expectedIds.length - 1);
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "previewAccepted")?.status,
    "open",
  );
  assert.equal(
    readiness.criteria.find((criterion) => criterion.id === "postDeploySmokePassed")?.status,
    "verified",
  );
});

test("complete technical M6 evidence still never authorizes release in the read-only contract", () => {
  const readiness = evaluateM6ProductionReleaseReadiness(allEvidence());

  assert.equal(readiness.status, "evidence-verified");
  assert.equal(readiness.technicalEvidenceVerified, true);
  assert.equal(readiness.verifiedCount, expectedIds.length);
  assert.equal(readiness.explicitApprovalRequired, true);
  assert.equal(readiness.releaseAuthorized, false);
  assert.equal(Object.hasOwn(readiness, "productionVerified"), false);
  assert.ok(readiness.criteria.every((criterion) => criterion.status === "verified"));
});

test("malformed or inherited values cannot count as M6 production evidence", () => {
  assert.throws(
    () => evaluateM6ProductionReleaseReadiness([]),
    /M6 production release evidence must be a plain object/,
  );
  assert.throws(
    () => evaluateM6ProductionReleaseReadiness(null),
    /M6 production release evidence must be a plain object/,
  );

  const evidence = allEvidence();
  delete evidence.backupRecoveryReady;
  Object.defineProperty(Object.prototype, "backupRecoveryReady", {
    configurable: true,
    enumerable: false,
    value: true,
  });

  try {
    const readiness = evaluateM6ProductionReleaseReadiness(evidence);
    assert.equal(readiness.technicalEvidenceVerified, false);
    assert.equal(readiness.releaseAuthorized, false);
    assert.equal(readiness.verifiedCount, expectedIds.length - 1);
    assert.equal(
      readiness.criteria.find((criterion) => criterion.id === "backupRecoveryReady")?.status,
      "open",
    );
  } finally {
    delete Object.prototype.backupRecoveryReady;
  }
});

test("Factory snapshot promotes only independently verified GitHub M3 acceptance", async () => {
  const snapshot = await loadFactorySnapshot(repositoryRoot, {
    m3PreviewAcceptanceFetchImpl: verifiedM3GitHubFetch(),
  });

  assert.ok(snapshot.apps.length > 0);
  const acceptedPreview = snapshot.apps.find((app) => app.appId === "m3-preview");
  assert.ok(acceptedPreview);

  for (const app of snapshot.apps) {
    assert.equal(app.productionReleaseReadiness.status, "blocked");
    assert.equal(app.productionReleaseReadiness.technicalEvidenceVerified, false);
    assert.equal(app.productionReleaseReadiness.requiredCount, expectedIds.length);
    assert.equal(app.productionReleaseReadiness.explicitApprovalRequired, true);
    assert.equal(app.productionReleaseReadiness.releaseAuthorized, false);
    assert.deepEqual(
      app.productionReleaseReadiness.criteria.map((criterion) => criterion.id),
      expectedIds,
    );

    const previewCriterion = app.productionReleaseReadiness.criteria.find(
      (criterion) => criterion.id === "previewAccepted",
    );
    assert.equal(
      previewCriterion?.status,
      app.appId === "m3-preview" ? "verified" : "open",
    );

    const securityPrivacyCriterion = app.productionReleaseReadiness.criteria.find(
      (criterion) => criterion.id === "securityPrivacyReady",
    );
    assert.equal(
      securityPrivacyCriterion?.status,
      app.productionReadiness.productionReady === true ? "verified" : "open",
    );
    assert.ok(
      app.productionReleaseReadiness.criteria
        .filter(
          (criterion) =>
            criterion.id !== "previewAccepted" &&
            criterion.id !== "securityPrivacyReady",
        )
        .every((criterion) => criterion.status === "open"),
    );
  }

  assert.equal(acceptedPreview.productionReleaseReadiness.verifiedCount, 1);
  assert.equal(snapshot.capabilities.releaseProduction, false);
});
