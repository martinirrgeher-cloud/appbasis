import { describe, expect, it, vi } from "vitest";

import {
  assertUlcProtectedCatalogPreviewReadiness,
  UlcProtectedCatalogUnavailableError,
  type UlcProtectedCatalogPreviewReadinessClient,
} from "../worker/exercise-catalog-protected-runtime-readiness";

const READY = Object.freeze({
  database_name: "appbasis_ulc_linz_preview",
  principal_name: "appbasis_ulc_linz_preview_application",
  public_tables: 66,
  item_exists: true,
  favorite_exists: true,
  marker_exists: true,
  usage_subject_exists: true,
  may_write_item: true,
  may_write_favorite: true,
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
    expect(h.statements[1]).toContain("has_table_privilege");
    expect(h.statements).toHaveLength(2);
    expect(h.statements.every((statement) => !/\b(GRANT|INSERT INTO|DELETE FROM|UPDATE\s+appbasis_)\b/i.test(statement))).toBe(true);
  });

  it("fails closed for missing catalog, wrong role/db/schema or unexpected marker write powers", async () => {
    const badRows: Record<string, unknown>[] = [
      { ...READY, database_name: "prod" },
      { ...READY, principal_name: "appbasis_ulc_linz_preview_migration" },
      { ...READY, public_tables: 65 },
      { ...READY, usage_subject_exists: false },
      { ...READY, may_read_marker: false },
      { ...READY, may_write_favorite: false },
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
