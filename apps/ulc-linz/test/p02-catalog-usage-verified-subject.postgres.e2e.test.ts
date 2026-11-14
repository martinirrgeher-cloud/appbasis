import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  ExerciseCatalogFavoriteDeletedError,
  ExerciseCatalogUsageSubjectRequiredError,
  PostgresExerciseCatalogRepository,
  type ExerciseCatalogPostgresClient,
  type ExerciseCatalogUsageEvent,
  type ExerciseCatalogUsageSubjectContext,
} from "@appbasis/exercise-catalog";

/**
 * P02-H tests the ACTUAL opt-in catalog SQL repository in an isolated PG DB.
 * Subject evidence is simulated and is not a production authorization.
 * No source_ref or note is inferred to be the principal identity.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p02-h-org";
const OTHER_ORG = "p02-h-other-org";
const PRINCIPAL = "p02-h-person";
const OTHER_PERSON = "p02-h-other-person";
const EXERCISE = "p02-h-exercise";
const WHEN = new Date("2026-11-14T10:00:00.000Z");

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function usage(
  id: string,
  org: string = ORG,
  sourceRef: string = "non-personal-training-plan-42",
): ExerciseCatalogUsageEvent {
  return Object.freeze({
    id,
    organizationId: org,
    exerciseId: EXERCISE,
    occurredAt: "2026-11-14T10:05:00.000Z",
    sourceKind: "training",
    sourceRef,
    note: "Synthetic personal-training note",
  });
}

function subject(
  event: ExerciseCatalogUsageEvent,
  principalId: string = PRINCIPAL,
): ExerciseCatalogUsageSubjectContext {
  return Object.freeze({
    organizationId: event.organizationId,
    usageId: event.id,
    principalId,
    verifiedBy: "identity" as const,
  });
}

if (!DATABASE_URL) {
  describe.skip("P02-H explicit usage subject: isolated PostgreSQL", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("P02-H explicit usage subject: isolated PostgreSQL", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const databaseName = "ulc_p02_h_" + randomUUID().replaceAll("-", "").slice(0, 16);
    const url = new URL(DATABASE_URL);
    url.pathname = "/" + databaseName;
    type DB = ReturnType<typeof createPostgresDatabase>;
    let connection: DB | null = null;
    let databaseCreated = false;

    function db(): DB {
      if (!connection) throw new Error("Missing P02-H isolated database.");
      return connection;
    }

    function repository(
      target: DB,
      options: {
        favoriteFenceMode?: "legacy-unprotected" | "require-catalog-erasure-marker";
        usageWriteMode?: "legacy-unprotected" | "require-explicit-subject";
        beforeUsageInsert?: () => Promise<void>;
        beforeMarkerInsert?: () => Promise<void>;
        failSubjectLink?: boolean;
      } = {},
    ) {
      const adapter: ExerciseCatalogPostgresClient = {
        unsafe(sql, params) {
          return target.client.unsafe(sql, params);
        },
        begin(callback) {
          return target.client.begin(async (tx) => callback({
            async unsafe(sql, params) {
              if (sql.includes("INSERT INTO appbasis_exercise_catalog_usage (")) {
                await options.beforeUsageInsert?.();
              }
              if (sql.includes("INSERT INTO appbasis_exercise_catalog_favorite_deletion")) {
                await options.beforeMarkerInsert?.();
              }
              if (
                options.failSubjectLink &&
                sql.includes("INSERT INTO appbasis_exercise_catalog_usage_subject")
              ) {
                throw new Error("synthetic subject link failure");
              }
              return tx.unsafe(sql, params);
            },
          }));
        },
      };
      return new PostgresExerciseCatalogRepository(adapter, {
        favoriteFenceMode: options.favoriteFenceMode ??
          "require-catalog-erasure-marker",
        usageWriteMode: options.usageWriteMode ?? "require-explicit-subject",
      });
    }

    async function counts(
      org: string = ORG,
      principal: string = PRINCIPAL,
    ): Promise<{ usage: number; linked: number; favorites: number }> {
      const rows = await db().client.unsafe(
        `SELECT
          (SELECT count(*)::int FROM appbasis_exercise_catalog_usage
           WHERE organization_id = $1) AS usage,
          (SELECT count(*)::int FROM appbasis_exercise_catalog_usage_subject
           WHERE organization_id = $1 AND principal_id = $2) AS linked,
          (SELECT count(*)::int FROM appbasis_exercise_catalog_favorite
           WHERE organization_id = $1 AND principal_id = $2) AS favorites`,
        [org, principal],
      );
      return {
        usage: Number(rows[0]?.usage),
        linked: Number(rows[0]?.linked),
        favorites: Number(rows[0]?.favorites),
      };
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + databaseName);
      databaseCreated = true;
      connection = createPostgresDatabase(url.toString());
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
      for (const name of [
        "./fixtures/p02-g-catalog-favorite-erasure-marker.candidate.sql",
        "./fixtures/p02-h-catalog-usage-subject.candidate.sql",
      ]) {
        const sql = await readFile(new URL(name, import.meta.url), "utf8");
        for (const statement of sql.split("--> statement-breakpoint")) {
          if (statement.trim()) await db().client.unsafe(statement);
        }
      }
    });

    beforeEach(async () => {
      await db().client.unsafe(
        `TRUNCATE TABLE
           appbasis_exercise_catalog_usage_subject,
           appbasis_exercise_catalog_usage,
           appbasis_exercise_catalog_favorite,
           appbasis_exercise_catalog_favorite_deletion,
           appbasis_exercise_catalog_item CASCADE`,
      );
      for (const org of [ORG, OTHER_ORG]) {
        await db().client.unsafe(
          `INSERT INTO appbasis_exercise_catalog_item
             (organization_id, id, name, category_key)
           VALUES ($1, $2, 'P02-H synthetic exercise', 'speed')`,
          [org, EXERCISE],
        );
      }
    });

    afterAll(async () => {
      if (connection) {
        await connection.client.end();
        connection = null;
      }
      if (databaseCreated) {
        await admin.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
      }
      await admin.client.end();
    });

    it("requires exact explicit subject and atomically links new usage without inspecting source_ref", async () => {
      const repo = repository(db());
      const event = usage("h-usage-1", ORG, "external-plan-75");
      await expect(repo.recordUsage(event)).rejects.toBeInstanceOf(
        ExerciseCatalogUsageSubjectRequiredError,
      );
      await repo.recordUsageForVerifiedSubject(event, subject(event));
      expect(await counts()).toEqual({ usage: 1, linked: 1, favorites: 0 });
      const rows = await db().client.unsafe(
        `SELECT u.source_ref, u.note, s.principal_id, s.verified_by
         FROM appbasis_exercise_catalog_usage u
         JOIN appbasis_exercise_catalog_usage_subject s
           ON s.organization_id = u.organization_id AND s.usage_id = u.id
         WHERE u.organization_id = $1 AND u.id = $2`,
        [ORG, event.id],
      );
      expect(rows).toMatchObject([{
        source_ref: "external-plan-75",
        note: "Synthetic personal-training note",
        principal_id: PRINCIPAL,
        verified_by: "identity",
      }]);
    });

    it("rejects foreign tenant, mismatched event ID and unverified subject source before writing", async () => {
      const repo = repository(db());
      const event = usage("h-invalid");
      for (const context of [
        { ...subject(event), organizationId: OTHER_ORG },
        { ...subject(event), usageId: "different" },
        { ...subject(event), verifiedBy: "not-an-owner" },
        { ...subject(event), principalId: "  " },
      ]) {
        await expect(repo.recordUsageForVerifiedSubject(
          event, context as ExerciseCatalogUsageSubjectContext,
        )).rejects.toBeInstanceOf(ExerciseCatalogUsageSubjectRequiredError);
      }
      expect(await counts()).toEqual({ usage: 0, linked: 0, favorites: 0 });
    });

    it("rejects partial protection and cannot bypass via legacy recordUsage", async () => {
      const event = usage("h-unprotected");
      expect(() => repository(db(), {
        favoriteFenceMode: "legacy-unprotected",
        usageWriteMode: "require-explicit-subject",
      })).toThrow(/requires the favorite erasure marker fence/);
      const legacy = repository(db(), {
        favoriteFenceMode: "legacy-unprotected",
        usageWriteMode: "legacy-unprotected",
      });
      await expect(legacy.recordUsageForVerifiedSubject(
        event, subject(event),
      )).rejects.toBeInstanceOf(ExerciseCatalogUsageSubjectRequiredError);
      const protectedRepo = repository(db());
      await expect(protectedRepo.recordUsage(event)).rejects.toBeInstanceOf(
        ExerciseCatalogUsageSubjectRequiredError,
      );
      await expect(protectedRepo.markPrincipalDeletedAndDeleteFavorites(
        ORG, PRINCIPAL, WHEN,
      )).rejects.toThrow(/requires full personal-data deletion/);
      expect(await counts()).toEqual({ usage: 0, linked: 0, favorites: 0 });
    });

    it("rolls back newly inserted note when its subject link cannot be persisted", async () => {
      const repo = repository(db(), { failSubjectLink: true });
      const event = usage("h-rollback");
      await expect(repo.recordUsageForVerifiedSubject(
        event, subject(event),
      )).rejects.toThrow(/synthetic subject link failure/);
      expect(await counts()).toEqual({ usage: 0, linked: 0, favorites: 0 });
    });

    it("deletes only verified owner usage and favorites atomically; preserves other people and tenants", async () => {
      const repo = repository(db());
      const target = usage("h-subject-target");
      const other = usage("h-subject-other");
      const tenant = usage("h-subject-tenant", OTHER_ORG);
      await repo.recordUsageForVerifiedSubject(target, subject(target));
      await repo.recordUsageForVerifiedSubject(other, subject(other, OTHER_PERSON));
      await repo.recordUsageForVerifiedSubject(tenant, subject(tenant));
      await repo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      await repo.setFavorite(ORG, OTHER_PERSON, EXERCISE, true);
      await repo.setFavorite(OTHER_ORG, PRINCIPAL, EXERCISE, true);
      const result = await repo.markPrincipalDeletedAndDeletePersonalCatalogData(
        ORG, PRINCIPAL, WHEN,
      );
      expect(result).toEqual({
        markerInserted: true,
        deletedFavorites: 1,
        deletedUsageEvents: 1,
      });
      expect(await counts(ORG, PRINCIPAL)).toEqual({
        usage: 1, linked: 0, favorites: 0,
      });
      expect(await counts(ORG, OTHER_PERSON)).toEqual({
        usage: 1, linked: 1, favorites: 1,
      });
      expect(await counts(OTHER_ORG, PRINCIPAL)).toEqual({
        usage: 1, linked: 1, favorites: 1,
      });
      await expect(repo.recordUsageForVerifiedSubject(
        usage("h-stale-after-delete"),
        subject(usage("h-stale-after-delete")),
      )).rejects.toBeInstanceOf(ExerciseCatalogFavoriteDeletedError);
      expect(await repo.markPrincipalDeletedAndDeletePersonalCatalogData(
        ORG, PRINCIPAL, new Date("2026-11-20T10:00:00.000Z"),
      )).toEqual({
        markerInserted: false, deletedFavorites: 0, deletedUsageEvents: 0,
      });
      const markers = await db().client.unsafe(
        `SELECT extract(epoch from (purge_after - completed_at))::int AS seconds,
                completed_at::text AS completed_at
         FROM appbasis_exercise_catalog_favorite_deletion
         WHERE organization_id = $1 AND principal_id = $2`,
        [ORG, PRINCIPAL],
      );
      expect(Number(markers[0]?.seconds)).toBe(35 * 24 * 3600);
      expect(String(markers[0]?.completed_at)).toContain("2026-11-14");
    });

    it("delete transaction gets lock first: blocked concurrent writer cannot restore note", async () => {
      const left = createPostgresDatabase(url.toString());
      const right = createPostgresDatabase(url.toString());
      const lockHeld = gate();
      const releaseLock = gate();
      try {
        const deleting = repository(left, {
          beforeMarkerInsert: async () => {
            lockHeld.release();
            await releaseLock.promise;
          },
        }).markPrincipalDeletedAndDeletePersonalCatalogData(
          ORG, PRINCIPAL, WHEN,
        );
        await lockHeld.promise;
        const staleEvent = usage("h-erase-first");
        const writing = repository(right).recordUsageForVerifiedSubject(
          staleEvent, subject(staleEvent),
        );
        releaseLock.release();
        const [a, b] = await Promise.allSettled([deleting, writing]);
        expect(a).toMatchObject({ status: "fulfilled" });
        expect(b.status).toBe("rejected");
        if (b.status === "rejected") {
          expect(b.reason).toBeInstanceOf(ExerciseCatalogFavoriteDeletedError);
        }
        expect(await counts()).toEqual({
          usage: 0, linked: 0, favorites: 0,
        });
      } finally {
        releaseLock.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("writer transaction gets lock first: deletion waits and removes committed usage/note", async () => {
      const left = createPostgresDatabase(url.toString());
      const right = createPostgresDatabase(url.toString());
      const lockHeld = gate();
      const releaseLock = gate();
      try {
        const event = usage("h-write-first");
        const writing = repository(left, {
          beforeUsageInsert: async () => {
            lockHeld.release();
            await releaseLock.promise;
          },
        }).recordUsageForVerifiedSubject(event, subject(event));
        await lockHeld.promise;
        const deleting = repository(right).markPrincipalDeletedAndDeletePersonalCatalogData(
          ORG, PRINCIPAL, WHEN,
        );
        releaseLock.release();
        const [a, b] = await Promise.allSettled([writing, deleting]);
        expect(a.status).toBe("fulfilled");
        expect(b).toMatchObject({
          status: "fulfilled",
          value: {
            markerInserted: true,
            deletedFavorites: 0,
            deletedUsageEvents: 1,
          },
        });
        expect(await counts()).toEqual({
          usage: 0, linked: 0, favorites: 0,
        });
      } finally {
        releaseLock.release();
        await left.client.end();
        await right.client.end();
      }
    }, 20_000);

    it("ambiguous legacy note remains unassigned; no unsafe guess from source_ref", async () => {
      const legacy = repository(db(), {
        favoriteFenceMode: "legacy-unprotected",
        usageWriteMode: "legacy-unprotected",
      });
      const event = usage("h-legacy-note", ORG, PRINCIPAL);
      await legacy.recordUsage(event);
      const secured = repository(db());
      expect(await secured.markPrincipalDeletedAndDeletePersonalCatalogData(
        ORG, PRINCIPAL, WHEN,
      )).toEqual({
        markerInserted: true,
        deletedFavorites: 0,
        deletedUsageEvents: 0,
      });
      const rows = await db().client.unsafe(
        `SELECT id, source_ref, note
         FROM appbasis_exercise_catalog_usage
         WHERE organization_id = $1`,
        [ORG],
      );
      expect(rows).toMatchObject([{
        id: event.id,
        source_ref: PRINCIPAL,
        note: event.note,
      }]);
      // This is an EXPLICIT remaining privacy blocker, not a deletion success.
      expect(await counts()).toEqual({ usage: 1, linked: 0, favorites: 0 });
    });

    it("protected write refuses an absent marker schema rather than falling back", async () => {
      await db().client.unsafe(
        "ALTER TABLE appbasis_exercise_catalog_favorite_deletion RENAME TO p02_h_temporarily_missing_marker",
      );
      const repo = repository(db());
      const event = usage("h-no-marker");
      try {
        await expect(repo.recordUsageForVerifiedSubject(
          event, subject(event),
        )).rejects.toThrow();
        expect(await counts()).toEqual({
          usage: 0, linked: 0, favorites: 0,
        });
      } finally {
        await db().client.unsafe(
          "ALTER TABLE p02_h_temporarily_missing_marker RENAME TO appbasis_exercise_catalog_favorite_deletion",
        );
      }
    });
  });
}
