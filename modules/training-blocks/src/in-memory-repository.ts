import {
  assertTrainingBlockCreationInvariant,
  compareTrainingBlockSnapshots,
  type TrainingBlockDeactivateResult,
  type TrainingBlockRepository,
  type TrainingBlockRevision,
  type TrainingBlockRevisionAppendResult,
  type TrainingBlockSnapshot,
} from "./repository";

export class InMemoryTrainingBlockRepository implements TrainingBlockRepository {
  readonly #blocks = new Map<string, TrainingBlockSnapshot>();
  readonly #blockIds = new Set<string>();
  readonly #revisions = new Map<string, Map<number, TrainingBlockRevision>>();

  constructor(initialBlocks: readonly TrainingBlockSnapshot[] = []) {
    for (const block of initialBlocks) this.#insertInitial(block);
  }

  async listCurrent(organizationId: string): Promise<readonly TrainingBlockSnapshot[]> {
    return Object.freeze(
      [...this.#blocks.values()]
        .filter((block) => block.organizationId === organizationId)
        .sort(compareTrainingBlockSnapshots)
        .map(cloneBlock),
    );
  }

  async findCurrent(
    organizationId: string,
    blockId: string,
  ): Promise<TrainingBlockSnapshot | undefined> {
    const block = this.#blocks.get(blockKey(organizationId, blockId));
    return block === undefined ? undefined : cloneBlock(block);
  }

  async create(block: TrainingBlockSnapshot): Promise<TrainingBlockSnapshot> {
    const stored = cloneBlock(block);
    const key = blockKey(stored.organizationId, stored.id);
    if (this.#blockIds.has(stored.id)) throw new Error("Training block already exists.");
    assertTrainingBlockCreationInvariant(stored);
    this.#blocks.set(key, stored);
    this.#blockIds.add(stored.id);
    this.#revisions.set(key, new Map([[1, cloneRevision(stored.revision)]]));
    return cloneBlock(stored);
  }

  async appendRevision(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    revision: TrainingBlockRevision,
  ): Promise<TrainingBlockRevisionAppendResult> {
    const key = blockKey(organizationId, blockId);
    const current = this.#blocks.get(key);
    if (current === undefined) return Object.freeze({ status: "not-found" });
    if (current.currentRevision !== expectedRevision) {
      return Object.freeze({ status: "conflict", currentRevision: current.currentRevision });
    }
    assertRevisionScope(revision, organizationId, blockId);
    if (revision.revision !== expectedRevision + 1) {
      throw new Error("Training block next revision is not sequential.");
    }
    const revisions = this.#revisions.get(key);
    if (revisions === undefined) throw new Error("Training block revision store is missing.");
    if (revisions.has(revision.revision)) throw new Error("Training block revision already exists.");

    const storedRevision = cloneRevision(revision);
    revisions.set(storedRevision.revision, storedRevision);
    const stored = cloneBlock({
      ...current,
      currentRevision: storedRevision.revision,
      updatedAt: storedRevision.createdAt,
      revision: storedRevision,
    });
    this.#blocks.set(key, stored);
    return Object.freeze({ status: "updated", block: cloneBlock(stored) });
  }

  async deactivate(
    organizationId: string,
    blockId: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<TrainingBlockDeactivateResult> {
    const key = blockKey(organizationId, blockId);
    const current = this.#blocks.get(key);
    if (current === undefined) return Object.freeze({ status: "not-found" });
    if (current.currentRevision !== expectedRevision) {
      return Object.freeze({ status: "conflict", currentRevision: current.currentRevision });
    }
    if (!current.isActive) {
      return Object.freeze({ status: "updated", block: cloneBlock(current) });
    }
    const stored = cloneBlock({ ...current, isActive: false, updatedAt });
    this.#blocks.set(key, stored);
    return Object.freeze({ status: "updated", block: cloneBlock(stored) });
  }

  async listRevisions(
    organizationId: string,
    blockId: string,
  ): Promise<readonly TrainingBlockRevision[]> {
    const revisions = this.#revisions.get(blockKey(organizationId, blockId));
    if (revisions === undefined) return Object.freeze([]);
    return Object.freeze(
      [...revisions.values()]
        .sort((left, right) => right.revision - left.revision)
        .map(cloneRevision),
    );
  }

  async findRevision(
    organizationId: string,
    blockId: string,
    revision: number,
  ): Promise<TrainingBlockRevision | undefined> {
    const stored = this.#revisions.get(blockKey(organizationId, blockId))?.get(revision);
    return stored === undefined ? undefined : cloneRevision(stored);
  }

  #insertInitial(block: TrainingBlockSnapshot): void {
    const stored = cloneBlock(block);
    const key = blockKey(stored.organizationId, stored.id);
    if (this.#blockIds.has(stored.id)) throw new Error("Training block contains a duplicate id.");
    assertRevisionScope(stored.revision, stored.organizationId, stored.id);
    if (stored.currentRevision !== stored.revision.revision) {
      throw new Error("Training block current revision is inconsistent.");
    }
    this.#blocks.set(key, stored);
    this.#blockIds.add(stored.id);
    this.#revisions.set(key, new Map([[stored.revision.revision, cloneRevision(stored.revision)]]));
  }
}

function assertRevisionScope(
  revision: TrainingBlockRevision,
  organizationId: string,
  blockId: string,
): void {
  if (revision.organizationId !== organizationId || revision.blockId !== blockId) {
    throw new Error("Training block revision escaped its block scope.");
  }
}

function blockKey(organizationId: string, blockId: string): string {
  return organizationId + "\u0000" + blockId;
}

function cloneBlock(block: TrainingBlockSnapshot): TrainingBlockSnapshot {
  return Object.freeze({ ...block, revision: cloneRevision(block.revision) });
}

function cloneRevision(revision: TrainingBlockRevision): TrainingBlockRevision {
  return Object.freeze({
    ...revision,
    exercises: Object.freeze(
      revision.exercises.map((exercise) =>
        Object.freeze({
          ...exercise,
          parameterOverrides: Object.freeze(
            exercise.parameterOverrides.map((override) => Object.freeze({ ...override })),
          ),
        }),
      ),
    ),
  });
}
