import {
  TrainingPlanValidationError,
  normalizeTrainingPlanDate,
  normalizeTrainingPlanDraft,
  normalizeTrainingPlanIdentifier,
  type CreateTrainingPlanDraftInput,
  type TrainingPlanBlockInput,
  type TrainingPlanExerciseInput,
  type TrainingPlanDraft,
  type TrainingPlanItemDraft,
} from "./training-plan";
import type {
  TrainingPlanBlockRevision,
  TrainingPlanExerciseRevision,
  TrainingPlanItemRevision,
  TrainingPlanRepository,
  TrainingPlanRevision,
  TrainingPlanSnapshot,
} from "./repository";

export interface UpdateTrainingPlanExerciseInput
  extends TrainingPlanExerciseInput {
  readonly itemId?: string | null;
}

export interface UpdateTrainingPlanBlockInput
  extends Omit<TrainingPlanBlockInput, "exercises"> {
  readonly itemId?: string | null;
  readonly exercises?: readonly Omit<
    UpdateTrainingPlanExerciseInput,
    "kind"
  >[];
}

export type UpdateTrainingPlanItemInput =
  | UpdateTrainingPlanBlockInput
  | UpdateTrainingPlanExerciseInput;

export interface UpdateTrainingPlanDraftInput {
  readonly note?: string | null;
  readonly items?: readonly UpdateTrainingPlanItemInput[];
}

export interface TrainingPlanServiceOptions {
  readonly repository: TrainingPlanRepository;
  readonly createId?: () => string;
  readonly now?: () => Date;
}

export class TrainingPlanConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super(
      `Training plan revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
    );
    this.name = "TrainingPlanConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export class TrainingPlanTargetOccupiedError extends Error {
  readonly subjectId: string;
  readonly planDate: string;
  readonly existingPlanId: string;
  readonly currentRevision: number;

  constructor(
    subjectId: string,
    planDate: string,
    existingPlanId: string,
    currentRevision: number,
  ) {
    super(
      `Training plan target ${subjectId} / ${planDate} is already occupied.`,
    );
    this.name = "TrainingPlanTargetOccupiedError";
    this.subjectId = subjectId;
    this.planDate = planDate;
    this.existingPlanId = existingPlanId;
    this.currentRevision = currentRevision;
  }
}

export class TrainingPlanGeneratedIdConflictError extends Error {
  readonly generatedPlanId: string;

  constructor(generatedPlanId: string) {
    super(`Generated training plan id ${generatedPlanId} already exists.`);
    this.name = "TrainingPlanGeneratedIdConflictError";
    this.generatedPlanId = generatedPlanId;
  }
}

export class TrainingPlanSubjectDeletedError extends Error {
  readonly subjectId: string;

  constructor(subjectId: string) {
    super(`Training plan subject ${subjectId} is lifecycle-deleted.`);
    this.name = "TrainingPlanSubjectDeletedError";
    this.subjectId = subjectId;
  }
}

export class TrainingPlanService {
  readonly #repository: TrainingPlanRepository;
  readonly #createId: () => string;
  readonly #now: () => Date;

  constructor(options: TrainingPlanServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object"
    ) {
      throw new TrainingPlanValidationError(
        "Training plan service options are invalid.",
      );
    }
    this.#repository = options.repository;
    this.#createId = options.createId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => new Date());
  }

  async listForSubjectsDateRange(
    organizationId: string,
    subjectIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]> {
    if (!Array.isArray(subjectIds) || subjectIds.length > 500) {
      throw new TrainingPlanValidationError(
        "Training plan subjects must contain at most 500 entries.",
      );
    }
    const subjects = subjectIds.map((subjectId) =>
      normalizeTrainingPlanIdentifier(
        subjectId,
        "Training plan subject",
      ),
    );
    if (new Set(subjects).size !== subjects.length) {
      throw new TrainingPlanValidationError(
        "Training plan subjects contain a duplicate entry.",
      );
    }
    if (subjects.length === 0) return Object.freeze([]);

    const groupedPlans: Array<readonly TrainingPlanSnapshot[]> =
      new Array(subjects.length);
    let nextSubjectIndex = 0;
    const workerCount = Math.min(4, subjects.length);

    async function loadNext(this: TrainingPlanService): Promise<void> {
      while (true) {
        const index = nextSubjectIndex;
        nextSubjectIndex += 1;
        if (index >= subjects.length) return;
        const subjectId = subjects[index];
        if (subjectId === undefined) return;
        groupedPlans[index] = await this.listForSubjectDateRange(
          organizationId,
          subjectId,
          fromDate,
          toDate,
        );
      }
    }

    await Promise.all(
      Array.from({ length: workerCount }, () => loadNext.call(this)),
    );
    const plans = groupedPlans.flat();

    return Object.freeze(
      plans.slice().sort(
        (left, right) =>
          left.subjectId.localeCompare(right.subjectId) ||
          left.planDate.localeCompare(right.planDate) ||
          left.id.localeCompare(right.id),
      ),
    );
  }

  async listForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const subject = normalizeTrainingPlanIdentifier(
      subjectId,
      "Training plan subject",
    );
    const from = normalizeTrainingPlanDate(fromDate);
    const to = normalizeTrainingPlanDate(toDate);
    if (from > to) {
      throw new TrainingPlanValidationError(
        "Training plan date range is invalid.",
      );
    }

    const plans = await this.#repository.listCurrentBySubjectDateRange(
      organization,
      subject,
      from,
      to,
    );
    return Object.freeze(
      plans.map((plan) => {
        const validated = this.#assertPlan(plan, organization);
        if (
          validated.subjectId !== subject ||
          validated.planDate < from ||
          validated.planDate > to
        ) {
          throw new Error("Training plan repository escaped the requested date range.");
        }
        return validated;
      }),
    );
  }

  async findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingPlanIdentifier(planId, "Training plan id");
    const plan = await this.#repository.findCurrent(organization, id);
    return plan === undefined
      ? undefined
      : this.#assertPlan(plan, organization, id);
  }

  async findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const subject = normalizeTrainingPlanIdentifier(
      subjectId,
      "Training plan subject",
    );
    const date = normalizeTrainingPlanDate(planDate);
    const plan = await this.#repository.findCurrentBySubjectDate(
      organization,
      subject,
      date,
    );
    if (plan === undefined) return undefined;
    const validated = this.#assertPlan(plan, organization);
    if (validated.subjectId !== subject || validated.planDate !== date) {
      throw new Error("Training plan repository escaped the requested target.");
    }
    return validated;
  }

  async create(
    organizationId: string,
    input: CreateTrainingPlanDraftInput,
  ): Promise<TrainingPlanSnapshot> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const draft = normalizeTrainingPlanDraft(input);
    return this.#createFromDraft(organization, draft);
  }

  async update(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    input: UpdateTrainingPlanDraftInput,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingPlanIdentifier(planId, "Training plan id");
    const expected = requiredRevision(
      expectedRevision,
      "Expected training plan revision",
    );
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TrainingPlanValidationError(
        "Training plan update input is invalid.",
      );
    }

    const currentStored = await this.#repository.findCurrent(organization, id);
    if (currentStored === undefined) return undefined;
    const current = this.#assertPlan(currentStored, organization, id);
    if (current.currentRevision !== expected) {
      throw new TrainingPlanConflictError(expected, current.currentRevision);
    }

    const rawItems = input.items ?? [];
    if (!Array.isArray(rawItems)) {
      throw new TrainingPlanValidationError(
        "Training plan items must be an array.",
      );
    }
    const draft = normalizeTrainingPlanDraft({
      subjectId: current.subjectId,
      planDate: current.planDate,
      ...(input.note === undefined ? {} : { note: input.note }),
      items: rawItems,
    });
    const currentKinds = currentItemKinds(current.revision.items);
    const reservedIds = new Set<string>([
      current.id,
      ...currentKinds.keys(),
    ]);
    const historicalRevisions = await this.#repository.listRevisions(
      organization,
      id,
    );
    for (const historical of historicalRevisions) {
      const validated = this.#assertRevision(historical, organization, id);
      for (const historicalItemId of itemIds(validated.items)) {
        reservedIds.add(historicalItemId);
      }
    }
    const nextIds = new Set<string>();
    const items = draft.items.map((item, index) =>
      this.#materializeUpdateItem(
        item,
        rawItems[index],
        currentKinds,
        reservedIds,
        nextIds,
      ),
    );

    const revision: TrainingPlanRevision = Object.freeze({
      organizationId: organization,
      planId: id,
      revision: expected + 1,
      note: draft.note,
      items: Object.freeze(items),
      createdAt: normalizedTimestamp(this.#now()),
    });

    const result = await this.#repository.appendRevision(
      organization,
      id,
      expected,
      revision,
    );
    if (result.status === "not-found") return undefined;
    if (result.status === "conflict") {
      throw new TrainingPlanConflictError(expected, result.currentRevision);
    }
    return this.#assertPlan(result.plan, organization, id);
  }

  async copyCurrentTo(
    organizationId: string,
    sourcePlanId: string,
    targetSubjectId: string,
    targetDate: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const source = await this.findCurrent(organization, sourcePlanId);
    if (source === undefined) return undefined;

    const sourceRevisions = await this.#repository.listRevisions(
      organization,
      source.id,
    );
    const reservedSourceIds = new Set<string>([source.id]);
    for (const revision of sourceRevisions) {
      const validated = this.#assertRevision(
        revision,
        organization,
        source.id,
      );
      for (const sourceItemId of itemIds(validated.items)) {
        reservedSourceIds.add(sourceItemId);
      }
    }
    for (const sourceItemId of itemIds(source.revision.items)) {
      reservedSourceIds.add(sourceItemId);
    }

    const draft = normalizeTrainingPlanDraft({
      subjectId: normalizeTrainingPlanIdentifier(
        targetSubjectId,
        "Training plan subject",
      ),
      planDate: normalizeTrainingPlanDate(targetDate),
      note: source.revision.note,
      items: source.revision.items.map(copyItemInput),
    });
    return this.#createFromDraft(
      organization,
      draft,
      reservedSourceIds,
    );
  }

  async listRevisions(
    organizationId: string,
    planId: string,
  ): Promise<readonly TrainingPlanRevision[]> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingPlanIdentifier(planId, "Training plan id");
    const revisions = await this.#repository.listRevisions(organization, id);
    return Object.freeze(
      revisions.map((revision) =>
        this.#assertRevision(revision, organization, id),
      ),
    );
  }

  async findRevision(
    organizationId: string,
    planId: string,
    revision: number,
  ): Promise<TrainingPlanRevision | undefined> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingPlanIdentifier(planId, "Training plan id");
    const targetRevision = requiredRevision(
      revision,
      "Training plan revision",
    );
    const stored = await this.#repository.findRevision(
      organization,
      id,
      targetRevision,
    );
    return stored === undefined
      ? undefined
      : this.#assertRevision(stored, organization, id, targetRevision);
  }

  async #createFromDraft(
    organization: string,
    draft: TrainingPlanDraft,
    reservedItemIds: ReadonlySet<string> = new Set<string>(),
  ): Promise<TrainingPlanSnapshot> {
    const planId = normalizeTrainingPlanIdentifier(
      this.#createId(),
      "Generated training plan id",
    );
    const usedIds = new Set<string>([planId]);
    const createdAt = normalizedTimestamp(this.#now());
    const revision = Object.freeze({
      organizationId: organization,
      planId,
      revision: 1,
      note: draft.note,
      items: this.#materializeCreateItems(
        draft.items,
        usedIds,
        reservedItemIds,
      ),
      createdAt,
    });
    const plan = Object.freeze({
      id: planId,
      organizationId: organization,
      subjectId: draft.subjectId,
      planDate: draft.planDate,
      currentRevision: 1,
      createdAt,
      updatedAt: createdAt,
      revision,
    });

    const result = await this.#repository.create(plan);
    if (result.status === "target-occupied") {
      throw new TrainingPlanTargetOccupiedError(
        draft.subjectId,
        draft.planDate,
        normalizeTrainingPlanIdentifier(
          result.planId,
          "Existing training plan id",
        ),
        requiredRevision(
          result.currentRevision,
          "Existing training plan revision",
        ),
      );
    }
    if (result.status === "id-conflict") {
      throw new TrainingPlanGeneratedIdConflictError(planId);
    }
    if (result.status === "subject-deleted") {
      throw new TrainingPlanSubjectDeletedError(draft.subjectId);
    }
    return this.#assertPlan(result.plan, organization, planId);
  }

  #materializeCreateItems(
    items: readonly TrainingPlanItemDraft[],
    usedIds: Set<string>,
    reservedIds: ReadonlySet<string> = new Set<string>(),
  ): readonly TrainingPlanItemRevision[] {
    return Object.freeze(
      items.map((item) => {
        if (item.kind === "exercise") {
          return Object.freeze({
            ...item,
            itemId: this.#createUniqueItemId(usedIds, reservedIds),
          });
        }

        const itemId = this.#createUniqueItemId(usedIds, reservedIds);
        return Object.freeze({
          ...item,
          itemId,
          exercises: Object.freeze(
            item.exercises.map((exercise) =>
              Object.freeze({
                ...exercise,
                itemId: this.#createUniqueItemId(usedIds, reservedIds),
              }),
            ),
          ),
        });
      }),
    );
  }

  #materializeUpdateItem(
    item: TrainingPlanItemDraft,
    raw: UpdateTrainingPlanItemInput | undefined,
    currentKinds: ReadonlyMap<string, "block" | "exercise">,
    reservedIds: ReadonlySet<string>,
    nextIds: Set<string>,
  ): TrainingPlanItemRevision {
    if (
      raw === undefined ||
      raw === null ||
      typeof raw !== "object" ||
      Array.isArray(raw) ||
      raw.kind !== item.kind
    ) {
      throw new TrainingPlanValidationError(
        "Training plan item update is invalid.",
      );
    }

    const itemId = this.#resolvedUpdateItemId(
      raw.itemId,
      item.kind,
      currentKinds,
      reservedIds,
      nextIds,
    );
    if (item.kind === "exercise") {
      return Object.freeze({ ...item, itemId });
    }

    const rawBlock = raw as UpdateTrainingPlanBlockInput;
    const rawExercises = rawBlock.exercises ?? [];
    if (!Array.isArray(rawExercises)) {
      throw new TrainingPlanValidationError(
        "Training plan block exercises must be an array.",
      );
    }
    return Object.freeze({
      ...item,
      itemId,
      exercises: Object.freeze(
        item.exercises.map((exercise, index) => {
          const rawExercise = rawExercises[index];
          if (
            rawExercise === undefined ||
            rawExercise === null ||
            typeof rawExercise !== "object" ||
            Array.isArray(rawExercise)
          ) {
            throw new TrainingPlanValidationError(
              "Training plan exercise update is invalid.",
            );
          }
          return Object.freeze({
            ...exercise,
            itemId: this.#resolvedUpdateItemId(
              rawExercise.itemId,
              "exercise",
              currentKinds,
              reservedIds,
              nextIds,
            ),
          });
        }),
      ),
    });
  }

  #resolvedUpdateItemId(
    value: string | null | undefined,
    kind: "block" | "exercise",
    currentKinds: ReadonlyMap<string, "block" | "exercise">,
    reservedIds: ReadonlySet<string>,
    nextIds: Set<string>,
  ): string {
    if (value === undefined || value === null) {
      return this.#createUniqueItemId(nextIds, reservedIds);
    }
    const id = normalizeTrainingPlanIdentifier(
      value,
      "Training plan item id",
    );
    const currentKind = currentKinds.get(id);
    if (currentKind === undefined) {
      throw new TrainingPlanValidationError(
        "Training plan item id does not belong to the current revision.",
      );
    }
    if (currentKind !== kind) {
      throw new TrainingPlanValidationError(
        "Training plan item kind cannot change across revisions.",
      );
    }
    if (nextIds.has(id)) {
      throw new TrainingPlanValidationError(
        "Training plan update contains a duplicate item id.",
      );
    }
    nextIds.add(id);
    return id;
  }

  #createUniqueItemId(
    usedIds: Set<string>,
    reservedIds: ReadonlySet<string> = new Set<string>(),
  ): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const id = normalizeTrainingPlanIdentifier(
        this.#createId(),
        "Generated training plan item id",
      );
      if (usedIds.has(id) || reservedIds.has(id)) continue;
      usedIds.add(id);
      return id;
    }
    throw new Error("Unable to generate a unique training plan item id.");
  }

  #assertPlan(
    plan: TrainingPlanSnapshot,
    organizationId: string,
    planId?: string,
  ): TrainingPlanSnapshot {
    if (plan === null || typeof plan !== "object" || Array.isArray(plan)) {
      throw new Error("Training plan repository returned an invalid plan.");
    }
    const id = normalizeTrainingPlanIdentifier(plan.id, "Training plan id");
    if (planId !== undefined && id !== planId) {
      throw new Error("Training plan repository escaped the requested plan.");
    }
    const organization = normalizeTrainingPlanIdentifier(
      plan.organizationId,
      "Organization id",
    );
    if (organization !== organizationId) {
      throw new Error("Training plan repository escaped organization scope.");
    }
    const subject = normalizeTrainingPlanIdentifier(
      plan.subjectId,
      "Training plan subject",
    );
    const date = normalizeTrainingPlanDate(plan.planDate);
    const currentRevision = requiredRevision(
      plan.currentRevision,
      "Training plan current revision",
    );
    const revision = this.#assertRevision(
      plan.revision,
      organization,
      id,
      currentRevision,
      subject,
      date,
    );
    const createdAt = normalizedStoredTimestamp(plan.createdAt);
    const updatedAt = normalizedStoredTimestamp(plan.updatedAt);
    return Object.freeze({
      id,
      organizationId: organization,
      subjectId: subject,
      planDate: date,
      currentRevision,
      createdAt,
      updatedAt,
      revision,
    });
  }

  #assertRevision(
    revision: TrainingPlanRevision,
    organizationId: string,
    planId: string,
    expectedRevision?: number,
    subjectId = "validation-subject",
    planDate = "2000-01-01",
  ): TrainingPlanRevision {
    if (
      revision === null ||
      typeof revision !== "object" ||
      Array.isArray(revision)
    ) {
      throw new Error("Training plan repository returned an invalid revision.");
    }
    if (revision.organizationId !== organizationId || revision.planId !== planId) {
      throw new Error("Training plan revision escaped its plan scope.");
    }
    const number = requiredRevision(
      revision.revision,
      "Training plan revision",
    );
    if (expectedRevision !== undefined && number !== expectedRevision) {
      throw new Error("Training plan current revision is inconsistent.");
    }
    if (!Array.isArray(revision.items)) {
      throw new Error("Training plan revision items have an invalid shape.");
    }

    const input = {
      subjectId,
      planDate,
      note: revision.note,
      items: revision.items.map(copyItemInput),
    };
    const normalized = normalizeTrainingPlanDraft(input);
    if (
      JSON.stringify(normalized.items) !==
      JSON.stringify(revision.items.map(repositoryDomainShape))
    ) {
      throw new Error("Training plan revision escaped the domain contract.");
    }
    if (normalized.note !== revision.note) {
      throw new Error("Training plan revision note escaped the domain contract.");
    }

    const itemIds = new Set<string>();
    for (const item of revision.items) {
      const id = normalizeTrainingPlanIdentifier(
        item.itemId,
        "Training plan item id",
      );
      if (itemIds.has(id)) {
        throw new Error("Training plan revision contains a duplicate item id.");
      }
      itemIds.add(id);
      if (item.kind === "block") {
        for (const exercise of item.exercises) {
          const exerciseId = normalizeTrainingPlanIdentifier(
            exercise.itemId,
            "Training plan item id",
          );
          if (itemIds.has(exerciseId)) {
            throw new Error(
              "Training plan revision contains a duplicate item id.",
            );
          }
          itemIds.add(exerciseId);
        }
      }
    }

    return Object.freeze({
      organizationId,
      planId,
      revision: number,
      note: normalized.note,
      items: cloneItems(revision.items),
      createdAt: normalizedStoredTimestamp(revision.createdAt),
    });
  }
}

function itemIds(
  items: readonly TrainingPlanItemRevision[],
): readonly string[] {
  return items.flatMap((item) =>
    item.kind === "exercise"
      ? [item.itemId]
      : [item.itemId, ...item.exercises.map((exercise) => exercise.itemId)],
  );
}

function currentItemKinds(
  items: readonly TrainingPlanItemRevision[],
): ReadonlyMap<string, "block" | "exercise"> {
  const result = new Map<string, "block" | "exercise">();
  for (const item of items) {
    result.set(item.itemId, item.kind);
    if (item.kind === "block") {
      for (const exercise of item.exercises) {
        result.set(exercise.itemId, "exercise");
      }
    }
  }
  return result;
}

function copyItemInput(
  item: TrainingPlanItemRevision,
): TrainingPlanBlockInput | TrainingPlanExerciseInput {
  if (item.kind === "exercise") {
    return {
      kind: "exercise",
      sourceExerciseId: item.sourceExerciseId,
      name: item.name,
      sets: item.sets,
      repetitions: item.repetitions,
      amount: item.amount,
      unit: item.unit,
      comment: item.comment,
    };
  }
  return {
    kind: "block",
    sourceBlockId: item.sourceBlockId,
    sourceBlockRevision: item.sourceBlockRevision,
    name: item.name,
    durationMinutes: item.durationMinutes,
    note: item.note,
    exercises: item.exercises.map((exercise) => ({
      sourceExerciseId: exercise.sourceExerciseId,
      name: exercise.name,
      sets: exercise.sets,
      repetitions: exercise.repetitions,
      amount: exercise.amount,
      unit: exercise.unit,
      comment: exercise.comment,
    })),
  };
}

function repositoryDomainShape(
  item: TrainingPlanItemRevision,
): TrainingPlanItemDraft {
  if (item.kind === "exercise") {
    return {
      kind: "exercise",
      sourceExerciseId: item.sourceExerciseId,
      name: item.name,
      sets: item.sets,
      repetitions: item.repetitions,
      amount: item.amount,
      unit: item.unit,
      comment: item.comment,
      sortOrder: item.sortOrder,
    };
  }
  return {
    kind: "block",
    sourceBlockId: item.sourceBlockId,
    sourceBlockRevision: item.sourceBlockRevision,
    name: item.name,
    durationMinutes: item.durationMinutes,
    note: item.note,
    exercises: item.exercises.map((exercise) => ({
      kind: "exercise",
      sourceExerciseId: exercise.sourceExerciseId,
      name: exercise.name,
      sets: exercise.sets,
      repetitions: exercise.repetitions,
      amount: exercise.amount,
      unit: exercise.unit,
      comment: exercise.comment,
      sortOrder: exercise.sortOrder,
    })),
    sortOrder: item.sortOrder,
  };
}

function cloneItems(
  items: readonly TrainingPlanItemRevision[],
): readonly TrainingPlanItemRevision[] {
  return Object.freeze(
    items.map((item) =>
      item.kind === "exercise"
        ? Object.freeze({ ...item })
        : Object.freeze({
            ...item,
            exercises: Object.freeze(
              item.exercises.map((exercise) =>
                Object.freeze({ ...exercise }),
              ),
            ),
          }),
    ),
  );
}

function requiredRevision(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2_147_483_647
  ) {
    throw new TrainingPlanValidationError(
      `${label} must be a positive whole number.`,
    );
  }
  return value;
}

function normalizedTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new TrainingPlanValidationError(
      "Training plan clock returned an invalid timestamp.",
    );
  }
  return value.toISOString();
}

function normalizedStoredTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Training plan timestamp has an invalid shape.");
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Training plan timestamp has an invalid shape.");
  }
  return parsed.toISOString();
}
