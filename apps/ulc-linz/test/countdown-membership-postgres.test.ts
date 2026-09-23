import { describe, expect, it } from "vitest";

import {
  PostgresUlcLinzCountdownMembershipResolver,
  UlcLinzCountdownMembershipStateError,
} from "../worker/countdown-membership-postgres";

describe("ULC Linz countdown PostgreSQL membership resolver", () => {
  it("resolves the identity-owned single membership without client organization input", async () => {
    const calls: Array<{ query: string; parameters?: (string | number | boolean | null)[] }> = [];
    const resolver = new PostgresUlcLinzCountdownMembershipResolver({
      async unsafe(query, parameters) {
        calls.push({ query, ...(parameters === undefined ? {} : { parameters }) });
        return [
          {
            organization_id: "verein-1",
            source_role: "athlete",
            active: true,
          },
        ];
      },
    });

    await expect(
      resolver.resolveMembershipForIdentity("identity-1"),
    ).resolves.toEqual({
      organizationId: "verein-1",
      sourceRole: "athlete",
      active: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.query).toContain("WHERE identity_id = $1");
    expect(calls[0]?.parameters).toEqual(["identity-1"]);
  });

  it("returns null for an identity without membership", async () => {
    const resolver = new PostgresUlcLinzCountdownMembershipResolver({
      async unsafe() {
        return [];
      },
    });
    await expect(
      resolver.resolveMembershipForIdentity("identity-1"),
    ).resolves.toBeNull();
  });

  it("fails closed for impossible duplicate or malformed membership state", async () => {
    const duplicate = new PostgresUlcLinzCountdownMembershipResolver({
      async unsafe() {
        return [
          { organization_id: "verein-1", source_role: "trainer", active: true },
          { organization_id: "verein-2", source_role: "trainer", active: true },
        ];
      },
    });
    await expect(
      duplicate.resolveMembershipForIdentity("identity-1"),
    ).rejects.toBeInstanceOf(UlcLinzCountdownMembershipStateError);

    const malformed = new PostgresUlcLinzCountdownMembershipResolver({
      async unsafe() {
        return [
          { organization_id: " verein-1", source_role: "trainer", active: true },
        ];
      },
    });
    await expect(
      malformed.resolveMembershipForIdentity("identity-1"),
    ).rejects.toBeInstanceOf(UlcLinzCountdownMembershipStateError);
  });
});
