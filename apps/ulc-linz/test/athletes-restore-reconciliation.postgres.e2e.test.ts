import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  PostgresAthleteMasterdataRepository,
  reconcileAthleteMasterdataRestoredDatabase,
} from "@appbasis/athletes";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

const databaseUrl = process.env.DATABASE_URL;
const NOW = new Date("2026-09-27T10:00:00.000Z");
const EXPIRED_NOW = new Date("2026-11-02T10:00:00.000Z");

type DatabaseManifest = {
  owners: readonly {
    migrations: readonly string[];
  }[];
};

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Stammdaten restore reconciliation PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Stammdaten restore reconciliation PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
    const sourceName = `appbasis_ulc_e2d_source_${suffix}`;
    const restoreName = `appbasis_ulc_e2d_restore_${suffix}`;
    const sourceUrl = databaseUrlForName(databaseUrl, sourceName);
    const restoreUrl = databaseUrlForName(databaseUrl, restoreName);
    let source: ReturnType<typeof createPostgresDatabase> | null = null;
    let restored: ReturnType<typeof createPostgresDatabase> | null = null;

    beforeAll(async () => {
      await admin.client.unsafe("CREATE DATABASE " + sourceName);
      await admin.client.unsafe("CREATE DATABASE " + restoreName);
      source = createPostgresDatabase(sourceUrl);
      restored = createPostgresDatabase(restoreUrl);
      await applyManifestMigrations(requiredSource().client);
      await applyManifestMigrations(requiredRestored().client);
    });

    afterAll(async () => {
      await Promise.allSettled([
        source?.client.end(),
        restored?.client.end(),
      ]);
      source = null;
      restored = null;
      await admin.client.unsafe("DROP DATABASE " + sourceName + " WITH (FORCE)");
      await admin.client.unsafe("DROP DATABASE " + restoreName + " WITH (FORCE)");
      await admin.client.end();
    });

    it("replays authoritative 35-day deletion markers into an older restore without personal marker data", async () => {
      const sourceRepository = repositoryWithIds(requiredSource().client, [
        "group-1",
        "athlete-1",
        "trainer-1",
      ]);
      const restoredRepository = repositoryWithIds(requiredRestored().client, [
        "group-1",
        "athlete-1",
        "trainer-1",
      ]);

      await seedBackupState(sourceRepository);
      await seedBackupState(restoredRepository);

      await expect(
        sourceRepository.deactivateAthlete("verein-1", "athlete-1"),
      ).resolves.toBe(true);
      await expect(
        sourceRepository.deactivateTrainer("verein-1", "trainer-1"),
      ).resolves.toBe(true);
      await requiredSource().client.unsafe(
        `UPDATE appbasis_athlete
         SET updated_at = '2025-09-26T09:00:00.000Z'::timestamptz
         WHERE id = 'athlete-1'`,
      );
      await requiredSource().client.unsafe(
        `UPDATE appbasis_trainer
         SET updated_at = '2025-09-26T09:00:00.000Z'::timestamptz
         WHERE id = 'trainer-1'`,
      );

      await expect(
        sourceRepository.purgeDeactivatedPersonalData(NOW),
      ).resolves.toEqual({
        deletedAthletes: 1,
        deletedTrainers: 1,
        deletedAthleteGroupMemberships: 1,
        deletedTrainerGroupMemberships: 1,
      });

      const sourceMarkers = await sourceRepository.listCurrentDeletionMarkers(NOW);
      expect(sourceMarkers).toHaveLength(2);
      expect(sourceMarkers.map((marker) => marker.entityType).sort()).toEqual([
        "athlete",
        "trainer",
      ]);
      for (const marker of sourceMarkers) {
        expect(marker.organizationId).toBe("verein-1");
        expect(marker.purgeAfter.getTime() - marker.completedAt.getTime()).toBe(
          35 * 24 * 60 * 60 * 1000,
        );
      }

      const markerColumns = await requiredSource().client.unsafe(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'appbasis_athletes_deletion'
         ORDER BY ordinal_position`,
      );
      expect(markerColumns.map((row) => row.column_name)).toEqual([
        "entity_type",
        "entity_id",
        "organization_id",
        "completed_at",
        "purge_after",
      ]);

      await expect(
        reconcileAthleteMasterdataRestoredDatabase(
          {
            listCurrentDeletionMarkers: () =>
              sourceRepository.listCurrentDeletionMarkers(NOW),
          },
          restoredRepository,
        ),
      ).resolves.toEqual({
        requiredDeletionCount: 2,
        insertedMarkerCount: 2,
        deletedEntityCount: 2,
        deletedGroupMembershipCount: 2,
      });

      await expect(
        restoredRepository.readOrganizationSnapshot("verein-1"),
      ).resolves.toMatchObject({
        athletes: [],
        trainers: [],
        athleteGroupMemberships: [],
        trainerGroupMemberships: [],
      });

      const restoredMarkers =
        await restoredRepository.listCurrentDeletionMarkers(NOW);
      expect(
        restoredMarkers.map((marker) => ({
          entityType: marker.entityType,
          entityId: marker.entityId,
          organizationId: marker.organizationId,
          completedAt: marker.completedAt.toISOString(),
          purgeAfter: marker.purgeAfter.toISOString(),
        })),
      ).toEqual(
        sourceMarkers.map((marker) => ({
          entityType: marker.entityType,
          entityId: marker.entityId,
          organizationId: marker.organizationId,
          completedAt: marker.completedAt.toISOString(),
          purgeAfter: marker.purgeAfter.toISOString(),
        })),
      );

      await expect(
        reconcileAthleteMasterdataRestoredDatabase(
          {
            listCurrentDeletionMarkers: () =>
              sourceRepository.listCurrentDeletionMarkers(NOW),
          },
          restoredRepository,
        ),
      ).resolves.toEqual({
        requiredDeletionCount: 2,
        insertedMarkerCount: 0,
        deletedEntityCount: 0,
        deletedGroupMembershipCount: 0,
      });

      const sourceCrossRepository = new PostgresAthleteMasterdataRepository(
        requiredSource().client,
        () => "athlete-cross-org",
      );
      const restoredCrossRepository = new PostgresAthleteMasterdataRepository(
        requiredRestored().client,
        () => "athlete-cross-org",
      );
      await sourceCrossRepository.createAthlete("verein-1", {
        firstName: "Cross",
        lastName: "Source",
      });
      await restoredCrossRepository.createAthlete("verein-2", {
        firstName: "Cross",
        lastName: "Restore",
      });
      await sourceCrossRepository.deactivateAthlete(
        "verein-1",
        "athlete-cross-org",
      );
      await requiredSource().client.unsafe(
        `UPDATE appbasis_athlete
         SET updated_at = '2025-09-26T09:00:00.000Z'::timestamptz
         WHERE id = 'athlete-cross-org'`,
      );
      await sourceCrossRepository.purgeDeactivatedPersonalData(NOW);

      await expect(
        reconcileAthleteMasterdataRestoredDatabase(
          {
            listCurrentDeletionMarkers: () =>
              sourceRepository.listCurrentDeletionMarkers(NOW),
          },
          restoredRepository,
        ),
      ).rejects.toThrow(/invalid shape/);

      const crossRows = await requiredRestored().client.unsafe(
        `SELECT organization_id
         FROM appbasis_athlete
         WHERE id = 'athlete-cross-org'`,
      );
      expect(crossRows).toEqual([{ organization_id: "verein-2" }]);
      const crossMarkers = await requiredRestored().client.unsafe(
        `SELECT organization_id
         FROM appbasis_athletes_deletion
         WHERE entity_type = 'athlete'
           AND entity_id = 'athlete-cross-org'`,
      );
      expect(crossMarkers).toEqual([]);

      await expect(
        sourceRepository.listCurrentDeletionMarkers(EXPIRED_NOW),
      ).resolves.toEqual([]);
      await expect(
        sourceRepository.purgeExpiredDeletionMarkers(EXPIRED_NOW),
      ).resolves.toBe(3);
    });

    function requiredSource() {
      if (source === null) throw new Error("E2D source database is not ready.");
      return source;
    }

    function requiredRestored() {
      if (restored === null) throw new Error("E2D restore database is not ready.");
      return restored;
    }
  });
}

function repositoryWithIds(
  client: ReturnType<typeof createPostgresDatabase>["client"],
  ids: string[],
) {
  const remaining = [...ids];
  return new PostgresAthleteMasterdataRepository(client, () => {
    const id = remaining.shift();
    if (id === undefined) throw new Error("E2D fixture id sequence exhausted.");
    return id;
  });
}

async function seedBackupState(repository: PostgresAthleteMasterdataRepository) {
  await repository.createTrainingGroup("verein-1", {
    name: "U14",
    shortName: "U14",
  });
  await repository.createAthlete("verein-1", {
    firstName: "Anna",
    lastName: "Muster",
  });
  await repository.createTrainer("verein-1", {
    firstName: "Max",
    lastName: "Trainer",
  });
  await repository.createAthleteGroupMembership("verein-1", {
    athleteId: "athlete-1",
    groupId: "group-1",
    startedOn: "2026-09-01",
  });
  await repository.createTrainerGroupMembership("verein-1", {
    trainerId: "trainer-1",
    groupId: "group-1",
  });
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 19 || new Set(migrations).size !== migrations.length) {
    throw new Error("ULC E2D requires the exact manifest-owned migration set.");
  }
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../../../${migration}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.unsafe(statement);
    }
  }
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}
