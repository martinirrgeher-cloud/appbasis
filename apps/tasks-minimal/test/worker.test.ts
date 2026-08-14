import { describe, expect, it } from "vitest";

import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  InMemoryPermissionStore,
  capabilityId,
  principalId,
} from "@appbasis/permissions";
import { InMemoryTaskRepository, TASK_CAPABILITIES } from "@appbasis/tasks";

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
  APPBASIS_BASE_URL: "https://tasks-preview.example.test",
  BETTER_AUTH_SECRET: "worker-runtime-test-secret-00000000000000",
});

describe("generated Worker entrypoint", () => {
  it("keeps liveness available without database or secret bindings", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      throw new Error("runtime must not be created for liveness");
    });

    const response = await worker.fetch(
      new Request("https://tasks-preview.example.test/api/health"),
      undefined,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      appId: "tasks-minimal",
    });
    expect(runtimeCalls).toBe(0);
  });

  it("fails closed before runtime creation when required deployment bindings are missing", async () => {
    let runtimeCalls = 0;
    const worker = createGeneratedWorker(() => {
      runtimeCalls += 1;
      throw new Error("runtime must not be created for invalid bindings");
    });

    const response = await worker.fetch(
      new Request("https://tasks-preview.example.test/api/tasks"),
      {
        HYPERDRIVE: { connectionString: validEnv.HYPERDRIVE.connectionString },
        APPBASIS_BASE_URL: validEnv.APPBASIS_BASE_URL,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RUNTIME_NOT_CONFIGURED" },
    });
    expect(runtimeCalls).toBe(0);
  });

  it("maps validated bindings into one request-scoped runtime and always closes it", async () => {
    const tasks = new InMemoryTaskRepository();
    const capability = capabilityId(TASK_CAPABILITIES.manage);
    const permissions = new InMemoryPermissionStore({
      knownCapabilities: [capability],
      roles: [],
      principals: [
        {
          principalId: principalId(currentIdentity.identity.identityId),
          roleIds: [],
          grants: [capability],
          revokes: [],
        },
      ],
    });
    let closeCalls = 0;
    let receivedOptions: unknown = null;
    const runtime: GeneratedPostgresApplicationRuntime = {
      identity,
      permissions,
      tasks,
      async close() {
        closeCalls += 1;
      },
    };
    const worker = createGeneratedWorker((options) => {
      receivedOptions = options;
      return runtime;
    });

    const response = await worker.fetch(
      new Request("https://tasks-preview.example.test/api/tasks", {
        headers: { cookie: currentIdentity.sessionToken },
      }),
      validEnv,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tasks: [] });
    expect(receivedOptions).toEqual({
      connectionString: validEnv.HYPERDRIVE.connectionString,
      baseURL: validEnv.APPBASIS_BASE_URL,
      secret: validEnv.BETTER_AUTH_SECRET,
    });
    expect(closeCalls).toBe(1);
  });

  it("returns a generic 500 without leaking runtime errors and still closes the runtime", async () => {
    let closeCalls = 0;
    const runtime: GeneratedPostgresApplicationRuntime = {
      identity,
      permissions: {
        async findPrincipal() {
          throw new Error("postgresql://secret-host/internal");
        },
        async findRole() {
          return null;
        },
        async isKnownCapability() {
          return true;
        },
      },
      tasks: new InMemoryTaskRepository(),
      async close() {
        closeCalls += 1;
      },
    };
    const originalError = console.error;
    const logged: string[] = [];
    console.error = (...values: unknown[]) => {
      logged.push(values.map(String).join(" "));
    };
    try {
      const response = await createGeneratedWorker(() => runtime).fetch(
        new Request("https://tasks-preview.example.test/api/tasks", {
          headers: { cookie: currentIdentity.sessionToken },
        }),
        validEnv,
      );

      expect(response.status).toBe(500);
      const body = JSON.stringify(await response.json());
      expect(body).toContain("INTERNAL_ERROR");
      expect(body).not.toContain("secret-host");
      expect(logged.join("\n")).not.toContain("secret-host");
      expect(closeCalls).toBe(1);
    } finally {
      console.error = originalError;
    }
  });
});
