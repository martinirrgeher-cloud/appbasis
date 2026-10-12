import type {
  UlcTrainingAttendanceStatus,
  UlcTrainingModule,
  UlcTrainingSessionState,
} from "./training-session-domain";

type SqlParameter = string | number | boolean | null;

export interface UlcTrainingPlanAttendanceSqlClient {
  unsafe(
    query: string,
    parameters?: SqlParameter[],
  ): PromiseLike<readonly Record<string, unknown>[]>;
}

export interface UlcTrainingPlanAttendanceEntry {
  readonly sessionDate: string;
  readonly moduleId: UlcTrainingModule;
  readonly groupId: string;
  readonly groupName: string;
  readonly groupShortName: string | null;
  readonly sessionState: UlcTrainingSessionState;
  readonly status: UlcTrainingAttendanceStatus;
}

export interface UlcTrainingPlanAttendanceReader {
  listForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly UlcTrainingPlanAttendanceEntry[]>;
}

export class PostgresUlcTrainingPlanAttendanceReader
  implements UlcTrainingPlanAttendanceReader
{
  readonly #sql: UlcTrainingPlanAttendanceSqlClient;

  constructor(sql: UlcTrainingPlanAttendanceSqlClient) {
    this.#sql = sql;
  }

  async listForSubjectDateRange(
    organizationId: string,
    subjectId: string,
    fromDate: string,
    toDate: string,
  ): Promise<readonly UlcTrainingPlanAttendanceEntry[]> {
    const normalizedOrganizationId = requiredIdentifier(
      organizationId,
      "Organization id",
    );
    const normalizedSubjectId = requiredIdentifier(subjectId, "Subject id");
    const normalizedFromDate = requiredDate(fromDate, "From date");
    const normalizedToDate = requiredDate(toDate, "To date");
    assertDateRange(normalizedFromDate, normalizedToDate);

    const rows = await this.#sql.unsafe(
      `SELECT session.session_date::text AS session_date,
              session.module_id,
              session.group_id,
              training_group.name AS group_name,
              training_group.short_name AS group_short_name,
              session.state AS session_state,
              attendance.status
         FROM ulc_linz_training_attendance AS attendance
         JOIN ulc_linz_training_session AS session
           ON session.organization_id = attendance.organization_id
          AND session.id = attendance.session_id
         LEFT JOIN appbasis_training_group AS training_group
           ON training_group.organization_id = session.organization_id
          AND training_group.id = session.group_id
        WHERE attendance.organization_id = $1
          AND attendance.athlete_id = $2
          AND session.session_date BETWEEN $3::date AND $4::date
        ORDER BY session.session_date ASC,
                 session.module_id ASC,
                 session.group_id ASC,
                 session.id ASC`,
      [
        normalizedOrganizationId,
        normalizedSubjectId,
        normalizedFromDate,
        normalizedToDate,
      ],
    );

    const entries = rows.map((row) =>
      attendanceEntryFromRow(row),
    );
    return Object.freeze(entries);
  }
}

function attendanceEntryFromRow(
  row: Record<string, unknown>,
): UlcTrainingPlanAttendanceEntry {
  return Object.freeze({
    sessionDate: requiredDate(row.session_date, "Session date"),
    moduleId: requiredModule(row.module_id),
    groupId: requiredIdentifier(row.group_id, "Training group id"),
    groupName: requiredText(row.group_name, "Training group name", 100),
    groupShortName: optionalText(
      row.group_short_name,
      "Training group short name",
      20,
    ),
    sessionState: requiredSessionState(row.session_state),
    status: requiredAttendanceStatus(row.status),
  });
}

function requiredModule(value: unknown): UlcTrainingModule {
  if (value !== "kindertraining" && value !== "u12" && value !== "u14") {
    blocked("Training module is invalid.");
  }
  return value;
}

function requiredSessionState(value: unknown): UlcTrainingSessionState {
  if (value !== "scheduled" && value !== "cancelled") {
    blocked("Training session state is invalid.");
  }
  return value;
}

function requiredAttendanceStatus(
  value: unknown,
): UlcTrainingAttendanceStatus {
  if (
    value !== "open" &&
    value !== "present" &&
    value !== "excused" &&
    value !== "absent"
  ) {
    blocked("Training attendance status is invalid.");
  }
  return value;
}

function requiredIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 200 ||
    value.trim() !== value
  ) {
    blocked(`${label} is invalid.`);
  }
  return value;
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    blocked(`${label} is invalid.`);
  }
  return value;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === null) return null;
  return requiredText(value, label, maximumLength);
}

function requiredDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    blocked(`${label} is invalid.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    blocked(`${label} is invalid.`);
  }
  return value;
}

function assertDateRange(fromDate: string, toDate: string): void {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  const spanDays = Math.floor((to - from) / 86_400_000);
  if (spanDays < 0 || spanDays > 31) {
    blocked("Training attendance date range is invalid.");
  }
}

function blocked(message: string): never {
  throw new Error(message);
}
