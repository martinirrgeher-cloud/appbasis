import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveUlcLinzM6ProductionPilotAcceptanceEvidence,
  ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS,
} from "./ulc-linz-m6-production-pilot-acceptance-evidence.mjs";
import { REQUIRED_PRODUCTION_READINESS_CRITERIA } from "./production-readiness.mjs";

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

function runPayload(key, overrides = {}) {
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
  let mainReads = 0;
  return async (input) => {
    const url = String(input);

    if (url.endsWith("/branches/main")) {
      mainReads += 1;
      return Response.json({ commit: { sha: currentSha } });
    }

    for (const key of Object.keys(ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS)) {
      const expected = ULC_LINZ_M6_PRODUCTION_PILOT_ACCEPTANCE_RUNS[key];
      if (url.endsWith(`/actions/runs/${expected.id}`)) {
        return Response.json(runPayload(key, runOverrides[key] ?? {}));
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

    throw new Error(`Unexpected GitHub evidence URL: ${url}; main reads: ${mainReads}`);
  };
}

test("accepted ULC M6 pilot produces complete durable M5 evidence and the eight non-preview M6 pilot criteria", async () => {
  const result = await deriveUlcLinzM6ProductionPilotAcceptanceEvidence(
    process.cwd(),
    definition,
    { fetchImpl: successfulFetch() },
  );

  assert.deepEqual(
    Object.keys(result.m5ProductionEvidence).sort(),
    REQUIRED_PRODUCTION_READINESS_CRITERIA.map(({ id }) => id).sort(),
  );
  assert.ok(
    Object.values(result.m5ProductionEvidence).every((value) => value === true),
  );
  assert.deepEqual(result.m6ProductionEvidence, {
    productionDatabaseReady: true,
    productionWorkerReady: true,
    productionDomainReady: true,
    productionUsersAndPermissionsReady: true,
    backupRecoveryReady: true,
    productionMigrationsApplied: true,
    productionDeploymentCompleted: true,
    postDeploySmokePassed: true,
  });
  assert.equal("previewAccepted" in result.m6ProductionEvidence, false);
  assert.equal("securityPrivacyReady" in result.m6ProductionEvidence, false);
  assert.equal("releaseAuthorized" in result.m6ProductionEvidence, false);
});

test("accepted ULC M6 pilot fails closed when the runtime contract changed after the accepted head", async () => {
  const result = await deriveUlcLinzM6ProductionPilotAcceptanceEvidence(
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

  assert.deepEqual(result.m5ProductionEvidence, {});
  assert.deepEqual(result.m6ProductionEvidence, {});
});

test("accepted ULC M6 pilot fails closed when any pinned production run drifts", async () => {
  const result = await deriveUlcLinzM6ProductionPilotAcceptanceEvidence(
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

  assert.deepEqual(result.m5ProductionEvidence, {});
  assert.deepEqual(result.m6ProductionEvidence, {});
});

test("accepted ULC M6 pilot fails closed when main changes during observation", async () => {
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

  const result = await deriveUlcLinzM6ProductionPilotAcceptanceEvidence(
    process.cwd(),
    definition,
    { fetchImpl },
  );

  assert.deepEqual(result.m5ProductionEvidence, {});
  assert.deepEqual(result.m6ProductionEvidence, {});
});
