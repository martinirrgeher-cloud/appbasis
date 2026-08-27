import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyRestoreCredentials } from "./ulc-linz-m5-restore-credential-preflight.mjs";

const RESTORE_HOST = "ep-restore.us-east-2.aws.neon.tech";
const RESTORE_DATABASE = "neondb";

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

function successfulFactory(opened) {
  return (value) => {
    const url = new URL(value);
    const username = decodeURIComponent(url.username);
    opened.push(username);
    return {
      client: {
        unsafe: async (query) => {
          assert.equal(query, "SELECT current_user AS current_user");
          return [{ current_user: username }];
        },
        end: async () => {},
      },
    };
  };
}

test("verifies all four distinct restore credentials before M5 work", async () => {
  const opened = [];
  const result = await verifyRestoreCredentials(env(), { databaseFactory: successfulFactory(opened) });
  assert.deepEqual(opened, ["owner", "application", "ingest", "reader"]);
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

test("fails before connecting when any restore credential has no password", async () => {
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

test("fails before connecting on endpoint drift or duplicate decoded principals", async () => {
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
      APPBASIS_M4_RESTORE_DATABASE_URL: credential("owner%40tenant", "owner-pass"),
      APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: credential("owner%40tenant", "read-pass"),
    }), { databaseFactory: factory }),
    /must use distinct principals/,
  );
});

test("fails closed before connecting for multi-host or non-canonical restore credentials", async () => {
  const unsafe = [
    credential("owner", "owner-pass", `${RESTORE_HOST},ep-other.us-east-2.aws.neon.tech`),
    credential("owner", "owner-pass", `${RESTORE_HOST}%2Cep-other.us-east-2.aws.neon.tech`),
    credential("owner", "owner-pass", "ep-restore-pooler.us-east-2.aws.neon.tech"),
    credential("owner", "owner-pass", "restore.example.test"),
  ];

  for (const restoreUrl of unsafe) {
    let opened = false;
    await assert.rejects(
      () => verifyRestoreCredentials(env({
        APPBASIS_M4_RESTORE_DATABASE_URL: restoreUrl,
      }), { databaseFactory: () => { opened = true; throw new Error("must not connect"); } }),
      /canonical|exactly one canonical database host|valid PostgreSQL URL/,
    );
    assert.equal(opened, false);
  }
});

test("reports all login failures without exposing credentials", async () => {
  const failing = new Set(["application", "reader"]);
  const factory = (value) => {
    const url = new URL(value);
    return {
      client: {
        unsafe: async () => {
          if (failing.has(url.username)) throw new Error(`password=${url.password}`);
          return [{ current_user: decodeURIComponent(url.username) }];
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
