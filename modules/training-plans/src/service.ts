import {
  TrainingPlanValidationError,
  normalizeTrainingPlanDate,
  normalizeTrainingPlanDraft,
  normalizeTrainingPlanIdentifier,
  type CreateTrainingPlanDraftInput,
  type TrainingPlanBlockInput,
  type TrainingPlanExerciseInput,
} from "./training-plan";
import {
  assertTrainingPlanRevisionInvariant,
  type TrainingPlanListQuery,
  type TrainingPlanRepository,
  type TrainingPlanRevision,
  type TrainingPlanRevisionItem,
  type TrainingPlanSnapshot,
} from "./repository";

export interface UpdateTrainingPlanExerciseInput
  extends Omit<TrainingPlanExerciseInput, "kind"> {
  readonly kind: "exercise";
  readonly itemId?: string | null;
}

export interface UpdateTrainingPlanBlockExerciseInput
  extends Omit<TrainingPlanExerciseInput, "kind"> {
  readonly itemId?: string | null;
}

export interface UpdateTrainingPlanBlockInput
  extends Omit<TrainingPlanBlockInput, "exercises"> {
  readonly itemId?: string | null;
  readonly exercises?: readonly UpdateTrainingPlanBlockExerciseInput[];
}

export type UpdateTrainingPlanItemInput =
  | UpdateTrainingPlanExerciseInput
  | UpdateTrainingPlanBlockInput;

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

export class TrainingPlanTargetExistsError extends Error {
  readonly subjectId: string;
  readonly planDate: string;
  readonly existingPlanId: string;
  readonly currentRevision: number;

  constructor(plan: TrainingPlanSnapshot) {
    super(
      `Training plan target already exists for ${plan.subjectId} on ${plan.planDate}.`,
    );
    this.name = "TrainingPlanTargetExistsError";
    this.subjectId = plan.subjectId;
    this.planDate = plan.planDate;
    this.existingPlanId = plan.id;
    this.currentRevision = plan.currentRevision;
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

  async list(
    organizationId: string,
    query: TrainingPlanListQuery = {},
  ): Promise<readonly TrainingPlanSnapshot[]> {
    const organization = normalizeTrainingPlanIdentifier(
      organizationId,
      "Organization id",
    );
    const normalizedQuery = normalizeListQuery(query);
    const plans = await this.#repository.listCurrent(
      organization,
      normalizedQuery,
    );
    return Object.freeze(
      plans.map((plan) => {
        const asserted = this.#assertPlan(plan, organization);
        if (
          (normalizedQuery.subjectId !== undefined &&
            asserted.subjectId !== normalizedQuery.subjectId) ||
          (normalizedQuery.fromDate !== undefined &&
            asserted.planDate < normalizedQuery.fromDate) ||
          (normalizedQuery.toDate !== undefined &&
            asserted.planDate > normalizedQuery.toDate)
        ) {
          throw new Error(
            "Training plan repository returned a plan outside the requested range.",
          );
        }
        return asserted;
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

  async findForSubjectDate(
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
    const plan = await this.#repository.findForSubjectDate(
      organization,
      subject,
      date,
    );
    if (plan === undefined) return undefined;
    const asserted = this.#assertPlan(plan, organization);
    if (asserted.subjectId !== subject || asserted.planDate !== date) {
      throw new Error(
        "Training plan repository returned an invalid subject/date target.",
      );
    }
    return asserted;
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
    const id = normalizeTrainingPlanIdentifier(
      this.#createId(),
      "Generated training plan id",
    );
    const createdAt = normalizedTimestamp(this.#now());
    const usedIds = new Set<string>([id]);
    const revision = Object.freeze({
      organizationId: organization,
      planId: id,
      revision: 1,
      note: draft.note,
      items: Object.freeze(
        draft.items.map((item) =>
          item.kind === "block"
            ? Object.freeze({
                ...item,
                itemId: this.#createUniqueItemId(usedIds),
                exercises: Object.freeze(
                  item.exercises.map((exercise) =>
                    Object.freeze({
                      ...exercise,
                      itemId: this.#createUniqueItemId(usedIds),
                    }),
                  ),
                ),
              })
            : Object.freeze({
                ...item,
                itemId: this.#createUniqueItemId(usedIds),
              }),
        ),
      ),
      createdAt,
    }) satisfies TrainingPlanRevision;
    const plan = Object.freeze({
      id,
      organizationId: organization,
      subjectId: draft.subjectId,
      planDate: draft.planDate,
      currentRevision: 1,
      createdAt,
      updatedAt: createdAt,
      revision,
    }) satisfies TrainingPlanSnapshot;

    const result = await this.#repository.create(plan);
    if (result.status === "target-exists") {
      const existing = this.#assertPlan(
        result.plan,
        organization,
      );
      if (
        existing.subjectId !== draft.subjectId ||
        existing.planDate !== draft.planDate
      ) {
        throw new Error(
          "Training plan repository reported an unrelated target conflict.",
        );
      }
      throw new TrainingPlanTargetExistsError(existing);
    }
    return this.#assertPlan(result.plan, organization, id);
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
      note: input.note,
      items: stripUpdateItemIds(rawItems),
    });

    const currentKinds = revisionItemKindMap(current.revision);
    const nextIds = new Set<string>();
    const nextItems: TrainingPlanRevisionItem[] = draft.items.map(
      (item, topIndex) => {
        const raw = rawItems[topIndex];
        if (
          raw === undefined ||
          raw === null ||
          typeof raw !== "object" ||
          Array.isArray(raw) ||
          raw.kind !== item.kind
        ) {
          throw new TrainingPlanValidationError(
            "Training plan update item is invalid.",
          );
        }

        if (item.kind === "exercise") {
          const exerciseRaw = raw as UpdateTrainingPlanExerciseInput;
          return Object.freeze({
            ...item,
            itemId: this.#resolveItemId(
              exerciseRaw.itemId,
              "exercise",
              currentKinds,
              nextIds,
            ),
          });
        }

        const blockRaw = raw as UpdateTrainingPlanBlockInput;
        const blockId = this.#resolveItemId(
          blockRaw.itemId,
          "block",
          currentKinds,
          nextIds,
        );
        const rawExercises = blockRaw.exercises ?? [];
        if (!Array.isArray(rawExercises)) {
          throw new TrainingPlanValidationError(
            "Training plan block exercises must be an array.",
          );
        }
        return Object.freeze({
          ...item,
          itemId: blockId,
          exercises: Object.freeze(
            item.exercises.map((exercise, exerciseIndex) => {
              const exerciseRaw = rawExercises[exerciseIndex];
              if (
                exerciseRaw === undefined ||
                exerciseRaw === null ||
                typeof exerciseRaw !== "object" ||
                Array.isArray(exerciseRaw)
              ) {
                throw new TrainingPlanValidationError(
                  "Training plan block exercise update is invalid.",
                );
              }
              return Object.freeze({
                ...exercise,
                itemId: this.#resolveItemId(
                  exerciseRaw.itemId,
                  "exercise",
                  currentKinds,
                  nextIds,
                ),
              });
            }),
          ),
        });
      },
    );

    const revision = Object.freeze({
      organizationId: organization,
      planId: id,
      revision: expected + 1,
      note: draft.note,
      items: Object.freeze(nextItems),
      createdAt: normalizedTimestamp(this.#now()),
    }) satisfies TrainingPlanRevision;

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
    const revisionNumber = requiredRevision(
      revision,
      "Training plan revision",
    );
    const stored = await this.#repository.findRevision(
      organization,
      id,
      revisionNumber,
    );
    return stored === undefined
      ? undefined
      : this.#assertRevision(
          stored,
          organization,
          id,
          revisionNumber,
        );
  }

  #resolveItemId(
    rawItemId: string | null | undefined,
    kind: "block" | "exercise",
    currentKinds: ReadonlyMap<string, "block" | "exercise">,
    nextIds: Set<string>,
  ): string {
    if (rawItemId === undefined || rawItemId === null) {
      return this.#createUniqueItemId(nextIds, currentKinds);
    }
    const itemId = normalizeTrainingPlanIdentifier(
      rawItemId,
      "Training plan item id",
    );
    const currentKind = currentKinds.get(itemId);
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
    if (nextIds.has(itemId)) {
      throw new TrainingPlanValidationError(
        "Training plan update contains a duplicate item id.",
      );
    }
    nextIds.add(itemId);
    return itemId;
  }

  #createUniqueItemId(
    used: Set<string>,
    disallowed: ReadonlyMap<string, unknown> = new Map(),
  ): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const itemId = normalizeTrainingPlanIdentifier(
        this.#createId(),
        "Generated training plan item id",
      );
      if (used.has(itemId) || disallowed.has(itemId)) continue;
      used.add(itemId);
      return itemId;
    }
    throw new Error(
      "Training plan id generator did not produce a unique item id.",
    );
  }

  #assertPlan(
    plan: TrainingPlanSnapshot,
    expectedOrganizationId: string,
    expectedPlanId?: string,
  ): TrainingPlanSnapshot {
    if (
      plan === null ||
      typeof plan !== "object" ||
      Array.isArray(plan) ||
      plan.organizationId !== expectedOrganizationId ||
      (expectedPlanId !== undefined && plan.id !== expectedPlanId) ||
      !Number.isSafeInteger(plan.currentRevision) ||
      plan.currentRevision < 1 ||
      plan.revision.revision !== plan.currentRevision
    ) {
      throw new Error(
        "Training plan repository returned an invalid current plan.",
      );
    }
    const id = normalizeTrainingPlanIdentifier(
      plan.id,
      "Persisted training plan id",
    );
    const subjectId = normalizeTrainingPlanIdentifier(
      plan.subjectId,
      "Persisted training plan subject",
    );
    const planDate = normalizeTrainingPlanDate(plan.planDate);
    const createdAt = normalizedPersistedTimestamp(
      plan.createdAt,
      "Training plan created timestamp",
    );
    const updatedAt = normalizedPersistedTimestamp(
      plan.updatedAt,
      "Training plan updated timestamp",
    );
    const revision = this.#assertRevision(
      plan.revision,
      expectedOrganizationId,
      id,
      plan.currentRevision,
    );
    return Object.freeze({
      id,
      organizationId: expectedOrganizationId,
      subjectId,
      planDate,
      currentRevision: plan.currentRevision,
      createdAt,
      updatedAt,
      revision,
    });
  }

  #assertRevision(
    revision: TrainingPlanRevision,
    expectedOrganizationId: string,
    expectedPlanId: string,
    expectedRevision?: number,
  ): TrainingPlanRevision {
    if (
      revision === null ||
      typeof revision !== "object" ||
      Array.isArray(revision) ||
      revision.organizationId !== expectedOrganizationId ||
      revision.planId !== expectedPlanId ||
      !Number.isSafeInteger(revision.revision) ||
      revision.revision < 1 ||
      (expectedRevision !== undefined &&
        revision.revision !== expectedRevision)
    ) {
      throw new Error(
        "Training plan repository returned an invalid revision scope.",
      );
    }
    assertTrainingPlanRevisionInvariant(revision);
    const normalized = normalizeTrainingPlanDraft({
      subjectId: "validation-subject",
      planDate: "2000-01-01",
      note: revision.note,
      items: revision.items.map((item) =>
        item.kind === "block"
          ? {
              kind: "block" as const,
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
            }
          : {
              kind: "exercise" as const,
              sourceExerciseId: item.sourceExerciseId,
              name: item.name,
              sets: item.sets,
              repetitions: item.repetitions,
              amount: item.amount,
              unit: item.unit,
              comment: item.comment,
            },
      ),
    });

    const itemIds = new Set<string>();
    const items = normalized.items.map((item, topIndex) => {
      const persisted = revision.items[topIndex];
      if (
        persisted === undefined ||
        persisted.kind !== item.kind ||
        persisted.sortOrder !== topIndex
      ) {
        throw new Error(
          "Training plan repository returned invalid top-level ordering.",
        );
      }
      const itemId = persistedItemId(persisted.itemId, itemIds);
      if (item.kind === "exercise") {
        return Object.freeze({ ...item, itemId });
      }
      if (persisted.kind !== "block") {
        throw new Error(
          "Training plan repository returned an invalid block item.",
        );
      }
      const exercises = item.exercises.map((exercise, exerciseIndex) => {
        const persistedExercise = persisted.exercises[exerciseIndex];
        if (
          persistedExercise === undefined ||
          persistedExercise.kind !== "exercise" ||
          persistedExercise.sortOrder !== exerciseIndex
        ) {
          throw new Error(
            "Training plan repository returned invalid block exercise ordering.",
          );
        }
        return Object.freeze({
          ...exercise,
          itemId: persistedItemId(
            persistedExercise.itemId,
            itemIds,
          ),
        });
      });
      return Object.freeze({
        ...item,
        itemId,
        exercises: Object.freeze(exercises),
      });
    });

    return Object.freeze({
      organizationId: expectedOrganizationId,
      planId: expectedPlanId,
      revision: revision.revision,
      note: normalized.note,
      items: Object.freeze(items),
      createdAt: normalizedPersistedTimestamp(
        revision.createdAt,
        "Training plan revision timestamp",
      ),
    });
  }
}

function stripUpdateItemIds(
  items: readonly UpdateTrainingPlanItemInput[],
): CreateTrainingPlanDraftInput["items"] {
  return items.map((item) =>
    item.kind === "block"
      ? {
          kind: "block" as const,
          sourceBlockId: item.sourceBlockId,
          sourceBlockRevision: item.sourceBlockRevision,
          name: item.name,
          durationMinutes: item.durationMinutes,
          note: item.note,
          exercises: item.exercises?.map((exercise) => ({
            sourceExerciseId: exercise.sourceExerciseId,
            name: exercise.name,
            sets: exercise.sets,
            repetitions: exercise.repetitions,
            amount: exercise.amount,
            unit: exercise.unit,
            comment: exercise.comment,
          })),
        }
      : {
          kind: "exercise" as const,
          sourceExerciseId: item.sourceExerciseId,
          name: item.name,
          sets: item.sets,
          repetitions: item.repetitions,
          amount: item.amount,
          unit: item.unit,
          comment: item.comment,
        },
  );
}

function revisionItemKindMap(
  revision: TrainingPlanRevision,
): ReadonlyMap<string, "block" | "exercise"> {
  const result = new Map<string, "block" | "exercise">();
  for (const item of revision.items) {
    result.set(item.itemId, item.kind);
    if (item.kind === "block") {
      for (const exercise of item.exercises) {
        result.set(exercise.itemId, "exercise");
      }
    }
  }
  return result;
}

function normalizeListQuery(query: TrainingPlanListQuery): TrainingPlanListQuery {
  if (query === null || typeof query !== "object" || Array.isArray(query)) {
    throw new TrainingPlanValidationError(
      "Training plan list query is invalid.",
    );
  }
  const subjectId =
    query.subjectId === undefined
      ? undefined
      : normalizeTrainingPlanIdentifier(
          query.subjectId,
          "Training plan subject",
        );
  const fromDate =
    query.fromDate === undefined
      ? undefined
      : normalizeTrainingPlanDate(query.fromDate);
  const toDate =
    query.toDate === undefined
      ? undefined
      : normalizeTrainingPlanDate(query.toDate);
  if (fromDate !== undefined && toDate !== undefined && fromDate > toDate) {
    throw new TrainingPlanValidationError(
      "Training plan date range is invalid.",
    );
  }
  return Object.freeze({
    ...(subjectId === undefined ? {} : { subjectId }),
    ...(fromDate === undefined ? {} : { fromDate }),
    ...(toDate === undefined ? {} : { toDate }),
  });
}

function requiredRevision(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new TrainingPlanValidationError(`${label} is invalid.`);
  }
  return value;
}

function persistedItemId(value: unknown, used: Set<string>): string {
  const itemId = normalizeTrainingPlanIdentifier(
    value,
    "Persisted training plan item id",
  );
  if (used.has(itemId)) {
    throw new Error(
      "Training plan repository returned a duplicate item id.",
    );
  }
  used.add(itemId);
  return itemId;
}

function normalizedTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new TrainingPlanValidationError(
      "Training plan timestamp is invalid.",
    );
  }
  return value.toISOString();
}

function normalizedPersistedTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} is invalid.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed.toISOString();
}
