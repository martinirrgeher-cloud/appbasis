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

describe("ULC shared training schema", () => {
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
});
