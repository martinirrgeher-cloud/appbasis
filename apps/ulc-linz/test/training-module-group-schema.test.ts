import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("ULC training module group schema", () => {
  it("keeps one app-owned group per attendance module and one module per group", async () => {
    const sql = await readFile(
      new URL("../migrations/0006_ulc_linz_training_module_groups.sql", import.meta.url),
      "utf8",
    );

    expect(sql).toContain('CREATE TABLE "ulc_linz_training_module_group"');
    expect(sql).toContain('PRIMARY KEY ("organization_id", "module_id")');
    expect(sql).toContain('UNIQUE ("organization_id", "group_id")');
    expect(sql).toContain(
      'CHECK ("module_id" IN (\'kindertraining\', \'u12\', \'u14\'))',
    );
    expect(sql).not.toMatch(/\bREFERENCES\b/i);
  });
});
