import type {
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";
import type {
  ExerciseCatalogItem,
  ExerciseCatalogParameter,
  ExerciseCatalogRepository,
} from "@appbasis/exercise-catalog";
import {
  normalizeTrainingBlockDraft,
  TrainingBlockConflictError,
  TrainingBlockInactiveError,
  TrainingBlockValidationError,
  type CreateTrainingBlockDraftInput,
  type TrainingBlockExerciseDraft,
  type TrainingBlockRevision,
  type TrainingBlockRevisionComparison,
  type TrainingBlockService,
  type TrainingBlockSnapshot,
  type UpdateTrainingBlockDraftInput,
} from "@appbasis/training-blocks";

export interface UlcTrainingBlockAudience {
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
}

export interface UlcTrainingBlockMasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): PromiseLike<Pick<AthleteMasterdataSnapshot, "trainingGroups">>;
}

export interface UlcTrainingBlockExerciseReader {
  listItems: Pick<ExerciseCatalogRepository, "listItems">["listItems"];
}

export class UlcTrainingBlockReferenceError extends Error {
  readonly code = "ULC_TRAINING_BLOCK_REFERENCE_INVALID";
  readonly referenceType: "audience" | "exercise";
  readonly referenceId: string | null;

  constructor(
    referenceType: "audience" | "exercise",
    referenceId: string | null,
  ) {
    super(
      referenceType === "audience"
        ? "Training block requires one active ULC training group."
        : "Training block references an unavailable exercise.",
    );
    this.name = "UlcTrainingBlockReferenceError";
    this.referenceType = referenceType;
    this.referenceId = referenceId;
  }
}

export type UlcTrainingBlockParameterErrorReason =
  | "unknown-key"
  | "required-value-missing"
  | "invalid-number"
  | "below-minimum"
  | "above-maximum"
  | "step-mismatch";

export class UlcTrainingBlockParameterError extends Error {
  readonly code = "ULC_TRAINING_BLOCK_PARAMETER_INVALID";
  readonly exerciseId: string;
  readonly parameterKey: string;
  readonly reason: UlcTrainingBlockParameterErrorReason;

  constructor(
    exerciseId: string,
    parameterKey: string,
    reason: UlcTrainingBlockParameterErrorReason,
  ) {
    super("Training block exercise parameter override is invalid.");
    this.name = "UlcTrainingBlockParameterError";
    this.exerciseId = exerciseId;
    this.parameterKey = parameterKey;
    this.reason = reason;
  }
}

export interface UlcTrainingBlockService {
  listAudiences(organizationId: string): Promise<readonly UlcTrainingBlockAudience[]>;
  list(organizationId: string): Promise<readonly TrainingBlockSnapshot[]>;
  findCurrent(
    organizationId: string,
    blockId: string,
  ): Promise<TrainingBlockSnapshot | undefined>;
  create(
    organizationId: string,
    input: CreateTrainingBlockDraftInput,
  ): Promise<TrainingBlockSnapshot>;
  update(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    input: UpdateTrainingBlockDraftInput,
  ): Promise<TrainingBlockSnapshot | undefined>;
  deactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
  ): Promise<TrainingBlockSnapshot | undefined>;
  listRevisions(
    organizationId: string,
    blockId: string,
  ): Promise<readonly TrainingBlockRevision[]>;
  findRevision(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<TrainingBlockRevision | undefined>;
  compareRevisions(
    organizationId: string,
    blockId: string,
    fromRevision: number,
    toRevision: number,
  ): Promise<TrainingBlockRevisionComparison | undefined>;
}

export function createUlcTrainingBlockService({
  blocks,
  masterdata,
  exerciseCatalog,
}: {
  blocks: TrainingBlockService;
  masterdata: UlcTrainingBlockMasterdataReader;
  exerciseCatalog: UlcTrainingBlockExerciseReader;
}): UlcTrainingBlockService {
  async function listAudiences(
    organizationId: string,
  ): Promise<readonly UlcTrainingBlockAudience[]> {
    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
    return Object.freeze(
      snapshot.trainingGroups
        .filter(
          (group) =>
            group.organizationId === organizationId && group.isActive === true,
        )
        .map((group) => audienceFromGroup(group)),
    );
  }

  async function assertUpdatePrecondition(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
  ): Promise<boolean> {
    if (
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 1
    ) {
      throw new TrainingBlockValidationError(
        "Expected training block revision is invalid.",
      );
    }
    const current = await blocks.findCurrent(organizationId, blockId);
    if (current === undefined) return false;
    if (current.currentRevision !== expectedRevision) {
      throw new TrainingBlockConflictError(
        expectedRevision,
        current.currentRevision,
      );
    }
    if (!current.isActive) {
      throw new TrainingBlockInactiveError(
        current.id,
        current.currentRevision,
      );
    }
    return true;
  }

  async function assertReferences(
    organizationId: string,
    input: CreateTrainingBlockDraftInput | UpdateTrainingBlockDraftInput,
  ): Promise<void> {
    const draft = normalizeTrainingBlockDraft(input);
    if (draft.audienceId === null) {
      throw new UlcTrainingBlockReferenceError("audience", null);
    }

    const [snapshot, catalogItems] = await Promise.all([
      masterdata.readOrganizationSnapshot(organizationId),
      exerciseCatalog.listItems(organizationId),
    ]);
    const audience = snapshot.trainingGroups.find(
      (group) =>
        group.id === draft.audienceId &&
        group.organizationId === organizationId &&
        group.isActive === true,
    );
    if (audience === undefined) {
      throw new UlcTrainingBlockReferenceError(
        "audience",
        draft.audienceId,
      );
    }

    const byId = new Map(
      catalogItems.map((exercise) => [exercise.id, exercise] as const),
    );
    for (const occurrence of draft.exercises) {
      const exercise = byId.get(occurrence.exerciseId);
      if (
        exercise === undefined ||
        exercise.organizationId !== organizationId ||
        exercise.isActive !== true
      ) {
        throw new UlcTrainingBlockReferenceError(
          "exercise",
          occurrence.exerciseId,
        );
      }
      validateParameterOverrides(occurrence, exercise);
    }
  }

  return Object.freeze({
    listAudiences,
    list(organizationId: string) {
      return blocks.list(organizationId);
    },
    findCurrent(organizationId: string, blockId: string) {
      return blocks.findCurrent(organizationId, blockId);
    },
    async create(
      organizationId: string,
      input: CreateTrainingBlockDraftInput,
    ) {
      await assertReferences(organizationId, input);
      return blocks.create(organizationId, input);
    },
    async update(
      organizationId: string,
      blockId: string,
      expectedRevision: number,
      input: UpdateTrainingBlockDraftInput,
    ) {
      const exists = await assertUpdatePrecondition(
        organizationId,
        blockId,
        expectedRevision,
      );
      if (!exists) return undefined;
      await assertReferences(organizationId, input);
      return blocks.update(
        organizationId,
        blockId,
        expectedRevision,
        input,
      );
    },
    deactivate(
      organizationId: string,
      blockId: string,
      expectedRevision: number,
    ) {
      return blocks.deactivate(organizationId, blockId, expectedRevision);
    },
    listRevisions(organizationId: string, blockId: string) {
      return blocks.listRevisions(organizationId, blockId);
    },
    findRevision(
      organizationId: string,
      blockId: string,
      revision: number,
    ) {
      return blocks.findRevision(organizationId, blockId, revision);
    },
    compareRevisions(
      organizationId: string,
      blockId: string,
      fromRevision: number,
      toRevision: number,
    ) {
      return blocks.compareRevisions(
        organizationId,
        blockId,
        fromRevision,
        toRevision,
      );
    },
  });
}

function validateParameterOverrides(
  occurrence: TrainingBlockExerciseDraft,
  exercise: ExerciseCatalogItem,
): void {
  const definitions = new Map(
    exercise.parameters.map((parameter) => [parameter.key, parameter] as const),
  );
  const overrides = new Map(
    occurrence.parameterOverrides.map((override) => [override.key, override.value] as const),
  );

  for (const override of occurrence.parameterOverrides) {
    const definition = definitions.get(override.key);
    if (definition === undefined) {
      throw new UlcTrainingBlockParameterError(
        exercise.id,
        override.key,
        "unknown-key",
      );
    }
    validateParameterValue(exercise.id, definition, override.value);
  }

  for (const definition of exercise.parameters) {
    if (
      definition.isRequired &&
      definition.defaultValue === null &&
      !overrides.has(definition.key)
    ) {
      throw new UlcTrainingBlockParameterError(
        exercise.id,
        definition.key,
        "required-value-missing",
      );
    }
  }
}

function validateParameterValue(
  exerciseId: string,
  definition: ExerciseCatalogParameter,
  value: string,
): void {
  if (definition.inputType !== "number") return;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new UlcTrainingBlockParameterError(
      exerciseId,
      definition.key,
      "invalid-number",
    );
  }
  if (definition.minValue !== null && numericValue < definition.minValue) {
    throw new UlcTrainingBlockParameterError(
      exerciseId,
      definition.key,
      "below-minimum",
    );
  }
  if (definition.maxValue !== null && numericValue > definition.maxValue) {
    throw new UlcTrainingBlockParameterError(
      exerciseId,
      definition.key,
      "above-maximum",
    );
  }
  if (
    definition.stepValue !== null &&
    !isStepAligned(
      numericValue,
      definition.minValue ?? 0,
      definition.stepValue,
    )
  ) {
    throw new UlcTrainingBlockParameterError(
      exerciseId,
      definition.key,
      "step-mismatch",
    );
  }
}

function isStepAligned(value: number, base: number, step: number): boolean {
  const quotient = (value - base) / step;
  const nearest = Math.round(quotient);
  const tolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(quotient));
  return Math.abs(quotient - nearest) <= tolerance;
}

function audienceFromGroup(group: TrainingGroup): UlcTrainingBlockAudience {
  return Object.freeze({
    id: group.id,
    name: group.name,
    shortName: group.shortName,
  });
}
