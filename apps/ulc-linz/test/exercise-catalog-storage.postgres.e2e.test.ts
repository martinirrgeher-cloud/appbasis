import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPostgresDatabase } from "../../../packages/database/src/client.ts";
import { createUlcExerciseCatalogItem } from "../worker/exercise-catalog-domain";
import {
  UlcExerciseCatalogConflictError,
  UlcExerciseCatalogNotFoundError,
} from "../worker/exercise-catalog-postgres";
import {
  StandardUlcExerciseCatalogRepository,
} from "../worker/exercise-catalog-storage";

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  describe.skip("ULC standard exercise catalog storage PostgreSQL E2E", () => {
    it("requires DATABASE_URL", () => {});
  });
} else {
  describe("ULC standard exercise catalog storage PostgreSQL E2E", () => {
    const admin = createPostgresDatabase(databaseUrl);
    const databaseName =
      "appbasis_ulc_standard_exercise_" +
      randomUUID().replaceAll("-", "").slice(0, 10);
    const isolatedUrl = databaseUrlForName(databaseUrl, databaseName);
    let isolated: ReturnType<typeof createPostgresDatabase> | null = null;
    let created = false;

    beforeAll(async () => {
      await admin.client.unsafe(`CREATE DATABASE ${databaseName}`);
      created = true;
      isolated = createPostgresDatabase(isolatedUrl);
      for (const migrationPath of [
        "../../../modules/exercise-catalog/migrations/0000_appbasis_exercise_catalog_foundation.sql",
        "../../../modules/exercise-catalog/migrations/0001_appbasis_exercise_catalog_tenant_identity.sql",
      ]) {
        const migration = await readFile(
          new URL(migrationPath, import.meta.url),
          "utf8",
        );
        for (const statement of migration.split("--> statement-breakpoint")) {
          if (statement.trim() !== "") {
            await requiredConnection().client.unsafe(statement);
          }
        }
      }
    });

    afterAll(async () => {
      if (isolated !== null) {
        await isolated.client.end();
        isolated = null;
      }
      if (created) {
        await admin.client.unsafe(
          `DROP DATABASE ${databaseName} WITH (FORCE)`,
        );
      }
      await admin.client.end();
    });

    function requiredConnection() {
      if (isolated === null) {
        throw new Error("Standard exercise catalog database is not ready.");
      }
      return isolated;
    }

    it("preserves the ULC service repository contract on standard-module target tables", async () => {
      const repository = new StandardUlcExerciseCatalogRepository(
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

    it("translates target unique-name violations to the established ULC conflict contract", async () => {
      const repository = new StandardUlcExerciseCatalogRepository(
        requiredConnection().client,
      );
      await repository.create(
        createUlcExerciseCatalogItem(
          {
            name: "Sprint ABC",
            categoryKey: "warmup",
          },
          { id: "duplicate-a", organizationId: "verein-dup" },
        ),
      );
      await expect(
        repository.create(
          createUlcExerciseCatalogItem(
            {
              name: "sprint abc",
              categoryKey: "warmup",
            },
            { id: "duplicate-b", organizationId: "verein-dup" },
          ),
        ),
      ).rejects.toBeInstanceOf(UlcExerciseCatalogConflictError);
    });
  });
}

function databaseUrlForName(connectionString: string, databaseName: string) {
  const url = new URL(connectionString);
  url.pathname = "/" + databaseName;
  return url.toString();
}
