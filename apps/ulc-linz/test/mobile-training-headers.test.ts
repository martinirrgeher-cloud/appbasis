import { describe, expect, it } from "vitest";
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
      expect(module.css).toContain("@media (max-width: 600px)");
      expect(module.css).toContain(`.${module.cls}.ab-training-page-header`);
      expect(module.css).toContain("flex-wrap: wrap");
      expect(module.css).toContain("overflow-wrap: anywhere");
      expect(module.css).toContain("display: none");
    });
  }

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
      expect(module.css).toContain(`.${module.cls}.ab-training-page-header .summary { display: none; }`);
    }
  });
});
