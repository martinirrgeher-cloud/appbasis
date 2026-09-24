import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import { InMemoryPermissionStore } from "@appbasis/permissions";

import { createGeneratedWorker } from "../worker/index";
import type { GeneratedPostgresApplicationRuntime } from "../worker/postgres";
import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

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
  it("serves the mobile countdown shell without creating a database runtime", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      throw new Error("runtime must not be created for static UI");
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/"),
      undefined,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self'",
    );
    expect(await response.text()).toContain("Intervall-Countdown");
    expect(runtimeCalls).toBe(0);
  });

  it("ships browser JavaScript that parses as standalone module-compatible code", () => {
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("ships the countdown controls and domain-backed plan integration in static assets", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("/api/modules/countdown/plan");
    expect(ULC_LINZ_APP_SCRIPT).toContain("speechSynthesis");
    expect(ULC_LINZ_APP_SCRIPT).toContain("navigator.wakeLock");
    expect(ULC_LINZ_APP_SCRIPT).toContain("localStorage");
    expect(ULC_LINZ_APP_SCRIPT).toContain('runMode === "paused" ? "Weiter" : "Pause"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('timerHint.textContent = "3, 2, 1 – Los"');
    expect(ULC_LINZ_APP_CSS).toContain('[data-phase="work"]');
    expect(ULC_LINZ_APP_CSS).toContain('[data-phase="rest"]');
  });

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
      },
    });
  });

  it("builds an authorized countdown plan from the public domain contract", async () => {
    const worker = createGeneratedWorker(() => runtime());

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/plan", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rounds: 2,
          workSeconds: 20,
          restSeconds: 10,
          workAnnouncementIntervalSeconds: 10,
          restAnnouncementIntervalSeconds: 5,
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.configuration).toEqual({
      rounds: 2,
      workSeconds: 20,
      restSeconds: 10,
      workAnnouncementIntervalSeconds: 10,
      restAnnouncementIntervalSeconds: 5,
      totalSeconds: 53,
    });
    expect(payload.timeline.slice(0, 4)).toEqual([
      { type: "count", atSecond: 0, phase: "prepare", round: 1, value: 3 },
      { type: "count", atSecond: 1, phase: "prepare", round: 1, value: 2 },
      { type: "count", atSecond: 2, phase: "prepare", round: 1, value: 1 },
      { type: "start", atSecond: 3, phase: "work", round: 1, value: "Los" },
    ]);
    expect(payload.timeline.at(-1)).toEqual({
      type: "finished",
      atSecond: 53,
      phase: "finished",
      round: 2,
      value: "Fertig",
    });
  });

  it("rejects invalid countdown plans without leaking validation details", async () => {
    const worker = createGeneratedWorker(() => runtime());
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/plan", {
        method: "POST",
        headers: {
          cookie: currentIdentity.sessionToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rounds: 0,
          workSeconds: 20,
          restSeconds: 10,
        }),
      }),
      validEnv,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_COUNTDOWN_CONFIGURATION",
        message: "The countdown configuration is invalid.",
      },
    });
  });

  it("requires POST for the countdown plan endpoint", async () => {
    const worker = createGeneratedWorker(() => runtime());
    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown/plan", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("keeps the countdown contract closed and audited without a valid session", async () => {
    let accessCalls = 0;
    const events: unknown[] = [];
    const worker = createGeneratedWorker(() => {
      const value = runtime(
        async () => {},
        async () => {},
        {
          async assertViewAccess() {
            accessCalls += 1;
            return { organizationId: "verein-1" };
          },
        },
      );
      return {
        ...value,
        securityEvents: {
          record(event: unknown) {
            events.push(event);
          },
          async flush() {},
        },
      };
    });

    const response = await worker.fetch(
      new Request("https://ulc.example.test/api/modules/countdown"),
      validEnv,
    );

    expect(response.status).toBe(401);
    expect(accessCalls).toBe(0);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_INVALID" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "authorization.denied",
      actorPrincipalId: null,
      organizationId: null,
      action: "view",
      targetId: "countdown",
      reasonCode: "identity-access-denied",
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

  it("keeps unexpected countdown authorization failures generic and secret-free", async () => {
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const worker = createGeneratedWorker(() =>
        runtime(
          async () => {},
          async () => {},
          {
            async assertViewAccess() {
              throw new Error("postgresql://countdown-secret/private");
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

      expect(response.status).toBe(500);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("INTERNAL_ERROR");
      expect(body).not.toContain("countdown-secret");
      expect(logged.join("\n")).not.toContain("countdown-secret");
    } finally {
      console.error = originalError;
    }
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
