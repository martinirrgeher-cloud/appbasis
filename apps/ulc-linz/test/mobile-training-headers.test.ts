import { describe, expect, it } from "vitest";
import { ULC_TRAINING_PAGE_HEADER_CSS } from "../worker/design-system";
import { ULC_LINZ_APP_CSS } from "../worker/ui";
import { ULC_EXERCISE_CATALOG_HTML, ULC_EXERCISE_CATALOG_CSS } from "../worker/exercise-catalog-ui";
import { ULC_TRAINING_BLOCKS_HTML, ULC_TRAINING_BLOCKS_CSS } from "../worker/training-blocks-ui";
import { ULC_TRAINING_PLANS_HTML, ULC_TRAINING_PLANS_CSS } from "../worker/training-plans-ui";
import { ULC_TRAINING_DOCUMENTATION_HTML, ULC_TRAINING_DOCUMENTATION_CSS } from "../worker/training-documentation-ui";

describe("ULC N04 compact mobile training headers", () => {
  const modules = [
    { name: "Übungskatalog", cls: "exercise-catalog-hero", html: ULC_EXERCISE_CATALOG_HTML, css: ULC_EXERCISE_CATALOG_CSS },
    { name: "Trainingsblöcke", cls: "training-blocks-hero", html: ULC_TRAINING_BLOCKS_HTML, css: ULC_TRAINING_BLOCKS_CSS },
    { name: "Trainingsplanung", cls: "training-plans-hero", html: ULC_TRAINING_PLANS_HTML, css: ULC_TRAINING_PLANS_CSS },
    { name: "Trainingsdokumentation", cls: "training-documentation-hero", html: ULC_TRAINING_DOCUMENTATION_HTML, css: ULC_TRAINING_DOCUMENTATION_CSS },
  ] as const;

  for (const module of modules) {
    it(`keeps ${module.name} functional and applies the shared mobile geometry`, () => {
      expect(module.html).toContain(`class="hero ${module.cls} ab-training-page-header"`);
      expect(module.html).toContain(`<h1>${module.name}</h1>`);
      expect(module.css).not.toContain("Shared mobile training-header geometry");
      expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain("@media (max-width: 600px)");
      expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain(".ab-training-page-header {");
      expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain("flex-wrap: wrap");
      expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain("overflow-wrap: anywhere");
      expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain("display: none");
    });
  }

  it("injects the centralized training header stylesheet after the four module styles", () => {
    expect(ULC_LINZ_APP_CSS).toContain(ULC_TRAINING_PAGE_HEADER_CSS.trim());
    expect(ULC_LINZ_APP_CSS.lastIndexOf(".ab-training-page-header {"))
      .toBeGreaterThan(ULC_LINZ_APP_CSS.lastIndexOf(".training-plan-toolbar {"));
    for (const selector of [
      ".exercise-catalog-hero-actions #exercise-catalog-new",
      "#training-block-new:not([hidden])",
      ".training-documentation-hero > .button",
      ".training-plan-week-nav .button",
    ]) expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain(selector);
  });

  it("preserves creation, import/export, planning tabs and documentation navigation", () => {
    for (const id of ["exercise-catalog-new", "exercise-catalog-import-open", "exercise-catalog-template", "exercise-catalog-export"]) {
      expect(ULC_EXERCISE_CATALOG_HTML).toContain(`id="${id}"`);
    }
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-new"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('data-training-plan-mode="group"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('data-training-plan-mode="athlete"');
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain('data-open-view="training-plans"');
  });

  it("only collapses explanatory copy at mobile widths, retaining desktop content", () => {
    for (const module of modules) {
      expect(module.html).toContain('class="summary"');
      expect(ULC_TRAINING_PAGE_HEADER_CSS).toContain(".ab-training-page-header .summary { display: none; }");
    }
  });
});
