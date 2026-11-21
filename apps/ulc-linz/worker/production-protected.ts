import { createGeneratedWorker } from "./index";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";

/**
 * Explicit, fail-closed ULC production runtime.
 *
 * This entrypoint is used only by the existing M6 private production
 * refresh workflow. Preview workers and the generic test worker retain
 * their original runtime choices.
 *
 * The flags opt in to SQL-backed guards already tested independently.
 * They are not a privacy policy, legal approval, or release authorization.
 */
export function protectedUlcProductionRuntimeOptions(
  options: GeneratedPostgresApplicationRuntimeOptions,
): GeneratedPostgresApplicationRuntimeOptions {
  return Object.freeze({
    ...options,
    exerciseCatalogRuntimeMode: "standard-module-protected-production" as const,
    trainingBlockUsageMode: "protected-production-verified-subject" as const,
    trainingDocumentationRuntimeMode: "protected-production" as const,
  });
}

export function createProtectedUlcProductionWorker() {
  return createGeneratedWorker(
    (options: GeneratedPostgresApplicationRuntimeOptions) =>
      createGeneratedPostgresApplicationRuntime(
        protectedUlcProductionRuntimeOptions(options),
      ),
  );
}

export default createProtectedUlcProductionWorker();
