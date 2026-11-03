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

/**
 * Privileged, aggregate-only inventory of subject data owned by this module.
 * Historical attendance snapshots may contain participant IDs and names for
 * individuals who do NOT own the documentation root. Those are counted, not
 * inferred from source plan IDs or free-text notes.
 *
 * Empty counts do not prove an absence of unstructured personal information.
 */
export interface TrainingDocumentationSubjectPrivacyInspection {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly ownedDocuments: number;
  readonly ownedRevisions: number;
  readonly otherSubjectDocumentsWithParticipant: number;
  readonly otherSubjectRevisionsWithParticipant: number;
}

export interface TrainingDocumentationSubjectPrivacyInspectionReader {
  inspectSubjectPrivacy(
    organizationId: string,
    subjectId: string,
  ): Promise<TrainingDocumentationSubjectPrivacyInspection>;
}

/**
 * PRIVILEGED lifecycle primitive: original athlete owner must have committed
 * a verified, still-current 35-day deletion marker before invoking it.
 * The module owns only documentation roots and structured attendance JSON.
 * Free text, backups and unrelated app attendance are NOT covered.
 */
export interface TrainingDocumentationSubjectDeletionResult {
  readonly markerInserted: boolean;
  readonly deletedDocuments: number;
  readonly deletedRevisions: number;
  readonly redactedOtherSubjectRevisions: number;
}

export interface TrainingDocumentationSubjectDeletionRepository {
  removeSubjectDataAfterVerifiedDeletion(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<TrainingDocumentationSubjectDeletionResult>;
}

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
