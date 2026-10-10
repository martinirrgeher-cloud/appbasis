import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../migrations/0000_appbasis_training_blocks_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("training-blocks schema", () => {
  it("keeps the current block revision referentially valid at transaction commit", () => {
    expect(migration).toContain(
      "CONSTRAINT appbasis_training_block_current_revision_fk",
    );
    expect(migration).toContain(
      "FOREIGN KEY (organization_id, id, current_revision)",
    );
    expect(migration).toContain(
      "REFERENCES appbasis_training_block_revision",
    );
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
  });

  it("keeps exercise and audience ownership outside this module", () => {
    expect(migration).not.toContain("REFERENCES appbasis_exercise");
    expect(migration).not.toContain("REFERENCES appbasis_training_group");
  });

  it("uses occurrence identity rather than exercise identity so duplicate exercises remain valid", () => {
    expect(migration).toContain(
      "PRIMARY KEY (organization_id, block_id, revision, item_id)",
    );
    expect(migration).not.toContain(
      "UNIQUE (organization_id, block_id, revision, exercise_id)",
    );
  });

  it("stores ordered parameter overrides per exercise occurrence", () => {
    expect(migration).toContain(
      "appbasis_training_block_revision_item_parameter",
    );
    expect(migration).toContain(
      "UNIQUE (\n    organization_id,\n    block_id,\n    revision,\n    item_id,\n    sort_order\n  )",
    );
  });
});
