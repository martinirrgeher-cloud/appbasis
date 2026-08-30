import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyRestoreCredentials } from "./ulc-linz-m5-restore-credential-preflight.mjs";

const RESTORE_HOST = "ep-restore.us-east-2.aws.neon.tech";
const RESTORE_DATABASE = "neondb";
const IDENTITY_QUERY = "SELECT current_database() AS current_database, current_user AS current_user";

function credential(user, password, host = RESTORE_HOST) {
  return `postgresql://${user}:${password}@${host}/${RESTORE_DATABASE}?sslmode=require`;
}

function env(overrides = {}) {
  return {
    APPBASIS_M4_RESTORE_DATABASE_URL: credential("owner", "owner-pass"),
    APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL: credential("application", "app-pass"),
    APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL: credential("ingest", "ingest-pass"),
    APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: credential("reader", "read-pass"),
    ...overrides,
  };
}

function successfulFactory(opened, overrides = {}) {
  return (value) => {
    const url = new URL(value);
    const username = decodeURIComponent(url.username);
    opened.push(username);
    return {
      client: {
        unsafe: async (query) => {
          assert.equal(query, IDENTITY_QUERY);
          return [{
            current_user: overrides.currentUser ?? username,
            current_database: overrides.currentDatabase ?? RESTORE_DATABASE,
          }];
        },
        end: async () => {},
      },
    };
  };
}

test("verifies all four distinct restore credentials against effective database and principal", async () => {
  const opened = [];
  const result = await verifyRestoreCredentials(env(), { databaseFactory: successfulFactory(opened) });
  assert.deepEqual(opened, ["owner", "application", "ingest", "reader"]);
  assert.deepEqual(result, { restoreCredentialPreflightVerified: true });
});

test("accepts the production application role name on a distinct isolated restore endpoint", async () => {
  const opened = [];
  const result = await verifyRestoreCredentials(env({
    APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL: credential("ulc_linz_application", "app-pass"),
  }), { databaseFactory: successfulFactory(opened) });
  assert.deepEqual(opened, ["owner", "ulc_linz_application", "ingest", "reader"]);
  assert.deepEqual(result, { restoreCredentialPreflightVerified: true });
});

test("accepts URL-encoded PostgreSQL principals and compares decoded current_user", async () => {
  const opened = [];
  const result = await verifyRestoreCredentials(env({
    APPBASIS_M4_RESTORE_DATABASE_URL: credential("owner%40tenant", "owner-pass"),
  }), { databaseFactory: successfulFactory(opened) });
  assert.equal(opened[0], "owner@tenant");
  assert.deepEqual(result, { restoreCredentialPreflightVerified: true });
});

test("fails before connecting when any restore credential is incomplete", async () => {
  let opened = false;
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL:
        `postgresql://application@${RESTORE_HOST}/${RESTORE_DATABASE}?sslmode=require`,
    }), { databaseFactory: () => { opened = true; throw new Error("must not connect"); } }),
    /application credential must include host, database, username and password/,
  );
  assert.equal(opened, false);
});

test("fails before connecting on endpoint drift, duplicate principals or query identity overrides", async () => {
  const factory = () => { throw new Error("must not connect"); };
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL:
        credential("reader", "read-pass", "ep-other.us-east-2.aws.neon.tech"),
    }), { databaseFactory: factory }),
    /exact same isolated restore database/,
  );
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: credential("application", "read-pass"),
    }), { databaseFactory: factory }),
    /must use distinct principals/,
  );
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_DATABASE_URL: `${credential("owner", "owner-pass")}&database=production`,
    }), { databaseFactory: factory }),
    /override connection identity/,
  );
});

test("fails closed before connecting for ambiguous or non-canonical restore credentials", async () => {
  const unsafe = [
    credential("owner", "owner-pass", `${RESTORE_HOST},ep-other.us-east-2.aws.neon.tech`),
    credential("owner", "owner-pass", `${RESTORE_HOST}%2Cep-other.us-east-2.aws.neon.tech`),
    credential("owner", "owner-pass", "ep-restore-pooler.us-east-2.aws.neon.tech"),
    credential("owner", "owner-pass", "restore.example.test"),
    `postgresql://owner:owner-pass@ep-prod.us-east-2.aws.neon.tech,${RESTORE_HOST}@${RESTORE_HOST}/${RESTORE_DATABASE}?sslmode=require`,
    `${credential("owner", "owner-pass")}&options=-csearch_path%3Dpublic`,
  ];

  for (const restoreUrl of unsafe) {
    let opened = false;
    await assert.rejects(
      () => verifyRestoreCredentials(env({ APPBASIS_M4_RESTORE_DATABASE_URL: restoreUrl }), {
        databaseFactory: () => { opened = true; throw new Error("must not connect"); },
      }),
    );
    assert.equal(opened, false);
  }
});

test("fails all four-principal preflight on effective database or principal mismatch", async () => {
  for (const overrides of [
    { currentDatabase: "production" },
    { currentUser: "unexpected" },
  ]) {
    await assert.rejects(
      () => verifyRestoreCredentials(env(), { databaseFactory: successfulFactory([], overrides) }),
      /effective database identity mismatch/,
    );
  }
});

test("reports login failures without exposing credentials", async () => {
  const failing = new Set(["application", "reader"]);
  const factory = (value) => {
    const url = new URL(value);
    return {
      client: {
        unsafe: async () => {
          if (failing.has(url.username)) throw new Error(`password=${url.password}`);
          return [{ current_user: decodeURIComponent(url.username), current_database: RESTORE_DATABASE }];
        },
        end: async () => {},
      },
    };
  };
  await assert.rejects(
    () => verifyRestoreCredentials(env(), { databaseFactory: factory }),
    (error) => {
      assert.match(error.message, /application: login failed/);
      assert.match(error.message, /security-log-read: login failed/);
      assert.doesNotMatch(error.message, /app-pass|read-pass|password=/);
      return true;
    },
  );
});

test("production evidence enforces restore credential preflight before workspace and snapshot work", async () => {
  const workflow = await readFile(new URL("../.github/workflows/m5-ulc-production-evidence.yml", import.meta.url), "utf8");
  const preflightIndex = workflow.indexOf("node ./tooling/ulc-linz-m5-restore-credential-preflight.mjs");
  const workspaceIndex = workflow.indexOf("Create restricted temporary evidence workspace");
  const snapshotIndex = workflow.indexOf("Capture one exported source snapshot and create authorized backup");
  assert.notEqual(preflightIndex, -1);
  assert.ok(preflightIndex < workspaceIndex);
  assert.ok(preflightIndex < snapshotIndex);
});
