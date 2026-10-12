import {
  assertTrainingPlanCreationInvariant,
  assertTrainingPlanRevisionInvariant,
  compareTrainingPlanSnapshots,
  type TrainingPlanCreateResult,
  type TrainingPlanListQuery,
  type TrainingPlanRepository,
  type TrainingPlanRevision,
  type TrainingPlanRevisionAppendResult,
  type TrainingPlanSnapshot,
} from "./repository";

export class InMemoryTrainingPlanRepository implements TrainingPlanRepository {
  readonly #plans = new Map<string, TrainingPlanSnapshot>();
  readonly #planIds = new Set<string>();
  readonly #targetPlanIds = new Map<string, string>();
  readonly #revisions = new Map<string, Map<number, TrainingPlanRevision>>();

  constructor(initialPlans: readonly TrainingPlanSnapshot[] = []) {
    for (const plan of initialPlans) this.#insertInitial(plan);
  }

  async listCurrent(
    organizationId: string,
    query: TrainingPlanListQuery = {},
  ): Promise<readonly TrainingPlanSnapshot[]> {
    return Object.freeze(
      [...this.#plans.values()]
        .filter(
          (plan) =>
            plan.organizationId === organizationId &&
            (query.subjectId === undefined ||
              plan.subjectId === query.subjectId) &&
            (query.fromDate === undefined ||
              plan.planDate >= query.fromDate) &&
            (query.toDate === undefined ||
              plan.planDate <= query.toDate),
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

  async findForSubjectDate(
    organizationId: string,
    subjectId: string,
    planDate: string,
  ): Promise<TrainingPlanSnapshot | undefined> {
    const planId = this.#targetPlanIds.get(
      targetKey(organizationId, subjectId, planDate),
    );
    if (planId === undefined) return undefined;
    const plan = this.#plans.get(planKey(organizationId, planId));
    if (plan === undefined) {
      throw new Error("Training plan target index is inconsistent.");
    }
    return clonePlan(plan);
  }

  async create(plan: TrainingPlanSnapshot): Promise<TrainingPlanCreateResult> {
    assertTrainingPlanCreationInvariant(plan);
    const target = targetKey(
      plan.organizationId,
      plan.subjectId,
      plan.planDate,
    );
    const existingId = this.#targetPlanIds.get(target);
    if (existingId !== undefined) {
      const existing = this.#plans.get(
        planKey(plan.organizationId, existingId),
      );
      if (existing === undefined) {
        throw new Error("Training plan target index is inconsistent.");
      }
      return Object.freeze({
        status: "target-exists" as const,
        plan: clonePlan(existing),
      });
    }
    if (this.#planIds.has(plan.id)) {
      throw new Error("Training plan already exists.");
    }

    const stored = clonePlan(plan);
    const key = planKey(stored.organizationId, stored.id);
    this.#plans.set(key, stored);
    this.#planIds.add(stored.id);
    this.#targetPlanIds.set(target, stored.id);
    this.#revisions.set(
      key,
      new Map([[stored.revision.revision, cloneRevision(stored.revision)]]),
    );
    return Object.freeze({
      status: "created" as const,
      plan: clonePlan(stored),
    });
  }

  async appendRevision(
    organizationId: string,
    planId: string,
    expectedRevision: number,
    revision: TrainingPlanRevision,
  ): Promise<TrainingPlanRevisionAppendResult> {
    const key = planKey(organizationId, planId);
    const current = this.#plans.get(key);
    if (current === undefined) {
      return Object.freeze({ status: "not-found" as const });
    }
    if (current.currentRevision !== expectedRevision) {
      return Object.freeze({
        status: "conflict" as const,
        currentRevision: current.currentRevision,
      });
    }
    if (
      revision.organizationId !== organizationId ||
      revision.planId !== planId ||
      revision.revision !== expectedRevision + 1
    ) {
      throw new Error(
        "Training plan next revision escaped the locked plan scope.",
      );
    }
    assertTrainingPlanRevisionInvariant(revision);

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
    return Object.freeze({
      status: "updated" as const,
      plan: clonePlan(stored),
    });
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
    if (
      plan.currentRevision !== plan.revision.revision ||
      plan.revision.organizationId !== plan.organizationId ||
      plan.revision.planId !== plan.id
    ) {
      throw new Error("Training plan current revision is inconsistent.");
    }
    assertTrainingPlanRevisionInvariant(plan.revision);
    if (this.#planIds.has(plan.id)) {
      throw new Error("Training plan contains a duplicate id.");
    }
    const target = targetKey(
      plan.organizationId,
      plan.subjectId,
      plan.planDate,
    );
    if (this.#targetPlanIds.has(target)) {
      throw new Error("Training plan contains a duplicate subject/date target.");
    }

    const stored = clonePlan(plan);
    const key = planKey(stored.organizationId, stored.id);
    this.#plans.set(key, stored);
    this.#planIds.add(stored.id);
    this.#targetPlanIds.set(target, stored.id);
    this.#revisions.set(
      key,
      new Map([
        [stored.revision.revision, cloneRevision(stored.revision)],
      ]),
    );
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
  return Object.freeze({
    ...plan,
    revision: cloneRevision(plan.revision),
  });
}

function cloneRevision(revision: TrainingPlanRevision): TrainingPlanRevision {
  return Object.freeze({
    ...revision,
    items: Object.freeze(
      revision.items.map((item) =>
        item.kind === "block"
          ? Object.freeze({
              ...item,
              exercises: Object.freeze(
                item.exercises.map((exercise) =>
                  Object.freeze({ ...exercise }),
                ),
              ),
            })
          : Object.freeze({ ...item }),
      ),
    ),
  });
}
