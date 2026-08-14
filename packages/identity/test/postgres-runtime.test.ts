import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPostgresDatabase: vi.fn(),
  createBetterAuthRuntime: vi.fn(),
  end: vi.fn(),
}));

vi.mock("@appbasis/database", () => ({
  createPostgresDatabase: mocks.createPostgresDatabase,
}));

vi.mock("../src/better-auth", () => ({
  createBetterAuthRuntime: mocks.createBetterAuthRuntime,
}));

import { createPostgresIdentityApplicationRuntime } from "../src/postgres-runtime";

const validInput = {
  connectionString: "postgresql://user:password@example.test/appbasis",
  baseURL: "https://generated.example.test",
  secret: "generated-runtime-test-secret-000000000000",
};

describe("PostgreSQL identity application runtime", () => {
  beforeEach(() => {
    mocks.createPostgresDatabase.mockReset();
    mocks.createBetterAuthRuntime.mockReset();
    mocks.end.mockReset();
    mocks.end.mockResolvedValue(undefined);
  });

  it("fails before opening PostgreSQL when the connection string is invalid", async () => {
    await expect(
      createPostgresIdentityApplicationRuntime({
        ...validInput,
        connectionString: "not-postgresql",
      }),
    ).rejects.toThrow(/valid PostgreSQL connection string/);
    expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
  });

  it("fails before opening PostgreSQL when the public base URL is not canonical", async () => {
    await expect(
      createPostgresIdentityApplicationRuntime({
        ...validInput,
        baseURL: "https://generated.example.test/path",
      }),
    ).rejects.toThrow(/canonical HTTP\(S\) base URL/);
    expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
  });

  it("fails before opening PostgreSQL when the identity secret is too short", async () => {
    await expect(
      createPostgresIdentityApplicationRuntime({
        ...validInput,
        secret: "too-short",
      }),
    ).rejects.toThrow(/identity secret with at least 32 characters/);
    expect(mocks.createPostgresDatabase).not.toHaveBeenCalled();
  });

  it("closes PostgreSQL when identity runtime construction fails after opening it", async () => {
    mocks.createPostgresDatabase.mockReturnValue({
      database: {},
      client: {
        unsafe: vi.fn(),
        end: mocks.end,
      },
    });
    mocks.createBetterAuthRuntime.mockImplementation(() => {
      throw new Error("identity runtime construction failed");
    });

    await expect(createPostgresIdentityApplicationRuntime(validInput)).rejects.toThrow(
      /identity runtime construction failed/,
    );
    expect(mocks.createPostgresDatabase).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledTimes(1);
  });
});
