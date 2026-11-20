import { describe, expect, it } from "vitest";

import {
  assertUlcProtectedCatalogPreviewReadiness,
  UlcProtectedCatalogUnavailableError,
  type UlcProtectedCatalogPreviewReadinessClient,
} from "../worker/exercise-catalog-protected-runtime-readiness";

const READY = Object.freeze({
  database_name: "appbasis_ulc_linz_preview",
  principal_name: "appbasis_ulc_linz_preview_application",
  public_tables: 68,
  item_exists: true,
  favorite_exists: true,
  marker_exists: true,
  usage_subject_exists: true,
  training_subject_marker_exists: false,
  training_subject_fence_triggers: 0,
  may_access_training_subject_marker: false,
  may_write_item: true,
  may_write_favorite: true,
  may_write_children: true,
  may_read_marker: true,
  may_mutate_marker: false,
});

function harness(row: Record<string, unknown> | null = READY, fail = false) {
  const statements: string[] = [];
  const sql: UlcProtectedCatalogPreviewReadinessClient = {
    async begin(callback) {
      return callback({
        async unsafe(query) {
          statements.push(query);
          if (fail) throw new Error("Synthetic connection or permission failure");
          return query.startsWith("SET TRANSACTION") ? [] : row === null ? [] : [row];
        },
      });
    },
  };
  return { sql, statements };
}

describe("P2-D isolated protected catalog Preview readiness", () => {
  it("runs a read-only metadata and privilege check under the app role", async () => {
    const h = harness();
    await expect(assertUlcProtectedCatalogPreviewReadiness(h.sql)).resolves.toBeUndefined();
    expect(h.statements[0]).toMatch(/REPEATABLE READ, READ ONLY/);
    expect(h.statements[1]).toContain("current_user");
    expect(h.statements[1]).toContain("appbasis_exercise_catalog_usage_subject");
    expect(h.statements[1]).toContain("ulc_linz_training_subject_deletion");
    expect(h.statements[1]).toContain("ulc_linz_training_registration_change_subject_fence");
    expect(h.statements[1]).toContain("trigger.tgenabled IN ('O', 'A')");
    expect(h.statements[1]).toContain("(trigger.tgtype::integer & 23) = 23");
    expect(h.statements[1]).toContain("ulc_linz_training_subject_write_fence()");
    expect(h.statements[1]).toContain("appbasis_exercise_catalog_parameter");
    expect(h.statements[1]).toContain("appbasis_exercise_catalog_similarity");
    expect(h.statements[1]).toContain("has_table_privilege");
    expect(h.statements).toHaveLength(2);
    expect(h.statements.every((statement) => !/\b(GRANT|INSERT INTO|DELETE FROM|UPDATE\s+appbasis_)\b/i.test(statement))).toBe(true);
  });

  it("accepts 69-table Preview only when all three training fences exist and ordinary marker access is denied", async () => {
    const ready69 = {
      ...READY,
      public_tables: 69,
      training_subject_marker_exists: true,
      training_subject_fence_triggers: 3,
      may_access_training_subject_marker: false,
    };
    await expect(assertUlcProtectedCatalogPreviewReadiness(harness(ready69).sql))
      .resolves.toBeUndefined();
    for (const change of [
      { training_subject_marker_exists: false },
      { training_subject_fence_triggers: 0 },
      { training_subject_fence_triggers: 2 },
      { training_subject_fence_triggers: 4 },
      { may_access_training_subject_marker: true },
      { database_name: "neondb" },
      { principal_name: "ulc_linz_application" },
    ]) {
      await expect(assertUlcProtectedCatalogPreviewReadiness(harness({
        ...ready69, ...change,
      }).sql)).rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
    }
  });

  it("fails closed for missing catalog, wrong role/db/schema or unexpected marker write powers", async () => {
    const badRows: Record<string, unknown>[] = [
      { ...READY, database_name: "prod" },
      { ...READY, principal_name: "appbasis_ulc_linz_preview_migration" },
      { ...READY, public_tables: 65 },
      { ...READY, public_tables: 66 }, // Legacy Preview lacks two catalog guard tables
      { ...READY, public_tables: 67 }, // Partially migrated schema is never ready
      { ...READY, public_tables: 69 },
      { ...READY, usage_subject_exists: false },
      { ...READY, may_read_marker: false },
      { ...READY, may_write_favorite: false },
      { ...READY, may_write_children: false },
      { ...READY, may_mutate_marker: true },
      { ...READY, may_write_item: "true" },
    ];
    for (const row of badRows) {
      await expect(assertUlcProtectedCatalogPreviewReadiness(harness(row).sql))
        .rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
    }
    await expect(assertUlcProtectedCatalogPreviewReadiness(harness(null).sql))
      .rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
    await expect(assertUlcProtectedCatalogPreviewReadiness(harness(READY, true).sql))
      .rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
  });

  it("denies a missing transaction interface before performing any write", async () => {
    await expect(assertUlcProtectedCatalogPreviewReadiness(
      {} as UlcProtectedCatalogPreviewReadinessClient,
    )).rejects.toBeInstanceOf(UlcProtectedCatalogUnavailableError);
  });
});
