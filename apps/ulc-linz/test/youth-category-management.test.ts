import { describe, expect, it, vi } from "vitest";
import {
  PostgresUlcYouthCategoryRepository,
  UlcYouthCategoryConflictError,
  UlcYouthCategoryValidationError,
  safeYouthTrainingArea,
} from "../worker/youth-category-postgres";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import { ULC_YOUTH_CATEGORY_HTML, ULC_YOUTH_CATEGORY_SCRIPT } from "../worker/youth-category-ui";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

const row = (code: string, label: string, isActive = true, revision = 1) => ({
  code, label, is_active: isActive, revision,
});

describe("ULC independent training area category repository", () => {
  it("reads only the authorized organization and seeds defaults idempotently", async () => {
    const calls: Array<{ query: string; params: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcYouthCategoryRepository({
      async unsafe(query, parameters) {
        calls.push({ query, params: parameters });
        return query.includes("SELECT code, label, is_active, revision")
          ? [row("sprint", "Sprint / Schnelligkeit"), row("games", "Spiel / Staffel", false)]
          : [];
      },
    }, () => "custom_0123");
    const categories = await repository.list("verein-a", "u12");
    expect(categories).toEqual([
      { code: "sprint", label: "Sprint / Schnelligkeit", isActive: true, revision: 1 },
      { code: "games", label: "Spiel / Staffel", isActive: false, revision: 1 },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.query).toContain("ON CONFLICT DO NOTHING");
    expect(calls[0]!.params?.[0]).toBe("verein-a");
    expect(calls[1]!.query).toContain("WHERE organization_id = $1");
    expect(calls[1]!.params).toEqual(["verein-a"]);
  });

  it("creates stable custom category codes and blocks duplicates", async () => {
    const unsafe = vi.fn(async (_sql: string, params?: unknown[]) =>
      [row(String(params?.[1]), String(params?.[2]))]);
    const repository = new PostgresUlcYouthCategoryRepository({ unsafe },
      () => "custom_1234abcd");
    await expect(repository.create("verein-a", "u12", "Hürdenlauf")).resolves.toEqual({
      code: "custom_1234abcd", label: "Hürdenlauf", isActive: true, revision: 1,
    });
    expect(unsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ulc_linz_youth_content_category"),
      ["verein-a", "custom_1234abcd", "Hürdenlauf"],
    );
    await expect(repository.create("verein-a", "u12", "  ")).rejects.toThrow(
      UlcYouthCategoryValidationError,
    );
    const duplicate = new PostgresUlcYouthCategoryRepository({
      async unsafe() { throw { code: "23505" }; },
    }, () => "custom_1234abcd");
    await expect(duplicate.create("verein-a", "u12", "Hürdenlauf"))
      .rejects.toThrow(UlcYouthCategoryConflictError);
  });

  it("requires revision matching for rename/deactivation without deleting rows", async () => {
    let query = "";
    let parameters: unknown[] | undefined;
    const repository = new PostgresUlcYouthCategoryRepository({
      async unsafe(sql, params) {
        query = sql; parameters = params;
        return [row("sprint", "Sprint", false, 5)];
      },
    });
    await expect(repository.update("verein-a", "u12", "sprint", {
      label: "Sprint", isActive: false, expectedRevision: 4,
    })).resolves.toEqual({
      code: "sprint", label: "Sprint", isActive: false, revision: 5,
    });
    expect(query).toContain("AND revision = $5");
    expect(query).not.toContain("DELETE");
    expect(parameters).toEqual(["verein-a", "sprint", "Sprint", false, 4]);
    const stale = new PostgresUlcYouthCategoryRepository({
      async unsafe() { return []; },
    });
    await expect(stale.update("verein-a", "u12", "sprint", {
      label: "Sprint", isActive: false, expectedRevision: 3,
    })).rejects.toThrow(UlcYouthCategoryConflictError);
  });

  it("allows historical labels of deactivated or renamed categories but blocks new misuse", async () => {
    const repository = new PostgresUlcYouthCategoryRepository({
      async unsafe(sql) {
        return sql.includes("SELECT code, label, is_active, revision")
          ? [row("sprint", "Schnelligkeit neu", false), row("jump", "Sprung", true)]
          : [];
      },
    });
    const items = [{ code: "sprint", detail: "4x30" }];
    await expect(repository.validateSessionContents("verein-a", "u12", ["Sprint / Schnelligkeit"],
      items, { titles: ["Sprint / Schnelligkeit"], items: [{ code: "sprint", detail: "" }] }))
      .resolves.toBeUndefined();
    await expect(repository.validateSessionContents("verein-a", "u12", ["Sprint / Schnelligkeit"],
      items, null)).rejects.toThrow(UlcTrainingValidationError);
    await expect(repository.validateSessionContents("verein-a", "u12", ["Sprung"],
      [{ code: "jump", detail: "" }], null)).resolves.toBeUndefined();
    await expect(repository.validateSessionContents("verein-a", "u12", ["Springen"],
      [{ code: "jump", detail: "" }], null)).rejects.toThrow(UlcTrainingValidationError);
  });
});

describe("ULC cross-group category isolation", () => {
  it("requires an explicit approved training area", () => {
    expect(safeYouthTrainingArea("u12")).toBe("u12");
    expect(safeYouthTrainingArea("u14")).toBe("u14");
    expect(safeYouthTrainingArea("kindertraining")).toBe("kindertraining");
    for (const invalid of ["", "irrgeher", "u15", null, undefined]) {
      expect(() => safeYouthTrainingArea(invalid)).toThrow(UlcYouthCategoryValidationError);
    }
  });

  it("seeds and loads independent U14 and Kindertraining catalogs without writing to U12", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcYouthCategoryRepository({
      async unsafe(sql, params) {
        calls.push({ sql, params });
        return sql.includes("SELECT code, label, is_active, revision")
          ? [row("warmup", "Aufwärmen")] : [];
      },
    });
    await repository.list("verein-a", "u14");
    await repository.list("verein-a", "kindertraining");
    expect(calls).toHaveLength(4);
    expect(calls.every((call) => call.sql.includes("ulc_linz_youth_group_category"))).toBe(true);
    expect(calls[0]!.params?.[1]).toBe("u14");
    expect(calls[1]!.params).toEqual(["verein-a", "u14"]);
    expect(calls[2]!.params?.[1]).toBe("kindertraining");
    expect(calls[3]!.params).toEqual(["verein-a", "kindertraining"]);
    expect(calls[0]!.params?.[2]).toContain("Hürden");
    expect(calls[2]!.params?.[2]).toContain("Bewegungsspiele");
    expect(calls[0]!.sql).toContain("ON CONFLICT DO NOTHING");
  });

  it("creates and updates group categories with mandatory organization and area predicates", async () => {
    const calls: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const repository = new PostgresUlcYouthCategoryRepository({
      async unsafe(sql, params) {
        calls.push({ sql, params });
        return sql.startsWith("INSERT") ? [row("custom_a", "Staffeltraining")] :
          [row("custom_a", "Laufstaffel", false, 2)];
      },
    }, () => "custom_a");
    await repository.create("verein-a", "kindertraining", "Staffeltraining");
    await repository.update("verein-a", "kindertraining", "custom_a", {
      label: "Laufstaffel", isActive: false, expectedRevision: 1,
    });
    expect(calls[0]!.params).toEqual(["verein-a", "kindertraining", "custom_a", "Staffeltraining"]);
    expect(calls[1]!.params).toEqual(["verein-a", "kindertraining", "custom_a", "Laufstaffel", false, 1]);
    expect(calls[1]!.sql).toContain("training_area = $2");
    expect(calls[1]!.sql).toContain("revision = $6");
    expect(calls[1]!.sql).not.toContain("DELETE");
  });
});

describe("ULC mobile category management", () => {
  it("provides an attendance overlay with add, edit, disable, reactivate and hidden inactive", () => {
    expect(ULC_YOUTH_CATEGORY_HTML).toContain('id="youth-category-dialog"');
    expect(ULC_YOUTH_CATEGORY_HTML).toContain('id="youth-category-create"');
    expect(ULC_YOUTH_CATEGORY_HTML).toContain('id="youth-category-inactive"');
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("youthCategoryShowInactive");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("Umbenennen");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("Deaktivieren");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("Aktivieren");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("expectedRevision: category.revision");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain('requestJson("/api/modules/youth-categories?area="');
    expect(ULC_U12_SCRIPT).toContain("updateU12CategoryCatalog(categories)");
    // N17 keeps the fresh category read on every attendance load, now in
    // parallel with the authorized session request (not cached or skipped).
    expect(ULC_U12_SCRIPT).toContain("const [, payload] = await Promise.all([");
    expect(ULC_U12_SCRIPT).toContain("refreshYouthCategoryCatalog(),");
    expect(ULC_U12_SCRIPT).toContain("im Training gespeichert");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("youthCategoryArea = area;");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain("area === \"u12\"");
    expect(ULC_YOUTH_CATEGORY_HTML).not.toContain("Gemeinsam für U12, U14");
    expect(ULC_LINZ_APP_HTML).toContain('data-youth-category-area="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-youth-category-area="u14"');
    expect(ULC_LINZ_APP_HTML).toContain('data-youth-category-area="kindertraining"');
    expect(ULC_U12_HTML).toContain('class="u12-category-shortcut ab-icon-button"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-categories"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("syncKindertrainingCategoryShortcut()");
    expect(ULC_LINZ_APP_CSS).not.toContain(".app-nav__attendance-row");
    expect(ULC_U12_CSS).toContain(".u12-category-shortcut");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).not.toContain("localStorage");
  });
});
