import { createGeneratedApp } from "./app";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";

type GeneratedRuntimeFactory = (
  options: GeneratedPostgresApplicationRuntimeOptions,
) => GeneratedPostgresApplicationRuntime;

export function createGeneratedWorker(
  runtimeFactory: GeneratedRuntimeFactory =
    createGeneratedPostgresApplicationRuntime,
) {
  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/api/health") {
        return Response.json({ status: "ok", appId: "tasks-minimal" });
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
      try {
        runtime = runtimeFactory(runtimeOptions);
        const app = createGeneratedApp({
          identity: runtime.identity,
          permissions: runtime.permissions,
          tasks: runtime.tasks,
          secureCookies: url.protocol === "https:",
        });
        return await app.fetch(request);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "generated_worker_request_failed",
            errorKind: errorKind(error),
          }),
        );
        return Response.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "The generated application request failed.",
            },
          },
          { status: 500 },
        );
      } finally {
        if (runtime !== null) await runtime.close();
      }
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

function errorKind(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
