import type {
  Athlete,
  AthleteMasterdataSnapshot,
} from "@appbasis/athletes";
import type {
  ExerciseCatalogItem,
  ExerciseCatalogRepository,
} from "@appbasis/exercise-catalog";
import type {
  CreateTrainingBlockDraftInput,
  TrainingBlockSnapshot,
} from "@appbasis/training-blocks";
import {
  normalizeTrainingPlanDraft,
  TrainingPlanConflictError,
  TrainingPlanValidationError,
  type CreateTrainingPlanDraftInput,
  type TrainingPlanBlockDraft,
  type TrainingPlanBlockInput,
  type TrainingPlanDraft,
  type TrainingPlanExerciseRevision,
  type TrainingPlanItemDraft,
  type TrainingPlanRevision,
  type TrainingPlanService,
  type TrainingPlanSnapshot,
  type UpdateTrainingPlanDraftInput,
  type UpdateTrainingPlanItemInput,
} from "@appbasis/training-plans";
import type { UlcTrainingAttendanceSummary } from "./training-session-postgres";

export interface UlcTrainingPlanSubject {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly displayName: string;
}

export interface UlcTrainingPlanMasterdataReader {
  readOrganizationSnapshot(
    organizationId: string,
  ): PromiseLike<
    Pick<AthleteMasterdataSnapshot, "athletes" | "trainingGroups">
  >;
}

export interface UlcTrainingPlanExerciseReader {
  listItems: Pick<ExerciseCatalogRepository, "listItems">["listItems"];
}

export interface UlcTrainingPlanAttendanceReader {
  listAttendanceForAthleteDateRange(
    organizationId: string,
    athleteId: string,
    fromDate: string,
    toDate: string,
  ): PromiseLike<readonly UlcTrainingAttendanceSummary[]>;
}

export interface UlcTrainingPlanBlockReader {
  list(
    organizationId: string,
  ): PromiseLike<readonly TrainingBlockSnapshot[]>;
  findCurrent(
    organizationId: string,
    blockId: string,
  ): PromiseLike<TrainingBlockSnapshot | undefined>;
  listAudiences(
    organizationId: string,
  ): PromiseLike<
    readonly Readonly<{
      id: string;
      name: string;
      shortName: string | null;
    }>[]
  >;
  create(
    organizationId: string,
    input: CreateTrainingBlockDraftInput,
  ): PromiseLike<TrainingBlockSnapshot>;
}

export interface UlcTrainingPlanBlockTemplateSummary {
  readonly id: string;
  readonly currentRevision: number;
  readonly name: string;
  readonly audienceName: string;
  readonly durationMinutes: number | null;
  readonly exerciseCount: number;
}

export interface UlcTrainingPlanBlockTemplate {
  readonly id: string;
  readonly currentRevision: number;
  readonly item: TrainingPlanBlockInput;
}

export interface UlcTrainingPlanBlockTemplateAudience {
  readonly id: string;
  readonly name: string;
  readonly shortName: string | null;
}

export interface SaveTrainingPlanBlockTemplateInput {
  readonly planId: string;
  readonly blockItemId: string;
  readonly expectedRevision: number;
  readonly audienceId: string;
  readonly name?: string;
}

export interface UlcTrainingPlanSavedBlockTemplate {
  readonly id: string;
  readonly currentRevision: number;
  readonly name: string;
  readonly audienceId: string;
  readonly audienceName: string;
  readonly durationMinutes: number | null;
  readonly exerciseCount: number;
}

export type UlcTrainingPlanTemplateSaveErrorReason =
  | "plan-block-not-found"
  | "manual-exercise"
  | "exercise-unavailable"
  | "audience-unavailable"
  | "parameter-unavailable"
  | "parameter-ambiguous"
  | "required-parameter-missing";

export class UlcTrainingPlanTemplateSaveError extends Error {
  readonly code = "ULC_TRAINING_PLAN_TEMPLATE_SAVE_INVALID";
  readonly reason: UlcTrainingPlanTemplateSaveErrorReason;
  readonly referenceId: string | null;

  constructor(
    reason: UlcTrainingPlanTemplateSaveErrorReason,
    referenceId: string | null = null,
  ) {
    super("Training plan block cannot be saved as a reusable template.");
    this.name = "UlcTrainingPlanTemplateSaveError";
    this.reason = reason;
    this.referenceId = referenceId;
  }
}

export class UlcTrainingPlanReferenceError extends Error {
  readonly code = "ULC_TRAINING_PLAN_REFERENCE_INVALID";
  readonly referenceType: "subject" | "exercise" | "block";
  readonly referenceId: string | null;

  constructor(
    referenceType: "subject" | "exercise" | "block",
    referenceId: string | null,
  ) {
    super(
      referenceType === "subject"
        ? "Training plan requires one active ULC athlete."
        : referenceType === "exercise"
          ? "Training plan references an unavailable exercise."
          : "Training plan references an unavailable block template.",
    );
    this.name = "UlcTrainingPlanReferenceError";
    this.referenceType = referenceType;
    this.referenceId = referenceId;
  }
}

export interface UlcTrainingPlanService {
  listSubjects(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanSubject[]>;
  listForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]>;
  listAttendanceForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly UlcTrainingAttendanceSummary[]>;
  listBlockTemplates(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanBlockTemplateSummary[]>;
  findBlockTemplate(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<UlcTrainingPlanBlockTemplate | undefined>;
  listBlockTemplateAudiences(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanBlockTemplateAudience[]>;
  saveBlockAsTemplate(
    organizationId: string,
    input: SaveTrainingPlanBlockTemplateInput,
  ): Promise<UlcTrainingPlanSavedBlockTemplate | undefined>;
  findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  create(
    organizationId: string,
    input: CreateTrainingPlanDraftInput,
  ): Promise<TrainingPlanSnapshot>;
  update(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    input: UpdateTrainingPlanDraftInput,
  ): Promise<TrainingPlanSnapshot | undefined>;
  copyCurrentTo(
    organizationId: string,
    sourcePlanId: string,
    targetSubjectId: string,
    targetDate: string,
  ): Promise<TrainingPlanSnapshot | undefined>;
  listRevisions(
    organizationId: string,
    planId: string,
  ): Promise<readonly TrainingPlanRevision[]>;
  findRevision(
    organizationId: string,
    planId: string,
    revision: number,
  ): Promise<TrainingPlanRevision | undefined>;
}

export function createUlcTrainingPlanService({
  plans,
  masterdata,
  exerciseCatalog,
  attendance,
  blocks,
}: {
  plans: TrainingPlanService;
  masterdata: UlcTrainingPlanMasterdataReader;
  exerciseCatalog: UlcTrainingPlanExerciseReader;
  attendance: UlcTrainingPlanAttendanceReader;
  blocks: UlcTrainingPlanBlockReader;
}): UlcTrainingPlanService {
  async function listSubjects(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanSubject[]> {
    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
    return Object.freeze(
      snapshot.athletes
        .filter(
          (athlete) =>
            athlete.organizationId === organizationId &&
            athlete.isActive === true,
        )
        .sort(compareAthletes)
        .map(subjectFromAthlete),
    );
  }

  async function assertActiveSubject(
    organizationId: string,
    subjectId: string,
  ): Promise<void> {
    const snapshot = await masterdata.readOrganizationSnapshot(organizationId);
    const subject = snapshot.athletes.find(
      (athlete) =>
        athlete.id === subjectId &&
        athlete.organizationId === organizationId &&
        athlete.isActive === true,
    );
    if (subject === undefined) {
      throw new UlcTrainingPlanReferenceError("subject", subjectId);
    }
  }

  async function assertExerciseReferences(
    organizationId: string,
    exerciseIds: ReadonlySet<string>,
  ): Promise<void> {
    if (exerciseIds.size === 0) return;

    const catalogItems = await exerciseCatalog.listItems(organizationId);
    const byId = new Map(
      catalogItems.map((item) => [item.id, item] as const),
    );
    for (const exerciseId of exerciseIds) {
      const exercise = byId.get(exerciseId);
      if (
        exercise === undefined ||
        exercise.organizationId !== organizationId ||
        exercise.isActive !== true
      ) {
        throw new UlcTrainingPlanReferenceError("exercise", exerciseId);
      }
    }
  }

  async function blockTemplateContext(
    organizationId: string,
  ): Promise<
    Readonly<{
      activeAudienceNames: ReadonlyMap<string, string>;
      catalogById: ReadonlyMap<string, ExerciseCatalogItem>;
    }>
  > {
    const [snapshot, catalogItems] = await Promise.all([
      masterdata.readOrganizationSnapshot(organizationId),
      exerciseCatalog.listItems(organizationId),
    ]);
    const activeAudienceNames = new Map(
      snapshot.trainingGroups
        .filter(
          (group) =>
            group.organizationId === organizationId &&
            group.isActive === true,
        )
        .map((group) => [group.id, group.name] as const),
    );
    const catalogById = new Map(
      catalogItems
        .filter(
          (item) =>
            item.organizationId === organizationId &&
            item.isActive === true,
        )
        .map((item) => [item.id, item] as const),
    );
    return Object.freeze({ activeAudienceNames, catalogById });
  }

  async function findBlockTemplate(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<UlcTrainingPlanBlockTemplate | undefined> {
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TrainingPlanValidationError(
        "Training block template revision is invalid.",
      );
    }
    const [block, context] = await Promise.all([
      blocks.findCurrent(organizationId, blockId),
      blockTemplateContext(organizationId),
    ]);
    if (
      block === undefined ||
      block.currentRevision !== revision
    ) {
      return undefined;
    }
    return materializeBlockTemplate(
      organizationId,
      block,
      context.activeAudienceNames,
      context.catalogById,
    )?.template;
  }

  async function assertNewBlockTemplateReferences(
    organizationId: string,
    current: TrainingPlanSnapshot | null,
    items: readonly TrainingPlanItemDraft[],
    rawItems: readonly UpdateTrainingPlanItemInput[] | null,
  ): Promise<void> {
    const currentBlocks = new Map(
      current === null
        ? []
        : current.revision.items
            .filter((item) => item.kind === "block")
            .map((item) => [
              item.itemId,
              {
                sourceBlockId: item.sourceBlockId,
                sourceBlockRevision: item.sourceBlockRevision,
              },
            ] as const),
    );

    for (const [index, item] of items.entries()) {
      if (item.kind !== "block") continue;
      const raw =
        rawItems === null ? null : rawItems[index];
      const rawItemId =
        isRecord(raw) && typeof raw.itemId === "string"
          ? raw.itemId
          : null;
      const existing =
        rawItemId === null ? undefined : currentBlocks.get(rawItemId);

      if (existing !== undefined) {
        if (
          existing.sourceBlockId !== item.sourceBlockId ||
          existing.sourceBlockRevision !== item.sourceBlockRevision
        ) {
          throw new UlcTrainingPlanReferenceError(
            "block",
            item.sourceBlockId,
          );
        }
        continue;
      }

      if (
        item.sourceBlockId === null &&
        item.sourceBlockRevision === null
      ) {
        continue;
      }
      if (
        item.sourceBlockId === null ||
        item.sourceBlockRevision === null
      ) {
        throw new UlcTrainingPlanReferenceError(
          "block",
          item.sourceBlockId,
        );
      }

      const template = await findBlockTemplate(
        organizationId,
        item.sourceBlockId,
        item.sourceBlockRevision,
      );
      if (
        template === undefined ||
        !blockDraftMatchesTemplate(item, template.item)
      ) {
        throw new UlcTrainingPlanReferenceError(
          "block",
          item.sourceBlockId,
        );
      }
    }
  }

  async function listBlockTemplateAudiences(
    organizationId: string,
  ): Promise<readonly UlcTrainingPlanBlockTemplateAudience[]> {
    const audiences = await blocks.listAudiences(organizationId);
    return Object.freeze(
      audiences
        .map((audience) =>
          Object.freeze({
            id: audience.id,
            name: audience.name,
            shortName: audience.shortName,
          }),
        )
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name, "de", {
              sensitivity: "base",
            }) || left.id.localeCompare(right.id),
        ),
    );
  }

  async function saveBlockAsTemplate(
    organizationId: string,
    input: SaveTrainingPlanBlockTemplateInput,
  ): Promise<UlcTrainingPlanSavedBlockTemplate | undefined> {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TrainingPlanValidationError(
        "Training plan template save input is invalid.",
      );
    }
    const expected = requiredRevision(input.expectedRevision);
    const current = await plans.findCurrent(organizationId, input.planId);
    if (current === undefined) return undefined;
    if (current.currentRevision !== expected) {
      throw new TrainingPlanConflictError(
        expected,
        current.currentRevision,
      );
    }

    const planBlock = current.revision.items.find(
      (item) =>
        item.kind === "block" &&
        item.itemId === input.blockItemId,
    );
    if (planBlock === undefined || planBlock.kind !== "block") {
      throw new UlcTrainingPlanTemplateSaveError(
        "plan-block-not-found",
        input.blockItemId,
      );
    }

    const [catalogItems, audiences] = await Promise.all([
      exerciseCatalog.listItems(organizationId),
      listBlockTemplateAudiences(organizationId),
    ]);
    const catalogById = new Map(
      catalogItems
        .filter(
          (item) =>
            item.organizationId === organizationId &&
            item.isActive === true,
        )
        .map((item) => [item.id, item] as const),
    );
    const audience = audiences.find(
      (candidate) => candidate.id === input.audienceId,
    );
    if (audience === undefined) {
      throw new UlcTrainingPlanTemplateSaveError(
        "audience-unavailable",
        input.audienceId,
      );
    }

    const exercises = planBlock.exercises.map((exercise) =>
      trainingBlockExerciseFromPlan(
        exercise,
        catalogById,
      ),
    );
    const created = await blocks.create(organizationId, {
      name: input.name ?? planBlock.name,
      audienceId: audience.id,
      durationMinutes: planBlock.durationMinutes,
      note: planBlock.note,
      exercises,
    });

    return Object.freeze({
      id: created.id,
      currentRevision: created.currentRevision,
      name: created.revision.name,
      audienceId: audience.id,
      audienceName: audience.name,
      durationMinutes: created.revision.durationMinutes,
      exerciseCount: created.revision.exercises.length,
    });
  }

  return Object.freeze({
    listSubjects,
    listForSubjectDateRange(
      organizationId: string,
      subjectId: string,
      fromDate: string,
      toDate: string,
    ) {
      return plans.listForSubjectDateRange(
        organizationId,
        subjectId,
        fromDate,
        toDate,
      );
    },
    async listAttendanceForSubjectDateRange(
      organizationId: string,
      subjectId: string,
      fromDate: string,
      toDate: string,
    ) {
      await assertActiveSubject(organizationId, subjectId);
      return attendance.listAttendanceForAthleteDateRange(
        organizationId,
        subjectId,
        fromDate,
        toDate,
      );
    },
    async listBlockTemplates(organizationId: string) {
      const [currentBlocks, context] = await Promise.all([
        blocks.list(organizationId),
        blockTemplateContext(organizationId),
      ]);
      return Object.freeze(
        currentBlocks
          .map((block) =>
            materializeBlockTemplate(
              organizationId,
              block,
              context.activeAudienceNames,
              context.catalogById,
            ),
          )
          .filter(
            (
              value,
            ): value is Readonly<{
              template: UlcTrainingPlanBlockTemplate;
              summary: UlcTrainingPlanBlockTemplateSummary;
            }> => value !== null,
          )
          .map((value) => value.summary)
          .sort(
            (left, right) =>
              left.name.localeCompare(right.name, "de", {
                sensitivity: "base",
              }) || left.id.localeCompare(right.id),
          ),
      );
    },
    findBlockTemplate,
    listBlockTemplateAudiences,
    saveBlockAsTemplate,
    findCurrent(organizationId: string, planId: string) {
      return plans.findCurrent(organizationId, planId);
    },
    findCurrentBySubjectDate(
      organizationId: string,
      subjectId: string,
      planDate: string,
    ) {
      return plans.findCurrentBySubjectDate(
        organizationId,
        subjectId,
        planDate,
      );
    },
    async create(
      organizationId: string,
      input: CreateTrainingPlanDraftInput,
    ) {
      const draft = normalizeTrainingPlanDraft(input);
      await assertActiveSubject(organizationId, draft.subjectId);
      await assertExerciseReferences(
        organizationId,
        sourceExerciseIds(draft.items),
      );
      await assertNewBlockTemplateReferences(
        organizationId,
        null,
        draft.items,
        null,
      );
      return plans.create(organizationId, input);
    },
    async update(
      organizationId: string,
      planId: string,
      expectedRevision: number,
      input: UpdateTrainingPlanDraftInput,
    ) {
      const expected = requiredRevision(expectedRevision);
      const current = await plans.findCurrent(organizationId, planId);
      if (current === undefined) return undefined;
      if (current.currentRevision !== expected) {
        throw new TrainingPlanConflictError(
          expected,
          current.currentRevision,
        );
      }
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        throw new TrainingPlanValidationError(
          "Training plan update input is invalid.",
        );
      }

      const rawItems = input.items ?? [];
      const draft = normalizeTrainingPlanDraft({
        subjectId: current.subjectId,
        planDate: current.planDate,
        ...(input.note === undefined ? {} : { note: input.note }),
        items: rawItems,
      });
      await assertExerciseReferences(
        organizationId,
        changedSourceExerciseIds(current, draft, rawItems),
      );
      await assertNewBlockTemplateReferences(
        organizationId,
        current,
        draft.items,
        rawItems,
      );
      return plans.update(
        organizationId,
        planId,
        expected,
        input,
      );
    },
    async copyCurrentTo(
      organizationId: string,
      sourcePlanId: string,
      targetSubjectId: string,
      targetDate: string,
    ) {
      const source = await plans.findCurrent(organizationId, sourcePlanId);
      if (source === undefined) return undefined;
      await assertActiveSubject(organizationId, targetSubjectId);
      return plans.copyCurrentTo(
        organizationId,
        sourcePlanId,
        targetSubjectId,
        targetDate,
      );
    },
    listRevisions(organizationId: string, planId: string) {
      return plans.listRevisions(organizationId, planId);
    },
    findRevision(
      organizationId: string,
      planId: string,
      revision: number,
    ) {
      return plans.findRevision(organizationId, planId, revision);
    },
  });
}

function trainingBlockExerciseFromPlan(
  exercise: TrainingPlanExerciseRevision,
  catalogById: ReadonlyMap<string, ExerciseCatalogItem>,
): NonNullable<CreateTrainingBlockDraftInput["exercises"]>[number] {
  if (exercise.sourceExerciseId === null) {
    throw new UlcTrainingPlanTemplateSaveError(
      "manual-exercise",
      exercise.itemId ?? null,
    );
  }
  const catalog = catalogById.get(exercise.sourceExerciseId);
  if (catalog === undefined) {
    throw new UlcTrainingPlanTemplateSaveError(
      "exercise-unavailable",
      exercise.sourceExerciseId,
    );
  }

  const byKey = new Map(
    catalog.parameters.map((parameter) => [parameter.key, parameter] as const),
  );
  const overrides: Array<{ key: string; value: string }> = [];

  addNamedPlanOverride(
    overrides,
    byKey,
    "sets",
    exercise.sets,
    catalog.id,
  );
  addNamedPlanOverride(
    overrides,
    byKey,
    "repetitions",
    exercise.repetitions,
    catalog.id,
  );

  if (exercise.amount === null) {
    if (exercise.unit !== null) {
      throw new UlcTrainingPlanTemplateSaveError(
        "parameter-unavailable",
        catalog.id,
      );
    }
  } else {
    const expectedUnit = exercise.unit ?? "";
    const candidates = catalog.parameters.filter(
      (parameter) =>
        parameter.key !== "sets" &&
        parameter.key !== "repetitions" &&
        parameter.inputType === "number" &&
        parameter.unit === expectedUnit,
    );
    if (candidates.length === 0) {
      throw new UlcTrainingPlanTemplateSaveError(
        "parameter-unavailable",
        catalog.id,
      );
    }
    if (candidates.length !== 1) {
      throw new UlcTrainingPlanTemplateSaveError(
        "parameter-ambiguous",
        catalog.id,
      );
    }
    const parameter = candidates[0];
    if (parameter === undefined) {
      throw new UlcTrainingPlanTemplateSaveError(
        "parameter-unavailable",
        catalog.id,
      );
    }
    overrides.push({
      key: parameter.key,
      value: exercise.amount,
    });
  }

  for (const parameter of catalog.parameters) {
    if (
      parameter.isRequired &&
      parameter.defaultValue === null &&
      !overrides.some((override) => override.key === parameter.key)
    ) {
      throw new UlcTrainingPlanTemplateSaveError(
        "required-parameter-missing",
        parameter.key,
      );
    }
  }

  return Object.freeze({
    exerciseId: catalog.id,
    note: exercise.comment,
    parameterOverrides: Object.freeze(
      overrides.map((override) => Object.freeze(override)),
    ),
  });
}

function addNamedPlanOverride(
  overrides: Array<{ key: string; value: string }>,
  byKey: ReadonlyMap<string, ExerciseCatalogItem["parameters"][number]>,
  key: "sets" | "repetitions",
  value: string | null,
  exerciseId: string,
): void {
  if (value === null) return;
  const parameter = byKey.get(key);
  if (parameter === undefined) {
    throw new UlcTrainingPlanTemplateSaveError(
      "parameter-unavailable",
      exerciseId,
    );
  }
  overrides.push({ key, value });
}

function isCompactTrainingPlanValue(value: string): boolean {
  return value.length <= 80;
}

function blockDraftMatchesTemplate(
  draft: TrainingPlanBlockDraft,
  template: TrainingPlanBlockInput,
): boolean {
  if (
    draft.sourceBlockId !== (template.sourceBlockId ?? null) ||
    draft.sourceBlockRevision !== (template.sourceBlockRevision ?? null) ||
    draft.name !== template.name ||
    draft.durationMinutes !== (template.durationMinutes ?? null) ||
    draft.note !== (template.note ?? null)
  ) {
    return false;
  }

  const exercises = template.exercises ?? [];
  if (draft.exercises.length !== exercises.length) return false;
  return draft.exercises.every((exercise, index) => {
    const expected = exercises[index];
    return expected !== undefined &&
      exercise.sourceExerciseId === (expected.sourceExerciseId ?? null) &&
      exercise.name === expected.name &&
      exercise.sets === (expected.sets ?? null) &&
      exercise.repetitions === (expected.repetitions ?? null) &&
      exercise.amount === (expected.amount ?? null) &&
      exercise.unit === (expected.unit ?? null) &&
      exercise.comment === (expected.comment ?? null);
  });
}

function materializeBlockTemplate(
  organizationId: string,
  block: TrainingBlockSnapshot,
  activeAudienceNames: ReadonlyMap<string, string>,
  catalogById: ReadonlyMap<string, ExerciseCatalogItem>,
): Readonly<{
  template: UlcTrainingPlanBlockTemplate;
  summary: UlcTrainingPlanBlockTemplateSummary;
}> | null {
  if (
    block.organizationId !== organizationId ||
    block.isActive !== true ||
    block.revision.organizationId !== organizationId ||
    block.revision.blockId !== block.id ||
    block.revision.revision !== block.currentRevision ||
    block.revision.audienceId === null
  ) {
    return null;
  }

  const audienceName = activeAudienceNames.get(block.revision.audienceId);
  if (audienceName === undefined) return null;

  const exercises: Array<
    NonNullable<TrainingPlanBlockInput["exercises"]>[number]
  > = [];
  for (const occurrence of block.revision.exercises) {
    const exercise = catalogById.get(occurrence.exerciseId);
    if (exercise === undefined) return null;

    const overrides = new Map(
      occurrence.parameterOverrides.map((value) => [
        value.key,
        value.value,
      ] as const),
    );
    const definitions = new Map(
      exercise.parameters.map((value) => [value.key, value] as const),
    );
    if (
      occurrence.parameterOverrides.some(
        (value) => !definitions.has(value.key),
      )
    ) {
      return null;
    }

    const effective = exercise.parameters
      .slice()
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.key.localeCompare(right.key),
      )
      .map((parameter) => ({
        parameter,
        value: overrides.get(parameter.key) ?? parameter.defaultValue,
      }))
      .filter(
        (
          value,
        ): value is Readonly<{
          parameter: ExerciseCatalogItem["parameters"][number];
          value: string;
        }> => value.value !== null,
      );

    if (
      exercise.parameters.some(
        (parameter) =>
          parameter.isRequired &&
          !effective.some(
            (value) => value.parameter.key === parameter.key,
          ),
      )
    ) {
      return null;
    }

    const setsParameter =
      effective.find((value) => value.parameter.key === "sets") ?? null;
    const repetitionsParameter =
      effective.find(
        (value) => value.parameter.key === "repetitions",
      ) ?? null;
    const sets =
      setsParameter !== null &&
      isCompactTrainingPlanValue(setsParameter.value)
        ? setsParameter.value
        : null;
    const repetitions =
      repetitionsParameter !== null &&
      isCompactTrainingPlanValue(repetitionsParameter.value)
        ? repetitionsParameter.value
        : null;
    const planningValues = effective.filter(
      (value) =>
        value.parameter.key !== "sets" &&
        value.parameter.key !== "repetitions",
    );
    const primary =
      planningValues.find(
        (value) =>
          value.parameter.inputType === "number" &&
          isCompactTrainingPlanValue(value.value),
      ) ?? null;
    const summarizedValues = [
      ...(sets === null && setsParameter !== null
        ? [setsParameter]
        : []),
      ...(repetitions === null && repetitionsParameter !== null
        ? [repetitionsParameter]
        : []),
      ...planningValues,
    ];
    const parameterSummary = summarizedValues
      .map(
        ({ parameter, value }) =>
          parameter.label +
          ": " +
          value +
          (parameter.unit.length === 0 ? "" : " " + parameter.unit),
      )
      .join(" · ");
    const comment = [
      occurrence.note,
      parameterSummary.length === 0
        ? null
        : "Planwerte: " + parameterSummary,
    ]
      .filter((value): value is string => value !== null)
      .join("\n");

    exercises.push({
      sourceExerciseId: exercise.id,
      name: exercise.name,
      sets,
      repetitions,
      amount: primary?.value ?? null,
      unit:
        primary === null || primary.parameter.unit.length === 0
          ? null
          : primary.parameter.unit,
      comment: comment.length === 0 ? null : comment,
    });
  }

  const candidate: TrainingPlanBlockInput = {
    kind: "block",
    sourceBlockId: block.id,
    sourceBlockRevision: block.currentRevision,
    name: block.revision.name,
    durationMinutes: block.revision.durationMinutes,
    note: block.revision.note,
    exercises,
  };

  let normalized: TrainingPlanBlockDraft;
  try {
    const draft = normalizeTrainingPlanDraft({
      subjectId: "template-validation-subject",
      planDate: "2000-01-03",
      items: [candidate],
    });
    const item = draft.items[0];
    if (item === undefined || item.kind !== "block") return null;
    normalized = item;
  } catch (error) {
    if (error instanceof TrainingPlanValidationError) return null;
    throw error;
  }

  const item: TrainingPlanBlockInput = Object.freeze({
    kind: "block",
    sourceBlockId: normalized.sourceBlockId,
    sourceBlockRevision: normalized.sourceBlockRevision,
    name: normalized.name,
    durationMinutes: normalized.durationMinutes,
    note: normalized.note,
    exercises: Object.freeze(
      normalized.exercises.map((exercise) =>
        Object.freeze({
          sourceExerciseId: exercise.sourceExerciseId,
          name: exercise.name,
          sets: exercise.sets,
          repetitions: exercise.repetitions,
          amount: exercise.amount,
          unit: exercise.unit,
          comment: exercise.comment,
        }),
      ),
    ),
  });

  return Object.freeze({
    template: Object.freeze({
      id: block.id,
      currentRevision: block.currentRevision,
      item,
    }),
    summary: Object.freeze({
      id: block.id,
      currentRevision: block.currentRevision,
      name: normalized.name,
      audienceName,
      durationMinutes: normalized.durationMinutes,
      exerciseCount: normalized.exercises.length,
    }),
  });
}

function requiredRevision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TrainingPlanValidationError(
      "Expected training plan revision is invalid.",
    );
  }
  return value;
}

function sourceExerciseIds(
  items: readonly TrainingPlanItemDraft[],
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const item of items) {
    if (item.kind === "exercise") {
      if (item.sourceExerciseId !== null) result.add(item.sourceExerciseId);
      continue;
    }
    for (const exercise of item.exercises) {
      if (exercise.sourceExerciseId !== null) {
        result.add(exercise.sourceExerciseId);
      }
    }
  }
  return result;
}

function changedSourceExerciseIds(
  current: TrainingPlanSnapshot,
  draft: TrainingPlanDraft,
  rawItems: readonly UpdateTrainingPlanItemInput[],
): ReadonlySet<string> {
  const currentById = currentExerciseSources(current.revision.items);
  const result = new Set<string>();

  draft.items.forEach((item, index) => {
    const raw = rawItems[index];
    if (!isRecord(raw) || raw.kind !== item.kind) return;

    if (item.kind === "exercise") {
      collectChangedSource(
        result,
        currentById,
        raw.itemId,
        item.sourceExerciseId,
      );
      return;
    }

    const rawExercises = Array.isArray(raw.exercises) ? raw.exercises : [];
    item.exercises.forEach((exercise, exerciseIndex) => {
      const rawExercise = rawExercises[exerciseIndex];
      if (!isRecord(rawExercise)) return;
      collectChangedSource(
        result,
        currentById,
        rawExercise.itemId,
        exercise.sourceExerciseId,
      );
    });
  });

  return result;
}

function currentExerciseSources(
  items: TrainingPlanSnapshot["revision"]["items"],
): ReadonlyMap<string, string | null> {
  const result = new Map<string, string | null>();
  for (const item of items) {
    if (item.kind === "exercise") {
      result.set(item.itemId, item.sourceExerciseId);
      continue;
    }
    for (const exercise of item.exercises) {
      result.set(exercise.itemId, exercise.sourceExerciseId);
    }
  }
  return result;
}

function collectChangedSource(
  result: Set<string>,
  currentById: ReadonlyMap<string, string | null>,
  rawItemId: unknown,
  nextSourceExerciseId: string | null,
): void {
  if (nextSourceExerciseId === null) return;

  if (typeof rawItemId !== "string") {
    result.add(nextSourceExerciseId);
    return;
  }

  const currentSource = currentById.get(rawItemId);
  if (currentSource === undefined) {
    return;
  }
  if (currentSource !== nextSourceExerciseId) {
    result.add(nextSourceExerciseId);
  }
}

function compareAthletes(left: Athlete, right: Athlete): number {
  return (
    left.lastName.localeCompare(right.lastName, "de") ||
    left.firstName.localeCompare(right.firstName, "de") ||
    left.id.localeCompare(right.id)
  );
}

function subjectFromAthlete(athlete: Athlete): UlcTrainingPlanSubject {
  return Object.freeze({
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    displayName: `${athlete.lastName}, ${athlete.firstName}`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
