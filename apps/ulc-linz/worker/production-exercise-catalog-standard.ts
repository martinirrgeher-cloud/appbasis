import { createGeneratedWorker } from "./index";
import {
  createGeneratedPostgresApplicationRuntime,
  type GeneratedPostgresApplicationRuntimeOptions,
} from "./postgres";

export function standardExerciseCatalogProductionRuntimeOptions(
  options: GeneratedPostgresApplicationRuntimeOptions,
): GeneratedPostgresApplicationRuntimeOptions {
  return Object.freeze({
    ...options,
    exerciseCatalogRuntimeMode: "standard-module",
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
