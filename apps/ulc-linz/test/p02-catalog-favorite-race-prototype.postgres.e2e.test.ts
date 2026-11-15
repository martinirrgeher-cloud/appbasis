import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogPostgresClient,
} from "@appbasis/exercise-catalog";

/**
 * P02-F: an ISOLATED PostgreSQL candidate fence, never a production migration.
 * The table p02_probe_favorite_deletion is created ONLY inside a freshly
 * allocated disposable CI DB. It is NOT a legally authorized retention ledger.
 *
 * Passing "guarded" tests prove a specific SQL lock strategy works in this
 * disposable fixture. Passing "baseline" proves the shipped repository still
 * bypasses this test-only marker, not that production is safe.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p02-f-tenant-a";
const OTHER_ORG = "p02-f-tenant-b";
const PRINCIPAL = "p02-f-deleted-principal";
const OTHER_PRINCIPAL = "p02-f-active-principal";
const EXERCISE = "p02-f-exercise";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

if (!DATABASE_URL) {
  describe.skip("ULC P02-F favorite writer fence: isolated PG prototype", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P02-F favorite writer fence: isolated PG prototype", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const databaseName = "ulc_p02_f_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const url = new URL(DATABASE_URL);
    url.pathname = "/" + databaseName;
    type Database = ReturnType<typeof createPostgresDatabase>;
    let db: Database | null = null;
    let created = false;

    function database(): Database {
      if (db === null) throw new Error("P02-F isolated database missing.");
      return db;
    }

    function postgresCatalog(connection: Database) {
      const client = connection.client;
      const adapter: ExerciseCatalogPostgresClient = {
        unsafe(query, parameters) {
          return client.unsafe(query, parameters);
        },
        begin(callback) {
          return client.begin(async (transaction) => callback({
            unsafe(query, parameters) {
              return transaction.unsafe(query, parameters);
            },
          }));
        },
      };
      return new PostgresExerciseCatalogRepository(adapter);
    }

    async function lockPrincipal(
      tx: { unsafe(query: string, params?: (string | number | boolean | null)[]): PromiseLike<readonly Record<string, unknown>[]> },
      organizationId: string,
      principalId: string,
    ): Promise<void> {
      // Same (organization, principal) advisory-lock key as the existing
      // training-blocks favorite deletion owner; candidate catalog writers
      // must use the same lock for BOTH writer and erase.
      await tx.unsafe(
        `SELECT pg_advisory_xact_lock(
          hashtextextended(jsonb_build_array($1::text, $2::text)::text, 0)
        )`,
        [organizationId, principalId],
      );
    }

    async function guardedWrite(
      connection: Database,
      organizationId: string,
      principalId: string,
      beforeInsert?: () => Promise<void>,
    ): Promise<"inserted" | "blocked"> {
      return connection.client.begin(async (tx) => {
        await lockPrincipal(tx, organizationId, principalId);
        const deleted = await tx.unsafe(
          `SELECT 1 AS present FROM p02_probe_favorite_deletion
           WHERE organization_id = $1 AND principal_id = $2`,
          [organizationId, principalId],
        );
        if (deleted.length > 0) return "blocked";
        if (beforeInsert) await beforeInsert();
        await tx.unsafe(
          `INSERT INTO appbasis_exercise_catalog_favorite
             (organization_id, principal_id, exercise_id)
           SELECT $1, $2, $3
           WHERE EXISTS (
             SELECT 1 FROM appbasis_exercise_catalog_item
             WHERE organization_id = $1 AND id = $3
           )
           ON CONFLICT (organization_id, principal_id, exercise_id)
           DO NOTHING`,
          [organizationId, principalId, EXERCISE],
        );
        return "inserted";
      });
    }

    async function markDeletedAndPurge(
      connection: Database,
      organizationId: string,
      principalId: string,
      afterLock?: () => Promise<void>,
    ): Promise<number> {
      return connection.client.begin(async (tx) => {
        await lockPrincipal(tx, organizationId, principalId);
        if (afterLock) await afterLock();
        await tx.unsafe(
          `INSERT INTO p02_probe_favorite_deletion
             (organization_id, principal_id, deleted_at)
           VALUES ($1, $2, now())
           ON CONFLICT (organization_id, principal_id) DO NOTHING`,
          [organizationId, principalId],
        );
        const deleted = await tx.unsafe(
          `DELETE FROM appbasis_exercise_catalog_favorite
           WHERE organization_id = $1 AND principal_id = $2
           RETURNING exercise_id`,
          [organizationId, principalId],
        );
        return deleted.length;
      });
    }

    async function favorites(
      connection: Database,
      organizationId = ORG,
      principalId = PRINCIPAL,
    ): Promise<number> {
      const rows = await connection.client.unsafe(
        `SELECT count(*)::int AS count FROM appbasis_exercise_catalog_favorite
         WHERE organization_id = $1 AND principal_id = $2`,
        [organizationId, principalId],
      );
      return Number(rows[0]?.count);
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + databaseName);
      created = true;
      db = createPostgresDatabase(url.toString());
      for (const name of [
        "0000_appbasis_exercise_catalog_foundation.sql",
        "0001_appbasis_exercise_catalog_tenant_identity.sql",
        "0002_appbasis_exercise_catalog_parity.sql",
        "0003_appbasis_exercise_catalog_private_media_delete_state.sql",
      ]) {
        const sql = await readFile(
          new URL("../../../modules/exercise-catalog/migrations/" + name, import.meta.url),
          "utf8",
        );
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await database().client.unsafe(statement);
        }
      }
      await database().client.unsafe(
        `CREATE TABLE p02_probe_favorite_deletion (
          organization_id text NOT NULL,
          principal_id text NOT NULL,
          deleted_at timestamptz NOT NULL,
          PRIMARY KEY (organization_id, principal_id)
        )`,
      );
    });

    beforeEach(async () => {
      await database().client.unsafe(
        `TRUNCATE TABLE
          appbasis_exercise_catalog_favorite,
          appbasis_exercise_catalog_item CASCADE`,
      );
      await database().client.unsafe("TRUNCATE TABLE p02_probe_favorite_deletion");
      for (const org of [ORG, OTHER_ORG]) {
        await database().client.unsafe(
          `INSERT INTO appbasis_exercise_catalog_item
             (organization_id, id, name, category_key)
           VALUES ($1, $2, 'P02-F isolated exercise', 'speed')`,
          [org, EXERCISE],
        );
      }
    });

    afterAll(async () => {
      if (db !== null) {
        await db.client.end();
        db = null;
      }
      if (created) {
        await admin.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
      }
      await admin.client.end();
    });

    it("deletion gets lock first: the stale guarded writer waits then denies resurrection", async () => {
      const deleteConnection = createPostgresDatabase(url.toString());
      const writeConnection = createPostgresDatabase(url.toString());
      const hasLock = gate();
      const releaseLock = gate();
      try {
        const erase = markDeletedAndPurge(
          deleteConnection, ORG, PRINCIPAL,
          async () => {
            hasLock.release();
            await releaseLock.promise;
          },
        );
        await hasLock.promise;
        const stale = guardedWrite(writeConnection, ORG, PRINCIPAL);
        releaseLock.release();
        const [deleted, writer] = await Promise.all([erase, stale]);
        expect(deleted).toBe(0);
        expect(writer).toBe("blocked");
        expect(await favorites(database())).toBe(0);
      } finally {
        releaseLock.release();
        await deleteConnection.client.end();
        await writeConnection.client.end();
      }
    }, 20_000);

    it("writer gets lock first: erase waits, then removes its committed favorite", async () => {
      const writeConnection = createPostgresDatabase(url.toString());
      const deleteConnection = createPostgresDatabase(url.toString());
      const hasLock = gate();
      const releaseLock = gate();
      try {
        const stale = guardedWrite(
          writeConnection, ORG, PRINCIPAL,
          async () => {
            hasLock.release();
            await releaseLock.promise;
          },
        );
        await hasLock.promise;
        const erase = markDeletedAndPurge(deleteConnection, ORG, PRINCIPAL);
        releaseLock.release();
        const [writer, deleted] = await Promise.all([stale, erase]);
        expect(writer).toBe("inserted");
        expect(deleted).toBe(1);
        expect(await favorites(database())).toBe(0);
      } finally {
        releaseLock.release();
        await writeConnection.client.end();
        await deleteConnection.client.end();
      }
    }, 20_000);

    it("same principal ID in another organization remains writable and untouched", async () => {
      expect(await guardedWrite(database(), OTHER_ORG, PRINCIPAL)).toBe("inserted");
      expect(await guardedWrite(database(), ORG, OTHER_PRINCIPAL)).toBe("inserted");
      await markDeletedAndPurge(database(), ORG, PRINCIPAL);
      expect(await guardedWrite(database(), ORG, PRINCIPAL)).toBe("blocked");
      expect(await favorites(database(), OTHER_ORG, PRINCIPAL)).toBe(1);
      expect(await favorites(database(), ORG, OTHER_PRINCIPAL)).toBe(1);
      expect(await favorites(database(), ORG, PRINCIPAL)).toBe(0);
    });

    it("the marker insert and favorite purge are idempotent", async () => {
      await guardedWrite(database(), ORG, PRINCIPAL);
      expect(await markDeletedAndPurge(database(), ORG, PRINCIPAL)).toBe(1);
      expect(await markDeletedAndPurge(database(), ORG, PRINCIPAL)).toBe(0);
      expect(await guardedWrite(database(), ORG, PRINCIPAL)).toBe("blocked");
      const rows = await database().client.unsafe(
        `SELECT count(*)::int AS count FROM p02_probe_favorite_deletion
         WHERE organization_id = $1 AND principal_id = $2`,
        [ORG, PRINCIPAL],
      );
      expect(Number(rows[0]?.count)).toBe(1);
    });

    it("the existing catalog writer BYPASSES this test-only marker: still an active security gap", async () => {
      await markDeletedAndPurge(database(), ORG, PRINCIPAL);
      const unsafeExistingRepository = postgresCatalog(database());
      await unsafeExistingRepository.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      expect(await favorites(database(), ORG, PRINCIPAL)).toBe(1);
      // Passing this negative proof DOES NOT authorize live use or a new
      // personal tombstone. A full P01/D2 decision is still required.
    });
  });
}
