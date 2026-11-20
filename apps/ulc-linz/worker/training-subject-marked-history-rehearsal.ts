import type {
  UlcTrainingSubjectHistoryDeletionResult,
  UlcTrainingSubjectHistorySqlClient,
  UlcTrainingSubjectHistoryTransactionClient,
} from "./training-subject-history-deletion-postgres";

/**
 * P03-E ISOLATED REHEARSAL ONLY. This is deliberately NOT exported from
 * worker/index.ts, installed in HTTP routes, cron or live retention.
 *
 * Caller/admin authorization and the canonical athletes-owner erasure MUST
 * be separately proven before this internal database primitive is used.
 * It only checks a preexisting, transactionally locked canonical DB marker.
 * A real restore and all-owner privacy completion are separate gates.
 */
export interface UlcMarkedTrainingHistoryRehearsalResult
  extends UlcTrainingSubjectHistoryDeletionResult {
  readonly markerInserted: boolean;
}

export class PostgresUlcMarkedTrainingHistoryRehearsalRepository {
  constructor(private readonly client: UlcTrainingSubjectHistoryTransactionClient) {}

  async markAndEraseOnIsolatedStore(
    organizationId: string,
    athleteId: string,
  ): Promise<UlcMarkedTrainingHistoryRehearsalResult> {
    const organization = identifier(organizationId);
    const athlete = identifier(athleteId);

    return this.client.begin(async (tx) => {
      // READ COMMITTED, plus the SAME per-subject lock used by all three
      // prospective P03-D BEFORE INSERT/UPDATE SQL triggers. No writes may
      // outrun the marker transaction or reinsert after it commits.
      await tx.unsafe("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await tx.unsafe(
        `SELECT pg_advisory_xact_lock(
           hashtextextended($1::text || chr(31) || $2::text, 0)
         )`,
        [organization, athlete],
      );

      // An app-owned marker MUST NOT be created from a caller assertion,
      // legacy note or inferred athlete ID. Prove the athletes-owner marker
      // under a PostgreSQL row lock; a missing/foreign marker blocks.
      const authority = await tx.unsafe(
        `SELECT 1 AS authorized
           FROM appbasis_athletes_deletion
          WHERE entity_type = 'athlete'
            AND entity_id = $2
            AND organization_id = $1
            AND purge_after = completed_at + interval '35 days'
          FOR SHARE`,
        [organization, athlete],
      );
      if (authority.length !== 1 || authority[0]?.authorized !== 1) {
        throw new Error("ULC training rehearsal canonical athlete deletion authority missing.");
      }

      const inserted = await tx.unsafe(
        `INSERT INTO ulc_linz_training_subject_deletion
           (organization_id, athlete_id, completed_at, purge_after)
         SELECT organization_id, entity_id, completed_at, purge_after
           FROM appbasis_athletes_deletion
          WHERE entity_type = 'athlete'
            AND entity_id = $2
            AND organization_id = $1
         ON CONFLICT (organization_id, athlete_id) DO NOTHING
         RETURNING athlete_id`,
        [organization, athlete],
      );
      if (inserted.length > 1) {
        throw new Error("ULC training rehearsal marker insertion is inconsistent.");
      }

      // Idempotent replay is permitted ONLY for the same canonical erasure.
      // A stale/forged marker with a differing timestamp is never accepted.
      const matching = await tx.unsafe(
        `SELECT count(*)::int AS matches
           FROM ulc_linz_training_subject_deletion AS app
           JOIN appbasis_athletes_deletion AS canonical
             ON canonical.entity_type = 'athlete'
            AND canonical.entity_id = app.athlete_id
            AND canonical.organization_id = app.organization_id
            AND canonical.completed_at = app.completed_at
            AND canonical.purge_after = app.purge_after
          WHERE app.organization_id = $1
            AND app.athlete_id = $2`,
        [organization, athlete],
      );
      if (matching.length !== 1 || matching[0]?.matches !== 1) {
        throw new Error("ULC training rehearsal marker is inconsistent with canonical owner.");
      }

      const deletedRegistrationHistoryRows = await removeRows(
        tx,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_registration_change
            WHERE organization_id = $1 AND athlete_id = $2
            RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, athlete],
      );
      const deletedRegistrationRows = await removeRows(
        tx,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_registration
            WHERE organization_id = $1 AND athlete_id = $2
            RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, athlete],
      );
      const deletedAttendanceRows = await removeRows(
        tx,
        `WITH removed AS (
           DELETE FROM ulc_linz_training_attendance
            WHERE organization_id = $1 AND athlete_id = $2
            RETURNING athlete_id
         ) SELECT count(*)::int AS total FROM removed`,
        [organization, athlete],
      );

      const residual = await tx.unsafe(
        `SELECT
           (SELECT count(*)::int FROM ulc_linz_training_attendance
             WHERE organization_id = $1 AND athlete_id = $2) AS attendance,
           (SELECT count(*)::int FROM ulc_linz_training_registration
             WHERE organization_id = $1 AND athlete_id = $2) AS registration,
           (SELECT count(*)::int FROM ulc_linz_training_registration_change
             WHERE organization_id = $1 AND athlete_id = $2) AS history`,
        [organization, athlete],
      );
      if (
        residual.length !== 1 ||
        residual[0]?.attendance !== 0 ||
        residual[0]?.registration !== 0 ||
        residual[0]?.history !== 0
      ) {
        throw new Error("ULC training rehearsal retains app-owned subject references.");
      }

      return Object.freeze({
        markerInserted: inserted.length === 1,
        deletedRegistrationHistoryRows,
        deletedRegistrationRows,
        deletedAttendanceRows,
      });
    });
  }
}

async function removeRows(
  tx: UlcTrainingSubjectHistorySqlClient,
  sql: string,
  parameters: string[],
): Promise<number> {
  const result = await tx.unsafe(sql, parameters);
  const total = result[0]?.total;
  if (
    result.length !== 1 ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new Error("ULC training rehearsal erasure count is invalid.");
  }
  return total;
}

function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 || value.length > 200 ||
    value !== value.trim() ||
    value.includes("\u0000")
  ) {
    throw new Error("ULC training rehearsal subject scope is invalid.");
  }
  return value;
}
