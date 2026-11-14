import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPostgresDatabase } from "@appbasis/database/postgres-provisioning";
import {
  PostgresExerciseCatalogRepository,
  deleteExerciseCatalogPrivateMediaWithProviderProof,
  type ExerciseCatalogMediaDeletionProvider,
  type ExerciseCatalogPostgresClient,
} from "@appbasis/exercise-catalog";

/**
 * P02: isolated PostgreSQL NEGATIVE baseline.
 *
 * Passing tests labelled "gap" prove that the existing catalog repository
 * currently ALLOWS unsafe post-erasure resurrection or metadata-only media
 * completion. They are not acceptance of any production deletion workflow.
 * Never connect these tests to live application, Neon, or provider media.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const ORG = "p02-tenant-a";
const OTHER_ORG = "p02-tenant-b";
const EXERCISE = "p02-shared-exercise";
const PRINCIPAL = "p02-deleted-principal";

if (!DATABASE_URL) {
  describe.skip("ULC P02 catalog retention negative PostgreSQL evidence", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC P02 catalog retention negative PostgreSQL evidence", () => {
    const admin = createPostgresDatabase(DATABASE_URL);
    const databaseName = "ulc_p02_cat_" + randomUUID().replaceAll("-", "").slice(0, 13);
    const url = new URL(DATABASE_URL);
    url.pathname = "/" + databaseName;
    let client: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    function db() {
      if (!client) throw new Error("Isolated P02 database not initialized.");
      return client;
    }
    function catalog() {
      const connection = db().client;
      const adapter: ExerciseCatalogPostgresClient = {
        unsafe(sql, parameters) {
          return connection.unsafe(sql, parameters);
        },
        begin(callback) {
          return connection.begin(async (transaction) => callback({
            unsafe(sql, parameters) {
              return transaction.unsafe(sql, parameters);
            },
          }));
        },
      };
      return new PostgresExerciseCatalogRepository(adapter);
    }

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + databaseName);
      created = true;
      client = createPostgresDatabase(url.toString());
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
    });

    beforeEach(async () => {
      await db().client.unsafe(
        `TRUNCATE TABLE
           appbasis_exercise_catalog_private_media,
           appbasis_exercise_catalog_usage,
           appbasis_exercise_catalog_favorite,
           appbasis_exercise_catalog_item CASCADE`,
      );
      for (const org of [ORG, OTHER_ORG]) {
        await db().client.unsafe(
          `INSERT INTO appbasis_exercise_catalog_item
             (organization_id, id, name, category_key)
           VALUES ($1, $2, 'P02 Catalog Exercise', 'speed')`,
          [org, EXERCISE],
        );
      }
    });

    afterAll(async () => {
      if (client) {
        await client.client.end();
        client = null;
      }
      if (created) await admin.client.unsafe("DROP DATABASE " + databaseName + " WITH (FORCE)");
      await admin.client.end();
    });

    it("GAP A: deleted principal favorites can currently be recreated by a stale repository writer", async () => {
      const repo = catalog();
      await repo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      await repo.setFavorite(OTHER_ORG, PRINCIPAL, EXERCISE, true);
      await db().client.unsafe(
        `DELETE FROM appbasis_exercise_catalog_favorite
         WHERE organization_id = $1 AND principal_id = $2`,
        [ORG, PRINCIPAL],
      );
      await repo.setFavorite(ORG, PRINCIPAL, EXERCISE, true);
      expect(await repo.listFavoriteExerciseIds(ORG, PRINCIPAL)).toEqual([EXERCISE]);
      expect(await repo.listFavoriteExerciseIds(OTHER_ORG, PRINCIPAL)).toEqual([EXERCISE]);
      // No principal deletion tombstone or atomic writer fence is consulted.
    });

    it("GAP B: usage containing personal text can be reintroduced after an owner-specific deletion", async () => {
      const repo = catalog();
      await repo.recordUsage({
        id: "usage-before",
        organizationId: ORG,
        exerciseId: EXERCISE,
        occurredAt: "2026-11-11T08:00:00.000Z",
        sourceKind: "training",
        sourceRef: PRINCIPAL,
        note: "Personal historic note",
      });
      await db().client.unsafe(
        `DELETE FROM appbasis_exercise_catalog_usage
         WHERE organization_id = $1 AND source_ref = $2`,
        [ORG, PRINCIPAL],
      );
      await repo.recordUsage({
        id: "usage-reborn",
        organizationId: ORG,
        exerciseId: EXERCISE,
        occurredAt: "2026-11-13T08:00:00.000Z",
        sourceKind: "training",
        sourceRef: PRINCIPAL,
        note: "Recreated personal note",
      });
      const rows = await db().client.unsafe(
        `SELECT id, note FROM appbasis_exercise_catalog_usage
         WHERE organization_id = $1 AND source_ref = $2`,
        [ORG, PRINCIPAL],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: "usage-reborn", note: "Recreated personal note",
      });
      // Original target identity is NOT verified by source_ref; this cannot
      // authorize a real-life erasure of ambiguous legacy records.
    });

    it("GAP C: catalog SQL media completion does not establish external provider-object deletion", async () => {
      const repo = catalog();
      const storageKey = "p02-private/child-video.mp4";
      const fakeProviderObjects = new Set([storageKey]);
      await repo.registerPrivateMedia({
        id: "p02-media",
        organizationId: ORG,
        exerciseId: EXERCISE,
        fileName: "training.mp4",
        storageKey,
        contentType: "video/mp4",
        sizeBytes: 100,
        createdAt: "2026-11-13T09:00:00.000Z",
      });
      await expect(repo.completePrivateMediaDeletion(
        ORG, EXERCISE, "p02-media",
      )).resolves.toBe(false);
      await repo.requestPrivateMediaDeletion(ORG, EXERCISE, "p02-media");
      await expect(repo.listPrivateMedia(ORG, EXERCISE)).resolves.toEqual([]);
      await expect(repo.completePrivateMediaDeletion(
        ORG, EXERCISE, "p02-media",
      )).resolves.toBe(true);
      const rows = await db().client.unsafe(
        `SELECT id FROM appbasis_exercise_catalog_private_media
         WHERE organization_id = $1 AND id = 'p02-media'`,
        [ORG],
      );
      expect(rows).toHaveLength(0);
      // The repository has NO provider argument, so it cannot delete
      // objects: a genuine provider must be independently verified.
      expect(fakeProviderObjects.has(storageKey)).toBe(true);
    });

    it("GAP D: same-ID other-tenant media and favorites are unaffected by a target-tenant request", async () => {
      const repo = catalog();
      for (const org of [ORG, OTHER_ORG]) {
        await repo.registerPrivateMedia({
          id: "shared-id",
          organizationId: org,
          exerciseId: EXERCISE,
          fileName: "training.mp4",
          storageKey: org + "/object.mp4",
          contentType: "video/mp4",
          sizeBytes: 100,
          createdAt: "2026-11-13T09:00:00.000Z",
        });
      }
      await repo.requestPrivateMediaDeletion(ORG, EXERCISE, "shared-id");
      await repo.completePrivateMediaDeletion(ORG, EXERCISE, "shared-id");
      expect(await repo.listPrivateMedia(ORG, EXERCISE)).toEqual([]);
      expect(await repo.listPrivateMedia(OTHER_ORG, EXERCISE)).toHaveLength(1);
    });
    it("P02-E draft: SQL metadata stays until fake provider returns exact deletion AND independent absence", async () => {
      const repo = catalog();
      const objects = new Set(["p02-private/child-video.mp4"]);
      await repo.registerPrivateMedia({
        id: "p02-provider-check",
        organizationId: ORG,
        exerciseId: EXERCISE,
        fileName: "training.mp4",
        storageKey: "p02-private/child-video.mp4",
        contentType: "video/mp4",
        sizeBytes: 100,
        createdAt: "2026-11-13T09:00:00.000Z",
      });
      let confirmAbsent = false;
      let deletionCount = 0;
      const provider: ExerciseCatalogMediaDeletionProvider = {
        async deleteExactObject(input) {
          deletionCount += 1;
          expect(input).toMatchObject({
            organizationId: ORG, exerciseId: EXERCISE,
            mediaId: "p02-provider-check",
            storageKey: "p02-private/child-video.mp4",
          });
          objects.delete(input.storageKey);
          return { outcome: "delete-accepted", storageKey: input.storageKey };
        },
        async verifyExactObjectAbsence(input) {
          return {
            status: confirmAbsent && !objects.has(input.storageKey)
              ? "absent" : "indeterminate",
            storageKey: input.storageKey,
          };
        },
      };
      const call = () => deleteExerciseCatalogPrivateMediaWithProviderProof({
        organizationId: ORG,
        exerciseId: EXERCISE,
        mediaId: "p02-provider-check",
        repository: repo,
        provider,
      });
      await expect(call()).resolves.toMatchObject({
        status: "provider-object-not-confirmed",
        metadataDeleted: false,
      });
      expect(await db().client.unsafe(
        `SELECT deletion_requested_at IS NOT NULL AS requested
         FROM appbasis_exercise_catalog_private_media
         WHERE organization_id = $1 AND id = 'p02-provider-check'`,
        [ORG],
      )).toMatchObject([{ requested: true }]);
      expect(deletionCount).toBe(1);
      confirmAbsent = true;
      await expect(call()).resolves.toMatchObject({
        status: "completed", metadataDeleted: true, providerDeletionConfirmed: true,
      });
      expect(await db().client.unsafe(
        `SELECT id FROM appbasis_exercise_catalog_private_media
         WHERE organization_id = $1 AND id = 'p02-provider-check'`,
        [ORG],
      )).toEqual([]);
      expect(objects.size).toBe(0);
      await expect(call()).resolves.toMatchObject({
        status: "metadata-not-found",
      });
      // This uses a synthetic provider; no claim of actual vendor-side delete.
    });

    it("P02-E draft: provider outages leave SQL metadata for retry in the isolated DB", async () => {
      const repo = catalog();
      await repo.registerPrivateMedia({
        id: "p02-retry",
        organizationId: ORG,
        exerciseId: EXERCISE,
        fileName: "training.mp4",
        storageKey: "p02-private/retry.mp4",
        contentType: "video/mp4",
        sizeBytes: 100,
        createdAt: "2026-11-13T09:00:00.000Z",
      });
      const provider: ExerciseCatalogMediaDeletionProvider = {
        async deleteExactObject() {
          throw new Error("fake provider temporarily down");
        },
        async verifyExactObjectAbsence() {
          throw new Error("should never be called");
        },
      };
      await expect(deleteExerciseCatalogPrivateMediaWithProviderProof({
        organizationId: ORG,
        exerciseId: EXERCISE,
        mediaId: "p02-retry",
        repository: repo,
        provider,
      })).rejects.toThrow(/provider temporarily down/);
      const found = await db().client.unsafe(
        `SELECT id, deletion_requested_at IS NOT NULL AS requested
         FROM appbasis_exercise_catalog_private_media
         WHERE organization_id = $1 AND id = 'p02-retry'`,
        [ORG],
      );
      expect(found).toMatchObject([{ id: "p02-retry", requested: true }]);
      expect(await repo.listPrivateMedia(ORG, EXERCISE)).toEqual([]);
    });

    it("P02-E draft: same media ID in another organization is not finalized", async () => {
      const repo = catalog();
      for (const org of [ORG, OTHER_ORG]) {
        await repo.registerPrivateMedia({
          id: "p02-shared-deletion",
          organizationId: org,
          exerciseId: EXERCISE,
          fileName: "training.mp4",
          storageKey: org + "/file.mp4",
          contentType: "video/mp4",
          sizeBytes: 100,
          createdAt: "2026-11-13T09:00:00.000Z",
        });
      }
      const deletedKeys: string[] = [];
      const provider: ExerciseCatalogMediaDeletionProvider = {
        async deleteExactObject(input) {
          deletedKeys.push(input.storageKey);
          return { outcome: "delete-accepted", storageKey: input.storageKey };
        },
        async verifyExactObjectAbsence(input) {
          return { status: "absent", storageKey: input.storageKey };
        },
      };
      await expect(deleteExerciseCatalogPrivateMediaWithProviderProof({
        organizationId: ORG,
        exerciseId: EXERCISE,
        mediaId: "p02-shared-deletion",
        repository: repo,
        provider,
      })).resolves.toMatchObject({ status: "completed" });
      expect(deletedKeys).toEqual([ORG + "/file.mp4"]);
      expect(await repo.listPrivateMedia(OTHER_ORG, EXERCISE)).toHaveLength(1);
    });

  });
}
