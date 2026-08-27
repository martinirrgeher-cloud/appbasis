import assert from "node:assert/strict";
import test from "node:test";

import { verifyRestoreCredentials } from "./ulc-linz-m5-restore-credential-preflight.mjs";

function env(overrides = {}) {
  return {
    APPBASIS_M4_RESTORE_DATABASE_URL: "postgresql://owner:owner-pass@restore.example/db",
    APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL: "postgresql://application:app-pass@restore.example/db",
    APPBASIS_M4_RESTORE_SECURITY_LOG_INGEST_DATABASE_URL: "postgresql://ingest:ingest-pass@restore.example/db",
    APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: "postgresql://reader:read-pass@restore.example/db",
    ...overrides,
  };
}

function successfulFactory(opened) {
  return (value) => {
    const url = new URL(value);
    opened.push(url.username);
    return {
      client: {
        unsafe: async (query) => {
          assert.equal(query, "SELECT current_user AS current_user");
          return [{ current_user: url.username }];
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

test("fails before connecting when any restore credential has no password", async () => {
  let opened = false;
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_APPLICATION_DATABASE_URL: "postgresql://application@restore.example/db",
    }), { databaseFactory: () => { opened = true; throw new Error("must not connect"); } }),
    /application credential must include host, database, username and password/,
  );
  assert.equal(opened, false);
});

test("fails before connecting on endpoint drift or duplicate principals", async () => {
  const factory = () => { throw new Error("must not connect"); };
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: "postgresql://reader:read-pass@other.example/db",
    }), { databaseFactory: factory }),
    /exact same isolated restore database/,
  );
  await assert.rejects(
    () => verifyRestoreCredentials(env({
      APPBASIS_M4_RESTORE_SECURITY_LOG_READ_DATABASE_URL: "postgresql://application:read-pass@restore.example/db",
    }), { databaseFactory: factory }),
    /must use distinct principals/,
  );
});

test("reports all login failures without exposing credentials", async () => {
  const failing = new Set(["application", "reader"]);
  const factory = (value) => {
    const url = new URL(value);
    return {
      client: {
        unsafe: async () => {
          if (failing.has(url.username)) throw new Error(`password=${url.password}`);
          return [{ current_user: url.username }];
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
