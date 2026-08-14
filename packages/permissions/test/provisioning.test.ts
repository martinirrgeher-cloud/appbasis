import { describe, expect, it } from "vitest";

import {
  PermissionProvisioningConfigurationError,
  capabilityId,
  principalId,
  provisionPostgresPermissions,
  roleId,
  type PermissionProvisioningPostgresClient,
} from "../src";

describe("permission provisioning contract", () => {
  it("rejects role capabilities outside the declared capability set before PostgreSQL access", async () => {
    let began = false;
    const client = clientThatMustNotRun(() => {
      began = true;
    });

    await expect(
      provisionPostgresPermissions(client, {
        knownCapabilities: [capabilityId("reports:read")],
        roles: [
          {
            roleId: roleId("reports:editor"),
            capabilities: [capabilityId("reports:write")],
          },
        ],
        principalRoleAssignments: [],
      }),
    ).rejects.toBeInstanceOf(PermissionProvisioningConfigurationError);

    expect(began).toBe(false);
  });

  it("rejects principal assignments to roles outside the provisioning bundle", async () => {
    let began = false;
    const client = clientThatMustNotRun(() => {
      began = true;
    });

    await expect(
      provisionPostgresPermissions(client, {
        knownCapabilities: [capabilityId("reports:read")],
        roles: [
          {
            roleId: roleId("reports:viewer"),
            capabilities: [capabilityId("reports:read")],
          },
        ],
        principalRoleAssignments: [
          {
            principalId: principalId("principal-1"),
            roleIds: [roleId("reports:admin")],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(PermissionProvisioningConfigurationError);

    expect(began).toBe(false);
  });

  it("rejects duplicate provisioning identifiers instead of normalizing them silently", async () => {
    let began = false;
    const client = clientThatMustNotRun(() => {
      began = true;
    });
    const reportsRead = capabilityId("reports:read");

    await expect(
      provisionPostgresPermissions(client, {
        knownCapabilities: [reportsRead, reportsRead],
        roles: [],
        principalRoleAssignments: [],
      }),
    ).rejects.toBeInstanceOf(PermissionProvisioningConfigurationError);

    expect(began).toBe(false);
  });
});

function clientThatMustNotRun(
  onBegin: () => void,
): PermissionProvisioningPostgresClient {
  return {
    async begin() {
      onBegin();
      throw new Error("unexpected PostgreSQL transaction");
    },
  };
}
