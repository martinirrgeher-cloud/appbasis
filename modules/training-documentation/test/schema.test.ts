import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../migrations/0000_appbasis_training_documentation_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("training documentation schema", () => {
  it("owns documentation and revision history without foreign module FKs", () => {
    expect(migration).toContain(
      "UNIQUE (organization_id, subject_id, session_date)",
    );
    expect(migration).toContain(
      "appbasis_training_documentation_revision",
    );
    expect(migration).toContain(
      "appbasis_training_documentation_current_revision_fk",
    );
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).not.toContain("REFERENCES appbasis_training_plan");
    expect(migration).not.toContain("REFERENCES appbasis_athlete");
  });

  it("persists plan provenance and immutable revision content snapshots", () => {
    expect(migration).toContain("source_plan_id");
    expect(migration).toContain("source_plan_revision");
    expect(migration).toContain("items_json jsonb NOT NULL");
    expect(migration).toContain("attendance_json jsonb NOT NULL");
    expect(migration).toContain("status IN ('draft', 'completed')");
  });
});
