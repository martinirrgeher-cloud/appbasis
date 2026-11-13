import { describe, expect, it, vi } from "vitest";
import { BetterAuthIdentityBackend } from "../src/server";

type Options = ConstructorParameters<typeof BetterAuthIdentityBackend>[0];

function backendWithSessionResponse(payload: unknown) {
  const handler = vi.fn(async (_request: Request) => Response.json(payload));
  const backend = new BetterAuthIdentityBackend({
    auth: { handler } as unknown as Options["auth"],
    sql: {} as Options["sql"],
    baseURL: "https://identity.test",
  });
  return { backend, handler };
}

describe("N16 canonical Better Auth session identity bridge", () => {
  it("uses the canonical get-session response, not cookie decoding", async () => {
    const { backend, handler } = backendWithSessionResponse({
      user: { id: "trainer-identity" },
      session: { id: "canonical-row-id", userId: "trainer-identity" },
    });
    const cookie = "other=ignored; better-auth.session_token=opaque.signed.value";
    await expect(backend.getSession(cookie)).resolves.toEqual({
      identityId: "trainer-identity",
      sessionToken: cookie,
      sessionId: "canonical-row-id",
    });
    expect(handler).toHaveBeenCalledTimes(1);
    const request = handler.mock.calls[0]?.[0];
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("cookie")).toBe(cookie);
    expect(request?.url).toBe("https://identity.test/api/auth/get-session");
  });

  it("refuses a response that claims a session owned by a different actor", async () => {
    const { backend } = backendWithSessionResponse({
      user: { id: "trainer-identity" },
      session: { id: "other-user-session", userId: "someone-else" },
    });
    await expect(backend.getSession("better-auth.session_token=x")).resolves.toBeNull();
  });

  it("accepts legacy authenticated reads but withholds missing or malformed session IDs", async () => {
    for (const session of [
      undefined,
      { id: "" },
      { id: " invalid " },
      { id: 12 },
    ]) {
      const { backend } = backendWithSessionResponse({
        user: { id: "trainer-identity" },
        ...(session === undefined ? {} : { session }),
      });
      await expect(backend.getSession("better-auth.session_token=x")).resolves.toEqual({
        identityId: "trainer-identity",
        sessionToken: "better-auth.session_token=x",
      });
    }
  });
});
