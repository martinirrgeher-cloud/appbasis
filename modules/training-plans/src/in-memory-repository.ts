import {
  assertTrainingPlanCreationInvariant,
  compareTrainingPlanSnapshots,
  type TrainingPlanCreateResult,
  type TrainingPlanLifecycleRepository,
  type TrainingPlanRepository,
  type TrainingPlanRevision,
  type TrainingPlanDeletionReplayResult,
  type TrainingPlanRevisionAppendResult,
  type TrainingPlanSnapshot,
  type TrainingPlanSubjectDeletionMarker,
  type TrainingPlanSubjectDeletionResult,
} from "./repository";

export class InMemoryTrainingPlanRepository
  implements TrainingPlanRepository, TrainingPlanLifecycleRepository
{
  readonly #plans = new Map<string, TrainingPlanSnapshot>();
  readonly #planIds = new Set<string>();
  readonly #targetPlanKeys = new Map<string, string>();
  readonly #revisions = new Map<string, Map<number, TrainingPlanRevision>>();
  readonly #deletionMarkers = new Map<
    string,
    TrainingPlanSubjectDeletionMarker
  >();

  constructor(initialPlans: readonly TrainingPlanSnapshot[] = []) {
    for (const plan of initialPlans) this.#insertInitial(plan);
  }

  async listCurrentBySubjectsDateRange(
    organizationId: string,
    subjectIds: readonly string[],
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingPlanSnapshot[]> {
    const subjects = new Set(subjectIds);
    return Object.freeze(
      [...this.#plans.values()]
        .filter(
          (plan) =>
            plan.organizationId === organizationId &&
            subjects.has(plan.subjectId) &&
            plan.planDate >= fromDate &&
            plan.planDate <= toDate,
        )
        .sort(
          (left, right) =>
            left.subjectId.localeCompare(right.subjectId) ||
            compareTrainingPlanSnapshots(left, right),
        )
        .map(clonePlan),
    );
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

    if (
      this.#deletionMarkers.has(
        deletionMarkerKey(stored.organizationId, stored.subjectId),
      )
    ) {
      return Object.freeze({ status: "subject-deleted" as const });
    }

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

  async deleteSubjectData(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<TrainingPlanSubjectDeletionResult> {
    const marker = deletionMarker(
      organizationId,
      subjectId,
      completedAt,
    );
    const key = deletionMarkerKey(organizationId, subjectId);
    const existingMarker = this.#deletionMarkers.get(key);
    if (existingMarker === undefined) {
      this.#deletionMarkers.set(key, marker);
    }

    const matching = [...this.#plans.entries()].filter(
      ([, plan]) =>
        plan.organizationId === organizationId &&
        plan.subjectId === subjectId,
    );
    let deletedRevisions = 0;
    let deletedItems = 0;

    for (const [key, plan] of matching) {
      const revisions = this.#revisions.get(key);
      if (revisions === undefined) {
        throw new Error("Training plan revision store is missing.");
      }
      deletedRevisions += revisions.size;
      for (const revision of revisions.values()) {
        deletedItems += revision.items.reduce(
          (count, item) =>
            count +
            1 +
            (item.kind === "block" ? item.exercises.length : 0),
          0,
        );
      }

      this.#plans.delete(key);
      this.#planIds.delete(plan.id);
      this.#targetPlanKeys.delete(
        targetKey(plan.organizationId, plan.subjectId, plan.planDate),
      );
      this.#revisions.delete(key);
    }

    return Object.freeze({
      deletedPlans: matching.length,
      deletedRevisions,
      deletedItems,
    });
  }

  async listCurrentDeletionMarkers(
    now: Date,
  ): Promise<readonly TrainingPlanSubjectDeletionMarker[]> {
    const current = requiredDate(now);
    return Object.freeze(
      [...this.#deletionMarkers.values()]
        .filter((marker) => marker.purgeAfter.getTime() >= current.getTime())
        .sort(
          (left, right) =>
            left.organizationId.localeCompare(right.organizationId) ||
            left.subjectId.localeCompare(right.subjectId),
        )
        .map(cloneDeletionMarker),
    );
  }

  async reconcileDeletionMarker(
    marker: TrainingPlanSubjectDeletionMarker,
  ): Promise<TrainingPlanDeletionReplayResult> {
    const normalized = requiredDeletionMarker(marker);
    const key = deletionMarkerKey(
      normalized.organizationId,
      normalized.subjectId,
    );
    const existing = this.#deletionMarkers.get(key);
    if (
      existing !== undefined &&
      (existing.completedAt.getTime() !== normalized.completedAt.getTime() ||
        existing.purgeAfter.getTime() !== normalized.purgeAfter.getTime())
    ) {
      throw new Error("Training plan deletion marker conflicts with existing state.");
    }
    const markerInserted = existing === undefined;
    if (markerInserted) this.#deletionMarkers.set(key, normalized);
    const deleted = await this.deleteSubjectData(
      normalized.organizationId,
      normalized.subjectId,
      normalized.completedAt,
    );
    return Object.freeze({ markerInserted, ...deleted });
  }

  async purgeExpiredDeletionMarkers(now: Date): Promise<number> {
    const current = requiredDate(now);
    let deleted = 0;
    for (const [key, marker] of this.#deletionMarkers) {
      if (marker.purgeAfter.getTime() < current.getTime()) {
        this.#deletionMarkers.delete(key);
        deleted += 1;
      }
    }
    return deleted;
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

function deletionMarkerKey(
  organizationId: string,
  subjectId: string,
): string {
  return organizationId + "\u0000" + subjectId;
}

function deletionMarker(
  organizationId: string,
  subjectId: string,
  completedAt: Date,
): TrainingPlanSubjectDeletionMarker {
  const completed = requiredDate(completedAt);
  return Object.freeze({
    organizationId,
    subjectId,
    completedAt: completed,
    purgeAfter: new Date(
      completed.getTime() + 35 * 24 * 60 * 60 * 1000,
    ),
  });
}

function requiredDeletionMarker(
  marker: TrainingPlanSubjectDeletionMarker,
): TrainingPlanSubjectDeletionMarker {
  if (
    marker === null ||
    typeof marker !== "object" ||
    typeof marker.organizationId !== "string" ||
    marker.organizationId.length === 0 ||
    marker.organizationId.trim() !== marker.organizationId ||
    marker.organizationId.length > 200 ||
    typeof marker.subjectId !== "string" ||
    marker.subjectId.length === 0 ||
    marker.subjectId.trim() !== marker.subjectId ||
    marker.subjectId.length > 200
  ) {
    throw new Error("Training plan deletion marker is invalid.");
  }
  const completedAt = requiredDate(marker.completedAt);
  const purgeAfter = requiredDate(marker.purgeAfter);
  if (
    purgeAfter.getTime() - completedAt.getTime() !==
    35 * 24 * 60 * 60 * 1000
  ) {
    throw new Error("Training plan deletion marker retention is invalid.");
  }
  return Object.freeze({
    organizationId: marker.organizationId,
    subjectId: marker.subjectId,
    completedAt,
    purgeAfter,
  });
}

function cloneDeletionMarker(
  marker: TrainingPlanSubjectDeletionMarker,
): TrainingPlanSubjectDeletionMarker {
  return Object.freeze({
    ...marker,
    completedAt: new Date(marker.completedAt.getTime()),
    purgeAfter: new Date(marker.purgeAfter.getTime()),
  });
}

function requiredDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error("Training plan lifecycle clock is invalid.");
  }
  return new Date(value.getTime());
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
