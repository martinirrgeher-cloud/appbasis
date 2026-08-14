import { describe, expect, it } from "vitest";

import { createPostgresIdentityApplicationRuntime } from "../src/postgres-runtime";

const validInput = {
  connectionString: "postgresql://user:password@example.test/appbasis",
  baseURL: "https://generated.example.test",
  secret: "generated-runtime-test-secret-000000000000",
};

describe("PostgreSQL identity application runtime", () => {
  it("fails before opening PostgreSQL when the connection string is invalid", () => {
    expect(() =>
      createPostgresIdentityApplicationRuntime({
        ...validInput,
        connectionString: "not-postgresql",
      }),
    ).toThrow(/valid PostgreSQL connection string/);
  });

  it("fails before opening PostgreSQL when the public base URL is not canonical", () => {
    expect(() =>
      createPostgresIdentityApplicationRuntime({
        ...validInput,
        baseURL: "https://generated.example.test/path",
      }),
    ).toThrow(/canonical HTTP\(S\) base URL/);
  });

  it("fails before opening PostgreSQL when the identity secret is too short", () => {
    expect(() =>
      createPostgresIdentityApplicationRuntime({
        ...validInput,
        secret: "too-short",
      }),
    ).toThrow(/identity secret with at least 32 characters/);
  });
});
