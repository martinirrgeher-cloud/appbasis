import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresAthleteMasterdataRepository } from "@appbasis/athletes";
import { createPostgresDatabase } from "../../../packages/database/src/client.ts";

const databaseUrl = process.env.DATABASE_URL;

type DatabaseManifest = {
  owners: readonly {
    migrations: readonly string[];
  }[];
};

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC Stammdaten PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC Stammdaten PostgreSQL E2E", () => {
    const administrativeConnection = createPostgresDatabase(databaseUrl);
    const isolatedDatabaseName =
      "appbasis_ulc_masterdata_" + randomUUID().replaceAll("-", "").slice(0, 12);
    const isolatedDatabaseUrl = databaseUrlForName(
      databaseUrl,
      isolatedDatabaseName,
    );
    let isolatedConnection: ReturnType<typeof createPostgresDatabase> | null = null;
    let isolatedDatabaseCreated = false;

    beforeAll(async () => {
      await administrativeConnection.client.unsafe(
        "CREATE DATABASE " + isolatedDatabaseName,
      );
      isolatedDatabaseCreated = true;
      isolatedConnection = createPostgresDatabase(isolatedDatabaseUrl);
      await applyManifestMigrations(requiredConnection().client);
    });

    afterAll(async () => {
      if (isolatedConnection !== null) {
        await isolatedConnection.client.end();
        isolatedConnection = null;
      }
      if (isolatedDatabaseCreated) {
        await administrativeConnection.client.unsafe(
          "DROP DATABASE " + isolatedDatabaseName + " WITH (FORCE)",
        );
      }
      await administrativeConnection.client.end();
    });

    it("enforces organization isolation, same-org memberships and 12-month personal-data retention", async () => {
      const connection = requiredConnection();
      const repository = new PostgresAthleteMasterdataRepository(
        connection.client,
      );

      const groupOne = await repository.createTrainingGroup("verein-1", {
        name: "U14",
        shortName: "U14",
        sortOrder: 10,
      });
      const groupTwo = await repository.createTrainingGroup("verein-2", {
        name: "U14",
        shortName: "U14",
        sortOrder: 10,
      });
      const athleteOne = await repository.createAthlete("verein-1", {
        firstName: "Anna",
        lastName: "Muster",
        birthYear: 2012,
      });
      const athleteTwo = await repository.createAthlete("verein-2", {
        firstName: "Berta",
        lastName: "Beispiel",
        birthYear: 2011,
      });
      const activeAthlete = await repository.createAthlete("verein-1", {
        firstName: "Clara",
        lastName: "Aktiv",
        birthYear: 2013,
      });
      const trainerOne = await repository.createTrainer("verein-1", {
        firstName: "Max",
        lastName: "Trainer",
        email: "max@example.test",
      });

      await expect(
        repository.createAthleteGroupMembership("verein-1", {
          athleteId: athleteOne.id,
          groupId: groupOne.id,
          startedOn: "2026-09-01",
        }),
      ).resolves.toMatchObject({
        organizationId: "verein-1",
        athleteId: athleteOne.id,
        groupId: groupOne.id,
      });

      await expect(
        repository.createTrainerGroupMembership("verein-1", {
          trainerId: trainerOne.id,
          groupId: groupOne.id,
        }),
      ).resolves.toMatchObject({
        organizationId: "verein-1",
        trainerId: trainerOne.id,
        groupId: groupOne.id,
      });

      await expect(
        repository.createTrainerGroupMembership("verein-1", {
          trainerId: trainerOne.id,
          groupId: groupOne.id,
        }),
      ).resolves.toMatchObject({
        organizationId: "verein-1",
        trainerId: trainerOne.id,
        groupId: groupOne.id,
      });

      const trainerMembershipRows = await connection.client.unsafe(
        `SELECT organization_id, trainer_id, group_id
         FROM appbasis_trainer_group_membership
         WHERE organization_id = $1 AND trainer_id = $2 AND group_id = $3`,
        ["verein-1", trainerOne.id, groupOne.id],
      );
      expect(trainerMembershipRows).toEqual([
        {
          organization_id: "verein-1",
          trainer_id: trainerOne.id,
          group_id: groupOne.id,
        },
      ]);

      await expect(
        repository.createAthleteGroupMembership("verein-1", {
          athleteId: athleteOne.id,
          groupId: groupOne.id,
          startedOn: "2099-01-01",
        }),
      ).resolves.toMatchObject({
        organizationId: "verein-1",
        athleteId: athleteOne.id,
        groupId: groupOne.id,
        startedOn: "2099-01-01",
      });

      await expect(
        repository.createAthleteGroupMembership("verein-1", {
          athleteId: athleteOne.id,
          groupId: groupTwo.id,
          startedOn: "2026-09-01",
        }),
      ).rejects.toThrow(/invalid row count/);

      const snapshot = await repository.readOrganizationSnapshot("verein-1");
      expect(snapshot.trainingGroups.map((entry) => entry.id)).toEqual([
        groupOne.id,
      ]);
      expect(snapshot.athletes.map((entry) => entry.id)).toHaveLength(2);
      expect(snapshot.athletes.map((entry) => entry.id)).toEqual(
        expect.arrayContaining([athleteOne.id, activeAthlete.id]),
      );
      expect(snapshot.trainers.map((entry) => entry.id)).toEqual([
        trainerOne.id,
      ]);
      expect(JSON.stringify(snapshot)).not.toContain(athleteTwo.id);
      expect(JSON.stringify(snapshot)).not.toContain(groupTwo.id);

      await expect(
        repository.deactivateAthlete("verein-1", athleteOne.id),
      ).resolves.toBe(true);
      await expect(
        repository.deactivateTrainer("verein-1", trainerOne.id),
      ).resolves.toBe(true);
      await expect(
        repository.deactivateAthlete("verein-2", athleteTwo.id),
      ).resolves.toBe(true);

      await connection.client.unsafe(
        `UPDATE appbasis_athlete
         SET updated_at = '2025-09-26T09:00:00.000Z'::timestamptz
         WHERE id = $1 AND organization_id = 'verein-1'`,
        [athleteOne.id],
      );
      await connection.client.unsafe(
        `UPDATE appbasis_trainer
         SET updated_at = '2025-09-26T09:00:00.000Z'::timestamptz
         WHERE id = $1 AND organization_id = 'verein-1'`,
        [trainerOne.id],
      );
      await connection.client.unsafe(
        `UPDATE appbasis_athlete
         SET updated_at = '2026-09-01T09:00:00.000Z'::timestamptz
         WHERE id = $1 AND organization_id = 'verein-2'`,
        [athleteTwo.id],
      );
      await connection.client.unsafe(
        `UPDATE appbasis_athlete
         SET updated_at = '2020-01-01T00:00:00.000Z'::timestamptz
         WHERE id = $1 AND organization_id = 'verein-1'`,
        [activeAthlete.id],
      );

      await expect(
        repository.purgeDeactivatedPersonalData(
          new Date("2026-09-27T10:00:00.000Z"),
        ),
      ).resolves.toEqual({
        deletedAthletes: 1,
        deletedTrainers: 1,
        deletedAthleteGroupMemberships: 2,
        deletedTrainerGroupMemberships: 1,
      });

      const remaining = await connection.client.unsafe(
        `SELECT organization_id, id, is_active
         FROM appbasis_athlete
         ORDER BY organization_id, id`,
      );
      expect(remaining).toHaveLength(2);
      expect(remaining).toEqual(
        expect.arrayContaining([
          {
            organization_id: "verein-1",
            id: activeAthlete.id,
            is_active: true,
          },
          {
            organization_id: "verein-2",
            id: athleteTwo.id,
            is_active: false,
          },
        ]),
      );

      const memberships = await connection.client.unsafe(
        `SELECT
           (SELECT count(*)::int FROM appbasis_athlete_group_membership)
             AS athlete_memberships,
           (SELECT count(*)::int FROM appbasis_trainer_group_membership)
             AS trainer_memberships`,
      );
      expect(memberships[0]).toEqual({
        athlete_memberships: 0,
        trainer_memberships: 0,
      });
    });

    function requiredConnection() {
      if (isolatedConnection === null) {
        throw new Error("The isolated ULC Stammdaten PostgreSQL database is not ready.");
      }
      return isolatedConnection;
    }
  });
}

async function applyManifestMigrations(
  client: ReturnType<typeof createPostgresDatabase>["client"],
) {
  const manifest = JSON.parse(
    await readFile(new URL("../appbasis.database.json", import.meta.url), "utf8"),
  ) as DatabaseManifest;
  const migrations = manifest.owners.flatMap((owner) => owner.migrations);
  if (migrations.length !== 16 || new Set(migrations).size !== migrations.length) {
    throw new Error("ULC Stammdaten E2E requires the exact manifest-owned migration set.");
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
