import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import { InMemoryPermissionStore } from "@appbasis/permissions";

import { createGeneratedWorker } from "../worker/index";
import type { GeneratedPostgresApplicationRuntime } from "../worker/postgres";

const currentIdentity = {
  identity: {
    identityId: "identity-worker-1",
    username: "worker.user",
    displayName: "Worker User",
    contactEmail: null,
    personId: null,
    mustChangePassword: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    disabledAt: null,
    accountStatus: "active" as const,
  },
  sessionToken: "appbasis.session=worker-test-token",
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

const validEnv = Object.freeze({
  HYPERDRIVE: Object.freeze({
    connectionString: "postgresql://user:password@database.example.test/appbasis",
  }),
  SECURITY_LOG_HYPERDRIVE: Object.freeze({
    connectionString:
      "postgresql://security_ingest:password@database.example.test/appbasis",
  }),
  APPBASIS_BASE_URL: "https://ulc.example.test",
  BETTER_AUTH_SECRET: "worker-runtime-test-secret-00000000000000",
});

function runtime(
  close = async () => {},
  flush = async () => {},
  countdownAccess: GeneratedPostgresApplicationRuntime["countdownAccess"] = {
    async assertViewAccess() {
      return { organizationId: "verein-1" };
    },
  },
): GeneratedPostgresApplicationRuntime {
  return {
    identity,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [],
      roles: [],
      principals: [],
    }),
    countdownAccess,
    securityEvents: {
      record() {},
      flush,
    },
    close,
  };
}

describe("generated identity+permissions Worker entrypoint", () => {
  it("keeps liveness available without database or secret bindings", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      throw new Error("runtime must not be created for liveness");
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/health"),
      undefined,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      appId: "ulc-linz",
    });
    expect(runtimeCalls).toBe(0);
  });

  it("fails closed before runtime creation when required bindings are missing", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      return runtime();
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/session"),
      {
        HYPERDRIVE: { connectionString: validEnv.HYPERDRIVE.connectionString },
        APPBASIS_BASE_URL: validEnv.APPBASIS_BASE_URL,
        BETTER_AUTH_SECRET: validEnv.BETTER_AUTH_SECRET,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RUNTIME_NOT_CONFIGURED" },
    });
    expect(runtimeCalls).toBe(0);
  });

  it("rejects reuse of the application database credential for security-event ingest", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      return runtime();
    });
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/session"),
      {
        ...validEnv,
        SECURITY_LOG_HYPERDRIVE: {
          connectionString: validEnv.HYPERDRIVE.connectionString,
        },
      },
    );

    expect(response.status).toBe(503);
    expect(runtimeCalls).toBe(0);
  });

  it("serves the countdown contract only to an authenticated authorized member", async () => {
    let accessCalls = 0;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess(current) {
            accessCalls += 1;
            expect(current.identity.identityId).toBe(currentIdentity.identity.identityId);
            return { organizationId: "verein-1" };
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(accessCalls).toBe(1);
    await expect(response.json()).resolves.toEqual({
      module: {
        moduleId: "countdown",
        capability: "countdown:view",
      },
      access: {
        view: true,
        organizationId: "verein-1",
      },
    });
  });

  it("keeps the countdown contract closed without a valid session", async () => {
    let accessCalls = 0;
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess() {
            accessCalls += 1;
            return { organizationId: "verein-1" };
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown"),
      validEnv,
    );

    expect(response.status).toBe(401);
    expect(accessCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_INVALID" },
    });
  });

  it("returns a generic forbidden countdown response for denied module access", async () => {
    const { UlcLinzCountdownAccessDeniedError } = await import(
      "../worker/countdown-access"
    );
    const worker = createGeneratedWorker(() =>
      runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess() {
            throw new UlcLinzCountdownAccessDeniedError();
          },
        },
      ),
    );

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ULC_LINZ_COUNTDOWN_ACCESS_DENIED",
        message: "Countdown access denied.",
      },
    });
  });

  it("does not accept mutating methods on the countdown contract endpoint", async () => {
    const worker = createGeneratedWorker(() => runtime());

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown", {
        method: "POST",
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });

  it("maps validated bindings into one request-scoped runtime, flushes security events and closes it", async () => {
    let flushCalls = 0;
    let closeCalls = 0;
    let receivedOptions: unknown = null;
    const worker = createGeneratedWorker(async (options) => {
      receivedOptions = options;
      return runtime(
        async () => {
          closeCalls += 1;
        },
        async () => {
          flushCalls += 1;
        },
      );
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/auth/session", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    expect(receivedOptions).toEqual({
      connectionString: validEnv.HYPERDRIVE.connectionString,
      securityLogConnectionString:
        validEnv.SECURITY_LOG_HYPERDRIVE.connectionString,
      baseURL: validEnv.APPBASIS_BASE_URL,
      secret: validEnv.BETTER_AUTH_SECRET,
    });
    expect(flushCalls).toBe(1);
    expect(closeCalls).toBe(1);
  });

  it("returns a generic runtime failure without leaking provider error details", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const response = await createGeneratedWorker(() => {
        throw new Error("postgresql://secret-host/private");
      }).fetch(
        new Request("https://ulc.example.test/api/auth/session"),
        validEnv,
      );

      expect(response.status).toBe(500);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("INTERNAL_ERROR");
      expect(body).not.toContain("secret-host");
      expect(logged.join("\n")).toContain("UNEXPECTED_RUNTIME_ERROR");
      expect(logged.join("\n")).not.toContain("secret-host");
    } finally {
      console.error = originalError;
    }
  });

  it("keeps a successful response when security-event flush fails and still closes the runtime", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    let closeCalls = 0;
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const worker = createGeneratedWorker(() =>
        runtime(
          async () => {
            closeCalls += 1;
          },
          async () => {
            throw new Error("postgresql://security-log-secret/private");
          },
        ),
      );
      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/auth/session", {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(200);
      expect(closeCalls).toBe(1);
      expect(logged.join("\n")).toContain("SECURITY_EVENT_FLUSH_ERROR");
      expect(logged.join("\n")).not.toContain("security-log-secret");
    } finally {
      console.error = originalError;
    }
  });

  it("keeps a successful response when runtime close fails", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const worker = createGeneratedWorker(() =>
        runtime(async () => {
          throw new Error("close-secret");
        }),
      );
      const response = await worker.fetch(
        new Request("https://ulc.example.test/api/auth/session", {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(200);
      expect(logged.join("\n")).toContain("RUNTIME_CLOSE_ERROR");
      expect(logged.join("\n")).not.toContain("close-secret");
    } finally {
      console.error = originalError;
    }
  });
});
