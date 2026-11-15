import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  ExerciseCatalogFavoriteDeletedError,
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogPostgresClient,
} from "@appbasis/exercise-catalog";

/**
 * P02-G: exercise the ACTUAL PostgresExerciseCatalogRepository opt-in code,
 * using a separately created disposable CI database with candidate migration
 * 0004. No live app enables the mode; no production schema is touched.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p02-g-org";
const OTHER_ORG = "p02-g-other-org";
const PRINCIPAL = "p02-g-person";
const OTHER_PERSON = "p02-g-other-person";
const EXERCISE = "p02-g-exercise";
const WHEN = new Date("2026-11-14T10:00:00.000Z");

function pauseGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

if (!DATABASE_URL) {
  describe.skip("P02-G actual catalog favorite guarded PostgreSQL writer", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("P02-G actual catalog favorite guarded PostgreSQL writer", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const dbName = "ulc_p02_g_" + randomUUID().replaceAll("-", "").slice(0, 15);
    const url = new URL(DATABASE_URL);
    url.pathname = "/" + dbName;
    type DB = ReturnType<typeof createPostgresDatabase>;
    let isolated: DB | null = null;
    let created = false;

    function db() {
      if (!isolated) throw new Error("Missing P02-G isolated DB");
      return isolated;
    }

    function repository(
      connection: DB,
      options: {
        mode?: "legacy-unprotected" | "require-catalog-erasure-marker";
        beforeFavoriteInsert?: () => Promise<void>;
        beforeMarkerInsert?: () => Promise<void>;
      } = {},
    ) {
      const mode = options.mode ?? "require-catalog-erasure-marker";
      const adapter: ExerciseCatalogPostgresClient = {
        unsafe(sql, params) {
          return connection.client.unsafe(sql, params);
        },
        begin(callback) {
          return connection.client.begin(async (tx) => callback({
            async unsafe(sql, params) {
              if (sql.includes("INSERT INTO appbasis_exercise_catalog_favorite_deletion")) {
                await options.beforeMarkerInsert?.();
              }
              if (sql.includes("INSERT INTO appbasis_exercise_catalog_favorite (")) {
                await options.beforeFavoriteInsert?.();
              }
              return tx.unsafe(sql, params);
            },
          }));
        },
      };
      return new PostgresExerciseCatalogRepository(adapter, {
        favoriteFenceMode: mode,
      });
    }

    async function favoriteCount(
      org: string = ORG,
      person: string = PRINCIPAL,
    ): Promise<number> {
      const rows = await db().client.unsafe(
        `SELECT count(*)::int AS count FROM appbasis_exercise_catalog_favorite
         WHERE organization_id = $1 AND principal_id = $2`,
        [org, person],
      );
      return Number(rows[0]?.count);
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + dbName);
      created = true;
      isolated = createPostgresDatabase(url.toString());
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
          if (statement.trim()) await db().client.unsafe(statement);
        }
      }
      // A scoped synthetic owner-schema fixture, not an app/module migration.
      const markerFixture = await readFile(
        new URL("./fixtures/p02-g-catalog-favorite-erasure-marker.candidate.sql", import.meta.url),
        "utf8",
      );
      await db().client.unsafe(markerFixture);
    });

    beforeEach(async () => {
      await db().client.unsafe(
        `TRUNCATE TABLE
            appbasis_exercise_catalog_favorite_deletion,
            appbasis_exercise_catalog_favorite,
            appbasis_exercise_catalog_item CASCADE`,
      );
      for (const org of [ORG, OTHER_ORG]) {
        await db().client.unsafe(
          `INSERT INTO appbasis_exercise_catalog_item
             (organization_id, id, name, category_key)
           VALUES ($1, $2, 'P02-G Test Exercise', 'speed')`,
          [org, EXERCISE],
        );
      }
    });

    afterAll(async () => {
      if (isolated) {
        await isolated.client.end();
        isolated = null;
      }
      if (created) {
        await admin.client.unsafe("DROP DATABASE " + dbName + " WITH (FORCE)");
      }
      await admin.client.end();
    });

    it("real repository: deletion creates a 35-day marker, purges favorites, blocks stale writer", async () => {
      const repo = repository(db());
      await repo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      expect(await favoriteCount()).toBe(1);
      const result = await repo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, WHEN,
      );
      expect(result).toEqual({ markerInserted: true, deletedFavorites: 1 });
      await expect(repo.setFavorite(
        ORG, PRINCIPAL, EXERCISE, true,
      )).rejects.toBeInstanceOf(ExerciseCatalogFavoriteDeletedError);
      expect(await favoriteCount()).toBe(0);
      const markers = await db().client.unsafe(
        `SELECT completed_at::text AS completed_at,
                extract(epoch from (purge_after - completed_at))::int AS retention_seconds
         FROM appbasis_exercise_catalog_favorite_deletion
         WHERE organization_id = $1 AND principal_id = $2`,
        [ORG, PRINCIPAL],
      );
      expect(markers).toHaveLength(1);
      expect(Number(markers[0]?.retention_seconds)).toBe(35 * 24 * 3600);
    });

    it("real repository: deletion first, concurrently blocked writer cannot resurrect", async () => {
      const left = createPostgresDatabase(url.toString());
      const right = createPostgresDatabase(url.toString());
      const locked = pauseGate();
      const release = pauseGate();
      try {
        const deletion = repository(left, {
          beforeMarkerInsert: async () => {
            locked.release();
            await release.promise;
          },
        }).markPrincipalDeletedAndDeleteFavorites(ORG, PRINCIPAL, WHEN);
        await locked.promise; // delete transaction already owns scoped lock
        const stale = repository(right).setFavorite(ORG, PRINCIPAL, EXERCISE, true);
        release.release();
        const [result, writer] = await Promise.allSettled([deletion, stale]);
        expect(result).toMatchObject({
          status: "fulfilled",
          value: { markerInserted: true, deletedFavorites: 0 },
        });
        expect(writer.status).toBe("rejected");
        if (writer.status === "rejected") {
          expect(writer.reason).toBeInstanceOf(ExerciseCatalogFavoriteDeletedError);
        }
        expect(await favoriteCount()).toBe(0);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("real repository: writer first, deletion subsequently removes its committed favorite", async () => {
      const left = createPostgresDatabase(url.toString());
      const right = createPostgresDatabase(url.toString());
      const locked = pauseGate();
      const release = pauseGate();
      try {
        const writer = repository(left, {
          beforeFavoriteInsert: async () => {
            locked.release();
            await release.promise;
          },
        }).setFavorite(ORG, PRINCIPAL, EXERCISE, true);
        await locked.promise;
        const deletion = repository(right).markPrincipalDeletedAndDeleteFavorites(
          ORG, PRINCIPAL, WHEN,
        );
        release.release();
        const [created, deleted] = await Promise.allSettled([writer, deletion]);
        expect(created.status).toBe("fulfilled");
        expect(deleted).toMatchObject({
          status: "fulfilled",
          value: { markerInserted: true, deletedFavorites: 1 },
        });
        expect(await favoriteCount()).toBe(0);
      } finally {
        release.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("real repository: identical principal across organizations stays independent", async () => {
      const repo = repository(db());
      await repo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      await repo.setFavorite(OTHER_ORG, PRINCIPAL, EXERCISE, true);
      await repo.setFavorite(ORG, OTHER_PERSON, EXERCISE, true);
      const deletion = await repo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, WHEN,
      );
      expect(deletion.deletedFavorites).toBe(1);
      expect(await favoriteCount()).toBe(0);
      expect(await favoriteCount(OTHER_ORG, PRINCIPAL)).toBe(1);
      expect(await favoriteCount(ORG, OTHER_PERSON)).toBe(1);
      await expect(repo.setFavorite(
        OTHER_ORG, PRINCIPAL, EXERCISE, true,
      )).resolves.toBeUndefined();
    });

    it("real repository: deletion is idempotent and does not reset the 35-day deadline", async () => {
      const repo = repository(db());
      await repo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      expect(await repo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, WHEN,
      )).toEqual({ markerInserted: true, deletedFavorites: 1 });
      expect(await repo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, new Date("2026-11-25T10:00:00.000Z"),
      )).toEqual({ markerInserted: false, deletedFavorites: 0 });
      const rows = await db().client.unsafe(
        `SELECT completed_at::text AS completed_at,
                purge_after::text AS purge_after
         FROM appbasis_exercise_catalog_favorite_deletion
         WHERE organization_id = $1 AND principal_id = $2`,
        [ORG, PRINCIPAL],
      );
      expect(rows).toHaveLength(1);
      expect(String(rows[0]?.completed_at)).toContain("2026-11-14");
      expect(String(rows[0]?.purge_after)).toContain("2026-12-19");
    });

    it("real repository: opt-in guard denies invalid identities and unapproved deletion method", async () => {
      const protectedRepo = repository(db());
      await expect(protectedRepo.setFavorite(
        " ", PRINCIPAL, EXERCISE, true,
      )).rejects.toThrow(/favorite identity is invalid/);
      const legacyRepo = repository(db(), { mode: "legacy-unprotected" });
      await expect(legacyRepo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, WHEN,
      )).rejects.toThrow(/requires approved fenced mode/);
      await expect(protectedRepo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, new Date("invalid"),
      )).rejects.toThrow(/inputs are invalid/);
    });

    it("negative reference: legacy mode remains vulnerable until live wiring is approved", async () => {
      const protectedRepo = repository(db());
      await protectedRepo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, WHEN,
      );
      const legacyRepo = repository(db(), { mode: "legacy-unprotected" });
      await legacyRepo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      expect(await favoriteCount()).toBe(1);
      // The unsafe path is explicitly retained, NOT production-approved.
    });
  });
}
