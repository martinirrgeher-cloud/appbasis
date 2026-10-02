import { describe, expect, it } from "vitest";

import {
  PostgresUlcLinzTrainingModuleGroupReader,
  type UlcLinzTrainingModuleGroupSqlClient,
} from "../worker/training-module-group-postgres";

describe("ULC training module group mapping", () => {
  it("reads one server-owned module mapping", async () => {
    let received: unknown = null;
    const sql: UlcLinzTrainingModuleGroupSqlClient = {
      async unsafe(query, parameters) {
        expect(query).toContain("FROM ulc_linz_training_module_group");
        received = parameters;
        return [{ group_id: "group-u12" }];
      },
    };
    const reader = new PostgresUlcLinzTrainingModuleGroupReader(sql);

    await expect(reader.readGroupId("verein-1", "u12")).resolves.toBe(
      "group-u12",
    );
    expect(received).toEqual(["verein-1", "u12"]);
  });

  it("returns null when a module has no configured group", async () => {
    const reader = new PostgresUlcLinzTrainingModuleGroupReader({
      async unsafe() {
        return [];
      },
    });
    await expect(reader.readGroupId("verein-1", "u12")).resolves.toBeNull();
  });

  it("fails closed on ambiguous or malformed persisted state", async () => {
    for (const rows of [
      [{ group_id: "group-a" }, { group_id: "group-b" }],
      [{ group_id: " group-a " }],
      [{ group_id: "" }],
    ]) {
      const reader = new PostgresUlcLinzTrainingModuleGroupReader({
        async unsafe() {
          return rows;
        },
      });
      await expect(reader.readGroupId("verein-1", "u12")).rejects.toThrow();
    }
  });
});
