import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const EXERCISE_CATALOG_CAPABILITIES = {
  edit: requiredCapability("exercise-catalog:edit"),
  view: requiredCapability("exercise-catalog:view"),
} as const;

export {
  ExerciseCatalogValidationError,
  createExerciseCatalogDefinition,
  createExerciseCatalogItem,
} from "./domain/catalog";
export {
  InMemoryExerciseCatalogRepository,
} from "./in-memory-repository";
export {
  PostgresExerciseCatalogRepository,
} from "./postgres-repository";
export { ExerciseCatalogService } from "./service";
export type {
  CreateExerciseCatalogItemInput,
  ExerciseCatalogCategory,
  ExerciseCatalogDefinition,
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
  ExerciseCatalogParameterInput,
  ExerciseCatalogParameterInputType,
} from "./domain/catalog";
export type {
  ExerciseCatalogPostgresClient,
  ExerciseCatalogPostgresQueryClient,
  ExerciseCatalogSqlParameter,
} from "./postgres-repository";
export type { ExerciseCatalogRepository } from "./repository";
export type {
  ExerciseCatalogItemView,
  ExerciseCatalogServiceOptions,
  UpdateExerciseCatalogItemInput,
} from "./service";

function requiredCapability<const T extends string>(capability: T): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Exercise catalog capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}
