import { createExerciseCatalogRuntimePreviewWorker } from "./preview-exercise-catalog-runtime";
import { isG046SandboxRuntimeBound } from "./registration-calendar-sandbox-gate";

const preview = createExerciseCatalogRuntimePreviewWorker("standard-module");

/** No fallback to another Worker or database on invalid sandbox configuration. */
export default Object.freeze({
  async fetch(request: Request, env: unknown): Promise<Response> {
    if (!isG046SandboxRuntimeBound(request, env)) {
      return Response.json({
        error: { code: "G04_SANDBOX_NOT_CONFIGURED",
          message: "The isolated calendar test environment is unavailable." },
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    return preview.fetch(request, env);
  },
});
