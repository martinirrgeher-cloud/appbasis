import { createGeneratedWorker } from "./index";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";

export function standardExerciseCatalogProductionRuntimeOptions(
  options: GeneratedPostgresApplicationRuntimeOptions,
): GeneratedPostgresApplicationRuntimeOptions {
  // T10 scoped pilot: all personal-data writers must use their existing
  // PostgreSQL application-role admission and deletion fences. The regular
  // module runtimes remain available; only the protected admission variants
  // may be used on the six-module production entrypoint.
  //
  // Private exercise media are OUT OF SCOPE for the initial club pilot:
  // ignore any supplied R2 store so no HTTP endpoint can write/serve them.
  // This does not affect the separately configured encrypted DB backup.
  return Object.freeze({
    ...options,
    exerciseCatalogRuntimeMode: "standard-module-protected-production",
    trainingBlockUsageMode: "protected-production-verified-subject",
    trainingDocumentationRuntimeMode: "protected-production",
    exerciseCatalogMediaStore: null,
  });
}

export function createExerciseCatalogStandardProductionWorker() {
  return createGeneratedWorker(
    (options: GeneratedPostgresApplicationRuntimeOptions) =>
      createGeneratedPostgresApplicationRuntime(
        standardExerciseCatalogProductionRuntimeOptions(options),
      ),
  );
}

export default createExerciseCatalogStandardProductionWorker();
