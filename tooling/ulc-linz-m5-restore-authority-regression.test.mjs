import assert from "node:assert/strict";
import test from "node:test";

import { verifyRestoreCredentials } from "./ulc-linz-m5-restore-credential-preflight.mjs";
import { parseUlcLinzM5RestoreDatabaseUrl } from "./ulc-linz-m5-restore-target.mjs";

const PRODUCTION_HOST = "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech";
const RESTORE_HOST = "ep-restore.us-east-2.aws.neon.tech";
const DATABASE = "neondb";

function credential(user, password, host = RESTORE_HOST) {
  return `postgresql://${user}:${password}@${host}/${DATABASE}?sslmode=require`;
}

const AMBIGUOUS_OWNER =
  `postgresql://neondb_owner:secret@${PRODUCTION_HOST},${RESTORE_HOST}@${RESTORE_HOST}/${DATABASE}?sslmode=require`;

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
