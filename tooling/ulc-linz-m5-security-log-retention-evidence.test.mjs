import assert from "node:assert/strict";
import test from "node:test";

import {
  readUlcLinzM5SecurityLogRetentionRunEvidence,
  ULC_LINZ_M5_F_RETENTION_RUN_POLICY,
} from "./ulc-linz-m5-security-log-retention-evidence.mjs";
import { runUlcLinzM5SecurityLogRetention } from "./ulc-linz-m5-security-log-retention-run.mjs";
import { ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST } from "./ulc-linz-m5-audit-security-logging-evidence.mjs";

const MAIN_SHA = "a".repeat(40);
const NOW = Date.parse("2026-08-23T16:00:00.000Z");
const UPDATED_AT = "2026-08-23T15:55:00.000Z";
const RETENTION_CUTOFF = "2026-08-23T15:54:30.000Z";

const VALID_CLEANUP_ACCESS = Object.freeze({
  cleanup_member: true,
  login: true,
  superuser: false,
  create_db: false,
  create_role: false,
  replication: false,
  bypass_rls: false,
  cleanup_group_login: false,
  cleanup_group_superuser: false,
  cleanup_group_create_db: false,
  cleanup_group_create_role: false,
  cleanup_group_replication: false,
  cleanup_group_bypass_rls: false,
  membership_count: 1,
  cleanup_admin_option: false,
  reverse_membership_count: 0,
  cleanup_group_membership_count: 0,
  cleanup_group_operational_member_count: 1,
  cleanup_group_creator_back_reference_count: 0,
  cleanup_group_unexpected_member_count: 0,
  cleanup_execute: true,
  direct_select: false,
  direct_delete: false,
  direct_insert: false,
  direct_update: false,
  direct_truncate: false,
  direct_trigger: false,
  direct_references: false,
  retention_read: true,
  forbidden_column_select: false,
  forbidden_column_mutation: false,
  sequence_usage: false,
  sequence_select: false,
  sequence_update: false,
  protected_object_owner_count: 0,
  expected_cleanup_acl_count: 2,
  unexpected_cleanup_acl_count: 0,
});

function run(overrides = {}) {
  return {
    id: 123,
    run_attempt: 1,
    name: ULC_LINZ_M5_F_RETENTION_RUN_POLICY.workflowName,
    path: ULC_LINZ_M5_F_RETENTION_RUN_POLICY.workflowPath,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: MAIN_SHA,
    status: "completed",
    conclusion: "success",
    created_at: "2026-08-23T15:54:00.000Z",
    updated_at: UPDATED_AT,
    repository: { full_name: "martinirrgeher-cloud/appbasis" },
    ...overrides,
  };
}

function githubFetch(latestRun = run(), mainSha = MAIN_SHA) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/commits/main")) {
      return jsonResponse({ sha: mainSha });
    }
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/actions/workflows/m5-ulc-security-log-retention.yml/runs")) {
      return jsonResponse({ total_count: 1, workflow_runs: [latestRun] });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, calls };
}

function options(fetchImpl, now = () => NOW) {
  return { expectedHeadSha: MAIN_SHA, fetchImpl, now };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function retentionClient(access = VALID_CLEANUP_ACCESS, expiredRows = "0") {
  const queries = [];
  return {
    queries,
    client: {
      async unsafe(query) {
        queries.push(query);
        if (query.includes("WITH protected_acl AS")) return [structuredClone(access)];
        if (query.includes("COUNT(retained_until)")) return [{ expired_rows: expiredRows }];
        throw new Error("unexpected retention test query");
      },
    },
  };
}

test("reads only a fresh successful retention run on the exact expected current main head", async () => {
  const { fetchImpl, calls } = githubFetch();
  const evidence = await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl));

  assert.deepEqual(evidence, {
    schemaVersion: 1,
    application: "ulc-linz",
    environment: "production",
    evidenceSource: "github-actions-controlled-production-retention-run",
    cleanupExecutionBound: true,
    cleanupLastSucceededAt: UPDATED_AT,
    cleanupResultVerified: true,
    cutoffSemantics: "occurred-at-strictly-older-than-12-calendar-months",
    boundaryEventPreserved: true,
    clientCutoffOverridePresent: false,
    enforcementContractDigest: ULC_LINZ_M5_F_CONTROLLED_RETENTION_CONTRACT_DIGEST,
  });
  assert.equal(calls.length, 2);
  const runsUrl = new URL(calls[1].url);
  assert.equal(runsUrl.searchParams.get("branch"), "main");
  assert.equal(runsUrl.searchParams.get("event"), "workflow_dispatch");
  assert.equal(runsUrl.searchParams.get("per_page"), "1");
});

test("retention runner accepts only the exact non-delegable cleanup boundary", async () => {
  const { client, queries } = retentionClient();
  const result = await runUlcLinzM5SecurityLogRetention(
    client,
    async () => ({ cutoff: RETENTION_CUTOFF, deletedRows: "3" }),
  );

  assert.equal(result.cleanupAccessVerified, true);
  assert.equal(result.cleanupSucceeded, true);
  assert.equal(result.cleanupResultVerified, true);
  assert.equal(result.expiredRowsRemaining, false);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(queries.length, 2);
  assert.match(queries[0], /forbidden_column_mutation/);
  assert.match(queries[0], /attribute\.attname[\s\S]*'UPDATE'/);
  assert.match(queries[0], /attribute\.attname[\s\S]*'REFERENCES'/);
  assert.match(queries[0], /protected_object_owner_count/);
  assert.match(queries[0], /expected_cleanup_acl_count/);
  assert.match(queries[0], /unexpected_cleanup_acl_count/);
  assert.match(queries[0], /cleanup_group_operational_member_count/);
  assert.match(queries[0], /creator_back_reference_count/);
  assert.match(queries[0], /unexpected_member_count/);
  assert.match(queries[0], /grantor\.rolsuper = true/);
  assert.match(queries[0], /membership\.admin_option = true/);
  assert.match(queries[0], /membership\.inherit_option = false/);
  assert.match(queries[0], /membership\.set_option = false/);
  assert.match(queries[0], /count\(DISTINCT owner_oid\) = 1/);
  assert.match(queries[0], /reverse_membership_count/);
  assert.match(queries[0], /pg_catalog\.aclexplode/);
});

test("retention runner accepts the callable postgres-js client shape returned by the database factory", async () => {
  const queries = [];
  const client = function postgresJsClientShape() {};
  client.unsafe = async (query) => {
    queries.push(query);
    if (query.includes("WITH protected_acl AS")) return [structuredClone(VALID_CLEANUP_ACCESS)];
    if (query.includes("COUNT(retained_until)")) return [{ expired_rows: "0" }];
    throw new Error("unexpected retention test query");
  };

  assert.equal(typeof client, "function");
  const result = await runUlcLinzM5SecurityLogRetention(
    client,
    async () => ({ cutoff: RETENTION_CUTOFF, deletedRows: "0" }),
  );

  assert.equal(result.cleanupAccessVerified, true);
  assert.equal(result.cleanupSucceeded, true);
  assert.equal(result.cleanupResultVerified, true);
  assert.equal(queries.length, 2);
});

test("retention runner accepts the canonical single creator back-reference", async () => {
  const access = {
    ...VALID_CLEANUP_ACCESS,
    cleanup_group_creator_back_reference_count: 1,
  };
  const { client } = retentionClient(access);
  const result = await runUlcLinzM5SecurityLogRetention(
    client,
    async () => ({ cutoff: RETENTION_CUTOFF, deletedRows: "0" }),
  );

  assert.equal(result.cleanupAccessVerified, true);
  assert.equal(result.cleanupSucceeded, true);
});

test("retention runner fails closed for every adjacent cleanup privilege-escalation class", async () => {
  const invalidAccessRows = [
    { ...VALID_CLEANUP_ACCESS, cleanup_member: false },
    { ...VALID_CLEANUP_ACCESS, login: false },
    { ...VALID_CLEANUP_ACCESS, superuser: true },
    { ...VALID_CLEANUP_ACCESS, create_db: true },
    { ...VALID_CLEANUP_ACCESS, create_role: true },
    { ...VALID_CLEANUP_ACCESS, replication: true },
    { ...VALID_CLEANUP_ACCESS, bypass_rls: true },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_login: true },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_superuser: true },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_create_db: true },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_create_role: true },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_replication: true },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_bypass_rls: true },
    { ...VALID_CLEANUP_ACCESS, membership_count: 2 },
    { ...VALID_CLEANUP_ACCESS, cleanup_admin_option: true },
    { ...VALID_CLEANUP_ACCESS, reverse_membership_count: 1 },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_membership_count: 1 },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_operational_member_count: 0 },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_operational_member_count: 2 },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_creator_back_reference_count: 2 },
    { ...VALID_CLEANUP_ACCESS, cleanup_group_unexpected_member_count: 1 },
    { ...VALID_CLEANUP_ACCESS, cleanup_execute: false },
    { ...VALID_CLEANUP_ACCESS, direct_select: true },
    { ...VALID_CLEANUP_ACCESS, direct_delete: true },
    { ...VALID_CLEANUP_ACCESS, direct_insert: true },
    { ...VALID_CLEANUP_ACCESS, direct_update: true },
    { ...VALID_CLEANUP_ACCESS, direct_truncate: true },
    { ...VALID_CLEANUP_ACCESS, direct_trigger: true },
    { ...VALID_CLEANUP_ACCESS, direct_references: true },
    { ...VALID_CLEANUP_ACCESS, retention_read: false },
    { ...VALID_CLEANUP_ACCESS, forbidden_column_select: true },
    { ...VALID_CLEANUP_ACCESS, forbidden_column_mutation: true },
    { ...VALID_CLEANUP_ACCESS, sequence_usage: true },
    { ...VALID_CLEANUP_ACCESS, sequence_select: true },
    { ...VALID_CLEANUP_ACCESS, sequence_update: true },
    { ...VALID_CLEANUP_ACCESS, protected_object_owner_count: 1 },
    { ...VALID_CLEANUP_ACCESS, expected_cleanup_acl_count: 1 },
    { ...VALID_CLEANUP_ACCESS, expected_cleanup_acl_count: 3 },
    { ...VALID_CLEANUP_ACCESS, unexpected_cleanup_acl_count: 1 },
  ];

  for (const access of invalidAccessRows) {
    const { client } = retentionClient(access);
    let purgeCalls = 0;
    await assert.rejects(
      () => runUlcLinzM5SecurityLogRetention(client, async () => {
        purgeCalls += 1;
        return { cutoff: RETENTION_CUTOFF, deletedRows: "0" };
      }),
      /cleanup principal is not least privilege/,
    );
    assert.equal(purgeCalls, 0);
  }
});

test("retention runner fails closed when cleanup leaves rows expired at its own cutoff", async () => {
  const { client } = retentionClient(VALID_CLEANUP_ACCESS, "1");
  await assert.rejects(
    () => runUlcLinzM5SecurityLogRetention(
      client,
      async () => ({ cutoff: RETENTION_CUTOFF, deletedRows: "0" }),
    ),
    /left expired security events behind/,
  );
});

test("fails closed when the local expected head and remote current main differ", async () => {
  const { fetchImpl, calls } = githubFetch(run(), "b".repeat(40));
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
    {},
  );
  assert.equal(calls.length, 1);
});

test("fails closed on run-head drift, stale evidence, reruns, failures or workflow identity drift", async () => {
  const cases = [
    { latestRun: run({ head_sha: "b".repeat(40) }) },
    { latestRun: run({ updated_at: "2026-08-22T15:59:59.999Z" }) },
    { latestRun: run({ run_attempt: 2 }) },
    { latestRun: run({ conclusion: "failure" }) },
    { latestRun: run({ status: "in_progress", conclusion: null }) },
    { latestRun: run({ name: "Other workflow" }) },
    { latestRun: run({ path: ".github/workflows/other.yml" }) },
    { latestRun: run({ event: "push" }) },
    { latestRun: run({ head_branch: "feature" }) },
    { latestRun: run({ repository: { full_name: "other/repo" } }) },
  ];

  for (const value of cases) {
    const { fetchImpl } = githubFetch(value.latestRun);
    assert.deepEqual(
      await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
      {},
    );
  }
});

test("uses only the newest run and never falls back to an older success", async () => {
  const calls = [];
  const fetchImpl = async (url, requestOptions) => {
    calls.push({ url: String(url), options: requestOptions });
    if (String(url).endsWith("/commits/main")) return jsonResponse({ sha: MAIN_SHA });
    return jsonResponse({
      total_count: 2,
      workflow_runs: [run({ id: 999, conclusion: "failure" })],
    });
  };

  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
    {},
  );
  assert.equal(calls.length, 2);
});

test("fails closed before any GitHub request for missing or malformed expected head", async () => {
  for (const expectedHeadSha of [undefined, "", "not-a-sha", "A".repeat(40)]) {
    let calls = 0;
    const { fetchImpl } = githubFetch();
    const countingFetch = async (...args) => {
      calls += 1;
      return fetchImpl(...args);
    };
    assert.deepEqual(
      await readUlcLinzM5SecurityLogRetentionRunEvidence({ expectedHeadSha, fetchImpl: countingFetch, now: () => NOW }),
      {},
    );
    assert.equal(calls, 0);
  }
});

test("fails closed before the run lookup for invalid current main evidence", async () => {
  for (const mainPayload of [{}, { sha: "not-a-sha" }, null]) {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse(mainPayload);
    };
    assert.deepEqual(
      await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl)),
      {},
    );
    assert.equal(calls, 1);
  }
});

test("fails closed on unavailable, non-json or malformed GitHub evidence and invalid clocks", async () => {
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(async () => new Response("down", { status: 503 }))),
    {},
  );
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } }))),
    {},
  );
  assert.deepEqual(
    await readUlcLinzM5SecurityLogRetentionRunEvidence(options(async () => { throw new Error("network"); })),
    {},
  );
  const { fetchImpl } = githubFetch();
  assert.deepEqual(await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl, () => Number.NaN)), {});
  assert.deepEqual(await readUlcLinzM5SecurityLogRetentionRunEvidence(options(fetchImpl, () => { throw new Error("clock"); })), {});
});
