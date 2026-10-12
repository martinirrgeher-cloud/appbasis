import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../migrations/0000_appbasis_training_plans_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("training-plans schema", () => {
  it("pins one plan per subject and day with revision-ready history", () => {
    expect(migration).toContain(
      "UNIQUE (organization_id, subject_id, plan_date)",
    );
    expect(migration).toContain(
      "CONSTRAINT appbasis_training_plan_current_revision_fk",
    );
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("stores block and exercise snapshots in the plan owner", () => {
    expect(migration).toContain("item_kind IN ('block', 'exercise')");
    expect(migration).toContain("source_block_revision");
    expect(migration).toContain("source_exercise_id");
    expect(migration).toContain("sets_value");
    expect(migration).toContain("repetitions_value");
    expect(migration).toContain("amount_value");
    expect(migration).toContain("unit_value");
    expect(migration).toContain("comment");
  });

  it("keeps source modules and subjects as opaque references", () => {
    expect(migration).not.toContain("REFERENCES appbasis_athlete");
    expect(migration).not.toContain("REFERENCES appbasis_training_block");
    expect(migration).not.toContain("REFERENCES appbasis_exercise");
  });

  it("keeps top-level and block-child ordering independent", () => {
    expect(migration).toContain(
      "appbasis_training_plan_revision_top_level_sort_idx",
    );
    expect(migration).toContain(
      "WHERE parent_block_item_id IS NULL",
    );
    expect(migration).toContain(
      "appbasis_training_plan_revision_child_sort_idx",
    );
    expect(migration).toContain(
      "WHERE parent_block_item_id IS NOT NULL",
    );
  });

  it("enforces that every nested exercise parent is a block row", () => {
    expect(migration).toContain(
      "parent_block_item_kind text GENERATED ALWAYS AS",
    );
    expect(migration).toContain(
      "UNIQUE (organization_id, plan_id, revision, item_id, item_kind)",
    );
    expect(migration).toContain(
      "CONSTRAINT appbasis_training_plan_revision_item_parent_fk",
    );
    expect(migration).toContain(
      "parent_block_item_id,\n      parent_block_item_kind",
    );
    expect(migration).toContain(
      "item_id,\n      item_kind",
    );
    expect(migration).toContain(
      "item_kind = 'block'\n      AND parent_block_item_id IS NULL",
    );
  });
});
