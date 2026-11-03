/**
 * ULC application-owned training attendance/registration privacy inventory.
 *
 * This privileged, internal reader does not change the existing training
 * session writer. Counts are a point-in-time SQL statement snapshot, not
 * deletion authorization or completeness proof for free-text/actor fields.
 */

export interface UlcTrainingSubjectPrivacyInspection {
  readonly organizationId: string;
  readonly subjectId: string;
  readonly attendanceRows: number;
  readonly registrationRows: number;
  readonly registrationHistoryRows: number;
}

export interface UlcTrainingSubjectPrivacySqlClient {
  unsafe(
    query: string,
    parameters?: (string | number | boolean | null)[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcTrainingSubjectPrivacyInspector {
  inspectSubjectPrivacy(
    organizationId: string,
    subjectId: string,
  ): Promise<UlcTrainingSubjectPrivacyInspection>;
}

export class PostgresUlcTrainingSubjectPrivacyInspector
  implements UlcTrainingSubjectPrivacyInspector
{
  constructor(private readonly sql: UlcTrainingSubjectPrivacySqlClient) {}

  async inspectSubjectPrivacy(
    organizationId: string,
    subjectId: string,
  ): Promise<UlcTrainingSubjectPrivacyInspection> {
    const organization = requiredIdentifier(organizationId);
    const subject = requiredIdentifier(subjectId);
    // A single SELECT guarantees a PostgreSQL statement-level consistent
    // snapshot across all three application-owned subject-linked tables.
    const rows = await this.sql.unsafe(
      `SELECT
         (SELECT count(*)::int FROM ulc_linz_training_attendance
           WHERE organization_id = $1 AND athlete_id = $2) AS attendance_rows,
         (SELECT count(*)::int FROM ulc_linz_training_registration
           WHERE organization_id = $1 AND athlete_id = $2) AS registration_rows,
         (SELECT count(*)::int FROM ulc_linz_training_registration_change
           WHERE organization_id = $1 AND athlete_id = $2) AS history_rows`,
      [organization, subject],
    );
    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error("ULC training subject privacy inventory is invalid.");
    }
    const row = rows[0];
    return Object.freeze({
      organizationId: organization,
      subjectId: subject,
      attendanceRows: count(row.attendance_rows),
      registrationRows: count(row.registration_rows),
      registrationHistoryRows: count(row.history_rows),
    });
  }
}

function requiredIdentifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 || value.length > 200 ||
    value !== value.trim() || value.includes("\u0000")
  ) {
    throw new Error("ULC training privacy scope is invalid.");
  }
  return value;
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("ULC training privacy inventory count is invalid.");
  }
  return value;
}
