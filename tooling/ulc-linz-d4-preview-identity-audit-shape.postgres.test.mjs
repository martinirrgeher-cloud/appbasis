import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPostgresDatabase } from "../packages/database/src/node-runtime.mjs";
import {
  isCanonicalUlcPreviewIdentityAuditShape,
  readUlcPreviewIdentityAuditShape,
} from "./ulc-linz-d4-preview-identity-audit-shape.mjs";

class ExpectedTestRollback extends Error {}

const databaseUrl = process.env.DATABASE_URL;

test("PostgreSQL catalog deparser matches the real identity v3 migration", {
  skip: !databaseUrl,
}, async () => {
  const database = createPostgresDatabase(databaseUrl);
  try {
    await assert.rejects(
      database.client.begin(async (transaction) => {
        // This CI PostgreSQL service is disposable, and the transaction is
        // deliberately rolled back even when all assertions pass.
        const before = await transaction.unsafe(
          "SELECT pg_catalog.to_regclass('public.appbasis_identity_operation') AS existing",
        );
        assert.equal(before[0]?.existing, null);
        await transaction.unsafe(
          'CREATE TABLE public.appbasis_identity_operation ("kind" text NOT NULL)',
        );
        const sql = await readFile(
          new URL("../packages/identity/drizzle/0002_appbasis_identity_provisioning_audit.sql", import.meta.url),
          "utf8",
        );
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await transaction.unsafe(statement);
        }
        const canonical = await readUlcPreviewIdentityAuditShape(transaction);
        assert.equal(
          isCanonicalUlcPreviewIdentityAuditShape(canonical),
          true,
          JSON.stringify(canonical),
        );

        await transaction.unsafe(
          'ALTER TABLE public.appbasis_identity_operation ALTER COLUMN "reason" SET DEFAULT \'x\'',
        );
        const withDefault = await readUlcPreviewIdentityAuditShape(transaction);
        assert.equal(isCanonicalUlcPreviewIdentityAuditShape(withDefault), false);
        await transaction.unsafe(
          'ALTER TABLE public.appbasis_identity_operation ALTER COLUMN "reason" DROP DEFAULT',
        );
        await transaction.unsafe(
          'ALTER TABLE public.appbasis_identity_operation DROP CONSTRAINT "appbasis_identity_operation_provisioning_audit_shape_check"',
        );
        await transaction.unsafe(
          'ALTER TABLE public.appbasis_identity_operation ADD CONSTRAINT "appbasis_identity_operation_provisioning_audit_shape_check" CHECK ("kind" = \'provision\' AND "provisioning_owner" IS NOT NULL AND "actor_principal_id" IS NOT NULL AND "reason" IS NOT NULL)',
        );
        const drifted = await readUlcPreviewIdentityAuditShape(transaction);
        assert.equal(isCanonicalUlcPreviewIdentityAuditShape(drifted), false);
        throw new ExpectedTestRollback();
      }),
      ExpectedTestRollback,
    );
  } finally {
    await database.client.end();
  }
});
