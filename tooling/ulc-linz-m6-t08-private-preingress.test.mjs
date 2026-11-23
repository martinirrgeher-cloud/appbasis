import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertT08SyntheticBaseline } from "../apps/ulc-linz/tooling/t08-private-preingress-auth-smoke.mjs";

const RUNNER = new URL("../apps/ulc-linz/tooling/t08-private-preingress-auth-smoke.mjs", import.meta.url);
const WORKFLOW = new URL("../.github/workflows/m6-ulc-private-preingress-documentation-auth-smoke.yml", import.meta.url);
const COMPOSITION = new URL("../.github/workflows/m6-ulc-production-composition-gate.yml", import.meta.url);

const valid = Object.freeze({
  organization_id: "ulc-linz-m6-smoke",
  source_role: "trainer",
  active: true,
  banned: false,
  role_count: 1,
  trainer_role_count: 1,
  revoke_count: 2,
  grant_count: 0,
  active_session_count: 0,
  docs_count: 0,
  plans_count: 0,
  athletes_count: 0,
});

test("T08 only borrows a single existing inactive-session synthetic trainer in an empty private org", () => {
  assert.doesNotThrow(() => assertT08SyntheticBaseline([{ ...valid }]));
  assert.throws(() => assertT08SyntheticBaseline([]), /exactly once/);
  assert.throws(() => assertT08SyntheticBaseline([valid, valid]), /exactly once/);
  for (const [key,value] of Object.entries({
    organization_id: "ulc-linz",
    source_role: "admin",
    active: false,
    banned: true,
    role_count: 2,
    trainer_role_count: 0,
    revoke_count: 1,
    grant_count: 1,
    active_session_count: 1,
    docs_count: 1,
    plans_count: 1,
    athletes_count: 1,
  })) {
    assert.throws(() => assertT08SyntheticBaseline([{ ...valid, [key]:value }]),
      /not isolated/, "fail closed on " + key);
  }
});

test("T08 runner never persists a synthetic training document or weakens the real app guard", async () => {
  const source = await readFile(RUNNER,"utf8");
  for (const marker of [
    'const USERNAME = "ulc.m6.smoke"',
    'const ORG = "ulc-linz-m6-smoke"',
    'parsed.user !== "ulc_linz_application"',
    'active_session_count',
    'await inspect(connection.client);',
    'await armCleanup(env);',
    'await requireArmedCleanup(env);',
    'export async function inspectT08SyntheticDocumentationAccess',
    'await setTemporaryDocumentationAccess(connection.client);',
    'await restoreDocumentationDenials(connection.client);',
    'DELETE FROM session WHERE user_id=$1 AND expires_at > now()',
    'expectStatus(absence,404,"authorized-post-without-side-effects")',
    'expectStatus(await request("/api/modules/training-documentation",token,{cookie}),403',
    'expectStatus(await request("/api/auth/session",token,{cookie}),401',
    'persistentDocWriteVerified:false',
    'export async function cleanupT08SyntheticDocumentationAccess',
  ]) {
    assert.ok(source.includes(marker),"Missing T08 fail-closed contract: "+marker);
  }
  for (const forbidden of [
    "UPDATE appbasis_training_documentation",
    "DELETE FROM appbasis_training_documentation",
    "CREATE ROLE",
    "DROP TABLE",
    "ALTER ROLE",
    "INSERT INTO appbasis_athlete",
    "INSERT INTO appbasis_training_plan",
    "UPDATE ulc_linz_membership",
  ]) assert.equal(source.includes(forbidden),false,"T08 may not mutate "+forbidden);
});

test("T08 private workflow only runs on fresh confirmed main, limits transient routes and cleans rights on failure", async () => {
  const s=await readFile(WORKFLOW,"utf8");
  for(const marker of [
    "workflow_dispatch:",
    "RUN-ULC-T08-PRIVATE-AUTH-SMOKE",
    "test \"$GITHUB_RUN_ATTEMPT\" = 1",
    "test \"$GITHUB_REF\" = refs/heads/main",
    "environment: m4-dr",
    "group: m6-ulc-production-runtime-config",
    "ulc-linz-m6-production-hyperdrive.mjs resolve",
    "ulc-linz-m6-private-runtime-refresh.mjs state",
    "createProtectedUlcProductionWorker",
    "GET /api/modules/training-documentation",
    "POST /api/modules/training-documentation/start",
    "x-appbasis-t08-smoke-token",
    "wrangler dev --remote",
    "if: always() && steps.isolated.outcome == 'success'",
    'T08_CLEANUP_ARMED_FILE="$RUNNER_TEMP/t08-cleanup-armed"',
    't08-private-preingress-auth-smoke.mjs preflight',
    'AUTH_SECRET_FINGERPRINT',
    'Derive existing deployed private auth-secret HMAC fingerprint',
    "t08-private-preingress-auth-smoke.mjs cleanup",
    "persisted documentation POST/GET: NOT TESTED",
    "final production composition",
  ]){
    assert.ok(s.includes(marker),"Missing private T08 workflow guard: "+marker);
  }
  for(const forbidden of [
    "wrangler deploy",
    "wrangler versions upload",
    "wrangler publish",
    "ACTIVATE-ULC-M6-PILOT-INGRESS",
    "productionReleaseAuthorized: true",
    "UPDATE apps/ulc-linz/appbasis.production.json",
  ]) {
    assert.equal(s.includes(forbidden),false,"Private T08 workflow contains forbidden production action: "+forbidden);
  }
});

test("existing M6 composition still requires full ready; new smoke is not a release shortcut", async () => {
  const s=await readFile(COMPOSITION,"utf8");
  assert.ok(s.includes("node ./tooling/production-contract.mjs ulc-linz --require-ready"));
  assert.ok(s.includes("productionReleaseAuthorized: false"));
  assert.ok(s.includes("value?.compositionReady !== true"));
});
