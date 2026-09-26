import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzM6ProductionPilotCloseoutEvidence,
  ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS,
} from "./ulc-linz-m6-production-pilot-acceptance-evidence.mjs";
import { REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA } from "./production-release-readiness.mjs";
import { ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS } from "./ulc-linz-d4-preview-acceptance-evidence.mjs";

const ACCEPTED = "bab8b18fd9e88025a6df0ccbffe8c51b972fe4b3";
const CURRENT = "c".repeat(40);
const REPOSITORY = "martinirrgeher-cloud/appbasis";

const definition = Object.freeze({
  schemaVersion: 2,
  appId: "ulc-linz",
  displayName: "ULC Linz",
  modules: Object.freeze(["countdown"]),
  platformServices: Object.freeze(["identity", "permissions"]),
});

const runTimes = Object.freeze({
  m5: ["2026-09-26T14:13:40.000Z", "2026-09-26T14:16:15.000Z"],
  pilotIngress: ["2026-09-26T14:17:42.000Z", "2026-09-26T14:17:58.000Z"],
  smokePrincipal: ["2026-09-26T14:18:56.000Z", "2026-09-26T14:20:38.000Z"],
  postDeploySmoke: ["2026-09-26T14:21:42.000Z", "2026-09-26T14:23:16.000Z"],
});

function productionRunPayload(key, overrides = {}) {
  const expected = ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS[key];
  const [startedAt, completedAt] = runTimes[key];
  return {
    id: expected.id,
    run_attempt: 1,
    name: expected.name,
    path: expected.path,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: ACCEPTED,
    status: "completed",
    conclusion: "success",
    run_started_at: startedAt,
    updated_at: completedAt,
    repository: { full_name: REPOSITORY },
    ...overrides,
  };
}

function d4RunPayload(expected) {
  return {
    id: expected.id,
    run_attempt: expected.attempt,
    name: expected.name,
    path: expected.path,
    event: expected.event,
    head_branch: expected.branch,
    head_sha: expected.headSha,
    status: "completed",
    conclusion: "success",
    repository: { full_name: REPOSITORY },
  };
}

function successfulFetch({
  currentSha = CURRENT,
  compareFiles = [
    {
      filename:
        "tooling/factory-ui/ulc-linz-m6-production-pilot-acceptance-evidence.mjs",
      status: "added",
    },
    {
      filename: "apps/ulc-linz/evidence/m6-production-pilot-acceptance.json",
      status: "added",
    },
  ],
  runOverrides = {},
} = {}) {
  return async (input) => {
    const url = String(input);

    if (url.endsWith("/branches/main")) {
      return Response.json({ commit: { sha: currentSha } });
    }

    for (const expected of Object.values(ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS)) {
      if (url.endsWith(`/actions/runs/${expected.id}`)) {
        return Response.json(d4RunPayload(expected));
      }
    }

    for (const key of Object.keys(ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS)) {
      const expected = ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS[key];
      if (url.endsWith(`/actions/runs/${expected.id}`)) {
        return Response.json(
          productionRunPayload(key, runOverrides[key] ?? {}),
        );
      }
    }

    if (url.includes(`/compare/${ACCEPTED}...${currentSha}`)) {
      return Response.json({
        status: "ahead",
        ahead_by: 1,
        behind_by: 0,
        total_commits: 1,
        base_commit: { sha: ACCEPTED },
        merge_base_commit: { sha: ACCEPTED },
        commits: [{ sha: currentSha }],
        files: compareFiles,
      });
    }

    throw new Error(`Unexpected GitHub evidence URL: ${url}`);
  };
}

test("accepted ULC M6 pilot closes the technical milestone without authorizing final production release", async () => {
  const result = await deriveUlcLinzM6ProductionPilotCloseoutEvidence(
    process.cwd(),
    definition,
    { fetchImpl: successfulFetch() },
  );

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.application, "ulc-linz");
  assert.equal(result.environment, "production-pilot");
  assert.equal(result.milestone, "M6");
  assert.equal(result.acceptedHeadSha, ACCEPTED);
  assert.equal(result.technicalEvidenceVerified, true);
  assert.equal(
    result.verifiedCount,
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.length,
  );
  assert.equal(
    result.requiredCount,
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.length,
  );
  assert.deepEqual(
    result.acceptedCriteria,
    REQUIRED_M6_PRODUCTION_RELEASE_CRITERIA.map(({ id }) => id),
  );
  assert.equal(result.explicitApprovalRequiredForFinalRelease, true);
  assert.equal(result.finalProductionReleaseAuthorized, false);
});

test("M6 closeout fails closed when the runtime contract changed after the accepted head", async () => {
  const result = await deriveUlcLinzM6ProductionPilotCloseoutEvidence(
    process.cwd(),
    definition,
    {
      fetchImpl: successfulFetch({
        compareFiles: [
          { filename: "apps/ulc-linz/worker/index.ts", status: "modified" },
        ],
      }),
    },
  );

  assert.deepEqual(result, {});
});

test("M6 closeout fails closed when any pinned production run drifts", async () => {
  const result = await deriveUlcLinzM6ProductionPilotCloseoutEvidence(
    process.cwd(),
    definition,
    {
      fetchImpl: successfulFetch({
        runOverrides: {
          postDeploySmoke: { conclusion: "failure" },
        },
      }),
    },
  );

  assert.deepEqual(result, {});
});

test("M6 closeout fails closed when main changes during observation", async () => {
  let mainReads = 0;
  const baseFetch = successfulFetch();
  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/branches/main")) {
      mainReads += 1;
      return Response.json({
        commit: { sha: mainReads === 1 ? CURRENT : "d".repeat(40) },
      });
    }
    return baseFetch(input, init);
  };

  const result = await deriveUlcLinzM6ProductionPilotCloseoutEvidence(
    process.cwd(),
    definition,
    { fetchImpl },
  );

  assert.deepEqual(result, {});
});

test("M6 closeout fails closed when the accepted D4 preview evidence is unavailable", async () => {
  const baseFetch = successfulFetch();
  const fetchImpl = async (input, init) => {
    const url = String(input);
    if (
      Object.values(ULC_LINZ_D4_PREVIEW_ACCEPTANCE_RUNS).some((expected) =>
        url.endsWith(`/actions/runs/${expected.id}`),
      )
    ) {
      return Response.json({ status: "completed", conclusion: "failure" });
    }
    return baseFetch(input, init);
  };

  const result = await deriveUlcLinzM6ProductionPilotCloseoutEvidence(
    process.cwd(),
    definition,
    { fetchImpl },
  );

  assert.deepEqual(result, {});
});
