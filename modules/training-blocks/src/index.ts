import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const TRAINING_BLOCK_CAPABILITIES = Object.freeze({
  edit: requiredTrainingBlockCapability("training-blocks:edit"),
  view: requiredTrainingBlockCapability("training-blocks:view"),
});

export {
  TrainingBlockValidationError,
  normalizeTrainingBlockDraft,
  normalizeTrainingBlockIdentifier,
} from "./training-block";
export type {
  CreateTrainingBlockDraftInput,
  TrainingBlockDraft,
  TrainingBlockExerciseDraft,
  TrainingBlockExerciseInput,
  TrainingBlockParameterOverride,
  TrainingBlockParameterOverrideInput,
} from "./training-block";

export * from "./repository";
export * from "./in-memory-repository";
export * from "./postgres-repository";
export * from "./service";

function requiredTrainingBlockCapability<const T extends string>(
  capability: T,
): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Training blocks capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}
