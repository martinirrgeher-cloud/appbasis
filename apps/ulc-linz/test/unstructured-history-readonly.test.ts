import { describe, expect, it } from "vitest";

import {
  inspectUlcUnstructuredHistoryReadOnly,
  ULC_UNSTRUCTURED_REVIEW_AREAS,
  type UlcUnstructuredReviewSqlClient,
} from "../worker/unstructured-history-readonly";

type Area = typeof ULC_UNSTRUCTURED_REVIEW_AREAS[number];

function simulatedSql(
  response: readonly Record<string, unknown>[],
  commands: Array<{ query: string; params?: unknown[] }>,
): UlcUnstructuredReviewSqlClient {
  return {
    begin: async callback => callback({
      unsafe: async (query, params) => {
        commands.push({ query, ...(params === undefined ? {} : { params }) });
        return query.startsWith("SET TRANSACTION") ? [] : response;
      },
    }),
  };
}
const empty = Object.fromEntries(
  ULC_UNSTRUCTURED_REVIEW_AREAS.map(area => [area, 0]),
) as Record<Area, number>;

describe("ULC P4 immutable aggregate unstructured history inventory", () => {
  it("checks every historic notes/JSON/opaque-ref location without returning values", async () => {
    const commands: Array<{ query: string; params?: unknown[] }> = [];
    const data = {
      ...empty,
      registration_history_notes: 2,
      documentation_revision_json: 1,
      plan_revision_item_text: 1,
      block_revision_item_notes: 2,
      block_revision_parameter_values: 1,
    };
    const result = await inspectUlcUnstructuredHistoryReadOnly(
      simulatedSql([data], commands), "synthetic-org",
    );
    expect(result.counts).toEqual(data);
    expect(result.hasPotentiallyPersonalContent).toBe(true);
    expect(result.permitsLifecycleRelease).toBe(false);
    expect(result.permitsDeletion).toBe(false);
    expect(result.permitsRestorePromotion).toBe(false);
    expect(Object.isFrozen(result.counts)).toBe(true);
    expect(commands).toHaveLength(2);
    expect(commands[0]?.query).toBe(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    const query = commands[1]?.query ?? "";
    expect(commands[1]?.params).toEqual(["synthetic-org"]);
    for (const table of [
      "ulc_linz_training_session",
      "ulc_linz_training_registration",
      "ulc_linz_training_registration_change",
      "appbasis_training_documentation_revision",
      "appbasis_training_plan_revision",
      "appbasis_training_plan_revision_item",
      "appbasis_training_block_revision",
      "appbasis_training_block_revision_item",
      "appbasis_training_block_revision_item_parameter",
      "appbasis_exercise_catalog_usage",
      "appbasis_training_block_usage",
    ]) expect(query).toContain(table);
    expect(query).toContain("attendance_json");
    expect(query).toContain("items_json");
    expect(query).toContain("training_content_items");
    expect(query).toContain("source_ref");
    expect(query).toContain("nullif(btrim(comment)");
    expect(query).toContain("nullif(btrim(parameter_value)");
    for (const field of [
      "name", "sets_value", "repetitions_value", "amount_value", "unit_value",
    ]) expect(query).toContain("nullif(btrim(" + field + ")");
    expect(query).toContain("AS plan_revision_item_text");
    expect(query).toContain("AS block_revision_text");
    expect(query).not.toMatch(/\b(?:INSERT|DELETE|UPDATE|TRUNCATE|DROP)\b/i);
    expect(JSON.stringify(result)).not.toContain("synthetic-org");
  });

  it("never treats even zero hits as a lifecycle or restore clearance", async () => {
    const result = await inspectUlcUnstructuredHistoryReadOnly(
      simulatedSql([empty], []), "synthetic-org",
    );
    expect(result.hasPotentiallyPersonalContent).toBe(false);
    expect(result.permitsLifecycleRelease).toBe(false);
    expect(result.permitsRestorePromotion).toBe(false);
  });

  it("fails closed on missing/invalid/negative counts or partial SQL results", async () => {
    for (const bad of [
      [], [{}], [{ ...empty, registration_notes: null }],
      [{ ...empty, registration_notes: -1 }],
      [{ ...empty, registration_notes: "0" }],
      [{ ...empty, registration_notes: 1.5 }],
      [empty, empty],
    ]) {
      await expect(inspectUlcUnstructuredHistoryReadOnly(
        simulatedSql(bad, []), "synthetic-org",
      )).rejects.toThrow(/inventory is incomplete/);
    }
  });

  it("rejects invalid scopes before opening a SQL transaction", async () => {
    for (const scope of ["", " org", "org ", "bad\u0000id", "x".repeat(201)]) {
      const sql = simulatedSql([empty], []);
      await expect(
        inspectUlcUnstructuredHistoryReadOnly(sql, scope),
      ).rejects.toThrow(/scope is invalid/);
    }
  });
});
