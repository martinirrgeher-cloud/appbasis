import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../migrations/0007_ulc_linz_exercise_catalog.sql",
  import.meta.url,
);
const manifestUrl = new URL("../appbasis.database.json", import.meta.url);

describe("ULC E6A exercise catalog schema", () => {
  it("owns the complete schema-v8 catalog foundation without cross-owner foreign keys", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain(
      'CREATE TABLE "ulc_linz_exercise_catalog_item"',
    );
    expect(migration).toContain(
      'CREATE TABLE "ulc_linz_exercise_parameter"',
    );
    expect(migration).toContain(
      'CREATE TABLE "ulc_linz_exercise_group"',
    );
    expect(migration).toContain(
      'CREATE TABLE "ulc_linz_exercise_favorite"',
    );
    expect(migration).not.toMatch(/\bREFERENCES\b/i);
  });

  it("pins categories, planning parameters and deactivate-instead-of-delete state", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    for (const category of [
      "warmup",
      "acceleration",
      "max_velocity",
      "speed_endurance",
      "start_reaction",
      "technique",
      "plyometrics",
      "strength",
      "stability",
      "regeneration",
      "other",
    ]) {
      expect(migration).toContain("'" + category + "'");
    }

    for (const parameter of [
      "sets",
      "repetitions",
      "distance_m",
      "weight_kg",
      "duration_s",
      "target_time_s",
      "intensity_percent",
      "rest_s",
      "series_rest_s",
      "approach_distance_m",
      "flying_distance_m",
      "contacts",
      "resistance_kg",
      "height_cm",
      "tempo_text",
      "surface_text",
      "start_position_text",
      "note_text",
    ]) {
      expect(migration).toContain("'" + parameter + "'");
    }

    expect(migration).toContain(
      '"is_active" boolean DEFAULT true NOT NULL',
    );
    expect(migration).toContain(
      'UNIQUE INDEX "ulc_linz_exercise_catalog_item_org_name_unique"',
    );
  });

  it("keeps organization scope explicit on every persisted catalog relation", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(
      migration.match(/"organization_id" text NOT NULL/g),
    ).toHaveLength(4);
    expect(migration).toContain(
      'PRIMARY KEY ("organization_id", "exercise_id", "parameter_key")',
    );
    expect(migration).toContain(
      'PRIMARY KEY ("organization_id", "exercise_id", "group_id")',
    );
    expect(migration).toContain(
      'PRIMARY KEY ("organization_id", "identity_id", "exercise_id")',
    );
  });

  it("publishes the catalog migration as the canonical schema-v8 tail", async () => {
    const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
    const owner = manifest.owners.find(
      (candidate: { id?: unknown }) =>
        candidate.id === "ulc-linz-lifecycle",
    );

    expect(owner?.schemaVersion).toBe(8);
    expect(owner?.migrations?.at(-1)).toBe(
      "apps/ulc-linz/migrations/0007_ulc_linz_exercise_catalog.sql",
    );
  });
});
