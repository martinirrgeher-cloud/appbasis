import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  prepareInertRestoreBackupAclPrincipal,
  verifyAndCleanupRestoredBackupAuditAcl,
} from "./ulc-linz-m5-restore-backup-acl.mjs";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  test("M5 restore backup ACL PostgreSQL regression requires DATABASE_URL", { skip: true }, () => {});
} else {
  test("PostgreSQL 18 creator back-reference is accepted only in the exact inert form", async () => {
    const context = await createContext();
    try {
      const first = await prepareInertRestoreBackupAclPrincipal(context.input);
      assert.deepEqual(first, { role: context.backupRole, created: true });

      const roleRows = await context.superDatabase.client.unsafe(`
        SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolreplication, rolbypassrls
        FROM pg_catalog.pg_roles WHERE rolname = '${context.backupRole}'
      `);
      assert.deepEqual([...roleRows], [{
        rolcanlogin: false,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
      }]);

      const memberships = await context.superDatabase.client.unsafe(`
        SELECT granted.rolname AS granted_role, member.rolname AS member_name,
               grantor.rolsuper AS grantor_superuser, membership.admin_option,
               membership.inherit_option, membership.set_option
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles member ON member.oid = membership.member
        JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
        WHERE granted.rolname = '${context.backupRole}' OR member.rolname = '${context.backupRole}'
      `);
      assert.deepEqual([...memberships], [{
        granted_role: context.backupRole,
        member_name: context.ownerRole,
        grantor_superuser: true,
        admin_option: true,
        inherit_option: false,
        set_option: false,
      }]);

      const second = await prepareInertRestoreBackupAclPrincipal(context.input);
      assert.deepEqual(second, { role: context.backupRole, created: false });
    } finally {
      await context.cleanup();
    }
  });

  test("unsafe existing backup roles, ownership and unexpected memberships fail closed", async () => {
    const elevated = await createContext();
    try {
      await elevated.superDatabase.client.unsafe(`CREATE ROLE ${elevated.backupRole} LOGIN NOINHERIT`);
      await assert.rejects(
        () => prepareInertRestoreBackupAclPrincipal(elevated.input),
        /missing or unsafe/,
      );
    } finally {
      await elevated.cleanup();
    }

    const ownership = await createContext();
    try {
      await ownership.superDatabase.client.unsafe(`CREATE ROLE ${ownership.backupRole} NOLOGIN NOINHERIT`);
      await ownership.superDatabase.client.unsafe(`ALTER SCHEMA ${ownership.schema} OWNER TO ${ownership.backupRole}`);
      await assert.rejects(
        () => prepareInertRestoreBackupAclPrincipal(ownership.input),
        /missing or unsafe/,
      );
    } finally {
      await ownership.cleanup();
    }

    const membership = await createContext();
    try {
      await prepareInertRestoreBackupAclPrincipal(membership.input);
      await membership.superDatabase.client.unsafe(`CREATE ROLE ${membership.extraRole} NOLOGIN NOINHERIT`);
      await membership.superDatabase.client.unsafe(`GRANT ${membership.backupRole} TO ${membership.extraRole}`);
      await assert.rejects(
        () => prepareInertRestoreBackupAclPrincipal(membership.input),
        /missing or unsafe/,
      );
    } finally {
      await membership.cleanup();
    }
  });

  test("restored table and sequence read ACLs are verified exactly and cleaned atomically", async () => {
    const context = await createContext();
    try {
      await prepareInertRestoreBackupAclPrincipal(context.input);
      const ownerDatabase = createPostgresDatabase(context.ownerDatabaseUrl);
      try {
        await ownerDatabase.client.unsafe(`CREATE TABLE ${context.schema}.audit_log (id bigint PRIMARY KEY)`);
        await ownerDatabase.client.unsafe(`CREATE SEQUENCE ${context.schema}.audit_log_id_seq`);
        await ownerDatabase.client.unsafe(`GRANT SELECT ON TABLE ${context.schema}.audit_log TO ${context.backupRole}`);
        await ownerDatabase.client.unsafe(`GRANT SELECT ON SEQUENCE ${context.schema}.audit_log_id_seq TO ${context.backupRole}`);
      } finally {
        await ownerDatabase.client.end().catch(() => {});
      }

      const result = await verifyAndCleanupRestoredBackupAuditAcl({
        ...context.input,
        auditTable: `${context.schema}.audit_log`,
        auditSequence: `${context.schema}.audit_log_id_seq`,
      });
      assert.deepEqual(result, { role: context.backupRole, verified: true, cleaned: true });

      const [after] = await context.superDatabase.client.unsafe(`
        SELECT
          pg_catalog.has_table_privilege('${context.backupRole}', '${context.schema}.audit_log', 'SELECT') AS table_select,
          pg_catalog.has_sequence_privilege('${context.backupRole}', '${context.schema}.audit_log_id_seq', 'SELECT') AS sequence_select
      `);
      assert.deepEqual(after, { table_select: false, sequence_select: false });

      const ownerDatabase2 = createPostgresDatabase(context.ownerDatabaseUrl);
      try {
        await ownerDatabase2.client.unsafe(`GRANT SELECT ON TABLE ${context.schema}.audit_log TO ${context.backupRole}`);
        await ownerDatabase2.client.unsafe(`GRANT SELECT, USAGE ON SEQUENCE ${context.schema}.audit_log_id_seq TO ${context.backupRole}`);
      } finally {
        await ownerDatabase2.client.end().catch(() => {});
      }

      await assert.rejects(
        () => verifyAndCleanupRestoredBackupAuditAcl({
          ...context.input,
          auditTable: `${context.schema}.audit_log`,
          auditSequence: `${context.schema}.audit_log_id_seq`,
        }),
        /missing or unsafe/,
      );
      const [failedClosed] = await context.superDatabase.client.unsafe(`
        SELECT
          pg_catalog.has_table_privilege('${context.backupRole}', '${context.schema}.audit_log', 'SELECT') AS table_select,
          pg_catalog.has_sequence_privilege('${context.backupRole}', '${context.schema}.audit_log_id_seq', 'SELECT') AS sequence_select,
          pg_catalog.has_sequence_privilege('${context.backupRole}', '${context.schema}.audit_log_id_seq', 'USAGE') AS sequence_usage
      `);
      assert.deepEqual(failedClosed, { table_select: true, sequence_select: true, sequence_usage: true });
    } finally {
      await context.cleanup();
    }
  });
}

async function createContext() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const ownerRole = `m5_owner_${suffix}`;
  const backupRole = `m5_backup_${suffix}`;
  const extraRole = `m5_extra_${suffix}`;
  const schema = `m5_restore_${suffix}`;
  const password = `M5_${suffix}_p9`;
  const superDatabase = createPostgresDatabase(databaseUrl);

  await superDatabase.client.unsafe(`CREATE ROLE ${ownerRole} LOGIN PASSWORD '${password}' CREATEROLE NOINHERIT`);
  await superDatabase.client.unsafe(`CREATE SCHEMA ${schema} AUTHORIZATION ${ownerRole}`);

  const ownerUrl = new URL(databaseUrl);
  ownerUrl.username = ownerRole;
  ownerUrl.password = password;
  const backupUrl = new URL(ownerUrl);
  backupUrl.username = backupRole;
  backupUrl.password = "unused";

  return {
    ownerRole,
    backupRole,
    extraRole,
    schema,
    ownerDatabaseUrl: ownerUrl.toString(),
    superDatabase,
    input: {
      restoreDatabaseUrl: ownerUrl.toString(),
      backupDatabaseUrl: backupUrl.toString(),
    },
    async cleanup() {
      await superDatabase.client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
      await superDatabase.client.unsafe(`DROP ROLE IF EXISTS ${backupRole}`).catch(() => {});
      await superDatabase.client.unsafe(`DROP ROLE IF EXISTS ${extraRole}`).catch(() => {});
      await superDatabase.client.unsafe(`DROP ROLE IF EXISTS ${ownerRole}`).catch(() => {});
      await superDatabase.client.end().catch(() => {});
    },
  };
}
