import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { createUlcExerciseCatalogItem } from "../worker/exercise-catalog-domain";
import {
  PostgresUlcExerciseCatalogRepository,
  UlcExerciseCatalogConflictError,
  UlcExerciseCatalogNotFoundError,
} from "../worker/exercise-catalog-postgres";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC exercise catalog PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC exercise catalog PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const databaseName =
      "appbasis_ulc_exercise_" +
      randomUUID().replaceAll("-", "").slice(0, 12);
    const isolatedUrl = databaseUrlForName(databaseUrl, databaseName);
    let isolated: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    beforeAll(async () => {
      await admin.client.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      isolated = createPostgresDatabase(isolatedUrl);
      const migration = await readFile(
        new URL("../migrations/0007_ulc_linz_exercise_catalog.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim() !== "") {
          await requiredConnection().client.unsafe(statement);
        }
      }
    });

    afterAll(async () => {
      if (isolated !== null) {
        await isolated.client.end();
        isolated = null;
      }
      if (created) {
        await admin.client.unsafe(`DROP DATABASE ${databaseName} WITH (FORCE)`);
      }
      await admin.client.end();
    });

    it("creates, reads, updates, favorites and deactivates inside the organization boundary", async () => {
      const repository = new PostgresUlcExerciseCatalogRepository(
        requiredConnection().client,
      );
      const item = createUlcExerciseCatalogItem(
        {
          name: "Fliegende 30",
          categoryKey: "max_velocity",
          goal: "Maximalgeschwindigkeit",
          equipment: ["Hütchen"],
          videoUrl: "https://example.test/flying-30",
          groupIds: ["group-1"],
          parameters: [
            {
              key: "flying_distance_m",
              label: "Fliegend",
              unit: "m",
              inputType: "number",
              defaultValue: "30",
              minValue: 10,
              maxValue: 60,
              stepValue: 5,
              isRequired: true,
              sortOrder: 10,
            },
          ],
        },
        { id: "exercise-1", organizationId: "verein-1" },
      );

      await repository.create(item);
      await expect(
        repository.list("verein-1", "identity-1"),
      ).resolves.toEqual([
        expect.objectContaining({
          id: "exercise-1",
          organizationId: "verein-1",
          name: "Fliegende 30",
          groupIds: ["group-1"],
          equipment: ["Hütchen"],
          isFavorite: false,
          isActive: true,
          parameters: [
            expect.objectContaining({
              key: "flying_distance_m",
              defaultValue: "30",
              minValue: 10,
              maxValue: 60,
              stepValue: 5,
            }),
          ],
        }),
      ]);
      await expect(
        repository.list("verein-2", "identity-1"),
      ).resolves.toEqual([]);

      await repository.setFavorite(
        "verein-1",
        "identity-1",
        "exercise-1",
        true,
      );
      await expect(
        repository.read("verein-1", "identity-1", "exercise-1"),
      ).resolves.toMatchObject({ isFavorite: true });

      const updated = createUlcExerciseCatalogItem(
        {
          name: "Fliegende 40",
          categoryKey: "max_velocity",
          groupIds: [],
          parameters: [],
        },
        { id: "exercise-1", organizationId: "verein-1" },
      );
      await repository.update(updated);
      await expect(
        repository.read("verein-1", "identity-1", "exercise-1"),
      ).resolves.toMatchObject({
        name: "Fliegende 40",
        groupIds: [],
        parameters: [],
        isFavorite: true,
      });

      await repository.deactivate("verein-1", "exercise-1");
      await expect(
        repository.read("verein-1", "identity-1", "exercise-1"),
      ).resolves.toMatchObject({ isActive: false });
      await expect(
        repository.deactivate("verein-1", "exercise-1"),
      ).rejects.toBeInstanceOf(UlcExerciseCatalogNotFoundError);
    });

    it("enforces organization-local case-insensitive name uniqueness without partial child writes", async () => {
      const repository = new PostgresUlcExerciseCatalogRepository(
        requiredConnection().client,
      );
      await repository.create(
        createUlcExerciseCatalogItem(
          {
            name: "Sprint ABC",
            categoryKey: "warmup",
            groupIds: ["group-x"],
            parameters: [
              {
                key: "repetitions",
                label: "Wiederholungen",
                inputType: "number",
              },
            ],
          },
          { id: "exercise-duplicate-a", organizationId: "verein-dup" },
        ),
      );

      await expect(
        repository.create(
          createUlcExerciseCatalogItem(
            {
              name: "sprint abc",
              categoryKey: "warmup",
              groupIds: ["group-y"],
            },
            { id: "exercise-duplicate-b", organizationId: "verein-dup" },
          ),
        ),
      ).rejects.toBeInstanceOf(UlcExerciseCatalogConflictError);

      const counts = await requiredConnection().client.unsafe(
        `SELECT
           (SELECT count(*)::int
              FROM ulc_linz_exercise_catalog_item
             WHERE organization_id = 'verein-dup') AS items,
           (SELECT count(*)::int
              FROM ulc_linz_exercise_group
             WHERE organization_id = 'verein-dup'
               AND exercise_id = 'exercise-duplicate-b') AS leaked_groups,
           (SELECT count(*)::int
              FROM ulc_linz_exercise_parameter
             WHERE organization_id = 'verein-dup'
               AND exercise_id = 'exercise-duplicate-b') AS leaked_parameters`,
      );
      expect(counts[0]).toEqual({
        items: 1,
        leaked_groups: 0,
        leaked_parameters: 0,
      });
    });

    function requiredConnection() {
      if (isolated === null) {
        throw new Error("Exercise catalog database is not ready.");
      }
      return isolated;
    }
  });
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}
