import type {
  TrainingDocumentationAttendanceDraft,
  TrainingDocumentationItemDraft,
  TrainingDocumentationStatus,
} from "./training-documentation";

export interface TrainingDocumentationRevision {
  readonly organizationId: string;
  readonly documentationId: string;
  readonly revision: number;
  readonly status: TrainingDocumentationStatus;
  readonly note: string | null;
  readonly items: readonly TrainingDocumentationItemDraft[];
  readonly attendance: readonly TrainingDocumentationAttendanceDraft[];
  readonly completedAt: string | null;
  readonly createdAt: string;
}

export interface TrainingDocumentationSnapshot {
  readonly id: string;
  readonly organizationId: string;
  readonly subjectId: string;
  readonly sessionDate: string;
  readonly sourcePlanId: string;
  readonly sourcePlanRevision: number;
  readonly currentRevision: number;
  readonly status: TrainingDocumentationStatus;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: TrainingDocumentationRevision;
}

export type TrainingDocumentationCreateResult =
  | Readonly<{ status: "created"; documentation: TrainingDocumentationSnapshot }>
  | Readonly<{
      status: "target-occupied";
      documentationId: string;
      currentRevision: number;
    }>
  | Readonly<{ status: "id-conflict" }>;

export type TrainingDocumentationRevisionAppendResult =
  | Readonly<{
      status: "updated";
      documentation: TrainingDocumentationSnapshot;
    }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "conflict"; currentRevision: number }>;

export interface TrainingDocumentationRepository {
  listCurrentBySubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingDocumentationSnapshot[]>;
  findCurrent(
    organizationId: string,
    documentationId: string,
  ): Promise<TrainingDocumentationSnapshot | undefined>;
  findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    sessionDate: string,
  ): Promise<TrainingDocumentationSnapshot | undefined>;
  create(
    documentation: TrainingDocumentationSnapshot,
  ): Promise<TrainingDocumentationCreateResult>;
  appendRevision(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
    revision: TrainingDocumentationRevision,
  ): Promise<TrainingDocumentationRevisionAppendResult>;
  listRevisions(
    organizationId: string,
    documentationId: string,
  ): Promise<readonly TrainingDocumentationRevision[]>;
}
