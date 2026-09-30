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
const isolatedName = "appbasis_preview_identity_shape_contract_e2e";

test("PostgreSQL catalog deparser matches the real identity v3 migration", {
  skip: !databaseUrl,
}, async () => {
  // Existing identity E2E fixtures may already have tables in DATABASE_URL.
  // Create an exclusive disposable database; never alter or drop the baseline.
  const administrator = createPostgresDatabase(databaseUrl);
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.pathname = `/${isolatedName}`;
  let isolatedDatabase;
  let ownsDatabase = false;
  try {
    const existing = await administrator.client.unsafe(
      "SELECT datname FROM pg_catalog.pg_database WHERE datname = $1",
      [isolatedName],
    );
    assert.equal(existing.length, 0, "Dedicated CI contract database must not preexist");
    await administrator.client.unsafe(`CREATE DATABASE ${isolatedName}`);
    ownsDatabase = true;
    isolatedDatabase = createPostgresDatabase(isolatedUrl.toString());
    await assert.rejects(
      isolatedDatabase.client.begin(async (transaction) => {
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
    if (isolatedDatabase !== undefined) await isolatedDatabase.client.end();
    try {
      if (ownsDatabase) {
        await administrator.client.unsafe(
          `DROP DATABASE ${isolatedName} WITH (FORCE)`,
        );
      }
    } finally {
      await administrator.client.end();
    }
  }
});
