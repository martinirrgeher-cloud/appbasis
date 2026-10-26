import {
  TrainingDocumentationValidationError,
  normalizeTrainingDocumentationContent,
  normalizeTrainingDocumentationDate,
  normalizeTrainingDocumentationDraft,
  normalizeTrainingDocumentationIdentifier,
  normalizeTrainingDocumentationRevision,
  type CreateTrainingDocumentationDraftInput,
  type TrainingDocumentationAttendanceInput,
  type TrainingDocumentationItemInput,
} from "./training-documentation";
import type {
  TrainingDocumentationRepository,
  TrainingDocumentationRevision,
  TrainingDocumentationSnapshot,
} from "./repository";

export interface UpdateTrainingDocumentationInput {
  readonly note?: string | null;
  readonly items?: readonly TrainingDocumentationItemInput[];
  readonly attendance?: readonly TrainingDocumentationAttendanceInput[];
}

export interface TrainingDocumentationServiceOptions {
  readonly repository: TrainingDocumentationRepository;
  readonly createId?: () => string;
  readonly now?: () => Date;
}

export class TrainingDocumentationConflictError extends Error {
  readonly expectedRevision: number;
  readonly currentRevision: number;

  constructor(expectedRevision: number, currentRevision: number) {
    super(
      `Training documentation revision conflict: expected ${expectedRevision}, current ${currentRevision}.`,
    );
    this.name = "TrainingDocumentationConflictError";
    this.expectedRevision = expectedRevision;
    this.currentRevision = currentRevision;
  }
}

export class TrainingDocumentationTargetOccupiedError extends Error {
  readonly subjectId: string;
  readonly sessionDate: string;
  readonly documentationId: string;
  readonly currentRevision: number;

  constructor(
    subjectId: string,
    sessionDate: string,
    documentationId: string,
    currentRevision: number,
  ) {
    super(
      `Training documentation target ${subjectId} / ${sessionDate} is already occupied.`,
    );
    this.name = "TrainingDocumentationTargetOccupiedError";
    this.subjectId = subjectId;
    this.sessionDate = sessionDate;
    this.documentationId = documentationId;
    this.currentRevision = currentRevision;
  }
}

export class TrainingDocumentationGeneratedIdConflictError extends Error {
  readonly generatedDocumentationId: string;

  constructor(generatedDocumentationId: string) {
    super(
      `Generated training documentation id ${generatedDocumentationId} already exists.`,
    );
    this.name = "TrainingDocumentationGeneratedIdConflictError";
    this.generatedDocumentationId = generatedDocumentationId;
  }
}

export class TrainingDocumentationCompletedError extends Error {
  readonly documentationId: string;

  constructor(documentationId: string) {
    super(
      `Training documentation ${documentationId} is completed and must be reopened before editing.`,
    );
    this.name = "TrainingDocumentationCompletedError";
    this.documentationId = documentationId;
  }
}

export class TrainingDocumentationService {
  readonly #repository: TrainingDocumentationRepository;
  readonly #createId: () => string;
  readonly #now: () => Date;

  constructor(options: TrainingDocumentationServiceOptions) {
    if (
      options === null ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      options.repository === null ||
      typeof options.repository !== "object"
    ) {
      throw new TrainingDocumentationValidationError(
        "Training documentation service options are invalid.",
      );
    }
    this.#repository = options.repository;
    this.#createId = options.createId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => new Date());
  }

  async listForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingDocumentationSnapshot[]> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId,
      "Organization id",
    );
    const subject = normalizeTrainingDocumentationIdentifier(
      subjectId,
      "Training documentation subject",
    );
    const from = normalizeTrainingDocumentationDate(fromDate);
    const to = normalizeTrainingDocumentationDate(toDate);
    if (from > to) {
      throw new TrainingDocumentationValidationError(
        "Training documentation date range is invalid.",
      );
    }
    const documents = await this.#repository.listCurrentBySubjectDateRange(
      organization,
      subject,
      from,
      to,
    );
    return Object.freeze(
      documents.map((entry) =>
        this.#assertSnapshot(entry, organization, undefined, subject),
      ),
    );
  }

  async findCurrent(
    organizationId: string,
    documentationId: string,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingDocumentationIdentifier(
      documentationId,
      "Training documentation id",
    );
    const found = await this.#repository.findCurrent(organization, id);
    return found === undefined
      ? undefined
      : this.#assertSnapshot(found, organization, id);
  }

  async findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    sessionDate: string,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId,
      "Organization id",
    );
    const subject = normalizeTrainingDocumentationIdentifier(
      subjectId,
      "Training documentation subject",
    );
    const date = normalizeTrainingDocumentationDate(sessionDate);
    const found = await this.#repository.findCurrentBySubjectDate(
      organization,
      subject,
      date,
    );
    if (found === undefined) return undefined;
    const validated = this.#assertSnapshot(
      found,
      organization,
      undefined,
      subject,
    );
    if (validated.sessionDate !== date) {
      throw new Error(
        "Training documentation repository escaped the requested target.",
      );
    }
    return validated;
  }

  async create(
    organizationId: string,
    input: CreateTrainingDocumentationDraftInput,
  ): Promise<TrainingDocumentationSnapshot> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId,
      "Organization id",
    );
    const draft = normalizeTrainingDocumentationDraft(input);
    const id = normalizeTrainingDocumentationIdentifier(
      this.#createId(),
      "Generated training documentation id",
    );
    const now = this.#timestamp();
    const revision = this.#revision({
      organizationId: organization,
      documentationId: id,
      revision: 1,
      status: "draft",
      note: draft.note,
      items: draft.items,
      attendance: draft.attendance,
      completedAt: null,
      createdAt: now,
    });
    const snapshot: TrainingDocumentationSnapshot = Object.freeze({
      id,
      organizationId: organization,
      subjectId: draft.subjectId,
      sessionDate: draft.sessionDate,
      sourcePlanId: draft.sourcePlanId,
      sourcePlanRevision: draft.sourcePlanRevision,
      currentRevision: 1,
      status: "draft",
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      revision,
    });
    const result = await this.#repository.create(snapshot);
    if (result.status === "created") {
      return this.#assertSnapshot(
        result.documentation,
        organization,
        id,
        draft.subjectId,
      );
    }
    if (result.status === "target-occupied") {
      throw new TrainingDocumentationTargetOccupiedError(
        draft.subjectId,
        draft.sessionDate,
        result.documentationId,
        result.currentRevision,
      );
    }
    throw new TrainingDocumentationGeneratedIdConflictError(id);
  }

  async update(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
    input: UpdateTrainingDocumentationInput,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const current = await this.#currentForMutation(
      organizationId,
      documentationId,
      expectedRevision,
    );
    if (current === undefined) return undefined;
    if (current.status === "completed") {
      throw new TrainingDocumentationCompletedError(current.id);
    }
    const content = normalizeTrainingDocumentationContent({
      note: input.note ?? current.revision.note,
      items: input.items ?? current.revision.items,
      attendance: input.attendance ?? current.revision.attendance,
    });
    return this.#append(current, "draft", null, content);
  }

  async complete(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const current = await this.#currentForMutation(
      organizationId,
      documentationId,
      expectedRevision,
    );
    if (current === undefined) return undefined;
    if (current.status === "completed") return current;
    const completedAt = this.#timestamp();
    return this.#append(current, "completed", completedAt, current.revision);
  }

  async reopen(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const current = await this.#currentForMutation(
      organizationId,
      documentationId,
      expectedRevision,
    );
    if (current === undefined) return undefined;
    if (current.status === "draft") return current;
    return this.#append(current, "draft", null, current.revision);
  }

  async listRevisions(
    organizationId: string,
    documentationId: string,
  ): Promise<readonly TrainingDocumentationRevision[]> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingDocumentationIdentifier(
      documentationId,
      "Training documentation id",
    );
    return this.#repository.listRevisions(organization, id);
  }

  async #currentForMutation(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId,
      "Organization id",
    );
    const id = normalizeTrainingDocumentationIdentifier(
      documentationId,
      "Training documentation id",
    );
    const expected = normalizeTrainingDocumentationRevision(
      expectedRevision,
      "Expected training documentation revision",
    );
    const current = await this.#repository.findCurrent(organization, id);
    if (current === undefined) return undefined;
    const validated = this.#assertSnapshot(current, organization, id);
    if (validated.currentRevision !== expected) {
      throw new TrainingDocumentationConflictError(
        expected,
        validated.currentRevision,
      );
    }
    return validated;
  }

  async #append(
    current: TrainingDocumentationSnapshot,
    status: "draft" | "completed",
    completedAt: string | null,
    content: Pick<
      TrainingDocumentationRevision,
      "note" | "items" | "attendance"
    >,
  ): Promise<TrainingDocumentationSnapshot> {
    const revision = this.#revision({
      organizationId: current.organizationId,
      documentationId: current.id,
      revision: current.currentRevision + 1,
      status,
      note: content.note,
      items: content.items,
      attendance: content.attendance,
      completedAt,
      createdAt: this.#timestamp(),
    });
    const result = await this.#repository.appendRevision(
      current.organizationId,
      current.id,
      current.currentRevision,
      revision,
    );
    if (result.status === "conflict") {
      throw new TrainingDocumentationConflictError(
        current.currentRevision,
        result.currentRevision,
      );
    }
    if (result.status === "not-found") {
      throw new Error(
        "Training documentation disappeared during an authorized mutation.",
      );
    }
    return this.#assertSnapshot(
      result.documentation,
      current.organizationId,
      current.id,
      current.subjectId,
    );
  }

  #revision(
    input: TrainingDocumentationRevision,
  ): TrainingDocumentationRevision {
    return Object.freeze({
      ...input,
      items: Object.freeze(input.items.map(cloneItem)),
      attendance: Object.freeze(
        input.attendance.map((entry) => Object.freeze({ ...entry })),
      ),
    });
  }

  #assertSnapshot(
    snapshot: TrainingDocumentationSnapshot,
    organizationId: string,
    documentationId?: string,
    subjectId?: string,
  ): TrainingDocumentationSnapshot {
    if (
      snapshot.organizationId !== organizationId ||
      (documentationId !== undefined && snapshot.id !== documentationId) ||
      (subjectId !== undefined && snapshot.subjectId !== subjectId) ||
      snapshot.currentRevision !== snapshot.revision.revision ||
      snapshot.status !== snapshot.revision.status ||
      snapshot.completedAt !== snapshot.revision.completedAt
    ) {
      throw new Error(
        "Training documentation repository returned an inconsistent snapshot.",
      );
    }
    return snapshot;
  }

  #timestamp(): string {
    const date = this.#now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      throw new Error("Training documentation clock is invalid.");
    }
    return date.toISOString();
  }
}

function cloneItem<T extends TrainingDocumentationRevision["items"][number]>(
  item: T,
): T {
  return (
    item.kind === "block"
      ? {
          ...item,
          exercises: Object.freeze(
            item.exercises.map((exercise) => Object.freeze({ ...exercise })),
          ),
        }
      : { ...item }
  ) as T;
}
