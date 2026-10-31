import { describe, expect, it } from "vitest";

import {
  ULC_TRAINING_BLOCKS_CSS,
  ULC_TRAINING_BLOCKS_HTML,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "../worker/training-blocks-ui";

describe("ULC training block planning-aligned UI", () => {
  it("filters by independent, persisted block category and preserves the group filter", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-category-filter"');
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-audience-filter"');
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-category"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('category: trainingBlockDraft.category || null');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('block.revision.category !== category');
  });

  it("reuses exercise categories in a dropdown while retaining historical category values", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain(
      '<select id="training-block-category"><option value="">Ohne Kategorie</option></select>',
    );
    expect(ULC_TRAINING_BLOCKS_HTML).not.toContain("training-block-category-suggestions");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("renderTrainingBlockCategoryEditor();");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("for (const category of EXERCISE_CATEGORIES)");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("option.value = category.key;");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('legacy.textContent = current + " (bisherige Kategorie)"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("trainingBlockCategoryLabel(block.revision.category)");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'control === trainingBlockElements.category ? "change" : "input"',
    );
  });

  it("offers compact prescription editing for every catalog exercise", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'trainingBlockParameterValueByKey(draft, item, "sets")',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'trainingBlockParameterValueByKey(draft, item, "repetitions")',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      '{ key: "sets", label: "Sätze" }',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      '{ key: "repetitions", label: "Wdh." }',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'noteLabel.textContent = "Kommentar"',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "trainingBlockExerciseCompactSummary",
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      ".training-block-exercise__editor",
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      ".training-block-parameters--prescription",
    );
  });

  it("keeps editor headings readable and mobile filters within the viewport", () => {
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      ".training-block-header > div:first-child { min-width: 0; }",
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
  });

  it("provides reachable compact block and info overlay close controls", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('aria-label="Trainingsblock schließen"');
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('aria-label="Übungsdetails schließen"');
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("#training-block-close,\n  #training-block-info-close {");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("padding-bottom: max(10px, env(safe-area-inset-bottom));");
  });

  it("invalidates organization-scoped block requests across account switches", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "let trainingBlockSessionGeneration = 0;",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "trainingBlockSessionGeneration += 1;",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "trainingBlockAudienceRequestId += 1;",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "generation !== trainingBlockSessionGeneration",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "trainingBlocks = [];",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "trainingBlockAudiences = [];",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "closeTrainingBlockExerciseInfo();",
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      "trainingBlockElements.infoBody?.replaceChildren();",
    );
  });

  it("keeps standard prescription overrides when building a block payload", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      '...item.parameters.map((parameter) => parameter.key),\n              "sets",\n              "repetitions"',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'const standardKey = key === "sets" || key === "repetitions";',
    );
  });
});
