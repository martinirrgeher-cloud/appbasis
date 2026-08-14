import { describe, expect, it, vi } from "vitest";

import { createIdentityHttpHandlers, type IdentityHttpService } from "../src/http";

const currentIdentity = {
  identity: {
    identityId: "identity-1",
    username: "demo.user",
    displayName: "Demo User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "better-auth.session_token=session-value",
  access: "full" as const,
};

function identityService(): IdentityHttpService {
  return {
    signInWithUsername: vi.fn(async () => currentIdentity),
    getCurrentIdentity: vi.fn(async () => currentIdentity),
    changeRequiredPassword: vi.fn(async () => currentIdentity),
  };
}

describe("identity HTTP adapter", () => {
  it("preserves username sign-in payload and secure session cookie", async () => {
    const identity = identityService();
    const handlers = createIdentityHttpHandlers({ identity, secureCookies: true });

    const response = await handlers.signIn(
      new Request("https://app.example/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "demo.user", password: "secret-value" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("set-cookie")).toBe(
      "better-auth.session_token=session-value; Path=/; HttpOnly; SameSite=Lax; Secure",
    );
    expect(await response.json()).toEqual({
      identity: {
        identityId: "identity-1",
        username: "demo.user",
        displayName: "Demo User",
        contactEmail: null,
        personId: null,
        mustChangePassword: false,
        accountStatus: "active",
      },
      access: "full",
    });
    expect(identity.signInWithUsername).toHaveBeenCalledWith({
      username: "demo.user",
      password: "secret-value",
    });
  });

  it("passes the complete cookie header to session resolution", async () => {
    const identity = identityService();
    const handlers = createIdentityHttpHandlers({ identity });
    const request = new Request("https://app.example/protected", {
      headers: {
        cookie: "other=value; better-auth.session_token=session-value",
      },
    });

    const current = await handlers.resolveCurrentIdentity(request);

    expect(current).not.toBeInstanceOf(Response);
    expect(identity.getCurrentIdentity).toHaveBeenCalledWith(
      "other=value; better-auth.session_token=session-value",
    );
  });

  it("keeps a missing session fail-closed", async () => {
    const identity = identityService();
    const handlers = createIdentityHttpHandlers({ identity });

    const response = await handlers.session(
      new Request("https://app.example/api/auth/session"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "SESSION_INVALID",
        message: "A valid session is required.",
      },
    });
    expect(identity.getCurrentIdentity).not.toHaveBeenCalled();
  });

  it("rejects an invalid password-change idempotency key before identity mutation", async () => {
    const identity = identityService();
    const handlers = createIdentityHttpHandlers({ identity, secureCookies: false });

    const response = await handlers.changeRequiredPassword(
      new Request("https://app.example/api/auth/change-required-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=session-value",
        },
        body: JSON.stringify({
          currentPassword: "current-secret",
          newPassword: "new-secret",
          idempotencyKey: "not-a-uuid",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The request body is invalid.",
      },
    });
    expect(identity.changeRequiredPassword).not.toHaveBeenCalled();
  });
});
