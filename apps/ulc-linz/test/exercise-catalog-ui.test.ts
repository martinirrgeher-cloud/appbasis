import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC E6C exercise catalog UI", () => {
  it("ships a compact catalog page with overlay filters and a separated tabbed editor", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="exercise-catalog" data-nav-priority="2" hidden disabled',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-app-section="exercise-catalog"',
    );
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-search"');
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-filter-toggle"');
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="exercise-catalog-filter-sheet" role="dialog" aria-modal="true"',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="exercise-catalog-editor" hidden',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'class="exercise-catalog-editor-dialog" role="dialog" aria-modal="true"',
    );
    for (const tab of ["basis", "instructions", "groups", "parameters"]) {
      expect(ULC_LINZ_APP_HTML).toContain(
        'data-exercise-catalog-tab="' + tab + '"',
      );
      expect(ULC_LINZ_APP_HTML).toContain(
        'data-exercise-catalog-panel="' + tab + '"',
      );
    }
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-parameters"');
    expect(ULC_LINZ_APP_CSS).toContain(".exercise-catalog-filter-sheet");
    expect(ULC_LINZ_APP_CSS).toContain(".exercise-catalog-editor-backdrop");
    expect(ULC_LINZ_APP_CSS).toContain("position: sticky;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("setExerciseCatalogFilterOpen");
    expect(ULC_LINZ_APP_SCRIPT).toContain("setExerciseCatalogEditorTab");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'window.confirm("Ungespeicherte Änderungen verwerfen?")',
    );
  });

  it("offers read-only XLSX export and import-template actions", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-template"');
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-export"');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/exercise-catalog/template.xlsx"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/exercise-catalog/export.xlsx"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("downloadExerciseCatalogWorkbook");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
  });

  it("offers E6F2 read-only XLSX import preview and row review in the existing editor", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-import-open"');
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-import-file"');
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-import-preview" hidden');
    expect(ULC_LINZ_APP_HTML).toContain('id="exercise-catalog-import-review" hidden');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/exercise-catalog/import-preview"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "EXERCISE_CATALOG_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("value.applyAvailable !== false");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "populateExerciseCatalogEditor(row.draft, {",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("exerciseCatalogEditorReviewMode");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("/import-apply");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("actorPrincipalId");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("uses only the protected server-owned catalog API without client scope", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/exercise-catalog")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/exercise-catalog/" + encodeURIComponent(id)',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/update"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/deactivate"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/favorite"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("payload?.access?.edit");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("actorPrincipalId");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("keeps archive, favorites and canonical planning parameters in the mobile client", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'status === "archived" && item.isActive !== false',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'item.isFavorite ? "DELETE" : "PUT"',
    );
    for (const key of [
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
      expect(ULC_LINZ_APP_SCRIPT).toContain('key: "' + key + '"');
    }
  });

  it("acknowledges committed mutations without a second refresh request", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "reconcileExerciseCatalogItem(payload.item);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "closeExerciseCatalogEditor(true);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "archiveExerciseCatalogItemLocally(deactivatedId);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Übung wurde gespeichert. Die Ansicht konnte nicht automatisch aktualisiert werden.",
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("reloadExerciseCatalog");
  });

  it("parses the delivered browser script as an ES module", () => {
    const result = spawnSync(
      process.execPath,
      ["--check", "--input-type=module"],
      {
        input: ULC_LINZ_APP_SCRIPT,
        encoding: "utf8",
      },
    );

    expect(result.status, result.stderr).toBe(0);
  });
});
