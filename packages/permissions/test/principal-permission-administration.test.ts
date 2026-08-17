import { describe, expect, it } from "vitest";

import {
  capabilityId,
  principalId,
  type CapabilityId,
} from "../src/contracts";
import { PostgresPrincipalPermissionAdministration } from "../src/principal-permission-administration";
import type { PermissionPostgresClient } from "../src/postgres-permission-store";
import type { RoleAdministrationPostgresClient } from "../src/role-administration";

describe("PostgresPrincipalPermissionAdministration snapshot constraints", () => {
  it("compares expected capability snapshots as sets independent of row ordering", async () => {
    const requestedCapabilities = [
      capabilityId("ordering:a-b"),
      capabilityId("ordering:a_b"),
    ];
    const normalizedCapabilities = [...requestedCapabilities].sort((left, right) =>
      String(left).localeCompare(String(right)),
    );
    const databaseOrderedCapabilities = [...normalizedCapabilities].reverse();
    expect(databaseOrderedCapabilities).not.toEqual(normalizedCapabilities);

    const administration = new PostgresPrincipalPermissionAdministration(
      clientWithPreviousGrants(databaseOrderedCapabilities),
    );

    await expect(
      administration.replacePrincipalPermissions(
        principalId("principal-ordering"),
        { grants: requestedCapabilities, revokes: [] },
        {
          actorPrincipalId: principalId("principal-administrator"),
          reason: "Order-independent optimistic concurrency",
        },
        {
          expectedGrants: requestedCapabilities,
          expectedRevokes: [],
        },
      ),
    ).resolves.toEqual({
      grants: normalizedCapabilities,
      revokes: [],
    });
  });
});

function clientWithPreviousGrants(
  previousGrants: readonly CapabilityId[],
): RoleAdministrationPostgresClient {
  const transaction: PermissionPostgresClient = {
    async unsafe(query, parameters = []) {
      if (query.includes("FROM appbasis_permission_principal\n")) {
        return [{ principal_id: parameters[0] }];
      }
      if (query.includes("FROM appbasis_permission_principal_grant")) {
        return previousGrants.map((capability) => ({
          capability_id: capability,
        }));
      }
      if (query.includes("FROM appbasis_permission_principal_revoke")) {
        return [];
      }
      if (query.includes("FROM appbasis_permission_capability")) {
        return [{ capability_id: parameters[0] }];
      }
      return [];
    },
  };

  return {
    unsafe(query, parameters) {
      return transaction.unsafe(query, parameters);
    },
    async begin(callback) {
      return callback(transaction);
    },
  };
}
