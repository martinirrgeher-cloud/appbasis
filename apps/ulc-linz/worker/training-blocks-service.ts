import type {
  AthleteMasterdataSnapshot,
  TrainingGroup,
} from "@appbasis/athletes";
import type { ExerciseCatalogRepository } from "@appbasis/exercise-catalog";
import {
  normalizeTrainingBlockDraft,
  type CreateTrainingBlockDraftInput,
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
  findItemById: Pick<
    ExerciseCatalogRepository,
    "findItemById"
  >["findItemById"];
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

  async function assertReferences(
    organizationId: string,
    input: CreateTrainingBlockDraftInput | UpdateTrainingBlockDraftInput,
  ): Promise<void> {
    const draft = normalizeTrainingBlockDraft(input);
    if (draft.audienceId === null) {
      throw new UlcTrainingBlockReferenceError("audience", null);
    }

    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
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

    const exerciseIds = [
      ...new Set(draft.exercises.map((exercise) => exercise.exerciseId)),
    ];
    const exercises = await Promise.all(
      exerciseIds.map((exerciseId) =>
        exerciseCatalog.findItemById(organizationId, exerciseId),
      ),
    );
    for (let index = 0; index < exerciseIds.length; index += 1) {
      const exerciseId = exerciseIds[index]!;
      const exercise = exercises[index];
      if (
        exercise === undefined ||
        exercise.organizationId !== organizationId ||
        exercise.isActive !== true
      ) {
        throw new UlcTrainingBlockReferenceError("exercise", exerciseId);
      }
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

function audienceFromGroup(group: TrainingGroup): UlcTrainingBlockAudience {
  return Object.freeze({
    id: group.id,
    name: group.name,
    shortName: group.shortName,
  });
}

