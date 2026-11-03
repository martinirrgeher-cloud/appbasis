import {
  normalizeTrainingDocumentationContent,
  normalizeTrainingDocumentationIdentifier,
  type TrainingDocumentationStatus,
} from "./training-documentation";
import type {
  TrainingDocumentationCreateResult,
  TrainingDocumentationRepository,
  TrainingDocumentationRevision,
  TrainingDocumentationRevisionAppendResult,
  TrainingDocumentationSnapshot,
  TrainingDocumentationSubjectDeletionRepository,
  TrainingDocumentationSubjectDeletionResult,
  TrainingDocumentationSubjectPrivacyInspection,
  TrainingDocumentationSubjectPrivacyInspectionReader,
} from "./repository";

export type TrainingDocumentationSqlParameter =
  | string
  | number
  | boolean
  | null;

export interface TrainingDocumentationPostgresQueryClient {
  unsafe(
    query: string,
    parameters?: TrainingDocumentationSqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface TrainingDocumentationPostgresClient
  extends TrainingDocumentationPostgresQueryClient {
  begin<T>(
    callback: (
      transaction: TrainingDocumentationPostgresQueryClient,
    ) => Promise<T>,
  ): Promise<T>;
}

export class PostgresTrainingDocumentationRepository
  implements TrainingDocumentationRepository, TrainingDocumentationSubjectPrivacyInspectionReader,
    TrainingDocumentationSubjectDeletionRepository
{
  readonly #client: TrainingDocumentationPostgresClient;

  constructor(client: TrainingDocumentationPostgresClient) {
    this.#client = client;
  }

  /**
   * A single PostgreSQL SELECT gives one statement-consistent inventory with
   * no actor data, notes, names or individual documentation IDs returned.
   * It counts participant references in ALL historical revisions, including
   * documents owned by a different athlete in the same organization.
   */
  async inspectSubjectPrivacy(
    organizationId: string,
    subjectId: string,
  ): Promise<TrainingDocumentationSubjectPrivacyInspection> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId, "Documentation organization",
    );
    const subject = normalizeTrainingDocumentationIdentifier(
      subjectId, "Documentation subject",
    );
    const rows = await this.#client.unsafe(
      `SELECT
         (SELECT count(*)::int
            FROM appbasis_training_documentation AS document
           WHERE document.organization_id = $1
             AND document.subject_id = $2) AS owned_documents,
         (SELECT count(*)::int
            FROM appbasis_training_documentation_revision AS revision
            JOIN appbasis_training_documentation AS document
              ON document.organization_id = revision.organization_id
             AND document.id = revision.documentation_id
           WHERE document.organization_id = $1
             AND document.subject_id = $2) AS owned_revisions,
         (SELECT count(DISTINCT document.id)::int
            FROM appbasis_training_documentation_revision AS revision
            JOIN appbasis_training_documentation AS document
              ON document.organization_id = revision.organization_id
             AND document.id = revision.documentation_id
           WHERE document.organization_id = $1
             AND document.subject_id <> $2
             AND revision.attendance_json @>
               jsonb_build_array(jsonb_build_object('participantId', $2::text))
         ) AS other_subject_documents_with_participant,
         (SELECT count(*)::int
            FROM appbasis_training_documentation_revision AS revision
            JOIN appbasis_training_documentation AS document
              ON document.organization_id = revision.organization_id
             AND document.id = revision.documentation_id
           WHERE document.organization_id = $1
             AND document.subject_id <> $2
             AND revision.attendance_json @>
               jsonb_build_array(jsonb_build_object('participantId', $2::text))
         ) AS other_subject_revisions_with_participant`,
      [organization, subject],
    );
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error("Training documentation privacy inventory is invalid.");
    }
    const row = rows[0];
    const requiredCount = (value: unknown): number => {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        throw new Error("Training documentation privacy count is invalid.");
      }
      return value;
    };
    const ownedDocuments = requiredCount(row.owned_documents);
    const ownedRevisions = requiredCount(row.owned_revisions);
    const otherSubjectDocumentsWithParticipant =
      requiredCount(row.other_subject_documents_with_participant);
    const otherSubjectRevisionsWithParticipant =
      requiredCount(row.other_subject_revisions_with_participant);
    if (
      ownedRevisions < ownedDocuments ||
      otherSubjectRevisionsWithParticipant <
        otherSubjectDocumentsWithParticipant
    ) {
      throw new Error("Training documentation privacy totals conflict.");
    }
    return Object.freeze({
      organizationId: organization,
      subjectId: subject,
      ownedDocuments,
      ownedRevisions,
      otherSubjectDocumentsWithParticipant,
      otherSubjectRevisionsWithParticipant,
    });
  }

  /**
   * Privileged module-owned erasure, intentionally NOT in the normal public
   * documentation service. The app must independently verify the canonical
   * completed athletes deletion before invoking this method.
   *
   * With v2 SQL triggers, the subject advisory lock serializes erasure with
   * root inserts and all revision inserts/attendance updates, so stale editor
   * snapshots cannot resurrect the removed participant reference.
   *
   * It is an explicit privacy exception to otherwise immutable revision JSON.
   * Other athletes' exercises/notes and ordering remain unchanged.
   */
  async removeSubjectDataAfterVerifiedDeletion(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<TrainingDocumentationSubjectDeletionResult> {
    const organization = normalizeTrainingDocumentationIdentifier(
      organizationId, "Documentation organization",
    );
    const subject = normalizeTrainingDocumentationIdentifier(
      subjectId, "Documentation subject",
    );
    if (!(completedAt instanceof Date) || !Number.isFinite(completedAt.getTime())) {
      throw new Error("Training documentation deletion timestamp is invalid.");
    }
    const completed = new Date(completedAt.getTime());
    const now = Date.now();
    if (
      completed.getTime() > now ||
      now - completed.getTime() > 35 * 24 * 60 * 60 * 1000
    ) {
      throw new Error("Training documentation deletion source is expired or in the future.");
    }
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        `SELECT pg_advisory_xact_lock(
           hashtextextended($1::text || chr(31) || $2::text, 0)
         ) AS acquired`,
        [organization, subject],
      );
      const inserted = await transaction.unsafe(
        `INSERT INTO appbasis_training_documentation_subject_deletion (
           organization_id, subject_id, completed_at, purge_after
         ) VALUES ($1, $2, $3::timestamptz, $3::timestamptz + interval '840 hours')
         ON CONFLICT (organization_id, subject_id) DO NOTHING
         RETURNING organization_id`,
        [organization, subject, completed.toISOString()],
      );
      if (inserted.length > 1) {
        throw new Error("Training documentation deletion marker insert is ambiguous.");
      }
      const markers = await transaction.unsafe(
        `SELECT completed_at, purge_after
         FROM appbasis_training_documentation_subject_deletion
         WHERE organization_id = $1 AND subject_id = $2`,
        [organization, subject],
      );
      if (markers.length !== 1 || markers[0] === undefined) {
        throw new Error("Training documentation deletion marker is missing.");
      }
      const row = markers[0];
      const storedCompleted = new Date(row.completed_at as string);
      const storedPurge = new Date(row.purge_after as string);
      if (
        !Number.isFinite(storedCompleted.getTime()) ||
        !Number.isFinite(storedPurge.getTime()) ||
        storedCompleted.getTime() !== completed.getTime() ||
        storedPurge.getTime() - storedCompleted.getTime() !==
          35 * 24 * 60 * 60 * 1000
      ) {
        throw new Error("Training documentation deletion marker conflicts.");
      }

      // This deletion order respects the v1 circular current-revision FK:
      // root -> revision is DEFERRABLE, revision -> root is RESTRICT.
      const deletedRevisionRows = await transaction.unsafe(
        `WITH deleted AS (
           DELETE FROM appbasis_training_documentation_revision AS revision
           USING appbasis_training_documentation AS document
           WHERE revision.organization_id = document.organization_id
             AND revision.documentation_id = document.id
             AND document.organization_id = $1
             AND document.subject_id = $2
           RETURNING revision.revision
         ) SELECT count(*)::int AS count FROM deleted`,
        [organization, subject],
      );
      const deletedRootRows = await transaction.unsafe(
        `WITH deleted AS (
           DELETE FROM appbasis_training_documentation
           WHERE organization_id = $1 AND subject_id = $2
           RETURNING id
         ) SELECT count(*)::int AS count FROM deleted`,
        [organization, subject],
      );

      // Every historical other-owner revision is surgically scrubbed.
      // jsonb_agg with ORDINALITY preserves every unrelated participant
      // in the original order, including their unrelated status and name.
      const redactedRows = await transaction.unsafe(
        `WITH redacted AS (
           UPDATE appbasis_training_documentation_revision AS revision
           SET attendance_json = (
             SELECT COALESCE(jsonb_agg(participant.entry ORDER BY participant.position),
                             '[]'::jsonb)
             FROM jsonb_array_elements(revision.attendance_json)
               WITH ORDINALITY AS participant(entry, position)
             WHERE participant.entry->>'participantId' IS DISTINCT FROM $2
           )
           FROM appbasis_training_documentation AS document
           WHERE revision.organization_id = document.organization_id
             AND revision.documentation_id = document.id
             AND document.organization_id = $1
             AND document.subject_id <> $2
             AND revision.attendance_json @>
               jsonb_build_array(jsonb_build_object('participantId', $2::text))
           RETURNING revision.revision
         ) SELECT count(*)::int AS count FROM redacted`,
        [organization, subject],
      );
      const counts = [
        deletedRootRows[0]?.count, deletedRevisionRows[0]?.count,
        redactedRows[0]?.count,
      ];
      if (
        deletedRootRows.length !== 1 ||
        deletedRevisionRows.length !== 1 ||
        redactedRows.length !== 1 ||
        counts.some((value) =>
          typeof value !== "number" ||
          !Number.isSafeInteger(value) ||
          value < 0
        ) ||
        (counts[1] as number) < (counts[0] as number)
      ) {
        throw new Error("Training documentation subject deletion totals are invalid.");
      }

      // Never acknowledge partial success while structured subject refs remain.
      const residual = await transaction.unsafe(
        `SELECT (
           SELECT count(*)::int FROM appbasis_training_documentation
           WHERE organization_id = $1 AND subject_id = $2
         ) AS roots,
         (
           SELECT count(*)::int
           FROM appbasis_training_documentation_revision AS revision
           JOIN appbasis_training_documentation AS document
             ON document.organization_id = revision.organization_id
            AND document.id = revision.documentation_id
           WHERE document.organization_id = $1
             AND revision.attendance_json @>
               jsonb_build_array(jsonb_build_object('participantId', $2::text))
         ) AS participants`,
        [organization, subject],
      );
      if (
        residual.length !== 1 ||
        residual[0]?.roots !== 0 ||
        residual[0]?.participants !== 0
      ) {
        throw new Error("Training documentation subject references still remain.");
      }
      return Object.freeze({
        markerInserted: inserted.length === 1,
        deletedDocuments: counts[0] as number,
        deletedRevisions: counts[1] as number,
        redactedOtherSubjectRevisions: counts[2] as number,
      });
    });
  }

  async listCurrentBySubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly TrainingDocumentationSnapshot[]> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return readCurrent(
        transaction,
        organizationId,
        `AND document.subject_id = $2
         AND document.session_date >= $3::date
         AND document.session_date <= $4::date`,
        [subjectId, fromDate, toDate],
      );
    });
  }

  async findCurrent(
    organizationId: string,
    documentationId: string,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return (
        await readCurrent(
          transaction,
          organizationId,
          "AND document.id = $2",
          [documentationId],
        )
      )[0];
    });
  }

  async findCurrentBySubjectDate(
    organizationId: string,
    subjectId: string,
    sessionDate: string,
  ): Promise<TrainingDocumentationSnapshot | undefined> {
    return this.#client.begin(async (transaction) => {
      await transaction.unsafe(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return (
        await readCurrent(
          transaction,
          organizationId,
          `AND document.subject_id = $2
           AND document.session_date = $3::date`,
          [subjectId, sessionDate],
        )
      )[0];
    });
  }

  async create(
    documentation: TrainingDocumentationSnapshot,
  ): Promise<TrainingDocumentationCreateResult> {
    return this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `INSERT INTO appbasis_training_documentation (
           id, organization_id, subject_id, session_date,
           source_plan_id, source_plan_revision,
           current_revision, status, completed_at, created_at, updated_at
         )
         VALUES (
           $1, $2, $3, $4::date,
           $5, $6,
           $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz
         )
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          documentation.id,
          documentation.organizationId,
          documentation.subjectId,
          documentation.sessionDate,
          documentation.sourcePlanId,
          documentation.sourcePlanRevision,
          documentation.currentRevision,
          documentation.status,
          documentation.completedAt,
          documentation.createdAt,
          documentation.updatedAt,
        ],
      );
      if (rows.length === 0) {
        const occupied = await transaction.unsafe(
          `SELECT id, current_revision
           FROM appbasis_training_documentation
           WHERE organization_id = $1
             AND subject_id = $2
             AND session_date = $3::date`,
          [
            documentation.organizationId,
            documentation.subjectId,
            documentation.sessionDate,
          ],
        );
        if (occupied.length === 1) {
          return Object.freeze({
            status: "target-occupied" as const,
            documentationId: requiredString(
              occupied[0]!.id,
              "occupied documentation id",
            ),
            currentRevision: requiredInteger(
              occupied[0]!.current_revision,
              "occupied current revision",
            ),
          });
        }
        if (occupied.length > 1) {
          throw new Error(
            "Training documentation target lookup returned multiple rows.",
          );
        }
        return Object.freeze({ status: "id-conflict" as const });
      }
      if (rows.length !== 1) {
        throw new Error(
          "Training documentation insert returned multiple rows.",
        );
      }
      await insertRevision(transaction, documentation.revision);
      return Object.freeze({
        status: "created" as const,
        documentation: cloneSnapshot(documentation),
      });
    });
  }

  async appendRevision(
    organizationId: string,
    documentationId: string,
    expectedRevision: number,
    revision: TrainingDocumentationRevision,
  ): Promise<TrainingDocumentationRevisionAppendResult> {
    return this.#client.begin(async (transaction) => {
      const rows = await transaction.unsafe(
        `SELECT subject_id,
                to_char(session_date, 'YYYY-MM-DD') AS session_date,
                source_plan_id,
                source_plan_revision,
                current_revision,
                status,
                CASE
                  WHEN completed_at IS NULL THEN NULL
                  ELSE to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                END AS completed_at,
                to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
         FROM appbasis_training_documentation
         WHERE organization_id = $1
           AND id = $2
         FOR UPDATE`,
        [organizationId, documentationId],
      );
      if (rows.length === 0) {
        return Object.freeze({ status: "not-found" as const });
      }
      if (rows.length !== 1) {
        throw new Error(
          "Training documentation lock returned multiple rows.",
        );
      }
      const currentRevision = requiredInteger(
        rows[0]!.current_revision,
        "current revision",
      );
      if (currentRevision !== expectedRevision) {
        return Object.freeze({
          status: "conflict" as const,
          currentRevision,
        });
      }
      if (
        revision.organizationId !== organizationId ||
        revision.documentationId !== documentationId ||
        revision.revision !== expectedRevision + 1
      ) {
        throw new Error(
          "Training documentation next revision escaped the locked scope.",
        );
      }
      await insertRevision(transaction, revision);
      const updated = await transaction.unsafe(
        `UPDATE appbasis_training_documentation
         SET current_revision = $3,
             status = $4,
             completed_at = $5::timestamptz,
             updated_at = $6::timestamptz
         WHERE organization_id = $1
           AND id = $2
           AND current_revision = $7
         RETURNING id`,
        [
          organizationId,
          documentationId,
          revision.revision,
          revision.status,
          revision.completedAt,
          revision.createdAt,
          expectedRevision,
        ],
      );
      if (updated.length !== 1) {
        throw new Error(
          "Training documentation optimistic update lost its row lock.",
        );
      }
      const row = rows[0]!;
      return Object.freeze({
        status: "updated" as const,
        documentation: Object.freeze({
          id: documentationId,
          organizationId,
          subjectId: requiredString(row.subject_id, "subject id"),
          sessionDate: requiredDateString(row.session_date, "session date"),
          sourcePlanId: requiredString(row.source_plan_id, "source plan id"),
          sourcePlanRevision: requiredInteger(
            row.source_plan_revision,
            "source plan revision",
          ),
          currentRevision: revision.revision,
          status: revision.status,
          completedAt: revision.completedAt,
          createdAt: normalizedTimestamp(
            requiredString(row.created_at, "created timestamp"),
          ),
          updatedAt: normalizedTimestamp(revision.createdAt),
          revision: cloneRevision(revision),
        }),
      });
    });
  }

  async listRevisions(
    organizationId: string,
    documentationId: string,
  ): Promise<readonly TrainingDocumentationRevision[]> {
    const rows = await this.#client.unsafe(
      `SELECT organization_id,
              documentation_id,
              revision,
              status,
              note,
              items_json,
              attendance_json,
              CASE
                WHEN completed_at IS NULL THEN NULL
                ELSE to_char(completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
              END AS completed_at,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
       FROM appbasis_training_documentation_revision
       WHERE organization_id = $1
         AND documentation_id = $2
       ORDER BY revision DESC`,
      [organizationId, documentationId],
    );
    return Object.freeze(
      rows.map((row) =>
        revisionFromRow(row, organizationId, documentationId),
      ),
    );
  }
}

async function readCurrent(
  client: TrainingDocumentationPostgresQueryClient,
  organizationId: string,
  condition: string,
  parameters: TrainingDocumentationSqlParameter[],
): Promise<readonly TrainingDocumentationSnapshot[]> {
  const rows = await client.unsafe(
    `SELECT document.id,
            document.organization_id,
            document.subject_id,
            to_char(document.session_date, 'YYYY-MM-DD') AS session_date,
            document.source_plan_id,
            document.source_plan_revision,
            document.current_revision,
            document.status,
            CASE
              WHEN document.completed_at IS NULL THEN NULL
              ELSE to_char(document.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            END AS completed_at,
            to_char(document.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
            to_char(document.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
            revision.note,
            revision.items_json,
            revision.attendance_json,
            revision.status AS revision_status,
            CASE
              WHEN revision.completed_at IS NULL THEN NULL
              ELSE to_char(revision.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            END AS revision_completed_at,
            to_char(revision.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS revision_created_at
     FROM appbasis_training_documentation AS document
     INNER JOIN appbasis_training_documentation_revision AS revision
       ON revision.organization_id = document.organization_id
      AND revision.documentation_id = document.id
      AND revision.revision = document.current_revision
     WHERE document.organization_id = $1
       ${condition}
     ORDER BY document.session_date ASC, document.id ASC`,
    [organizationId, ...parameters],
  );

  return Object.freeze(
    rows.map((row) => {
      const id = requiredString(row.id, "documentation id");
      const currentRevision = requiredInteger(
        row.current_revision,
        "current revision",
      );
      const revision = revisionFromCurrentRow(
        row,
        organizationId,
        id,
        currentRevision,
      );
      const status = requiredStatus(row.status, "status");
      const completedAt = optionalTimestamp(row.completed_at);
      if (
        status !== revision.status ||
        completedAt !== revision.completedAt
      ) {
        throw new Error(
          "Training documentation current state differs from its current revision.",
        );
      }
      return Object.freeze({
        id,
        organizationId: scopedOrganization(
          row.organization_id,
          organizationId,
        ),
        subjectId: requiredString(row.subject_id, "subject id"),
        sessionDate: requiredDateString(row.session_date, "session date"),
        sourcePlanId: requiredString(row.source_plan_id, "source plan id"),
        sourcePlanRevision: requiredInteger(
          row.source_plan_revision,
          "source plan revision",
        ),
        currentRevision,
        status,
        completedAt,
        createdAt: normalizedTimestamp(
          requiredString(row.created_at, "created timestamp"),
        ),
        updatedAt: normalizedTimestamp(
          requiredString(row.updated_at, "updated timestamp"),
        ),
        revision,
      });
    }),
  );
}

async function insertRevision(
  client: TrainingDocumentationPostgresQueryClient,
  revision: TrainingDocumentationRevision,
): Promise<void> {
  const rows = await client.unsafe(
    `INSERT INTO appbasis_training_documentation_revision (
       organization_id, documentation_id, revision,
       status, note, items_json, attendance_json, completed_at, created_at
     )
     VALUES (
       $1, $2, $3,
       $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz, $9::timestamptz
     )
     RETURNING revision`,
    [
      revision.organizationId,
      revision.documentationId,
      revision.revision,
      revision.status,
      revision.note,
      JSON.stringify(revision.items),
      JSON.stringify(revision.attendance),
      revision.completedAt,
      revision.createdAt,
    ],
  );
  if (rows.length !== 1) {
    throw new Error("Training documentation revision insert failed.");
  }
}

function revisionFromCurrentRow(
  row: Record<string, unknown>,
  organizationId: string,
  documentationId: string,
  revision: number,
): TrainingDocumentationRevision {
  const content = normalizeStoredContent(row.items_json, row.attendance_json, row.note);
  return Object.freeze({
    organizationId,
    documentationId,
    revision,
    status: requiredStatus(row.revision_status, "revision status"),
    note: content.note,
    items: content.items,
    attendance: content.attendance,
    completedAt: optionalTimestamp(row.revision_completed_at),
    createdAt: normalizedTimestamp(
      requiredString(row.revision_created_at, "revision created timestamp"),
    ),
  });
}

function revisionFromRow(
  row: Record<string, unknown>,
  organizationId: string,
  documentationId: string,
): TrainingDocumentationRevision {
  scopedOrganization(row.organization_id, organizationId);
  if (
    requiredString(row.documentation_id, "revision documentation id") !==
    documentationId
  ) {
    throw new Error(
      "Training documentation revision escaped its requested document.",
    );
  }
  const content = normalizeStoredContent(
    row.items_json,
    row.attendance_json,
    row.note,
  );
  return Object.freeze({
    organizationId,
    documentationId,
    revision: requiredInteger(row.revision, "revision"),
    status: requiredStatus(row.status, "revision status"),
    note: content.note,
    items: content.items,
    attendance: content.attendance,
    completedAt: optionalTimestamp(row.completed_at),
    createdAt: normalizedTimestamp(
      requiredString(row.created_at, "revision created timestamp"),
    ),
  });
}

function normalizeStoredContent(
  rawItems: unknown,
  rawAttendance: unknown,
  rawNote: unknown,
) {
  const items = jsonArray(rawItems, "items");
  const attendance = jsonArray(rawAttendance, "attendance");
  const note = optionalString(rawNote, "note");
  return normalizeTrainingDocumentationContent({
    note,
    items: items as never,
    attendance: attendance as never,
  });
}

function jsonArray(value: unknown, label: string): readonly unknown[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error(
        `Training documentation ${label} JSON has an invalid shape.`,
      );
    }
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Training documentation ${label} JSON has an invalid shape.`,
    );
  }
  return parsed;
}

function requiredStatus(value: unknown, label: string): TrainingDocumentationStatus {
  if (value !== "draft" && value !== "completed") {
    throw new Error(
      `Training documentation ${label} has an invalid shape.`,
    );
  }
  return value;
}

function scopedOrganization(value: unknown, expected: string): string {
  const organization = requiredString(value, "organization id");
  if (organization !== expected) {
    throw new Error("Training documentation escaped organization scope.");
  }
  return organization;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Training documentation ${label} has an invalid shape.`,
    );
  }
  return value;
}

function optionalString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(
      `Training documentation ${label} has an invalid shape.`,
    );
  }
  return value;
}

function requiredInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(
      `Training documentation ${label} has an invalid shape.`,
    );
  }
  return value;
}

function requiredDateString(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000-")) {
    throw new Error(
      `Training documentation ${label} has an invalid shape.`,
    );
  }
  return date;
}

function optionalTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return normalizedTimestamp(requiredString(value, "timestamp"));
}

function normalizedTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("Training documentation timestamp has an invalid shape.");
  }
  return parsed.toISOString();
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
