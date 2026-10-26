import type {
  TrainingDocumentationCreateResult,
  TrainingDocumentationRepository,
  TrainingDocumentationRevision,
  TrainingDocumentationRevisionAppendResult,
  TrainingDocumentationSnapshot,
} from "./repository";

export class InMemoryTrainingDocumentationRepository
  implements TrainingDocumentationRepository
{
  readonly #documents = new Map<string, TrainingDocumentationSnapshot>();
  readonly #ids = new Set<string>();
  readonly #targets = new Map<string, string>();
  readonly #revisions = new Map<
    string,
    Map<number, TrainingDocumentationRevision>
  >();

  constructor(initial: readonly TrainingDocumentationSnapshot[] = []) {
    for (const documentation of initial) {
      const stored = cloneSnapshot(documentation);
      assertSnapshot(stored);
      const key = documentKey(stored.organizationId, stored.id);
      const target = targetKey(
        stored.organizationId,
        stored.subjectId,
        stored.sessionDate,
      );
      if (this.#ids.has(stored.id) || this.#targets.has(target)) {
        throw new Error(
          "Training documentation initial state contains duplicate identity.",
        );
      }
      this.#documents.set(key, stored);
      this.#ids.add(stored.id);
      this.#targets.set(target, key);
      this.#revisions.set(
        key,
        new Map([[stored.revision.revision, cloneRevision(stored.revision)]]),
      );
    }
  }

  async listCurrentBySubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingDocumentationSnapshot[]> {
    return Object.freeze(
      [...this.#documents.values()]
        .filter(
          (entry) =>
            entry.organizationId === organizationId &&
            entry.subjectId === subjectId &&
            entry.sessionDate >= fromDate &&
            entry.sessionDate <= toDate,
        )
        .sort(
          (left, right) =>
            left.sessionDate.localeCompare(right.sessionDate) ||
            left.id.localeCompare(right.id),
        )
        .map(cloneSnapshot),
    );
  }

  async findCurrent(
    organizationId: string,
    documentationId: string,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const found = this.#documents.get(
      documentKey(organizationId, documentationId),
    );
    return found === undefined ? undefined : cloneSnapshot(found);
  }

  async findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    sessionDate: string,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const key = this.#targets.get(
      targetKey(organizationId, subjectId, sessionDate),
    );
    if (key === undefined) return undefined;
    const found = this.#documents.get(key);
    return found === undefined ? undefined : cloneSnapshot(found);
  }

  async create(
    documentation: TrainingDocumentationSnapshot,
  ): Promise<TrainingDocumentationCreateResult> {
    const stored = cloneSnapshot(documentation);
    assertSnapshot(stored);
    const target = targetKey(
      stored.organizationId,
      stored.subjectId,
      stored.sessionDate,
    );
    const occupiedKey = this.#targets.get(target);
    if (occupiedKey !== undefined) {
      const occupied = this.#documents.get(occupiedKey);
      if (occupied === undefined) {
        throw new Error("Training documentation target index is inconsistent.");
      }
      return Object.freeze({
        status: "target-occupied" as const,
        documentationId: occupied.id,
        currentRevision: occupied.currentRevision,
      });
    }
    if (this.#ids.has(stored.id)) {
      return Object.freeze({ status: "id-conflict" as const });
    }
    const key = documentKey(stored.organizationId, stored.id);
    this.#documents.set(key, stored);
    this.#ids.add(stored.id);
    this.#targets.set(target, key);
    this.#revisions.set(
      key,
      new Map([[stored.revision.revision, cloneRevision(stored.revision)]]),
    );
    return Object.freeze({
      status: "created" as const,
      documentation: cloneSnapshot(stored),
    });
  }

  async appendRevision(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
    revision: TrainingDocumentationRevision,
  ): Promise<TrainingDocumentationRevisionAppendResult> {
    const key = documentKey(organizationId, documentationId);
    const current = this.#documents.get(key);
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
      revision.documentationId !== documentationId ||
      revision.revision !== expectedRevision + 1
    ) {
      throw new Error("Training documentation next revision is invalid.");
    }
    const revisions = this.#revisions.get(key);
    if (revisions === undefined || revisions.has(revision.revision)) {
      throw new Error("Training documentation revision store is inconsistent.");
    }
    const storedRevision = cloneRevision(revision);
    revisions.set(storedRevision.revision, storedRevision);
    const stored = cloneSnapshot({
      ...current,
      currentRevision: storedRevision.revision,
      status: storedRevision.status,
      completedAt: storedRevision.completedAt,
      updatedAt: storedRevision.createdAt,
      revision: storedRevision,
    });
    this.#documents.set(key, stored);
    return Object.freeze({
      status: "updated" as const,
      documentation: cloneSnapshot(stored),
    });
  }

  async listRevisions(
    organizationId: string,
    documentationId: string,
  ): Promise<readonly TrainingDocumentationRevision[]> {
    const revisions = this.#revisions.get(
      documentKey(organizationId, documentationId),
    );
    if (revisions === undefined) return Object.freeze([]);
    return Object.freeze(
      [...revisions.values()]
        .sort((left, right) => right.revision - left.revision)
        .map(cloneRevision),
    );
  }
}

function assertSnapshot(snapshot: TrainingDocumentationSnapshot): void {
  if (
    snapshot.currentRevision !== snapshot.revision.revision ||
    snapshot.status !== snapshot.revision.status ||
    snapshot.completedAt !== snapshot.revision.completedAt
  ) {
    throw new Error("Training documentation snapshot is inconsistent.");
  }
}

function documentKey(organizationId: string, documentationId: string): string {
  return organizationId + "\u0000" + documentationId;
}

function targetKey(
  organizationId: string,
  subjectId: string,
  sessionDate: string,
): string {
  return organizationId + "\u0000" + subjectId + "\u0000" + sessionDate;
}

function cloneSnapshot(
  snapshot: TrainingDocumentationSnapshot,
): TrainingDocumentationSnapshot {
  return Object.freeze({
    ...snapshot,
    revision: cloneRevision(snapshot.revision),
  });
}

function cloneRevision(
  revision: TrainingDocumentationRevision,
): TrainingDocumentationRevision {
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
    attendance: Object.freeze(
      revision.attendance.map((entry) => Object.freeze({ ...entry })),
    ),
  });
}
