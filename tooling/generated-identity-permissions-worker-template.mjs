export function extendIdentityPermissionsWorkerTemplate(input, generated) {
  if (!requiresIdentityPermissionsWorker(input)) return generated;

  const reservedPaths = [
    "test/worker.test.ts",
    "worker/index.ts",
    "worker/postgres.ts",
  ];
  for (const path of reservedPaths) {
    if (generated.files.some((entry) => entry.path === path)) {
      throw new Error(
        `Generated identity+permissions worker extension collided with existing file: ${path}.`,
      );
    }
  }

  const files = [];
  for (const entry of generated.files) {
    files.push(entry);
    if (entry.path === "test/app.test.ts") {
      files.push(file("test/worker.test.ts", generatedWorkerTest(generated.appId)));
    }
    if (entry.path === "worker/app.ts") {
      files.push(file("worker/index.ts", generatedWorkerEntrypoint(generated.appId)));
      files.push(file("worker/postgres.ts", generatedPostgresRuntime()));
    }
  }

  return Object.freeze({
    ...generated,
    files: Object.freeze(files),
  });
}

function requiresIdentityPermissionsWorker(input) {
  const modules = input?.modules ?? [];
  const platformServices = input?.platformServices ?? ["identity"];
  return (
    modules.length === 0 &&
    platformServices.includes("identity") &&
    platformServices.includes("permissions")
  );
}

function file(path, content) {
  return Object.freeze({ path, content });
}

function generatedPostgresRuntime() {
  return `import {
  createPostgresIdentityApplicationRuntime,
  type IdentityPostgresRuntimeSqlClient,
} from "@appbasis/identity/postgres-runtime";
import type { IdentityHttpService } from "@appbasis/identity/http";
import {
  PostgresPermissionStore,
  type PermissionStore,
} from "@appbasis/permissions";

export interface GeneratedPostgresApplicationRuntime {
  identity: IdentityHttpService;
  permissions: PermissionStore;
  close(): Promise<void>;
}

export interface GeneratedPostgresApplicationRuntimeOptions {
  connectionString: string;
  baseURL: string;
  secret: string;
}

export async function createGeneratedPostgresApplicationRuntime(
  options: GeneratedPostgresApplicationRuntimeOptions,
): Promise<GeneratedPostgresApplicationRuntime> {
  const identityRuntime = await createPostgresIdentityApplicationRuntime(options);

  try {
    const permissions = createPermissionStore(identityRuntime.sql);
    return Object.freeze({
      identity: identityRuntime.identity,
      permissions,
      async close() {
        await identityRuntime.close();
      },
    });
  } catch (error) {
    try {
      await identityRuntime.close();
    } catch {
      // Preserve the construction failure; cleanup errors must not replace it.
    }
    throw error;
  }
}

function createPermissionStore(client: IdentityPostgresRuntimeSqlClient) {
  return new PostgresPermissionStore({
    unsafe(query, parameters) {
      return client.unsafe(query, parameters);
    },
  });
}
`;
}

function generatedWorkerEntrypoint(appId) {
  return `import { createGeneratedApp } from "./app";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";

type GeneratedRuntimeFactory = (
  options: GeneratedPostgresApplicationRuntimeOptions,
) =>
  | GeneratedPostgresApplicationRuntime
  | PromiseLike<GeneratedPostgresApplicationRuntime>;

type WorkerErrorKind = "UNEXPECTED_RUNTIME_ERROR" | "RUNTIME_CLOSE_ERROR";

export function createGeneratedWorker(
  runtimeFactory: GeneratedRuntimeFactory =
    createGeneratedPostgresApplicationRuntime,
) {
  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/api/health") {
        return Response.json({ status: "ok", appId: "${appId}" });
      }

      const runtimeOptions = runtimeConfiguration(env);
      if (runtimeOptions === null) {
        return Response.json(
          {
            error: {
              code: "RUNTIME_NOT_CONFIGURED",
              message: "The generated application runtime is not configured.",
            },
          },
          { status: 503 },
        );
      }

      let runtime: GeneratedPostgresApplicationRuntime | null = null;
      let response: Response;
      try {
        runtime = await runtimeFactory(runtimeOptions);
        const app = createGeneratedApp({
          identity: runtime.identity,
          secureCookies: url.protocol === "https:",
        });
        response = await app.fetch(request);
      } catch {
        logWorkerError("generated_worker_request_failed", "UNEXPECTED_RUNTIME_ERROR");
        response = Response.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "The generated application request failed.",
            },
          },
          { status: 500 },
        );
      }

      if (runtime !== null) {
        await closeRuntimeSafely(runtime);
      }
      return response;
    },
  });
}

export default createGeneratedWorker();

function runtimeConfiguration(
  env: unknown,
): GeneratedPostgresApplicationRuntimeOptions | null {
  if (!isRecord(env)) return null;
  const hyperdrive = env.HYPERDRIVE;
  if (!isRecord(hyperdrive)) return null;

  const connectionString = normalizedPostgresConnectionString(
    hyperdrive.connectionString,
  );
  const baseURL = normalizedHttpsOrigin(env.APPBASIS_BASE_URL);
  const secret = normalizedSecret(env.BETTER_AUTH_SECRET);
  if (connectionString === null || baseURL === null || secret === null) {
    return null;
  }

  return Object.freeze({ connectionString, baseURL, secret });
}

async function closeRuntimeSafely(
  runtime: GeneratedPostgresApplicationRuntime,
): Promise<void> {
  try {
    await runtime.close();
  } catch {
    logWorkerError("generated_worker_runtime_close_failed", "RUNTIME_CLOSE_ERROR");
  }
}

function logWorkerError(event: string, errorKind: WorkerErrorKind): void {
  try {
    console.error(JSON.stringify({ event, errorKind }));
  } catch {
    // Logging must never replace an application response.
  }
}

function normalizedPostgresConnectionString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
      url.hostname.length === 0
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function normalizedHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.hostname.length === 0 ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function normalizedSecret(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length >= 32
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
`;
}

function generatedWorkerTest(appId) {
  return String.raw`import { describe, expect, it } from "vitest";

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
  APPBASIS_BASE_URL: "https://ulc.example.test",
  BETTER_AUTH_SECRET: "worker-runtime-test-secret-00000000000000",
});

function runtime(close = async () => {}) {
  return {
    identity,
    permissions: new InMemoryPermissionStore({
      knownCapabilities: [],
      roles: [],
      principals: [],
    }),
    close,
  } satisfies GeneratedPostgresApplicationRuntime;
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
      appId: "${appId}",
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
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RUNTIME_NOT_CONFIGURED" },
    });
    expect(runtimeCalls).toBe(0);
  });

  it("maps validated bindings into one request-scoped runtime and closes it", async () => {
    let closeCalls = 0;
    let receivedOptions: unknown = null;
    const worker = createGeneratedWorker(async (options) => {
      receivedOptions = options;
      return runtime(async () => {
        closeCalls += 1;
      });
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
      baseURL: validEnv.APPBASIS_BASE_URL,
      secret: validEnv.BETTER_AUTH_SECRET,
    });
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
`;
}
