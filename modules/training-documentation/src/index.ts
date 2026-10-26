import moduleDefinition from "../appbasis.module.json";

const manifestCapabilities: readonly string[] = moduleDefinition.capabilities;

export const MODULE_CAPABILITIES: readonly string[] = Object.freeze([
  ...manifestCapabilities,
]);

export const TRAINING_DOCUMENTATION_CAPABILITIES = Object.freeze({
  edit: requiredCapability("training-documentation:edit"),
  view: requiredCapability("training-documentation:view"),
});

export {
  TrainingDocumentationValidationError,
  normalizeTrainingDocumentationContent,
  normalizeTrainingDocumentationDate,
  normalizeTrainingDocumentationDraft,
  normalizeTrainingDocumentationIdentifier,
  normalizeTrainingDocumentationRevision,
} from "./training-documentation";
export * from "./repository";
export * from "./in-memory-repository";
export * from "./postgres-repository";
export * from "./service";
export type {
  CreateTrainingDocumentationDraftInput,
  TrainingAttendanceStatus,
  TrainingDocumentationAttendanceDraft,
  TrainingDocumentationAttendanceInput,
  TrainingDocumentationBlockDraft,
  TrainingDocumentationBlockInput,
  TrainingDocumentationDraft,
  TrainingDocumentationExerciseDraft,
  TrainingDocumentationExerciseInput,
  TrainingDocumentationItemDraft,
  TrainingDocumentationItemInput,
  TrainingDocumentationStatus,
} from "./training-documentation";

function requiredCapability<const T extends string>(capability: T): T {
  if (!MODULE_CAPABILITIES.includes(capability)) {
    throw new Error(
      `Training documentation capability ${capability} is missing from appbasis.module.json.`,
    );
  }
  return capability;
}
