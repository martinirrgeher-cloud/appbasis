/**
 * PRIVILEGED PREPARATION ONLY: app-owned athlete attendance and registration
 * history erasure on a proven FROZEN, isolated data store.
 *
 * The current ULC runtime does NOT install a subject-deletion tombstone or
 * guarantee that existing registration/attendance writers cannot re-create
 * rows. Consequently this repository must NOT be wired into live retention,
 * HTTP, background jobs, a public endpoint or a promoted restore.
 *
 * The application coordinator separately verifies the canonical athletes
 * deletion marker and active admin authority before calling this primitive.
 */
type SqlParameter = string | number | boolean | null;

export interface UlcTrainingSubjectHistorySqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcTrainingSubjectHistoryTransactionClient
  extends UlcTrainingSubjectHistorySqlClient {
  begin<T>(
    callback: (transaction: UlcTrainingSubjectHistorySqlClient) => Promise<T>,
  ): Promise<T>;
}

export interface UlcTrainingSubjectHistoryDeletionResult {
  readonly deletedAttendanceRows: number;
  readonly deletedRegistrationRows: number;
  readonly deletedRegistrationHistoryRows: number;
}

/**
 * Owner-local erasure only, never an app-wide deletion certificate.
 * The entire SQL transaction rolls back when any stage or residual check fails.
 */
export interface UlcTrainingSubjectFrozenHistoryDeletionRepository {
  eraseSubjectHistoryOnFrozenStore(
    organizationId: string,
    subjectId: string,
  ): Promise<UlcTrainingSubjectHistoryDeletionResult>;
}

export class PostgresUlcTrainingSubjectFrozenHistoryRepository
  implements UlcTrainingSubjectFrozenHistoryDeletionRepository
{
  constructor(private readonly client: UlcTrainingSubjectHistoryTransactionClient) {}

  async eraseSubjectHistoryOnFrozenStore(
    organizationId: string,
    subjectId: string,
  ): Promise<UlcTrainingSubjectHistoryDeletionResult> {
    const organization = requiredIdentifier(organizationId);
    const subject = requiredIdentifier(subjectId);
    return this.client.begin(async (transaction) => {
      // SERIALIZABLE cannot replace the external writer freeze. It only
      // rejects overlapping SQL anomalies while this transaction executes.
      await transaction.unsafe("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

      // Registration change history is privacy-bearing even after a current
      // registration was removed. Never remove session roots or other users.
      const deletedRegistrationHistoryRows = await deleteRows(
        transaction,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_registration_change
           WHERE organization_id = $1 AND athlete_id = $2
           RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, subject],
      );
      const deletedRegistrationRows = await deleteRows(
        transaction,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_registration
           WHERE organization_id = $1 AND athlete_id = $2
           RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, subject],
      );
      const deletedAttendanceRows = await deleteRows(
        transaction,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_attendance
           WHERE organization_id = $1 AND athlete_id = $2
           RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, subject],
      );

      const residual = await transaction.unsafe(
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
        residual.length !== 1 ||
        residual[0]?.attendance !== 0 ||
        residual[0]?.registration !== 0 ||
        residual[0]?.history !== 0
      ) {
        throw new Error("ULC training history still contains subject references.");
      }
      return Object.freeze({
        deletedAttendanceRows,
        deletedRegistrationRows,
        deletedRegistrationHistoryRows,
      });
    });
  }
}

async function deleteRows(
  transaction: UlcTrainingSubjectHistorySqlClient,
  query: string,
  parameters: SqlParameter[],
): Promise<number> {
  const rows = await transaction.unsafe(query, parameters);
  if (
    rows.length !== 1 ||
    typeof rows[0]?.total !== "number" ||
    !Number.isSafeInteger(rows[0].total) ||
    rows[0].total < 0
  ) {
    throw new Error("ULC training history deletion count is invalid.");
  }
  return rows[0].total;
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 || value.length > 200 ||
    value !== value.trim() ||
    value.includes("\u0000")
  ) {
    throw new Error("ULC training history deletion scope is invalid.");
  }
  return value;
}
