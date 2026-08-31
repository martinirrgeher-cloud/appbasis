import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  runControlledUlcLinzM5SecurityLogRetention,
  ULC_LINZ_M5_RETENTION_FAILURE_PHASES,
} from "./ulc-linz-m5-security-log-retention-controlled-run.mjs";

const PRODUCTION_HOST = "ep-crimson-boat-b1aqfjwf.c-5.eu-central-1.aws.neon.tech:5432/neondb";
const CLEANUP_URL = `postgresql://cleanup:secret@${PRODUCTION_HOST}?sslmode=require`;
const BACKUP_URL = `postgresql://backup:sanitized@${PRODUCTION_HOST}?sslmode=require`;
const CUTOFF = "2026-08-31T18:00:00.000Z";

const VALID_ACCESS = Object.freeze({
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

const VALID_CREATOR_BACK_REFERENCE = Object.freeze({
  reverse_membership_count: 0,
  safe_creator_back_reference_count: 0,
  unsafe_reverse_membership_count: 0,
  database_record_count: 1,
});

function database({
  access = VALID_ACCESS,
  creatorBackReference = VALID_CREATOR_BACK_REFERENCE,
  expiredRows = "0",
  accessError,
  creatorBackReferenceError,
  verifyError,
  closeError,
} = {}) {
  const client = function postgresJsClientShape() {};
  client.unsafe = async (query) => {
    if (query.includes("WITH protected_acl AS")) {
      if (accessError) throw accessError;
      return [structuredClone(access)];
    }
    if (query.includes("cleanup_role.rolname = current_user")) {
      if (creatorBackReferenceError) throw creatorBackReferenceError;
      return [structuredClone(creatorBackReference)];
    }
    if (query.includes("COUNT(retained_until)")) {
      if (verifyError) throw verifyError;
      return [{ expired_rows: expiredRows }];
    }
    throw new Error("unexpected controlled retention test query");
  };
  client.end = async () => {
    if (closeError) throw closeError;
  };
  return { client };
}

async function capturePhase(overrides = {}) {
  let phase;
  await assert.rejects(() => runControlledUlcLinzM5SecurityLogRetention({
    databaseUrl: CLEANUP_URL,
    backupDatabaseUrl: BACKUP_URL,
    createPostgresDatabase: () => database(overrides.database),
    purgeExpiredSecurityEvents: overrides.purge ?? (async () => ({ cutoff: CUTOFF, deletedRows: "0" })),
    onPhase: (value) => { phase = value; },
    ...overrides.options,
  }));
  return phase;
}

test("controlled retention runner exposes only the bounded failure phases", () => {
  assert.deepEqual(ULC_LINZ_M5_RETENTION_FAILURE_PHASES, [
    "database-binding",
    "database-client-import",
    "database-client-create",
    "cleanup-principal",
    "purge-execution",
    "post-verification",
    "database-client-close",
  ]);
  assert.equal(Object.isFrozen(ULC_LINZ_M5_RETENTION_FAILURE_PHASES), true);
});

test("controlled retention runner classifies binding, principal, purge and post-verification failures", async () => {
  let bindingPhase;
  await assert.rejects(() => runControlledUlcLinzM5SecurityLogRetention({
    databaseUrl: CLEANUP_URL,
    backupDatabaseUrl: CLEANUP_URL,
    createPostgresDatabase: () => database(),
    purgeExpiredSecurityEvents: async () => ({ cutoff: CUTOFF, deletedRows: "0" }),
    onPhase: (value) => { bindingPhase = value; },
  }));
  assert.equal(bindingPhase, "database-binding");

  assert.equal(await capturePhase({ database: { accessError: new Error("postgres://secret-leak") } }), "cleanup-principal");
  assert.equal(await capturePhase({ database: { creatorBackReferenceError: new Error("postgres://secret-leak") } }), "cleanup-principal");
  assert.equal(await capturePhase({ purge: async () => { throw new Error("postgres://secret-leak"); } }), "purge-execution");
  assert.equal(await capturePhase({ database: { verifyError: new Error("postgres://secret-leak") } }), "post-verification");
});

test("controlled retention runner accepts only the database-owner creator back-reference", async () => {
  const safeAccess = { ...structuredClone(VALID_ACCESS), reverse_membership_count: 1 };
  const safeCreatorBackReference = {
    reverse_membership_count: 1,
    safe_creator_back_reference_count: 1,
    unsafe_reverse_membership_count: 0,
    database_record_count: 1,
  };
  const result = await runControlledUlcLinzM5SecurityLogRetention({
    databaseUrl: CLEANUP_URL,
    backupDatabaseUrl: BACKUP_URL,
    createPostgresDatabase: () => database({
      access: safeAccess,
      creatorBackReference: safeCreatorBackReference,
    }),
    purgeExpiredSecurityEvents: async () => ({ cutoff: CUTOFF, deletedRows: "0" }),
  });
  assert.equal(result.cleanupAccessVerified, true);

  for (const creatorBackReference of [
    { ...safeCreatorBackReference, safe_creator_back_reference_count: 0, unsafe_reverse_membership_count: 1 },
    { ...safeCreatorBackReference, reverse_membership_count: 2 },
    { ...safeCreatorBackReference, safe_creator_back_reference_count: 2, reverse_membership_count: 2 },
    { ...safeCreatorBackReference, database_record_count: 0 },
  ]) {
    await assert.rejects(() => runControlledUlcLinzM5SecurityLogRetention({
      databaseUrl: CLEANUP_URL,
      backupDatabaseUrl: BACKUP_URL,
      createPostgresDatabase: () => database({
        access: safeAccess,
        creatorBackReference,
      }),
      purgeExpiredSecurityEvents: async () => ({ cutoff: CUTOFF, deletedRows: "0" }),
    }), /creator back-reference/);
  }
});

test("controlled retention runner rejects access/back-reference observation drift", async () => {
  await assert.rejects(() => runControlledUlcLinzM5SecurityLogRetention({
    databaseUrl: CLEANUP_URL,
    backupDatabaseUrl: BACKUP_URL,
    createPostgresDatabase: () => database({
      access: VALID_ACCESS,
      creatorBackReference: {
        reverse_membership_count: 1,
        safe_creator_back_reference_count: 1,
        unsafe_reverse_membership_count: 0,
        database_record_count: 1,
      },
    }),
    purgeExpiredSecurityEvents: async () => ({ cutoff: CUTOFF, deletedRows: "0" }),
  }), /changed during access verification/);
});

test("controlled retention runner classifies close failure only after successful verification", async () => {
  assert.equal(await capturePhase({ database: { closeError: new Error("postgres://secret-leak") } }), "database-client-close");
});

test("controlled retention runner preserves successful evidence and closes the client", async () => {
  let closed = false;
  let phase;
  const connection = database();
  connection.client.end = async () => { closed = true; };
  const result = await runControlledUlcLinzM5SecurityLogRetention({
    databaseUrl: CLEANUP_URL,
    backupDatabaseUrl: BACKUP_URL,
    createPostgresDatabase: () => connection,
    purgeExpiredSecurityEvents: async () => ({ cutoff: CUTOFF, deletedRows: "0" }),
    onPhase: (value) => { phase = value; },
  });

  assert.equal(result.cleanupAccessVerified, true);
  assert.equal(result.cleanupSucceeded, true);
  assert.equal(result.cleanupResultVerified, true);
  assert.equal(result.productionReleaseAuthorized, false);
  assert.equal(closed, true);
  assert.equal(phase, "database-client-close");
});

test("CLI emits a fixed phase only and never forwards caught error text", async () => {
  const source = await readFile(new URL("./ulc-linz-m5-security-log-retention-controlled-run.mjs", import.meta.url), "utf8");
  assert.match(source, /production retention cleanup failed at phase \$\{failurePhase\}/);
  assert.doesNotMatch(source, /error\.message|cause\.message|console\.error\([^)]*error/);
  assert.match(source, /failurePhase = "database-client-import"/);
  assert.match(source, /ULC_LINZ_M5_RETENTION_FAILURE_PHASES\.includes\(phase\)/);
  assert.match(source, /cleanup_role\.rolname = current_user/);
  assert.match(source, /membership\.member = database_record\.datdba/);
  assert.match(source, /membership\.grantor_superuser = true/);
  assert.match(source, /membership\.admin_option = true/);
  assert.match(source, /membership\.inherit_option = false/);
  assert.match(source, /membership\.set_option = false/);
  assert.match(source, /unsafe_reverse_membership_count/);
});
