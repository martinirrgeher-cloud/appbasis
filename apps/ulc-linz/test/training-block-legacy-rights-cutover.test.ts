import { describe, expect, it } from "vitest";

import {
  assertUlcLegacyBlockUsageRoleCutoverReady,
  UlcLegacyBlockUsageCutoverNotReadyError,
} from "../worker/training-block-legacy-rights-cutover";

const READY = Object.freeze({
  database_name: "neondb",
  principal_name: "ulc_linz_application",
  usage_table_exists: true,
  subject_table_exists: true,
  deletion_marker_exists: true,
  can_read_usage: true,
  can_insert_usage: true,
  can_update_usage: false,
  can_delete_usage: false,
  can_truncate_usage: false,
  can_read_subject: true,
  can_insert_subject: true,
  can_update_subject: false,
  can_delete_subject: false,
  can_truncate_subject: false,
  can_read_marker: true,
  can_insert_marker: false,
  can_update_marker: false,
  can_delete_marker: false,
  can_truncate_marker: false,
});

function mockClient(
  data: Record<string, unknown> | null = READY,
  fail = false,
) {
  const statements: string[] = [];
  let calls = 0;
  const client = {
    async begin<T>(
      callback: (transaction: {
        unsafe(
          query: string,
          parameters?: Array<string | number | boolean | null>,
        ): PromiseLike<readonly Record<string, unknown>[]>;
      }) => Promise<T>,
    ): Promise<T> {
      calls++;
      return callback({
        async unsafe(query: string) {
          statements.push(query);
          if (fail) throw new Error("private database unavailable");
          if (statements.length === 1) {
            expect(query).toBe(
              "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
            );
            return [];
          }
          if (statements.length === 2 && query.trim().startsWith("SELECT")) {
            return data === null ? [] : [data];
          }
          throw new Error("unexpected third SQL statement");
        },
      });
    },
  };
  return { client, statements, calls: () => calls };
}

describe("P02 ordinary app SQL role cutover: fail closed after privileged erasure separation", () => {
  it("accepts only the exact production app role with no direct UPDATE/DELETE", async () => {
    const test = mockClient();
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      test.client, "production",
    )).resolves.toBeUndefined();
    expect(test.calls()).toBe(1);
    expect(test.statements).toHaveLength(2);
    const sql = test.statements[1]!;
    expect(sql).toContain("current_database()");
    expect(sql).toContain("current_user");
    expect(sql).toContain("has_table_privilege(current_user");
    expect(sql).toContain("'UPDATE'");
    expect(sql).toContain("'DELETE'");
    expect(sql).toContain("'TRUNCATE'");
    expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\s+(?:FROM|INTO|public\.)/i);
    expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|ALTER TABLE|DROP TABLE)\s/i);
    expect(sql).not.toContain("COUNT(*) FROM appbasis_training_block_usage");
  });

  it("accepts the exact preview app/database identity only in preview mode", async () => {
    const row = {
      ...READY,
      database_name: "appbasis_ulc_linz_preview",
      principal_name: "appbasis_ulc_linz_preview_application",
    };
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      mockClient(row).client, "preview",
    )).resolves.toBeUndefined();
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      mockClient(row).client, "production",
    )).rejects.toBeInstanceOf(UlcLegacyBlockUsageCutoverNotReadyError);
  });

  it.each([
    ["database", { database_name: "appbasis_ulc_linz_preview" }],
    ["role", { principal_name: "postgres" }],
    ["missing usage", { usage_table_exists: false }],
    ["missing subject", { subject_table_exists: false }],
    ["missing marker", { deletion_marker_exists: false }],
    ["no read", { can_read_usage: false }],
    ["no insert", { can_insert_usage: false }],
    ["usage UPDATE", { can_update_usage: true }],
    ["usage DELETE", { can_delete_usage: true }],
    ["usage TRUNCATE", { can_truncate_usage: true }],
    ["no subject read", { can_read_subject: false }],
    ["no subject insert", { can_insert_subject: false }],
    ["subject UPDATE", { can_update_subject: true }],
    ["subject DELETE", { can_delete_subject: true }],
    ["subject TRUNCATE", { can_truncate_subject: true }],
    ["no marker read", { can_read_marker: false }],
    ["marker INSERT", { can_insert_marker: true }],
    ["marker UPDATE", { can_update_marker: true }],
    ["marker DELETE", { can_delete_marker: true }],
    ["marker TRUNCATE", { can_truncate_marker: true }],
    ["invalid null metadata", { can_delete_usage: null }],
  ] as const)("denies %s", async (_case, drift) => {
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      mockClient({ ...READY, ...drift }).client, "production",
    )).rejects.toBeInstanceOf(UlcLegacyBlockUsageCutoverNotReadyError);
  });

  it("does not leak the underlying database error", async () => {
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      mockClient(READY, true).client, "production",
    )).rejects.toThrow("Verified legacy block usage SQL privilege separation is not ready.");
  });

  it("denies a missing or malformed SQL result", async () => {
    await expect(assertUlcLegacyBlockUsageRoleCutoverReady(
      mockClient(null).client, "production",
    )).rejects.toBeInstanceOf(UlcLegacyBlockUsageCutoverNotReadyError);
  });
});
