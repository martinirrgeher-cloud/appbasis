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
  // Private exercise media is not yet approved for production. Even if a
  // Cloudflare R2 binding is configured, uploads/downloads/deletions via the
  // regular HTTP routes remain unavailable until provider-level erasure and
  // privacy evidence have been explicitly approved in a separate change.
  //
  // Preview-only activation flags must never be inherited by production.
  const {
    exerciseCatalogMediaStore: _unapprovedMediaStore,
    registrationCalendarActivation: _previewCalendar,
    trainingSessionWriteGuardMode: _previewTrainingWriteGuard,
    ...productionOptions
  } = options;
  return Object.freeze({
    ...productionOptions,
    exerciseCatalogMediaStore: null,
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
