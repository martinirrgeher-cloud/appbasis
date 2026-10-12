import {
  assertTrainingPlanCreationInvariant,
  compareTrainingPlanSnapshots,
  type TrainingPlanCreateResult,
  type TrainingPlanRepository,
  type TrainingPlanRevision,
  type TrainingPlanRevisionAppendResult,
  type TrainingPlanSnapshot,
} from "./repository";

export class InMemoryTrainingPlanRepository implements TrainingPlanRepository {
  readonly #plans = new Map<string, TrainingPlanSnapshot>();
  readonly #planIds = new Set<string>();
  readonly #targetPlanKeys = new Map<string, string>();
  readonly #revisions = new Map<string, Map<number, TrainingPlanRevision>>();

  constructor(initialPlans: readonly TrainingPlanSnapshot[] = []) {
    for (const plan of initialPlans) this.#insertInitial(plan);
  }

  async listCurrentBySubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]> {
    return Object.freeze(
      [...this.#plans.values()]
        .filter(
          (plan) =>
            plan.organizationId === organizationId &&
            plan.subjectId === subjectId &&
            plan.planDate >= fromDate &&
            plan.planDate <= toDate,
        )
        .sort(compareTrainingPlanSnapshots)
        .map(clonePlan),
    );
  }

  async findCurrent(
    organizationId: string,
    planId: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const plan = this.#plans.get(planKey(organizationId, planId));
    return plan === undefined ? undefined : clonePlan(plan);
  }

  async findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const key = this.#targetPlanKeys.get(
      targetKey(organizationId, subjectId, planDate),
    );
    if (key === undefined) return undefined;
    const plan = this.#plans.get(key);
    return plan === undefined ? undefined : clonePlan(plan);
  }

  async create(plan: TrainingPlanSnapshot): Promise<TrainingPlanCreateResult> {
    const stored = clonePlan(plan);
    assertTrainingPlanCreationInvariant(stored);

    const target = targetKey(
      stored.organizationId,
      stored.subjectId,
      stored.planDate,
    );
    const occupiedKey = this.#targetPlanKeys.get(target);
    if (occupiedKey !== undefined) {
      const occupied = this.#plans.get(occupiedKey);
      if (occupied === undefined) {
        throw new Error("Training plan target index is inconsistent.");
      }
      return Object.freeze({
        status: "target-occupied",
        planId: occupied.id,
        currentRevision: occupied.currentRevision,
      });
    }
    if (this.#planIds.has(stored.id)) {
      return Object.freeze({ status: "id-conflict" });
    }

    const key = planKey(stored.organizationId, stored.id);
    this.#plans.set(key, stored);
    this.#planIds.add(stored.id);
    this.#targetPlanKeys.set(target, key);
    this.#revisions.set(key, new Map([[1, cloneRevision(stored.revision)]]));
    return Object.freeze({ status: "created", plan: clonePlan(stored) });
  }

  async appendRevision(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    revision: TrainingPlanRevision,
  ): Promise<TrainingPlanRevisionAppendResult> {
    const key = planKey(organizationId, planId);
    const current = this.#plans.get(key);
    if (current === undefined) return Object.freeze({ status: "not-found" });
    if (current.currentRevision !== expectedRevision) {
      return Object.freeze({
        status: "conflict",
        currentRevision: current.currentRevision,
      });
    }
    assertRevisionScope(revision, organizationId, planId);
    if (revision.revision !== expectedRevision + 1) {
      throw new Error("Training plan next revision is not sequential.");
    }

    const revisions = this.#revisions.get(key);
    if (revisions === undefined) {
      throw new Error("Training plan revision store is missing.");
    }
    if (revisions.has(revision.revision)) {
      throw new Error("Training plan revision already exists.");
    }

    const storedRevision = cloneRevision(revision);
    revisions.set(storedRevision.revision, storedRevision);
    const stored = clonePlan({
      ...current,
      currentRevision: storedRevision.revision,
      updatedAt: storedRevision.createdAt,
      revision: storedRevision,
    });
    this.#plans.set(key, stored);
    return Object.freeze({ status: "updated", plan: clonePlan(stored) });
  }

  async listRevisions(
    organizationId: string,
    planId: string,
  ): Promise<readonly TrainingPlanRevision[]> {
    const revisions = this.#revisions.get(planKey(organizationId, planId));
    if (revisions === undefined) return Object.freeze([]);
    return Object.freeze(
      [...revisions.values()]
        .sort((left, right) => right.revision - left.revision)
        .map(cloneRevision),
    );
  }

  async findRevision(
    organizationId: string,
    planId: string,
    revision: number,
  ): Promise<TrainingPlanRevision | undefined> {
    const stored = this.#revisions
      .get(planKey(organizationId, planId))
      ?.get(revision);
    return stored === undefined ? undefined : cloneRevision(stored);
  }

  #insertInitial(plan: TrainingPlanSnapshot): void {
    const stored = clonePlan(plan);
    const key = planKey(stored.organizationId, stored.id);
    if (this.#planIds.has(stored.id)) {
      throw new Error("Training plan contains a duplicate id.");
    }
    const target = targetKey(
      stored.organizationId,
      stored.subjectId,
      stored.planDate,
    );
    if (this.#targetPlanKeys.has(target)) {
      throw new Error("Training plan contains a duplicate subject/date target.");
    }
    assertRevisionScope(stored.revision, stored.organizationId, stored.id);
    if (stored.currentRevision !== stored.revision.revision) {
      throw new Error("Training plan current revision is inconsistent.");
    }
    this.#plans.set(key, stored);
    this.#planIds.add(stored.id);
    this.#targetPlanKeys.set(target, key);
    this.#revisions.set(
      key,
      new Map([[stored.revision.revision, cloneRevision(stored.revision)]]),
    );
  }
}

function assertRevisionScope(
  revision: TrainingPlanRevision,
  organizationId: string,
  planId: string,
): void {
  if (
    revision.organizationId !== organizationId ||
    revision.planId !== planId
  ) {
    throw new Error("Training plan revision escaped its plan scope.");
  }
}

function planKey(organizationId: string, planId: string): string {
  return organizationId + "\u0000" + planId;
}

function targetKey(
  organizationId: string,
  subjectId: string,
  planDate: string,
): string {
  return organizationId + "\u0000" + subjectId + "\u0000" + planDate;
}

function clonePlan(plan: TrainingPlanSnapshot): TrainingPlanSnapshot {
  return Object.freeze({ ...plan, revision: cloneRevision(plan.revision) });
}

function cloneRevision(revision: TrainingPlanRevision): TrainingPlanRevision {
  return Object.freeze({
    ...revision,
    items: Object.freeze(
      revision.items.map((item) =>
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
    ),
  });
}
