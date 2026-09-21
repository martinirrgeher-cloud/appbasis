import { describe, expect, it } from "vitest";

import type {
  IdentityPostgresRuntimeParameter,
  IdentityPostgresRuntimeSqlClient,
} from "@appbasis/identity/postgres-runtime";

import { PostgresUlcLinzScopeResolver } from "../worker/scope-postgres";

type QueryCall = {
  query: string;
  parameters: IdentityPostgresRuntimeParameter[] | undefined;
};

function sqlClient(
  responses: Array<readonly Record<string, unknown>[]>,
): {
  calls: QueryCall[];
  client: IdentityPostgresRuntimeSqlClient;
} {
  const calls: QueryCall[] = [];
  const client: IdentityPostgresRuntimeSqlClient = {
    async unsafe(query, parameters) {
      calls.push({ query, parameters });
      return responses.shift() ?? [];
    },
  };
  return { calls, client };
}

describe("ULC Linz PostgreSQL scope resolver", () => {
  it("resolves only one active organization without exposing extra membership data", async () => {
    const sql = sqlClient([[{ organization_id: "verein-1" }]]);
    const resolver = new PostgresUlcLinzScopeResolver(sql.client);

    await expect(
      resolver.resolveActiveOrganizationId("identity-1"),
    ).resolves.toBe("verein-1");
    expect(sql.calls).toHaveLength(1);
    expect(sql.calls[0]?.parameters).toEqual(["identity-1"]);
    expect(sql.calls[0]?.query).toContain("active = true");
  });

  it("fails closed for missing or malformed membership state", async () => {
    const missing = new PostgresUlcLinzScopeResolver(sqlClient([[]]).client);
    await expect(
      missing.resolveActiveOrganizationId("identity-1"),
    ).resolves.toBeNull();

    const malformed = new PostgresUlcLinzScopeResolver(
      sqlClient([[{ organization_id: " verein-1 " }]]).client,
    );
    await expect(
      malformed.resolveActiveOrganizationId("identity-1"),
    ).resolves.toBeNull();
  });

  it("resolves the exact membership and subject relation contracts", async () => {
    const sql = sqlClient([
      [
        {
          organization_id: "verein-1",
          source_role: "athlete",
          active: true,
        },
      ],
      [{ related: 1 }],
    ]);
    const resolver = new PostgresUlcLinzScopeResolver(sql.client);

    await expect(
      resolver.resolveMembership({
        identityId: "identity-1",
        organizationId: "verein-1",
      }),
    ).resolves.toEqual({
      organizationId: "verein-1",
      sourceRole: "athlete",
      active: true,
    });
    await expect(
      resolver.hasRelation({
        identityId: "identity-1",
        organizationId: "verein-1",
        subjectId: "athlete-1",
        relationType: "self",
      }),
    ).resolves.toBe(true);
  });
});
