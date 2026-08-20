import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import {
  PostgresUlcLinzScopePersistence,
  type UlcLinzLifecycleTarget,
} from "../worker/scope-persistence";

const databaseUrl = process.env.DATABASE_URL;
const fixedNow = new Date("2026-08-18T10:30:00.000Z");
const organizationId = "ulc-linz";

type DatabaseManifest = {
  owners: readonly {
    id: string;
    schemaVersion: number;
    migrations: readonly string[];
  }[];
};

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Linz retention deletion claim PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Linz retention deletion claim PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const databaseName = `appbasis_ulc_retention_claim_${suffix}`;
    const isolatedDatabaseUrl = databaseUrlForName(databaseUrl, databaseName);
    let databaseCreated = false;

    afterAll(async () => {
      if (databaseCreated) {
        await administrativeConnection.client.unsafe(
          `DROP DATABASE ${databaseName} WITH (FORCE)`,
        );
      }
      await administrativeConnection.client.end();
    });

    it("serializes a deletion claim and a retention exception on the same membership row", async () => {
      await administrativeConnection.client.unsafe(`CREATE DATABASE ${databaseName}`);
      databaseCreated = true;
      const first = createPostgresDatabase(isolatedDatabaseUrl);
      const second = createPostgresDatabase(isolatedDatabaseUrl);

      try {
        await applyUlcLifecycleMigrations(first.client);
        const firstScopes = new PostgresUlcLinzScopePersistence(first.client, () => fixedNow);
        const secondScopes = new PostgresUlcLinzScopePersistence(second.client, () => fixedNow);

        const claimFirst = target("claim-first");
        await insertDueMembership(first.client, claimFirst);
        await expect(firstScopes.claimDueRetentionDeletion(claimFirst)).resolves.toBeUndefined();
        await expect(
          secondScopes.setRetentionException({
            identityId: claimFirst.identityId,
            organizationId,
            actor: "ulc-admin",
            reason: "late-legal-hold",
            reviewAt: new Date("2026-10-18T10:30:00.000Z"),
          }),
        ).rejects.toMatchObject({ code: "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED" });
        await expectState(first.client, claimFirst.identityId, {
          claimed: true,
          exception: false,
        });

        const exceptionFirst = target("exception-first");
        await insertDueMembership(first.client, exceptionFirst);
        await expect(
          secondScopes.setRetentionException({
            identityId: exceptionFirst.identityId,
            organizationId,
            actor: "ulc-admin",
            reason: "legal-hold",
            reviewAt: new Date("2026-10-18T10:30:00.000Z"),
          }),
        ).resolves.toMatchObject({ status: "exception" });
        await expect(firstScopes.claimDueRetentionDeletion(exceptionFirst)).rejects.toMatchObject({
          code: "ULC_LINZ_SCOPE_PERSISTENCE_BLOCKED",
        });
        await expectState(first.client, exceptionFirst.identityId, {
          claimed: false,
          exception: true,
        });

        const concurrent = target("concurrent");
        await insertDueMembership(first.client, concurrent);
        const results = await Promise.allSettled([
          firstScopes.claimDueRetentionDeletion(concurrent),
          secondScopes.setRetentionException({
            identityId: concurrent.identityId,
            organizationId,
            actor: "ulc-admin",
            reason: "concurrent-legal-hold",
            reviewAt: new Date("2026-10-18T10:30:00.000Z"),
          }),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);

        const rows = await first.client.unsafe(
          `SELECT retention_deletion_claimed_at, retention_review_at
           FROM ulc_linz_membership
           WHERE identity_id = $1`,
          [concurrent.identityId],
        );
        expect(rows).toHaveLength(1);
        const row = rows[0];
        if (row === undefined) throw new Error("Expected concurrent retention row.");
        const claimed = row.retention_deletion_claimed_at !== null;
        const exception = row.retention_review_at !== null;
        expect(Number(claimed) + Number(exception)).toBe(1);
      } finally {
        await Promise.allSettled([first.client.end(), second.client.end()]);
      }
    });
  });
}

function target(identityId: string): UlcLinzLifecycleTarget {
  return Object.freeze({
    identityId,
    organizationId,
    subjectId: `${identityId}-subject`,
    sourceRole: "trainer",
    active: false,
    endedAt: new Date("2025-07-18T10:30:00.000Z"),
  });
}

async function insertDueMembership(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  value: UlcLinzLifecycleTarget,
) {
  await client.unsafe(
    `INSERT INTO ulc_linz_membership (
       identity_id, organization_id, subject_id, source_role, active, ended_at
     ) VALUES ($1, $2, $3, $4, false, $5)`,
    [
      value.identityId,
      value.organizationId,
      value.subjectId,
      value.sourceRole,
      value.endedAt?.toISOString() ?? null,
    ],
  );
}

async function expectState(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  identityId: string,
  expected: { claimed: boolean; exception: boolean },
) {
  const rows = await client.unsafe(
    `SELECT retention_deletion_claimed_at, retention_review_at
     FROM ulc_linz_membership
     WHERE identity_id = $1`,
    [identityId],
  );
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (row === undefined) throw new Error("Expected retention membership row.");
  expect(row.retention_deletion_claimed_at !== null).toBe(expected.claimed);
  expect(row.retention_review_at !== null).toBe(expected.exception);
}

async function applyUlcLifecycleMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  const owner = manifest.owners.find((candidate) => candidate.id === "ulc-linz-lifecycle");
  expect(owner).toEqual({
    id: "ulc-linz-lifecycle",
    schemaVersion: 2,
    migrations: [
      "apps/ulc-linz/migrations/0000_ulc_linz_lifecycle_scope.sql",
      "apps/ulc-linz/migrations/0001_ulc_linz_retention_deletion_claim.sql",
    ],
  });
  if (owner === undefined) throw new Error("Expected ULC lifecycle database owner.");
  for (const migration of owner.migrations) {
    const sql = await readFile(new URL(`../../../${migration}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
