import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const TRAINING_PLAN_CAPABILITIES = Object.freeze({
  edit: requiredTrainingPlanCapability("training-plans:edit"),
  view: requiredTrainingPlanCapability("training-plans:view"),
});

export {
  TrainingPlanValidationError,
  normalizeTrainingPlanDate,
  normalizeTrainingPlanDraft,
  normalizeTrainingPlanIdentifier,
} from "./training-plan";
export * from "./repository";
export * from "./in-memory-repository";
export * from "./postgres-repository";
export * from "./service";

export type {
  CreateTrainingPlanDraftInput,
  TrainingPlanBlockDraft,
  TrainingPlanBlockInput,
  TrainingPlanDraft,
  TrainingPlanExerciseDraft,
  TrainingPlanExerciseInput,
  TrainingPlanItemDraft,
  TrainingPlanItemInput,
} from "./training-plan";

function requiredTrainingPlanCapability<const T extends string>(
  capability: T,
): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Training plans capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}
