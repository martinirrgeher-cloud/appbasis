import { createGeneratedWorker } from "./index";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";
import {
  type UlcExerciseCatalogRuntimeMode,
} from "./exercise-catalog-runtime";
import { createGeneratedPreviewWorker } from "./preview";

const RUNTIME_HEALTH_PATH = "/api/health/exercise-catalog-runtime";
const EXERCISE_CATALOG_API = "/api/modules/exercise-catalog";

interface PreviewWorker {
  fetch(request: Request, env: unknown): Promise<Response>;
}

export function createExerciseCatalogRuntimePreviewWorker(
  mode: Exclude<UlcExerciseCatalogRuntimeMode, "legacy">,
  delegate: PreviewWorker = createGeneratedWorker(
    (options: GeneratedPostgresApplicationRuntimeOptions) =>
      createGeneratedPostgresApplicationRuntime({
        ...options,
        exerciseCatalogRuntimeMode: mode,
      }),
  ),
) {
  const preview = createGeneratedPreviewWorker(delegate);

  return Object.freeze({
    async fetch(request: Request, env: unknown): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === RUNTIME_HEALTH_PATH) {
        if (request.method !== "GET") {
          return new Response(null, {
            status: 405,
            headers: { allow: "GET" },
          });
        }
        return Response.json({
          status: "ok",
          appId: "ulc-linz",
          exerciseCatalogRuntimeMode: mode,
        });
      }

      if (
        mode === "legacy-read-writes-blocked" &&
        isExerciseCatalogWriteRequest(request, url)
      ) {
        return exerciseCatalogWriteQuiesced();
      }

      return preview.fetch(request, env);
    },
  });
}

export function isExerciseCatalogWriteRequest(
  request: Request,
  url = new URL(request.url),
): boolean {
  if (
    url.pathname !== EXERCISE_CATALOG_API &&
    !url.pathname.startsWith(EXERCISE_CATALOG_API + "/")
  ) {
    return false;
  }
  if (request.method === "GET" || request.method === "HEAD") return false;
  if (
    request.method === "POST" &&
    url.pathname === EXERCISE_CATALOG_API + "/import-preview"
  ) {
    return false;
  }
  return true;
}

function exerciseCatalogWriteQuiesced(): Response {
  return Response.json(
    {
      error: {
        code: "EXERCISE_CATALOG_WRITE_QUIESCED",
        message:
          "Exercise catalog writes are temporarily blocked for the guarded runtime cutover.",
      },
    },
    {
      status: 503,
      headers: {
        "retry-after": "60",
      },
    },
  );
}
