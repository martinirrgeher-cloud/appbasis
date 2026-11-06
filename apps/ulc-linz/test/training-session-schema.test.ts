import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = resolve(
  appRoot,
  "migrations",
  "0004_ulc_linz_training_sessions.sql",
);
const registrationMigrationPath = resolve(
  appRoot,
  "migrations",
  "0008_ulc_linz_session_registration.sql",
);
const noteMigrationPath = resolve(
  appRoot,
  "migrations",
  "0010_ulc_linz_registration_notes.sql",
);
const youthContentMigrationPath = resolve(
  appRoot,
  "migrations",
  "0011_ulc_linz_youth_training_content.sql",
);

describe("ULC shared training schema", () => {
  it("adds optional bounded notes to current registration and append-only actor history", async () => {
    const sql = await readFile(noteMigrationPath, "utf8");
    expect(sql).toContain("ALTER TABLE ulc_linz_training_registration");
    expect(sql).toContain("ALTER TABLE ulc_linz_training_registration_change");
    expect((sql.match(/ADD COLUMN note text NULL/g) ?? [])).toHaveLength(2);
    expect((sql.match(/char_length\(note\) <= 160/g) ?? [])).toHaveLength(2);
    expect((sql.match(/note !~ '\[\[:cntrl:\]\]'/g) ?? [])).toHaveLength(2);
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain("CREATE TABLE");
  });


  it("adds bounded youth-session content and per-attendee slots without new personal-data tables", async () => {
    const sql = await readFile(youthContentMigrationPath, "utf8");
    expect(sql).toContain("ALTER TABLE ulc_linz_training_session");
    expect(sql).toContain("ADD COLUMN training_content_titles text[] NOT NULL DEFAULT ARRAY[]::text[]");
    expect(sql).toContain("cardinality(training_content_titles) <= 5");
    expect(sql).toContain("ALTER TABLE ulc_linz_training_attendance");
    expect(sql).toContain("ADD COLUMN training_content_slots smallint[] NOT NULL DEFAULT ARRAY[]::smallint[]");
    expect(sql).toContain("cardinality(training_content_slots) <= 5");
    expect(sql).toContain("status = 'present' OR cardinality(training_content_slots) = 0");
    expect(sql).not.toMatch(/\\b(?:DROP|TRUNCATE|DELETE)\\b/i);
    expect(sql).not.toContain("CREATE TABLE");
  });

  it("keeps Kindertraining, U12 and U14 in one app-owned persistence contract", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain('CREATE TABLE "ulc_linz_training_session"');
    expect(sql).toContain('CREATE TABLE "ulc_linz_training_attendance"');
    expect(sql).toContain(
      'UNIQUE ("organization_id", "module_id", "group_id", "session_date")',
    );
    expect(sql).toContain(
      'CHECK ("module_id" IN (\'kindertraining\', \'u12\', \'u14\'))',
    );
    expect(sql).toContain(
      'CHECK ("status" IN (\'open\', \'present\', \'excused\', \'absent\'))',
    );
    expect(sql).toContain(
      'CHECK ("note" IS NULL OR char_length("note") <= 3000)',
    );
    expect(sql).not.toMatch(/\bREFERENCES\b/i);
  });

  it("stores self-registration separately from trainer-confirmed attendance with immutable history", async () => {
    const sql = await readFile(registrationMigrationPath, "utf8");

    expect(sql).toContain(
      "CREATE TABLE ulc_linz_training_registration",
    );
    expect(sql).toContain(
      "CREATE TABLE ulc_linz_training_registration_change",
    );
    expect(sql).toContain(
      "PRIMARY KEY (session_id, athlete_id)",
    );
    expect(sql).toContain(
      "UNIQUE (session_id, athlete_id, revision)",
    );
    expect(sql).toContain(
      "CHECK (intention IN ('unknown', 'attending', 'not_attending', 'maybe'))",
    );
    expect(sql).toContain("updated_by_identity_id text NOT NULL");
    expect(sql).toContain("actor_identity_id text NOT NULL");
    expect(sql).not.toContain("status text");
  });
});
