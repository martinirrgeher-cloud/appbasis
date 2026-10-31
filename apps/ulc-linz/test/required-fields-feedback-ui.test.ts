import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";
import {
  ULC_EXERCISE_CATALOG_HTML,
} from "../worker/exercise-catalog-ui";
import {
  ULC_TRAINING_BLOCKS_SCRIPT,
  ULC_TRAINING_BLOCKS_CSS,
} from "../worker/training-blocks-ui";
import { ULC_USER_ADMIN_HTML } from "../worker/user-admin-ui";

describe("ULC editor required-field guidance", () => {
  it("starts with neutral fields and marks only invalid controls after failed submission", () => {
    expect(ULC_LINZ_APP_CSS).toContain(
      ".ulc-validation-attempted :is(input, select, textarea):invalid",
    );
    expect(ULC_LINZ_APP_CSS).toContain("background: #fef9c3");
    expect(ULC_LINZ_APP_CSS).toContain(".ulc-validation-summary {");
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.addEventListener("invalid", (event) => {');
    expect(ULC_LINZ_APP_SCRIPT).toContain('form.classList.add("ulc-validation-attempted")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('summary.setAttribute("role", "alert")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('summary.textContent = "Bitte prüfen: "');
  });

  it("covers actual Stammdaten, trainer and athlete user, and exercise editors without planning/docs", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("const ULC_VALIDATED_FORMS = [");
    const end = ULC_LINZ_APP_SCRIPT.indexOf('].join(", ");', start);
    const forms = ULC_LINZ_APP_SCRIPT.slice(start, end);
    for (const id of [
      "athlete-form", "trainer-form", "group-form", "athlete-contact-form",
      "athlete-group-form", "trainer-group-form", "athlete-user-form",
      "trainer-user-form", "trainer-identity-form", "exercise-catalog-form",
      "user-admin-form",
    ]) expect(forms).toContain('"#' + id + '"');
    expect(forms).not.toContain("training-plans");
    expect(forms).not.toContain("training-documentation");
    expect(ULC_EXERCISE_CATALOG_HTML).toContain('id="exercise-catalog-name"');
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-form"');
  });

  it("names the fields and clears feedback while correcting or resetting a form", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("invalid.map(ulcFieldDisplayName)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("control.closest(\"label\")");
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.addEventListener("input", (event) => {');
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.addEventListener("change", (event) => {');
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.addEventListener("reset", (event) => {');
    expect(ULC_LINZ_APP_SCRIPT).toContain('form.classList.remove("ulc-validation-attempted")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('form.querySelector(".ulc-validation-summary")?.remove()');
  });

  it("opens a hidden exercise editor tab containing an invalid required field", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (form.id === "exercise-catalog-form")');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'event.target.closest?.("[data-exercise-catalog-panel]")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (panel?.hidden)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("panel.dataset.exerciseCatalogPanel");
  });

  it("marks invalid name, category, duration and group selection in blocks", () => {
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-field-missing {");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("const missingName = !payload?.name?.trim()");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("const invalidDuration =");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("const invalidAudience =");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('invalidDuration ? "Dauer (Min.)"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('invalidAudience ? "Trainingsgruppen"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('control.setAttribute("aria-invalid", "true")');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('control.removeAttribute("aria-invalid")');
  });
});
