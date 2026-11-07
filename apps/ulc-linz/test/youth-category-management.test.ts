import { describe, expect, it, vi } from "vitest";
import {
  PostgresUlcYouthCategoryRepository,
  UlcYouthCategoryConflictError,
  UlcYouthCategoryValidationError,
} from "../worker/youth-category-postgres";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import { ULC_YOUTH_CATEGORY_HTML, ULC_YOUTH_CATEGORY_SCRIPT } from "../worker/youth-category-ui";
import { ULC_U12_SCRIPT } from "../worker/u12-ui";

const row = (code: string, label: string, isActive = true, revision = 1) => ({
  code, label, is_active: isActive, revision,
});

describe("ULC shared training category repository", () => {
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
    const categories = await repository.list("verein-a");
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
    await expect(repository.create("verein-a", "Hürdenlauf")).resolves.toEqual({
      code: "custom_1234abcd", label: "Hürdenlauf", isActive: true, revision: 1,
    });
    expect(unsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO ulc_linz_youth_content_category"),
      ["verein-a", "custom_1234abcd", "Hürdenlauf"],
    );
    await expect(repository.create("verein-a", "  ")).rejects.toThrow(
      UlcYouthCategoryValidationError,
    );
    const duplicate = new PostgresUlcYouthCategoryRepository({
      async unsafe() { throw { code: "23505" }; },
    }, () => "custom_1234abcd");
    await expect(duplicate.create("verein-a", "Hürdenlauf"))
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
    await expect(repository.update("verein-a", "sprint", {
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
    await expect(stale.update("verein-a", "sprint", {
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
    await expect(repository.validateSessionContents("verein-a", ["Sprint / Schnelligkeit"],
      items, { titles: ["Sprint / Schnelligkeit"], items: [{ code: "sprint", detail: "" }] }))
      .resolves.toBeUndefined();
    await expect(repository.validateSessionContents("verein-a", ["Sprint / Schnelligkeit"],
      items, null)).rejects.toThrow(UlcTrainingValidationError);
    await expect(repository.validateSessionContents("verein-a", ["Sprung"],
      [{ code: "jump", detail: "" }], null)).resolves.toBeUndefined();
    await expect(repository.validateSessionContents("verein-a", ["Springen"],
      [{ code: "jump", detail: "" }], null)).rejects.toThrow(UlcTrainingValidationError);
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
    expect(ULC_YOUTH_CATEGORY_SCRIPT).toContain('requestJson("/api/modules/youth-categories"');
    expect(ULC_U12_SCRIPT).toContain("updateU12CategoryCatalog(categories)");
    expect(ULC_U12_SCRIPT).toContain("await refreshYouthCategoryCatalog();");
    expect(ULC_U12_SCRIPT).toContain("im Training gespeichert");
    expect(ULC_YOUTH_CATEGORY_SCRIPT).not.toContain("localStorage");
  });
});
