import { describe, expect, it } from "vitest";

import {
  ULC_TRAINING_BLOCKS_CSS,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "../worker/training-blocks-ui";

describe("ULC training block planning-aligned UI", () => {
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

  it("keeps standard prescription overrides when building a block payload", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      '...item.parameters.map((parameter) => parameter.key),\n              "sets",\n              "repetitions"',
    );
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain(
      'const standardKey = key === "sets" || key === "repetitions";',
    );
  });
});
