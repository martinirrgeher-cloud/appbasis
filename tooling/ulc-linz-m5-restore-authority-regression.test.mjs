import assert from "node:assert/strict";
import test from "node:test";

import {
  assertUlcLinzM5NeonBranchIsolationAttestation,
  verifyUlcLinzM5NeonBranchIsolation,
} from "./ulc-linz-m5-neon-branch-isolation.mjs";
import { verifyRestoreCredentials } from "./ulc-linz-m5-restore-credential-preflight.mjs";
import { parseUlcLinzM5RestoreDatabaseUrl } from "./ulc-linz-m5-restore-target.mjs";

const PRODUCTION_HOST = "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const RESTORE_HOST = "ep-restore.us-east-2.aws.neon.tech";
const SECOND_RESTORE_HOST = "ep-restore-reader.us-east-2.aws.neon.tech";
const DATABASE = "neondb";
const ORG_ID = "org-appbasis";

function credential(user, password, host = RESTORE_HOST) {
  return `postgresql://${user}:${password}@${host}/${DATABASE}?sslmode=require`;
}

const SOURCE = credential("ulc_linz_application", "source-pass", PRODUCTION_HOST);
const AMBIGUOUS_OWNER =
  `postgresql://neondb_owner:secret@${PRODUCTION_HOST},${RESTORE_HOST}@${RESTORE_HOST}/${DATABASE}?sslmode=require`;

function providerFetch({
  sourceBranch = "br-production",
  restoreBranch = "br-restore",
  secondRestoreBranch = restoreBranch,
  sourceProject = "project-production",
  restoreProject = "project-restore",
  missingHost = null,
  fail = false,
} = {}) {
  const projects = [...new Set([sourceProject, restoreProject])];
  return async (input) => {
    if (fail) return { ok: false, json: async () => ({}) };
    const url = new URL(input);
    if (url.pathname === "/api/v2/projects") {
      return {
        ok: true,
        json: async () => ({ projects: projects.map((id) => ({ id })), pagination: { next: null } }),
      };
    }
    const projectId = url.pathname.split("/")[4];
    if (url.pathname.endsWith("/endpoints")) {
      const endpoints = [];
      if (projectId === sourceProject && missingHost !== PRODUCTION_HOST) {
        endpoints.push({
          host: PRODUCTION_HOST,
          id: "ep-crimson-boat-b1aqfjwf",
          project_id: sourceProject,
          branch_id: sourceBranch,
          type: "read_write",
        });
      }
      if (projectId === restoreProject && missingHost !== RESTORE_HOST) {
        endpoints.push({
          host: RESTORE_HOST,
          id: "ep-restore",
          project_id: restoreProject,
          branch_id: restoreBranch,
          type: "read_write",
        });
      }
      if (projectId === restoreProject && missingHost !== SECOND_RESTORE_HOST) {
        endpoints.push({
          host: SECOND_RESTORE_HOST,
          id: "ep-restore-reader",
          project_id: restoreProject,
          branch_id: secondRestoreBranch,
          type: "read_write",
        });
      }
      return { ok: true, json: async () => ({ endpoints }) };
    }
    throw new Error(`unexpected provider URL ${url}`);
  };
}

test("rejects multiple raw user-info delimiters before any restore connection", () => {
  assert.throws(
    () => parseUlcLinzM5RestoreDatabaseUrl(AMBIGUOUS_OWNER),
    /exactly one canonical user-info delimiter/,
  );
});

test("four-principal restore preflight rejects ambiguous authority before connecting", async () => {
  let connectionAttempts = 0;
  await assert.rejects(
    () => verifyRestoreCredentials({
      APPBASIS_M4_RESTORE_DATABASE_URL: AMBIGUOUS_OWNER,
      APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL: credential("application", "app-pass"),
      APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL: credential("ingest", "ingest-pass"),
      APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: credential("reader", "read-pass"),
    }, {
      databaseFactory: () => {
        connectionAttempts += 1;
        throw new Error("must not connect");
      },
    }),
    /exactly one canonical user-info delimiter/,
  );
  assert.equal(connectionAttempts, 0);
});

test("encoded at-signs in principals remain valid canonical user-info", () => {
  const parsed = parseUlcLinzM5RestoreDatabaseUrl(
    credential("owner%40tenant", "owner-pass"),
  );
  assert.equal(decodeURIComponent(parsed.username), "owner@tenant");
  assert.equal(parsed.hostname, RESTORE_HOST);
});

test("provider isolation rejects a different compute endpoint on the production Neon branch", async () => {
  await assert.rejects(
    () => verifyUlcLinzM5NeonBranchIsolation({
      sourceUrl: SOURCE,
      restoreUrls: [credential("owner", "owner-pass")],
      apiKey: "test-key",
      orgId: ORG_ID,
      fetchImpl: providerFetch({
        sourceProject: "project-shared",
        restoreProject: "project-shared",
        sourceBranch: "br-production",
        restoreBranch: "br-production",
      }),
    }),
    /different Neon branch from production/,
  );
});

test("provider isolation accepts same project only when restore branch is different", async () => {
  const proof = await verifyUlcLinzM5NeonBranchIsolation({
    sourceUrl: SOURCE,
    restoreUrls: [
      credential("owner", "owner-pass"),
      credential("application", "app-pass"),
      credential("ingest", "ingest-pass"),
      credential("reader", "read-pass"),
    ],
    apiKey: "test-key",
    orgId: ORG_ID,
    fetchImpl: providerFetch({
      sourceProject: "project-shared",
      restoreProject: "project-shared",
      sourceBranch: "br-production",
      restoreBranch: "br-restore",
    }),
  });
  assert.equal(proof.source.projectId, "project-shared");
  assert.equal(proof.source.branchId, "br-production");
  assert.equal(proof.restore.projectId, "project-shared");
  assert.equal(proof.restore.branchId, "br-restore");
  assert.equal(proof.restoreCredentialCount, 4);
});

test("provider isolation binds every restore credential to one provider branch", async () => {
  await assert.rejects(
    () => verifyUlcLinzM5NeonBranchIsolation({
      sourceUrl: SOURCE,
      restoreUrls: [
        credential("owner", "owner-pass"),
        credential("reader", "read-pass", SECOND_RESTORE_HOST),
      ],
      apiKey: "test-key",
      orgId: ORG_ID,
      fetchImpl: providerFetch({ secondRestoreBranch: "br-other-restore" }),
    }),
    /same Neon project, branch and database/,
  );
});

test("provider isolation fails closed when endpoint lookup is missing or provider API fails", async () => {
  for (const fetchImpl of [
    providerFetch({ missingHost: RESTORE_HOST }),
    providerFetch({ fail: true }),
  ]) {
    await assert.rejects(
      () => verifyUlcLinzM5NeonBranchIsolation({
        sourceUrl: SOURCE,
        restoreUrls: [credential("owner", "owner-pass")],
        apiKey: "test-key",
        orgId: ORG_ID,
        fetchImpl,
      }),
      /exactly one Neon provider identity|lookup was refused or failed/,
    );
  }
});

test("cross-step attestation is bound to source and restore endpoint ids and rejects same branch", () => {
  const env = {
    APPBASIS_M5_NEON_SOURCE_PROJECT_ID: "project-shared",
    APPBASIS_M5_NEON_SOURCE_BRANCH_ID: "br-production",
    APPBASIS_M5_NEON_SOURCE_ENDPOINT_ID: "ep-crimson-boat-b1aqfjwf",
    APPBASIS_M5_NEON_RESTORE_PROJECT_ID: "project-shared",
    APPBASIS_M5_NEON_RESTORE_BRANCH_ID: "br-restore",
    APPBASIS_M5_NEON_RESTORE_ENDPOINT_ID: "ep-restore",
  };
  const proof = assertUlcLinzM5NeonBranchIsolationAttestation({
    sourceUrl: SOURCE,
    restoreUrl: credential("owner", "owner-pass"),
    env,
  });
  assert.equal(proof.restore.branchId, "br-restore");

  assert.throws(
    () => assertUlcLinzM5NeonBranchIsolationAttestation({
      sourceUrl: SOURCE,
      restoreUrl: credential("owner", "owner-pass"),
      env: { ...env, APPBASIS_M5_NEON_RESTORE_BRANCH_ID: "br-production" },
    }),
    /resolves restore to the production branch/,
  );
  assert.throws(
    () => assertUlcLinzM5NeonBranchIsolationAttestation({
      sourceUrl: SOURCE,
      restoreUrl: credential("owner", "owner-pass", SECOND_RESTORE_HOST),
      env,
    }),
    /does not match the active database endpoints/,
  );
});
