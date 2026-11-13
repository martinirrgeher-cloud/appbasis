import { describe, expect, it } from "vitest";
import { UlcLinzAuthorizationDeniedError } from "../worker/authorization";
import { replaceUlcIrgTrainerPermissions } from "../worker/irg-permission-administration";

const input = {
  actorIdentityId: "admin", trustedSessionId: "server-session",
  organizationId: "org", groupId: "irg", targetIdentityId: "trainer",
  choice: "edit" as const, expectedRoleIds: ["ulc-linz:trainer"],
  expectedGrants: [], expectedRevokes: [],
  reason: "Assign approved performance trainer authorization",
};

describe("N16 unexposed IRG permission administration activation gate", () => {
  it("rejects SQL clients without transactions before querying", async () => {
    let queried = false;
    const sql = {
      async unsafe(_query: string, _params?: (string | number | boolean | null)[]) {
        queried = true;
        return [] as readonly Record<string, unknown>[];
      },
    };
    await expect(replaceUlcIrgTrainerPermissions(sql, input))
      .rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    expect(queried).toBe(false);
  });

  it("rejects self-edit, invalid identity and invalid audit reason before SQL", async () => {
    let called = false;
    type SimpleSql = {
      unsafe(query: string, params?: (string | number | boolean | null)[]):
        Promise<readonly Record<string, unknown>[]>;
    };
    const sql: SimpleSql & {
      begin<T>(callback: (tx: SimpleSql) => Promise<T>): Promise<T>;
    } = {
      async unsafe() { called = true; return []; },
      async begin<T>(callback: (tx: SimpleSql) => Promise<T>) {
        called = true;
        return callback(this);
      },
    };
    await expect(replaceUlcIrgTrainerPermissions(sql, {
      ...input, targetIdentityId: "admin",
    })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await expect(replaceUlcIrgTrainerPermissions(sql, {
      ...input, actorIdentityId: " admin",
    })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    await expect(replaceUlcIrgTrainerPermissions(sql, {
      ...input, reason: "short",
    })).rejects.toBeInstanceOf(UlcLinzAuthorizationDeniedError);
    expect(called).toBe(false);
  });
});
