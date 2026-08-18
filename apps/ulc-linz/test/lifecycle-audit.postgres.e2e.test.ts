import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { PostgresUlcLinzScopePersistence } from "../worker/scope-persistence";

const databaseUrl = process.env.DATABASE_URL;
const fixedNow = new Date("2026-08-18T10:30:00.000Z");
const organizationId = "ulc-linz";

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Linz lifecycle audit PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Linz lifecycle audit PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const databaseName = `appbasis_ulc_audit_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, databaseName);
    let isolated: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    beforeAll(async () => {
      await administrativeConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      isolated = createPostgresDatabase(isolatedDatabaseUrl);
      const migration = await readFile(
        new URL("../migrations/0000_ulc_linz_lifecycle_scope.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") await requiredConnection().client.unsafe(statement);
      }
    });

    afterAll(async () => {
      if (isolated !== null) {
        await isolated.client.end();
        isolated = null;
      }
      if (created) {
        await administrativeConnection.client.unsafe(
          `DROP DATABASE ${databaseName} WITH (FORCE)`,
        );
      }
      await administrativeConnection.client.end();
    });

    it("writes immutable exception/delete audit atomically and retains it for exactly 12 months", async () => {
      const connection = requiredConnection();
      const scopes = new PostgresUlcLinzScopePersistence(
        connection.client,
        () => fixedNow,
      );

      await connection.client.unsafe(
        `INSERT INTO ulc_linz_membership (
           identity_id, organization_id, subject_id, source_role, active, ended_at
         ) VALUES
           ('exception-target', $1, 'exception-subject', 'parent', false, '2025-07-18T10:30:00.000Z'),
           ('delete-target', $1, 'delete-subject', 'trainer', true, NULL)`,
        [organizationId],
      );
      await connection.client.unsafe(
        `INSERT INTO ulc_linz_subject_scope (
           identity_id, organization_id, subject_id, relation_type
         ) VALUES
           ('delete-target', $1, 'delete-subject', 'self'),
           ('manager-target', $1, 'delete-subject', 'managed')`,
        [organizationId],
      );

      const exception = await scopes.setRetentionException({
        identityId: "exception-target",
        organizationId,
        actor: "ulc-admin-principal",
        reason: "legal-hold",
        reviewAt: new Date("2026-10-18T10:30:00.000Z"),
      });
      expect(exception).toMatchObject({
        status: "exception",
        actor: "ulc-admin-principal",
        reason: "legal-hold",
        createdAt: fixedNow,
        reviewAt: new Date("2026-10-18T10:30:00.000Z"),
      });

      const deletion = await scopes.completeIdentityDeletion({
        identityId: "delete-target",
        actor: "ulc-admin-principal",
        reason: "manual-identity-deletion",
      });
      expect(deletion).toMatchObject({
        identityId: "delete-target",
        organizationId,
        subjectId: "delete-subject",
        sourceRole: "trainer",
        completedAt: fixedNow,
      });

      const auditRows = await connection.client.unsafe(
        `SELECT event_type, actor_principal_id, target_identity_id, organization_id,
                reason, review_at, created_at
         FROM ulc_linz_lifecycle_audit
         ORDER BY event_id ASC`,
      );
      expect(auditRows).toHaveLength(2);
      expect(auditRows[0]).toMatchObject({
        event_type: "retention.exception.set",
        actor_principal_id: "ulc-admin-principal",
        target_identity_id: "exception-target",
        organization_id: organizationId,
        reason: "legal-hold",
      });
      expect(new Date(String(auditRows[0]?.created_at)).toISOString()).toBe(
        fixedNow.toISOString(),
      );
      expect(new Date(String(auditRows[0]?.review_at)).toISOString()).toBe(
        "2026-10-18T10:30:00.000Z",
      );
      expect(auditRows[1]).toMatchObject({
        event_type: "identity.delete.completed",
        actor_principal_id: "ulc-admin-principal",
        target_identity_id: "delete-target",
        organization_id: organizationId,
        reason: "manual-identity-deletion",
        review_at: null,
      });

      const remaining = await connection.client.unsafe(
        `SELECT
           (SELECT count(*)::int FROM ulc_linz_membership WHERE identity_id = 'delete-target') AS membership_count,
           (SELECT count(*)::int FROM ulc_linz_subject_scope
              WHERE identity_id = 'delete-target'
                 OR (organization_id = $1 AND subject_id = 'delete-subject')) AS scope_count,
           (SELECT count(*)::int FROM ulc_linz_lifecycle_deletion WHERE identity_id = 'delete-target') AS marker_count`,
        [organizationId],
      );
      expect(remaining[0]).toEqual({
        membership_count: 0,
        scope_count: 0,
        marker_count: 1,
      });

      const exactAuditBoundary = new Date("2027-08-18T10:30:00.000Z");
      const atBoundary = new PostgresUlcLinzScopePersistence(
        connection.client,
        () => exactAuditBoundary,
      );
      await expect(atBoundary.purgeExpiredLifecycleAuditEvents()).resolves.toBe(0);

      const afterBoundary = new PostgresUlcLinzScopePersistence(
        connection.client,
        () => new Date(exactAuditBoundary.getTime() + 1),
      );
      await expect(afterBoundary.purgeExpiredLifecycleAuditEvents()).resolves.toBe(2);
      const auditCount = await connection.client.unsafe(
        `SELECT count(*)::int AS count FROM ulc_linz_lifecycle_audit`,
      );
      expect(auditCount[0]?.count).toBe(0);
    });

    function requiredConnection() {
      if (isolated === null) throw new Error("ULC lifecycle audit database is not ready.");
      return isolated;
    }
  });
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
