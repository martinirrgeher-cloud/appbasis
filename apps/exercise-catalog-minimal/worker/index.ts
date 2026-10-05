import { createExerciseCatalogMinimalApp } from "./app";
import {
  createExerciseCatalogMinimalPostgresApplicationRuntime,
  type ExerciseCatalogMinimalPostgresApplicationRuntime,
  type ExerciseCatalogMinimalPostgresApplicationRuntimeOptions,
} from "./postgres";
import { EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID } from "./catalog-config";

type RuntimeFactory = (
  options: ExerciseCatalogMinimalPostgresApplicationRuntimeOptions,
) =>
  | ExerciseCatalogMinimalPostgresApplicationRuntime
  | PromiseLike<ExerciseCatalogMinimalPostgresApplicationRuntime>;

type WorkerErrorKind = "UNEXPECTED_RUNTIME_ERROR" | "RUNTIME_CLOSE_ERROR";

export function createExerciseCatalogMinimalWorker(
  runtimeFactory: RuntimeFactory =
    createExerciseCatalogMinimalPostgresApplicationRuntime,
) {
  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/api/health") {
        return Response.json({
          status: "ok",
          appId: "exercise-catalog-minimal",
        });
      }

      const runtimeOptions = runtimeConfiguration(env);
      if (runtimeOptions === null) {
        return Response.json(
          {
            error: {
              code: "RUNTIME_NOT_CONFIGURED",
              message: "The application runtime is not configured.",
            },
          },
          { status: 503 },
        );
      }

      let runtime: ExerciseCatalogMinimalPostgresApplicationRuntime | null =
        null;
      let response: Response;
      try {
        runtime = await runtimeFactory(runtimeOptions);
        const app = createExerciseCatalogMinimalApp({
          identity: runtime.identity,
          permissions: runtime.permissions,
          catalog: runtime.catalog,
          organizationId: EXERCISE_CATALOG_MINIMAL_ORGANIZATION_ID,
          secureCookies: url.protocol === "https:",
        });
        response = await app.fetch(request);
      } catch {
        logWorkerError(
          "exercise_catalog_minimal_request_failed",
          "UNEXPECTED_RUNTIME_ERROR",
        );
        response = Response.json(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "The application request failed.",
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

export default createExerciseCatalogMinimalWorker();

function runtimeConfiguration(
  env: unknown,
): ExerciseCatalogMinimalPostgresApplicationRuntimeOptions | null {
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
  runtime: ExerciseCatalogMinimalPostgresApplicationRuntime,
): Promise<void> {
  try {
    await runtime.close();
  } catch {
    logWorkerError(
      "exercise_catalog_minimal_runtime_close_failed",
      "RUNTIME_CLOSE_ERROR",
    );
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
