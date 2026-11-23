import type {
  UlcTrainingSubjectHistoryTransactionClient,
  UlcTrainingSubjectHistorySqlClient,
  UlcTrainingSubjectHistoryDeletionResult,
} from "./training-subject-history-deletion-postgres";

/**
 * Privileged application-owned athlete history erasure for an actual v19
 * installation. The existing ulc_linz_training_subject_deletion table and
 * all THREE deployed v19 READ COMMITTED write-fence triggers are mandatory.
 *
 * This is NOT a public route, runtime registration or stand-alone deletion
 * authority. Its only permitted caller must independently authenticate a
 * current same-organization administrator AND the completed canonical
 * athletes-owner deletion marker. The normal application SQL role cannot
 * invoke this database-owner-only path.
 *
 * Session-level/free-text names, actor identities, audit, backup/restore and
 * other data owners remain separate privacy gates. No production activation.
 */
export interface UlcTrainingSubjectProtectedHistoryDeletionResult
  extends UlcTrainingSubjectHistoryDeletionResult {
  readonly markerInserted: boolean;
}

export interface UlcTrainingSubjectProtectedHistoryDeletionRepository {
  markSubjectDeletedAndEraseHistory(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<UlcTrainingSubjectProtectedHistoryDeletionResult>;
}

const MARKER_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
type Parameter = string | number | boolean | null;

export class PostgresUlcTrainingSubjectProtectedHistoryRepository
  implements UlcTrainingSubjectProtectedHistoryDeletionRepository
{
  constructor(private readonly client: UlcTrainingSubjectHistoryTransactionClient) {}

  async markSubjectDeletedAndEraseHistory(
    organizationId: string,
    subjectId: string,
    completedAt: Date,
  ): Promise<UlcTrainingSubjectProtectedHistoryDeletionResult> {
    const organization = identifier(organizationId);
    const subject = identifier(subjectId);
    const observedNow = Date.now();
    if (
      !(completedAt instanceof Date) ||
      !Number.isFinite(completedAt.getTime()) ||
      completedAt.getTime() > observedNow ||
      observedNow - completedAt.getTime() > MARKER_WINDOW_MS
    ) {
      throw new Error("ULC protected history requires a current completed athlete deletion.");
    }
    const sourceAt = new Date(completedAt.getTime());

    return this.client.begin(async (tx) => {
      // A stale snapshot may not see an already committed marker. Neither a
      // SERIALIZABLE nor REPEATABLE READ transaction is an adequate substitute.
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      const safety = await tx.unsafe(`SELECT
          current_user AS executor,
          session_user AS login_role,
          (SELECT pg_get_userbyid(datdba) FROM pg_database
             WHERE datname = current_database()) AS database_owner,
          (SELECT count(*)::int
             FROM (VALUES
               ('ulc_linz_training_attendance', 'ulc_linz_training_attendance_subject_fence'),
               ('ulc_linz_training_registration', 'ulc_linz_training_registration_subject_fence'),
               ('ulc_linz_training_registration_change', 'ulc_linz_training_registration_change_subject_fence')
             ) AS required(table_name, trigger_name)
             JOIN pg_class c ON c.relname = required.table_name
             JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
             JOIN pg_trigger t ON t.tgrelid = c.oid
               AND t.tgname = required.trigger_name AND t.tgenabled = 'O'
             JOIN pg_proc p ON p.oid = t.tgfoid
             WHERE p.proname = 'ulc_linz_training_subject_write_fence'
               AND position('transaction_isolation' IN p.prosrc) > 0
          ) AS guarded_tables`);
      if (
        safety.length !== 1 ||
        safety[0]?.executor !== safety[0]?.database_owner ||
        safety[0]?.login_role !== safety[0]?.executor ||
        safety[0]?.guarded_tables !== 3
      ) {
        throw new Error("ULC protected training history requires owner and all three v19 fences.");
      }

      // Exact advisory key shared by every v19 INSERT/UPDATE writer. Marker
      // and deletion commit atomically; subsequent writes fail in DB triggers.
      await tx.unsafe(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text || chr(31) || $2::text, 0)) AS locked",
        [organization, subject],
      );
      const inserted = await tx.unsafe(
        `INSERT INTO ulc_linz_training_subject_deletion
           (organization_id, athlete_id, completed_at, purge_after)
         VALUES ($1, $2, $3::timestamptz, $3::timestamptz + interval '840 hours')
         ON CONFLICT (organization_id, athlete_id) DO NOTHING
         RETURNING athlete_id`,
        [organization, subject, sourceAt.toISOString()],
      );
      if (inserted.length > 1) {
        throw new Error("ULC training history marker insertion is ambiguous.");
      }
      const markerRows = await tx.unsafe(
        `SELECT completed_at, purge_after
         FROM ulc_linz_training_subject_deletion
         WHERE organization_id = $1 AND athlete_id = $2`,
        [organization, subject],
      );
      if (
        markerRows.length !== 1 ||
        markerRows[0] === undefined ||
        storedDate(markerRows[0].completed_at) !== sourceAt.getTime() ||
        storedDate(markerRows[0].purge_after) !== sourceAt.getTime() + MARKER_WINDOW_MS
      ) {
        throw new Error("ULC training subject deletion marker conflicts with source decision.");
      }

      // Preserve shared training sessions and other subjects. The change
      // history must disappear BEFORE the current registration row.
      const deletedRegistrationHistoryRows = await eraseRows(tx,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_registration_change
           WHERE organization_id = $1 AND athlete_id = $2
           RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, subject],
      );
      const deletedRegistrationRows = await eraseRows(tx,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_registration
           WHERE organization_id = $1 AND athlete_id = $2
           RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, subject],
      );
      const deletedAttendanceRows = await eraseRows(tx,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_attendance
           WHERE organization_id = $1 AND athlete_id = $2
           RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, subject],
      );
      const remaining = await tx.unsafe(
        `SELECT
           (SELECT count(*)::int FROM ulc_linz_training_attendance
             WHERE organization_id = $1 AND athlete_id = $2) AS attendance,
           (SELECT count(*)::int FROM ulc_linz_training_registration
             WHERE organization_id = $1 AND athlete_id = $2) AS registration,
           (SELECT count(*)::int FROM ulc_linz_training_registration_change
             WHERE organization_id = $1 AND athlete_id = $2) AS history`,
        [organization, subject],
      );
      if (
        remaining.length !== 1 ||
        remaining[0]?.attendance !== 0 ||
        remaining[0]?.registration !== 0 ||
        remaining[0]?.history !== 0
      ) {
        throw new Error("ULC protected training history retains subject rows.");
      }
      return Object.freeze({
        markerInserted: inserted.length === 1,
        deletedAttendanceRows,
        deletedRegistrationRows,
        deletedRegistrationHistoryRows,
      });
    });
  }
}

async function eraseRows(
  client: UlcTrainingSubjectHistorySqlClient,
  query: string,
  parameters: Parameter[],
): Promise<number> {
  const rows = await client.unsafe(query, parameters);
  if (
    rows.length !== 1 ||
    typeof rows[0]?.total !== "number" ||
    !Number.isSafeInteger(rows[0].total) ||
    rows[0].total < 0
  ) {
    throw new Error("ULC protected history erasure row count is invalid.");
  }
  return rows[0].total;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 || value.length > 200 ||
    value !== value.trim() || value.includes("\u0000")
  ) {
    throw new Error("ULC protected history scope is invalid.");
  }
  return value;
}

function storedDate(value: unknown): number {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "string"
      ? new Date(value).getTime()
      : Number.NaN;
  if (!Number.isFinite(timestamp)) {
    throw new Error("ULC training history marker timestamp is invalid.");
  }
  return timestamp;
}
