import { UlcTrainingValidationError, type UlcTrainingModule } from "./training-session-domain";

type Parameter = string | number | boolean | null;
export interface UlcU12StatisticsSqlClient {
  unsafe(query: string, parameters?: Parameter[]): PromiseLike<readonly Record<string, unknown>[]>;
}
export interface UlcU12StatisticsAthleteName {
  readonly athleteId: string;
  readonly firstName: string;
  readonly lastName: string;
}
export interface UlcU12CategoryCount {
  readonly code: string;
  readonly label: string;
  readonly trainings: number;
  readonly assignments: number;
}
export interface UlcU12AthleteStatistics {
  readonly athleteId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly attended: number;
  readonly categories: readonly Readonly<{ code: string; label: string; count: number }>[];
}
export interface UlcU12TrainingStatistics {
  readonly date: string;
  readonly presentCount: number;
  readonly registeredCount: number;
  readonly categoryCount: number;
}
export interface UlcU12StatisticsReport {
  readonly from: string;
  readonly to: string;
  readonly trainings: readonly UlcU12TrainingStatistics[];
  readonly athletes: readonly UlcU12AthleteStatistics[];
  readonly categories: readonly UlcU12CategoryCount[];
  readonly summary: Readonly<{
    trainings: number;
    attendance: number;
    categories: number;
  }>;
}

const identifier = (value: string) => {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 ||
      value.trim() !== value) throw new UlcTrainingValidationError("Invalid U12 statistics scope.");
  return value;
};
export function u12StatisticsIsoDate(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UlcTrainingValidationError("Invalid statistics date.");
  }
  const date = new Date(value + "T12:00:00.000Z");
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new UlcTrainingValidationError("Invalid calendar date.");
  }
  return value;
}
export function validateU12StatisticsDateRange(from: string, to: string) {
  const start = u12StatisticsIsoDate(from);
  const end = u12StatisticsIsoDate(to);
  const days = (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) / 86400000;
  if (days < 0 || days > 731) {
    throw new UlcTrainingValidationError("Statistics range must be at most two years.");
  }
  return { from: start, to: end };
}

interface RawRow {
  session_id?: unknown;
  session_date?: unknown;
  content_titles?: unknown;
  content_items?: unknown;
  athlete_id?: unknown;
  status?: unknown;
  content_slots?: unknown;
}

export function aggregateU12Statistics(
  rows: readonly RawRow[],
  roster: readonly UlcU12StatisticsAthleteName[],
  from: string,
  to: string,
): UlcU12StatisticsReport {
  validateU12StatisticsDateRange(from, to);
  const athletesById = new Map<string, { athleteId: string; firstName: string; lastName: string;
    attended: number; categories: Map<string, number> }>();
  for (const athlete of roster) {
    if (athletesById.has(athlete.athleteId)) continue;
    athletesById.set(athlete.athleteId, {
      athleteId: identifier(athlete.athleteId),
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      attended: 0, categories: new Map(),
    });
  }
  const sessions = new Map<string, { date: string; present: Set<string>; registered: Set<string>;
    categories: Set<string> }>();
  const categoryTotals = new Map<string, { code: string; label: string; trainings: Set<string>; assignments: number }>();
  for (const row of rows) {
    const sessionId = identifier(row.session_id as string);
    const date = u12StatisticsIsoDate(row.session_date as string);
    if (date < from || date > to) throw new UlcTrainingValidationError("Out-of-range U12 training row.");
    const titles = row.content_titles;
    const items = row.content_items;
    if (!Array.isArray(titles) || titles.length > 5 ||
        !Array.isArray(items) || items.length > 5 ||
        (items.length !== 0 && items.length !== titles.length)) {
      throw new UlcTrainingValidationError("Malformed stored U12 category metadata.");
    }
    let session = sessions.get(sessionId);
    if (!session) {
      session = { date, present: new Set(), registered: new Set(), categories: new Set() };
      sessions.set(sessionId, session);
    } else if (session.date !== date) {
      throw new UlcTrainingValidationError("Inconsistent U12 session date.");
    }
    const selectedCategories = new Map<number, string>();
    for (const [index, entry] of items.entries()) {
      const meta = entry as Record<string, unknown> | null;
      const code = meta?.code;
      const title = titles[index];
      if (!code) continue; // Legacy free text is not a standard category.
      if (typeof code !== "string" || !/^[a-z][a-z0-9_]{0,79}$/.test(code) ||
          typeof title !== "string" || !title.trim()) {
        throw new UlcTrainingValidationError("Invalid stored U12 category.");
      }
      if (!categoryTotals.has(code)) {
        categoryTotals.set(code, { code, label: title, trainings: new Set(), assignments: 0 });
      }
      categoryTotals.get(code)!.trainings.add(sessionId);
      selectedCategories.set(index + 1, code);
      session.categories.add(code);
    }
    if (row.athlete_id === null || row.athlete_id === undefined) continue;
    const athleteId = identifier(row.athlete_id as string);
    const athlete = athletesById.get(athleteId);
    // Scope data strictly to authorized historical/current U12 group membership.
    if (!athlete) continue;
    if (!["present", "absent", "excused", "open"].includes(row.status as string)) {
      throw new UlcTrainingValidationError("Invalid stored U12 attendance status.");
    }
    if (session.registered.has(athleteId)) throw new UlcTrainingValidationError("Duplicate U12 attendance.");
    session.registered.add(athleteId);
    if (row.status !== "present") continue;
    athlete.attended += 1;
    session.present.add(athleteId);
    const slots = row.content_slots;
    if (!Array.isArray(slots)) throw new UlcTrainingValidationError("Invalid U12 assignments.");
    const uniqueSlots = new Set<number>();
    for (const slot of slots) {
      if (!Number.isInteger(slot) || slot < 1 || slot > 5 || uniqueSlots.has(slot)) {
        throw new UlcTrainingValidationError("Invalid U12 content assignment.");
      }
      uniqueSlots.add(slot);
      const code = selectedCategories.get(slot);
      if (!code) continue; // Legacy unclassified content is not counted as a category.
      athlete.categories.set(code, (athlete.categories.get(code) ?? 0) + 1);
      categoryTotals.get(code)!.assignments += 1;
    }
  }
  const categoryLabel = (code: string) => categoryTotals.get(code)?.label ?? code;
  const trainings = [...sessions.values()].map((session) => Object.freeze({
    date: session.date,
    presentCount: session.present.size,
    registeredCount: session.registered.size,
    categoryCount: session.categories.size,
  })).sort((a,b) => b.date.localeCompare(a.date));
  const athletes = [...athletesById.values()].map((athlete) => Object.freeze({
    athleteId: athlete.athleteId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    attended: athlete.attended,
    categories: Object.freeze([...athlete.categories].map(([code,count]) =>
      Object.freeze({ code, label: categoryLabel(code), count }))
      .sort((a,b) => b.count-a.count || a.label.localeCompare(b.label, "de"))),
  })).sort((a,b) => a.attended-b.attended ||
    a.lastName.localeCompare(b.lastName, "de") ||
    a.firstName.localeCompare(b.firstName, "de"));
  const categories = [...categoryTotals.values()].map((entry) => Object.freeze({
    code: entry.code, label: entry.label, trainings: entry.trainings.size,
    assignments: entry.assignments,
  })).sort((a,b) => b.trainings-a.trainings || a.label.localeCompare(b.label, "de"));
  return Object.freeze({
    from, to,
    trainings: Object.freeze(trainings),
    athletes: Object.freeze(athletes),
    categories: Object.freeze(categories),
    summary: Object.freeze({
      trainings: trainings.length,
      attendance: trainings.reduce((sum,session)=>sum+session.presentCount,0),
      categories: categories.length,
    }),
  });
}

export class PostgresUlcU12StatisticsRepository {
  constructor(
    private readonly sql: UlcU12StatisticsSqlClient,
    private readonly moduleId: UlcTrainingModule = "u12",
  ) {}
  async read(
    organizationId: string,
    groupId: string,
    from: string,
    to: string,
    roster: readonly UlcU12StatisticsAthleteName[],
  ): Promise<UlcU12StatisticsReport> {
    const scope = [identifier(organizationId), identifier(groupId)];
    const interval = validateU12StatisticsDateRange(from, to);
    const areaPredicate = this.moduleId === "u12" ? "'u12'" : "$5";
    const rows = await this.sql.unsafe(
      `SELECT session.id AS session_id,
              session.session_date::text AS session_date,
              session.training_content_titles AS content_titles,
              session.training_content_items AS content_items,
              attendance.athlete_id,
              attendance.status,
              attendance.training_content_slots AS content_slots
         FROM ulc_linz_training_session AS session
         LEFT JOIN ulc_linz_training_attendance AS attendance
           ON attendance.organization_id = session.organization_id
          AND attendance.session_id = session.id
        WHERE session.organization_id = $1
          AND session.group_id = $2
          AND session.module_id = ${areaPredicate}
          AND session.state = 'scheduled'
          AND session.session_date >= $3::date
          AND session.session_date <= $4::date
        ORDER BY session.session_date DESC, session.id, attendance.athlete_id`,
      [...scope, interval.from, interval.to,
        ...(this.moduleId === "u12" ? [] : [this.moduleId])],
    );
    return aggregateU12Statistics(rows, roster, interval.from, interval.to);
  }
}
