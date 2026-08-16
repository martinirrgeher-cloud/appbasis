import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import { createGeneratedApp } from "../worker/app";

const currentIdentity = {
  identity: {
    identityId: "identity-1",
    username: "mini.user",
    displayName: "Mini User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=test-token",
  access: "full" as const,
};

const identity: IdentityHttpService = {
  async signInWithUsername() {
    return currentIdentity;
  },
  async getCurrentIdentity(sessionToken) {
    return sessionToken === currentIdentity.sessionToken ? currentIdentity : null;
  },
  async changeRequiredPassword() {
    return currentIdentity;
  },
};

describe("generated AppBasis identity runtime", () => {
  it("is runnable and exposes health", async () => {
    const response = await createGeneratedApp({ identity }).request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("uses the shared identity HTTP contract", async () => {
    const response = await createGeneratedApp({
      identity,
      secureCookies: false,
    }).request("/api/auth/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "mini.user", password: "secret" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("appbasis.session=test-token");
    expect(await response.json()).toMatchObject({
      identity: { username: "mini.user" },
      access: "full",
    });
  });
});
