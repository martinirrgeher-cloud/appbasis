import { describe, expect, it, vi } from "vitest";

import {
  PostgresUlcLinzTrainerUserAdministration,
  UlcLinzTrainerUserConflictError,
  UlcLinzTrainerUserValidationError,
} from "../worker/trainer-user-admin";

const trustedProvisioningIdentity = {
  async createInitialUser() {
    throw new Error("must not be reached");
  },
};

describe("ULC trainer user administration service", () => {
  it.each([
    { username: " Trainer.A ", profile: "kindertrainer" },
    { username: "trainer.a", profile: "admin" },
    { username: "trainer.a", profile: "kindertrainer", temporaryPassword: "short" },
    { username: "trainer.a", profile: "kindertrainer", contactEmail: "invalid" },
  ])("rejects invalid trainer-user input before opening PostgreSQL: %j", async (override) => {
    const createDatabase = vi.fn();
    const service = new PostgresUlcLinzTrainerUserAdministration(
      {
        connectionString: "postgresql://example.invalid/app",
        trustedProvisioningIdentity,
      },
      createDatabase as never,
    );

    const input = {
      organizationId: "verein-1",
      actorPrincipalId: "admin-1",
      username: "trainer.a",
      displayName: "Trainer A",
      contactEmail: "trainer.a@example.test",
      temporaryPassword: "Temporary-123",
      profile: "kindertrainer",
    };
    Object.assign(input, override);

    await expect(
      service.createTrainerUser(input as never),
    ).rejects.toBeInstanceOf(UlcLinzTrainerUserValidationError);
    expect(createDatabase).not.toHaveBeenCalled();
  });

  it("fails closed when a username exists without the matching provisioning operation", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const unsafe = vi.fn(async (query: string) => {
      if (query.includes('FROM "user"')) {
        return [
          {
            id: "foreign-identity",
            email: "foreign@identity.invalid",
            username: "trainer.a",
            name: "Trainer A",
            role: "user",
            banned: false,
          },
        ];
      }
      if (query.includes("FROM appbasis_identity_operation")) return [];
      throw new Error("unexpected query");
    });
    const service = new PostgresUlcLinzTrainerUserAdministration(
      {
        connectionString: "postgresql://example.invalid/app",
        trustedProvisioningIdentity,
      },
      (() => ({
        client: {
          unsafe,
          begin: vi.fn(),
          end,
        },
      })) as never,
    );

    await expect(
      service.createTrainerUser({
        organizationId: "verein-1",
        actorPrincipalId: "admin-1",
        username: "trainer.a",
        displayName: "Trainer A",
        temporaryPassword: "Temporary-123",
        profile: "kindertrainer",
      }),
    ).rejects.toBeInstanceOf(UlcLinzTrainerUserConflictError);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
