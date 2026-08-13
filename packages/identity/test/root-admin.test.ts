import { describe, expect, it } from "vitest";

import {
  normalizeTechnicalRootAdminOptions,
  TechnicalRootAdminConfigurationError,
} from "../src/root-admin.mjs";

const valid = {
  connectionString: "postgres://postgres:postgres@localhost:5432/appbasis",
  secret: "technical-root-admin-secret-at-least-32-characters",
  baseURL: "https://preview.example.test",
  username: "Root.Admin",
  displayName: " Reference Technical Admin ",
  password: "Technical-root-password-42!",
};

describe("technical root administrator configuration", () => {
  it("normalizes only non-secret presentation fields", () => {
    expect(normalizeTechnicalRootAdminOptions(valid)).toEqual({
      ...valid,
      username: "root.admin",
      displayName: "Reference Technical Admin",
    });
  });

  it.each([
    [
      { connectionString: "postgres:relative" },
      "connectionString must be an absolute PostgreSQL URL",
    ],
    [{ secret: "too-short" }, "secret must contain at least 32"],
    [
      { baseURL: "https://user:pass@preview.example.test" },
      "credential-free HTTPS origin",
    ],
    [
      { baseURL: "http://preview.example.test" },
      "credential-free HTTPS origin",
    ],
    [{ username: "Admin-Root" }, "username is invalid"],
    [{ displayName: "   " }, "displayName is required"],
    [{ password: "short" }, "password must contain 8-128"],
    [{ password: "x".repeat(129) }, "password must contain 8-128"],
  ])("rejects invalid input before opening PostgreSQL", (patch, message) => {
    expect(() =>
      normalizeTechnicalRootAdminOptions({ ...valid, ...patch }),
    ).toThrowError(TechnicalRootAdminConfigurationError);
    expect(() =>
      normalizeTechnicalRootAdminOptions({ ...valid, ...patch }),
    ).toThrow(message);
  });

  it("allows loopback HTTP for isolated tests only", () => {
    expect(
      normalizeTechnicalRootAdminOptions({
        ...valid,
        baseURL: "http://127.0.0.1:3000/path",
      }).baseURL,
    ).toBe("http://127.0.0.1:3000");
  });
});
