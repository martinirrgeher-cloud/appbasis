import { describe, expect, it } from "vitest";
import {
  assertUlcDedicatedBlockErasureRoleReady,
  UlcBlockErasureRoleNotReadyError,
} from "../worker/training-block-erasure-role-readiness";

const GOOD = Object.freeze({
  database_name: "neondb",
  principal_name: "ulc_linz_erasure",
  can_login: true,
  is_superuser: false,
  can_create_roles: false,
  can_create_databases: false,
  can_bypass_rls: false,
  inherits_roles: false,
  is_database_owner_member: false,
  is_application_member: false,
  usage_exists: true,
  attribution_exists: true,
  marker_exists: true,
  can_select_usage: true,
  can_delete_usage: true,
  can_insert_usage: false,
  can_update_usage: false,
  can_truncate_usage: false,
  can_select_attribution: true,
  can_insert_attribution: false,
  can_update_attribution: false,
  can_delete_attribution: false,
  can_truncate_attribution: false,
  can_select_marker: true,
  can_insert_marker: true,
  can_update_marker: true,
  can_delete_marker: false,
  can_truncate_marker: false,
  other_writable_tables: 0,
});

function mockSql(row: Record<string, unknown> | null = GOOD, fail = false) {
  const queries: string[] = [];
  return {
    queries,
    client: {
      async begin<T>(callback: (tx: {
        unsafe(query: string): PromiseLike<readonly Record<string, unknown>[]>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async unsafe(query: string) {
            queries.push(query);
            if (fail) throw new Error("sensitive database connection failure");
            if (queries.length === 1) return [];
            if (queries.length === 2) return row === null ? [] : [row];
            throw new Error("unexpected extra query");
          },
        });
      },
    },
  };
}

describe("P02 dedicated erasure SQL role: offline control-plane proof", () => {
  it("accepts only the dedicated least-privilege role, without changing SQL state", async () => {
    const h = mockSql();
    await expect(assertUlcDedicatedBlockErasureRoleReady(h.client, "production"))
      .resolves.toBeUndefined();
    expect(h.queries).toHaveLength(2);
    expect(h.queries[0]).toBe(
      "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
    );
    expect(h.queries[1]).toContain("current_database()");
    expect(h.queries[1]).toContain("current_user");
    expect(h.queries[1]).toContain("has_any_column_privilege");
    expect(h.queries[1]).toContain("other_writable_tables");
    const shape = h.queries[1]!.replace(/'(?:''|[^'])*'/g, "''");
    expect(shape).not.toMatch(/\b(?:GRANT|REVOKE|CREATE ROLE|INSERT INTO|DELETE FROM|UPDATE\s+public)\b/i);
  });

  it("requires the exact independent Preview login in Preview", async () => {
    const preview = {
      ...GOOD,
      database_name: "appbasis_ulc_linz_preview",
      principal_name: "appbasis_ulc_linz_preview_erasure",
    };
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      mockSql(preview).client, "preview",
    )).resolves.toBeUndefined();
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      mockSql(preview).client, "production",
    )).rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
  });

  it.each([
    ["wrong SQL login", {principal_name: "ulc_linz_application"}],
    ["generic DB owner", {principal_name: "neondb_owner"}],
    ["wrong database", {database_name: "preview"}],
    ["cannot login", {can_login: false}],
    ["superuser", {is_superuser: true}],
    ["can create roles", {can_create_roles: true}],
    ["can create databases", {can_create_databases: true}],
    ["RLS bypass", {can_bypass_rls: true}],
    ["inherited roles", {inherits_roles: true}],
    ["owner role membership", {is_database_owner_member: true}],
    ["app role membership", {is_application_member: true}],
    ["missing usage table", {usage_exists: false}],
    ["missing attribution", {attribution_exists: false}],
    ["missing marker", {marker_exists: false}],
    ["missing usage SELECT", {can_select_usage: false}],
    ["missing usage DELETE", {can_delete_usage: false}],
    ["forbidden usage INSERT", {can_insert_usage: true}],
    ["forbidden usage UPDATE", {can_update_usage: true}],
    ["forbidden usage TRUNCATE", {can_truncate_usage: true}],
    ["missing attribution SELECT", {can_select_attribution: false}],
    ["forbidden attribution INSERT", {can_insert_attribution: true}],
    ["forbidden attribution UPDATE", {can_update_attribution: true}],
    ["forbidden attribution DELETE", {can_delete_attribution: true}],
    ["forbidden attribution TRUNCATE", {can_truncate_attribution: true}],
    ["missing marker SELECT", {can_select_marker: false}],
    ["missing marker INSERT", {can_insert_marker: false}],
    ["missing marker UPDATE", {can_update_marker: false}],
    ["forbidden marker DELETE", {can_delete_marker: true}],
    ["forbidden marker TRUNCATE", {can_truncate_marker: true}],
    ["extra application-table writes", {other_writable_tables: 1}],
    ["malformed count", {other_writable_tables: null}],
  ] as const)("fails closed for %s", async (_case, drift) => {
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      mockSql({...GOOD, ...drift}).client, "production",
    )).rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
  });

  it("hides the underlying SQL provider failure and rejects absent metadata", async () => {
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      mockSql(GOOD, true).client, "production",
    )).rejects.toThrow("Dedicated training block erasure role is not ready.");
    await expect(assertUlcDedicatedBlockErasureRoleReady(
      mockSql(null).client, "production",
    )).rejects.toBeInstanceOf(UlcBlockErasureRoleNotReadyError);
  });
});
