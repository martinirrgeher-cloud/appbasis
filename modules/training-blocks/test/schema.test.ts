import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../migrations/0000_appbasis_training_blocks_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const parityMigration = readFileSync(
  new URL(
    "../migrations/0001_appbasis_training_blocks_parity_metadata.sql",
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

  it("adds personal favorites and usage metadata without crossing module ownership", () => {
    expect(parityMigration).toContain("CREATE TABLE appbasis_training_block_favorite");
    expect(parityMigration).toContain("CREATE TABLE appbasis_training_block_usage");
    expect(parityMigration).toContain(
      "FOREIGN KEY (organization_id, block_id)",
    );
    expect(parityMigration).toContain(
      "REFERENCES appbasis_training_block (organization_id, id)",
    );
    expect(parityMigration).not.toContain("REFERENCES appbasis_person");
    expect(parityMigration).not.toContain("REFERENCES appbasis_exercise");
    expect(parityMigration).not.toContain("REFERENCES appbasis_training_group");
    expect(parityMigration).toContain(
      "PRIMARY KEY (organization_id, principal_id, block_id)",
    );
    expect(parityMigration).toContain(
      "appbasis_training_block_usage_block_idx",
    );
  });

});
