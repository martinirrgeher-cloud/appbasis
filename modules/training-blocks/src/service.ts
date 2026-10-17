import {
  TrainingBlockValidationError,
  normalizeTrainingBlockDraft,
  normalizeTrainingBlockIdentifier,
  type CreateTrainingBlockDraftInput,
  type TrainingBlockExerciseInput,
} from "./training-block";
import type {
  TrainingBlockRepository,
  TrainingBlockRevision,
  TrainingBlockSnapshot,
  TrainingBlockUsageEvent,
  TrainingBlockUsageSummary,
} from "./repository";

export interface UpdateTrainingBlockExerciseInput extends TrainingBlockExerciseInput {
  readonly itemId?: string | null;
}

export interface UpdateTrainingBlockDraftInput
  extends Omit<CreateTrainingBlockDraftInput, "exercises"> {
  readonly exercises?: readonly UpdateTrainingBlockExerciseInput[];
}

export interface TrainingBlockServiceOptions {
  readonly repository: TrainingBlockRepository;
  readonly createId?: () => string;
  readonly now?: () => Date;
}

export class TrainingBlockConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super(
      `Training block revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
    );
    this.name = "TrainingBlockConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export class TrainingBlockInactiveError extends Error {
  readonly blockId: string;
  readonly currentRevision: number;

  constructor(blockId: string, currentRevision: number) {
    super(`Training block ${blockId} is inactive at revision ${currentRevision}.`);
    this.name = "TrainingBlockInactiveError";
    this.blockId = blockId;
    this.currentRevision = currentRevision;
  }
}

export interface TrainingBlockRevisionComparison {
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly hasChanges: boolean;
  readonly changedFields: readonly (
    | "name"
    | "audienceId"
    | "durationMinutes"
    | "note"
  )[];
  readonly addedItemIds: readonly string[];
  readonly removedItemIds: readonly string[];
  readonly changedItemIds: readonly string[];
  readonly reorderedItemIds: readonly string[];
}

export interface TrainingBlockOverviewItem {
  readonly block: TrainingBlockSnapshot;
  readonly isFavorite: boolean;
  readonly usageCount: number;
  readonly lastUsedAt: string | null;
}

export interface RecordTrainingBlockUsageInput {
  readonly occurredAt: string;
  readonly sourceKind: string;
  readonly sourceRef?: string | null;
  readonly note?: string | null;
}

export class TrainingBlockService {
  readonly #repository: TrainingBlockRepository;
  readonly #createId: () => string;
  readonly #now: () => Date;

  constructor(options: TrainingBlockServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object"
    ) {
      throw new TrainingBlockValidationError(
        "Training block service options are invalid.",
      );
    }
    this.#repository = options.repository;
    this.#createId = options.createId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => new Date());
  }

  async list(organizationId: string): Promise<readonly TrainingBlockSnapshot[]> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const blocks = await this.#repository.listCurrent(organization);
    return Object.freeze(
      blocks.map((block) => this.#assertBlock(block, organization)),
    );
  }

  async findCurrent(
    organizationId: string,
    blockId: string,
  ): Promise<TrainingBlockSnapshot | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const block = await this.#repository.findCurrent(organization, id);
    return block === undefined ? undefined : this.#assertBlock(block, organization, id);
  }

  async listOverview(
    organizationId: string,
    principalId: string,
  ): Promise<readonly TrainingBlockOverviewItem[]> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = normalizeTrainingBlockIdentifier(
      principalId,
      "Principal id",
    );
    const [blocks, favoriteBlockIds, usageSummaries] = await Promise.all([
      this.list(organization),
      this.#repository.listFavoriteBlockIds(organization, principal),
      this.#repository.listUsageSummaries(organization),
    ]);
    const byId = new Map(blocks.map((block) => [block.id, block] as const));
    const favorites = new Set<string>();
    for (const favoriteBlockId of favoriteBlockIds) {
      const id = normalizeTrainingBlockIdentifier(
        favoriteBlockId,
        "Favorite training block id",
      );
      if (byId.has(id)) favorites.add(id);
    }
    const usage = validatedUsageSummaryMap(usageSummaries, byId, true);
    return Object.freeze(
      blocks.map((block) => {
        const summary = usage.get(block.id);
        return Object.freeze({
          block,
          isFavorite: favorites.has(block.id),
          usageCount: summary?.usageCount ?? 0,
          lastUsedAt: summary?.lastUsedAt ?? null,
        });
      }),
    );
  }

  async findOverview(
    organizationId: string,
    principalId: string,
    blockId: string,
  ): Promise<TrainingBlockOverviewItem | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = normalizeTrainingBlockIdentifier(
      principalId,
      "Principal id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const block = await this.findCurrent(organization, id);
    if (block === undefined) return undefined;
    const [favoriteBlockIds, usageSummaries] = await Promise.all([
      this.#repository.listFavoriteBlockIds(organization, principal),
      this.#repository.listUsageSummaries(organization),
    ]);
    const favorites = new Set(
      favoriteBlockIds.map((favoriteBlockId) =>
        normalizeTrainingBlockIdentifier(
          favoriteBlockId,
          "Favorite training block id",
        ),
      ),
    );
    const usage = validatedUsageSummaryMap(
      usageSummaries,
      new Map([[block.id, block]]),
      true,
    );
    const summary = usage.get(block.id);
    return Object.freeze({
      block,
      isFavorite: favorites.has(block.id),
      usageCount: summary?.usageCount ?? 0,
      lastUsedAt: summary?.lastUsedAt ?? null,
    });
  }

  async setFavorite(
    organizationId: string,
    principalId: string,
    blockId: string,
    favorite: boolean,
  ): Promise<boolean> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const principal = normalizeTrainingBlockIdentifier(
      principalId,
      "Principal id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    if (typeof favorite !== "boolean") {
      throw new TrainingBlockValidationError(
        "Training block favorite flag is invalid.",
      );
    }
    const block = await this.findCurrent(organization, id);
    if (block === undefined) return false;
    await this.#repository.setFavorite(organization, principal, id, favorite);
    return true;
  }

  async listUsageSummaries(
    organizationId: string,
  ): Promise<readonly TrainingBlockUsageSummary[]> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const blocks = await this.list(organization);
    const summaries = await this.#repository.listUsageSummaries(organization);
    const validated = validatedUsageSummaryMap(
      summaries,
      new Map(blocks.map((block) => [block.id, block] as const)),
      true,
    );
    return Object.freeze([...validated.values()]);
  }

  async listUsage(
    organizationId: string,
    blockId: string,
    limit = 50,
  ): Promise<readonly TrainingBlockUsageEvent[]> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      throw new TrainingBlockValidationError(
        "Training block usage limit is invalid.",
      );
    }
    const events = await this.#repository.listUsageEvents(
      organization,
      id,
      limit,
    );
    return Object.freeze(
      events.map((event) => validateUsageEvent(event, organization, id)),
    );
  }

  async recordUsage(
    organizationId: string,
    blockId: string,
    input: RecordTrainingBlockUsageInput,
  ): Promise<TrainingBlockUsageEvent | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TrainingBlockValidationError(
        "Training block usage input is invalid.",
      );
    }
    const block = await this.findCurrent(organization, id);
    if (block === undefined) return undefined;
    const event = Object.freeze({
      id: normalizeTrainingBlockIdentifier(
        this.#createId(),
        "Generated training block usage id",
      ),
      organizationId: organization,
      blockId: id,
      occurredAt: normalizedUsageTimestamp(input.occurredAt),
      sourceKind: normalizedUsageSourceKind(input.sourceKind),
      sourceRef: optionalUsageText(
        input.sourceRef,
        "Training block usage source reference",
        500,
      ),
      note: optionalUsageText(
        input.note,
        "Training block usage note",
        2_000,
      ),
    });
    await this.#repository.recordUsage(event);
    return event;
  }

  async recordUsageOnce(
    organizationId: string,
    blockId: string,
    eventId: string,
    input: RecordTrainingBlockUsageInput,
  ): Promise<TrainingBlockUsageEvent | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const usageId = normalizeTrainingBlockIdentifier(
      eventId,
      "Training block usage id",
    );
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TrainingBlockValidationError(
        "Training block usage input is invalid.",
      );
    }
    const block = await this.findCurrent(organization, id);
    if (block === undefined) return undefined;
    const event = Object.freeze({
      id: usageId,
      organizationId: organization,
      blockId: id,
      occurredAt: normalizedUsageTimestamp(input.occurredAt),
      sourceKind: normalizedUsageSourceKind(input.sourceKind),
      sourceRef: optionalUsageText(
        input.sourceRef,
        "Training block usage source reference",
        500,
      ),
      note: optionalUsageText(
        input.note,
        "Training block usage note",
        2_000,
      ),
    });
    const stored = validateUsageEvent(
      await this.#repository.recordUsageIfAbsent(event),
      organization,
      id,
    );
    if (!sameUsageEvent(stored, event)) {
      throw new TrainingBlockValidationError(
        "Training block usage id already represents a different event.",
      );
    }
    return stored;
  }

  async create(
    organizationId: string,
    input: CreateTrainingBlockDraftInput,
  ): Promise<TrainingBlockSnapshot> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const draft = normalizeTrainingBlockDraft(input);
    const id = normalizeTrainingBlockIdentifier(
      this.#createId(),
      "Generated training block id",
    );
    const createdAt = normalizedTimestamp(this.#now());
    const itemIds = new Set<string>();
    const revision = Object.freeze({
      organizationId: organization,
      blockId: id,
      revision: 1,
      name: draft.name,
      audienceId: draft.audienceId,
      durationMinutes: draft.durationMinutes,
      note: draft.note,
      exercises: Object.freeze(
        draft.exercises.map((exercise) => {
          const itemId = this.#createUniqueItemId(itemIds);
          return Object.freeze({ ...exercise, itemId });
        }),
      ),
      createdAt,
    });
    const block = Object.freeze({
      id,
      organizationId: organization,
      isActive: true,
      currentRevision: 1,
      createdAt,
      updatedAt: createdAt,
      revision,
    });
    const stored = await this.#repository.create(block);
    return this.#assertBlock(stored, organization, id);
  }

  async update(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    input: UpdateTrainingBlockDraftInput,
  ): Promise<TrainingBlockSnapshot | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const expected = requiredRevision(expectedRevision, "Expected training block revision");
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new TrainingBlockValidationError(
        "Training block update input is invalid.",
      );
    }

    const currentStored = await this.#repository.findCurrent(organization, id);
    if (currentStored === undefined) return undefined;
    const current = this.#assertBlock(currentStored, organization, id);
    if (current.currentRevision !== expected) {
      throw new TrainingBlockConflictError(expected, current.currentRevision);
    }
    if (!current.isActive) {
      throw new TrainingBlockInactiveError(id, current.currentRevision);
    }

    const rawExercises = input.exercises ?? [];
    if (!Array.isArray(rawExercises)) {
      throw new TrainingBlockValidationError(
        "Training block exercises must be an array.",
      );
    }
    const draft = normalizeTrainingBlockDraft(input);
    const currentItemIds = new Set(
      current.revision.exercises.map((exercise) => exercise.itemId),
    );
    const nextItemIds = new Set<string>();
    const nextExercises = draft.exercises.map((exercise, index) => {
      const raw = rawExercises[index];
      if (raw === undefined || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        throw new TrainingBlockValidationError(
          "Training block exercise update is invalid.",
        );
      }
      let itemId: string;
      if (raw.itemId === undefined || raw.itemId === null) {
        itemId = this.#createUniqueItemId(nextItemIds, currentItemIds);
      } else {
        itemId = normalizeTrainingBlockIdentifier(
          raw.itemId,
          "Training block exercise item id",
        );
        if (!currentItemIds.has(itemId)) {
          throw new TrainingBlockValidationError(
            "Training block exercise item id does not belong to the current revision.",
          );
        }
        if (nextItemIds.has(itemId)) {
          throw new TrainingBlockValidationError(
            "Training block update contains a duplicate exercise item id.",
          );
        }
        nextItemIds.add(itemId);
      }
      return Object.freeze({ ...exercise, itemId });
    });

    const revision: TrainingBlockRevision = Object.freeze({
      organizationId: organization,
      blockId: id,
      revision: expected + 1,
      name: draft.name,
      audienceId: draft.audienceId,
      durationMinutes: draft.durationMinutes,
      note: draft.note,
      exercises: Object.freeze(nextExercises),
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
      throw new TrainingBlockConflictError(expected, result.currentRevision);
    }
    if (result.status === "inactive") {
      throw new TrainingBlockInactiveError(id, result.currentRevision);
    }
    return this.#assertBlock(result.block, organization, id);
  }

  async deactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
  ): Promise<TrainingBlockSnapshot | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const expected = requiredRevision(expectedRevision, "Expected training block revision");
    const result = await this.#repository.deactivate(
      organization,
      id,
      expected,
      normalizedTimestamp(this.#now()),
    );
    if (result.status === "not-found") return undefined;
    if (result.status === "conflict") {
      throw new TrainingBlockConflictError(expected, result.currentRevision);
    }
    return this.#assertBlock(result.block, organization, id);
  }

  async listRevisions(
    organizationId: string,
    blockId: string,
  ): Promise<readonly TrainingBlockRevision[]> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const revisions = await this.#repository.listRevisions(organization, id);
    return Object.freeze(
      revisions.map((revision) => this.#assertRevision(revision, organization, id)),
    );
  }

  async findRevision(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<TrainingBlockRevision | undefined> {
    const organization = normalizeTrainingBlockIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingBlockIdentifier(blockId, "Training block id");
    const revisionNumber = requiredRevision(revision, "Training block revision");
    const stored = await this.#repository.findRevision(
      organization,
      id,
      revisionNumber,
    );
    return stored === undefined
      ? undefined
      : this.#assertRevision(stored, organization, id, revisionNumber);
  }

  async compareRevisions(
    organizationId: string,
    blockId: string,
    fromRevision: number,
    toRevision: number,
  ): Promise<TrainingBlockRevisionComparison | undefined> {
    const [from, to] = await Promise.all([
      this.findRevision(organizationId, blockId, fromRevision),
      this.findRevision(organizationId, blockId, toRevision),
    ]);
    if (from === undefined || to === undefined) return undefined;
    return compareRevisionSnapshots(from, to);
  }

  #createUniqueItemId(
    used: Set<string>,
    disallowed: ReadonlySet<string> = new Set<string>(),
  ): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const itemId = normalizeTrainingBlockIdentifier(
        this.#createId(),
        "Generated training block exercise item id",
      );
      if (used.has(itemId) || disallowed.has(itemId)) continue;
      used.add(itemId);
      return itemId;
    }
    throw new Error("Training block id generator did not produce a unique item id.");
  }

  #assertBlock(
    block: TrainingBlockSnapshot,
    expectedOrganizationId: string,
    expectedBlockId?: string,
  ): TrainingBlockSnapshot {
    if (
      block === null ||
      typeof block !== "object" ||
      Array.isArray(block) ||
      block.organizationId !== expectedOrganizationId ||
      (expectedBlockId !== undefined && block.id !== expectedBlockId) ||
      typeof block.isActive !== "boolean" ||
      !Number.isSafeInteger(block.currentRevision) ||
      block.currentRevision < 1 ||
      block.revision.revision !== block.currentRevision
    ) {
      throw new Error("Training block repository returned an invalid current block.");
    }
    normalizeTrainingBlockIdentifier(block.id, "Persisted training block id");
    assertTimestamp(block.createdAt, "Training block created timestamp");
    assertTimestamp(block.updatedAt, "Training block updated timestamp");
    const revision = this.#assertRevision(
      block.revision,
      expectedOrganizationId,
      block.id,
      block.currentRevision,
    );
    return Object.freeze({ ...block, revision });
  }

  #assertRevision(
    revision: TrainingBlockRevision,
    expectedOrganizationId: string,
    expectedBlockId: string,
    expectedRevision?: number,
  ): TrainingBlockRevision {
    if (
      revision === null ||
      typeof revision !== "object" ||
      Array.isArray(revision) ||
      revision.organizationId !== expectedOrganizationId ||
      revision.blockId !== expectedBlockId ||
      !Number.isSafeInteger(revision.revision) ||
      revision.revision < 1 ||
      (expectedRevision !== undefined && revision.revision !== expectedRevision)
    ) {
      throw new Error("Training block repository returned an invalid revision scope.");
    }
    assertTimestamp(revision.createdAt, "Training block revision timestamp");
    const normalized = normalizeTrainingBlockDraft({
      name: revision.name,
      audienceId: revision.audienceId,
      durationMinutes: revision.durationMinutes,
      note: revision.note,
      exercises: revision.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        note: exercise.note,
        parameterOverrides: exercise.parameterOverrides.map((override) => ({
          key: override.key,
          value: override.value,
        })),
      })),
    });
    if (normalized.exercises.length !== revision.exercises.length) {
      throw new Error("Training block repository returned an invalid revision payload.");
    }
    const itemIds = new Set<string>();
    const exercises = revision.exercises.map((exercise, index) => {
      const itemId = normalizeTrainingBlockIdentifier(
        exercise.itemId,
        "Persisted training block exercise item id",
      );
      if (itemIds.has(itemId) || exercise.sortOrder !== index) {
        throw new Error("Training block repository returned invalid exercise ordering.");
      }
      itemIds.add(itemId);
      const normalizedExercise = normalized.exercises[index]!;
      if (
        exercise.parameterOverrides.some(
          (override, parameterIndex) => override.sortOrder !== parameterIndex,
        )
      ) {
        throw new Error("Training block repository returned invalid parameter ordering.");
      }
      return Object.freeze({ ...normalizedExercise, itemId });
    });
    return Object.freeze({
      organizationId: expectedOrganizationId,
      blockId: expectedBlockId,
      revision: revision.revision,
      name: normalized.name,
      audienceId: normalized.audienceId,
      durationMinutes: normalized.durationMinutes,
      note: normalized.note,
      exercises: Object.freeze(exercises),
      createdAt: normalizedTimestamp(new Date(revision.createdAt)),
    });
  }
}

function compareRevisionSnapshots(
  from: TrainingBlockRevision,
  to: TrainingBlockRevision,
): TrainingBlockRevisionComparison {
  const changedFields: TrainingBlockRevisionComparison["changedFields"][number][] = [];
  if (from.name !== to.name) changedFields.push("name");
  if (from.audienceId !== to.audienceId) changedFields.push("audienceId");
  if (from.durationMinutes !== to.durationMinutes) changedFields.push("durationMinutes");
  if (from.note !== to.note) changedFields.push("note");

  const fromById = new Map(from.exercises.map((exercise) => [exercise.itemId, exercise]));
  const toById = new Map(to.exercises.map((exercise) => [exercise.itemId, exercise]));
  const addedItemIds = [...toById.keys()].filter((itemId) => !fromById.has(itemId)).sort();
  const removedItemIds = [...fromById.keys()].filter((itemId) => !toById.has(itemId)).sort();
  const changedItemIds: string[] = [];
  const reorderedItemIds: string[] = [];
  for (const [itemId, left] of fromById) {
    const right = toById.get(itemId);
    if (right === undefined) continue;
    if (left.sortOrder !== right.sortOrder) reorderedItemIds.push(itemId);
    if (
      left.exerciseId !== right.exerciseId ||
      left.note !== right.note ||
      JSON.stringify(left.parameterOverrides) !== JSON.stringify(right.parameterOverrides)
    ) {
      changedItemIds.push(itemId);
    }
  }
  changedItemIds.sort();
  reorderedItemIds.sort();
  const hasChanges =
    changedFields.length > 0 ||
    addedItemIds.length > 0 ||
    removedItemIds.length > 0 ||
    changedItemIds.length > 0 ||
    reorderedItemIds.length > 0;
  return Object.freeze({
    fromRevision: from.revision,
    toRevision: to.revision,
    hasChanges,
    changedFields: Object.freeze(changedFields),
    addedItemIds: Object.freeze(addedItemIds),
    removedItemIds: Object.freeze(removedItemIds),
    changedItemIds: Object.freeze(changedItemIds),
    reorderedItemIds: Object.freeze(reorderedItemIds),
  });
}

function requiredRevision(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TrainingBlockValidationError(`${label} is invalid.`);
  }
  return value;
}

function assertTimestamp(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(new Date(value).valueOf())) {
    throw new Error(`${label} is invalid.`);
  }
}

function normalizedTimestamp(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new TrainingBlockValidationError("Training block timestamp is invalid.");
  }
  return value.toISOString();
}

function validatedUsageSummaryMap(
  summaries: readonly TrainingBlockUsageSummary[],
  blocks: ReadonlyMap<string, TrainingBlockSnapshot>,
  allowOtherBlocks = false,
): ReadonlyMap<string, TrainingBlockUsageSummary> {
  const result = new Map<string, TrainingBlockUsageSummary>();
  for (const summary of summaries) {
    const id = normalizeTrainingBlockIdentifier(
      summary.blockId,
      "Training block usage summary block id",
    );
    if (!blocks.has(id)) {
      if (allowOtherBlocks) continue;
      throw new Error("Training block usage references an unknown block.");
    }
    if (
      !Number.isSafeInteger(summary.usageCount) ||
      summary.usageCount < 1 ||
      result.has(id)
    ) {
      throw new Error("Training block usage summary has an invalid shape.");
    }
    const lastUsedAt =
      summary.lastUsedAt === null
        ? null
        : normalizedUsageTimestamp(summary.lastUsedAt);
    if (lastUsedAt === null) {
      throw new Error("Training block usage summary is missing its timestamp.");
    }
    result.set(
      id,
      Object.freeze({
        blockId: id,
        usageCount: summary.usageCount,
        lastUsedAt,
      }),
    );
  }
  return result;
}

function sameUsageEvent(
  left: TrainingBlockUsageEvent,
  right: TrainingBlockUsageEvent,
): boolean {
  return (
    left.id === right.id &&
    left.organizationId === right.organizationId &&
    left.blockId === right.blockId &&
    left.occurredAt === right.occurredAt &&
    left.sourceKind === right.sourceKind &&
    left.sourceRef === right.sourceRef &&
    left.note === right.note
  );
}

function validateUsageEvent(
  event: TrainingBlockUsageEvent,
  expectedOrganizationId: string,
  expectedBlockId: string,
): TrainingBlockUsageEvent {
  if (
    event === null ||
    typeof event !== "object" ||
    Array.isArray(event) ||
    event.organizationId !== expectedOrganizationId ||
    event.blockId !== expectedBlockId
  ) {
    throw new Error("Training block usage event escaped its scope.");
  }
  return Object.freeze({
    id: normalizeTrainingBlockIdentifier(event.id, "Training block usage id"),
    organizationId: expectedOrganizationId,
    blockId: expectedBlockId,
    occurredAt: normalizedUsageTimestamp(event.occurredAt),
    sourceKind: normalizedUsageSourceKind(event.sourceKind),
    sourceRef: optionalUsageText(
      event.sourceRef,
      "Training block usage source reference",
      500,
    ),
    note: optionalUsageText(event.note, "Training block usage note", 2_000),
  });
}

function normalizedUsageTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    throw new TrainingBlockValidationError(
      "Training block usage timestamp is invalid.",
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new TrainingBlockValidationError(
      "Training block usage timestamp is invalid.",
    );
  }
  return parsed.toISOString();
}

function normalizedUsageSourceKind(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-z][a-z0-9_-]{0,79}$/.test(value)
  ) {
    throw new TrainingBlockValidationError(
      "Training block usage source kind is invalid.",
    );
  }
  return value;
}

function optionalUsageText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.includes("\0")) {
    throw new TrainingBlockValidationError(`${label} is invalid.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (Array.from(normalized).length > maximumLength) {
    throw new TrainingBlockValidationError(
      `${label} must contain at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}
