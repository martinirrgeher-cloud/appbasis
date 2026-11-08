import {
  normalizeUlcRegistrationSchedule,
  UlcRegistrationScheduleValidationError,
} from "./registration-schedule-policy";
import {
  UlcRegistrationCalendarConflictError,
  UlcRegistrationCalendarDataError,
} from "./registration-calendar-postgres";
import type { GeneratedPostgresApplicationRuntime } from "./postgres";

const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

type CalendarAccess = Readonly<{ organizationId: string; canEdit: boolean }>;
export type CalendarAuthorize = (
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  action: "view" | "edit",
) => Promise<Response | CalendarAccess>;

class InvalidCalendarRequest extends Error {}

function fail(message: string): never {
  throw new InvalidCalendarRequest(message);
}

function identifier(input: unknown): string {
  if (typeof input !== "string" || !input || input.length > 200 ||
      input !== input.trim()) fail("Invalid group identifier.");
  return input;
}

function validDay(input: unknown): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    fail("Invalid calendar date.");
  }
  const utc = new Date(input + "T12:00:00.000Z");
  if (!Number.isFinite(utc.valueOf()) ||
      utc.toISOString().slice(0, 10) !== input) fail("Invalid calendar date.");
  return input;
}

function revision(input: unknown): number | null {
  if (input === null) return null;
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 1) {
    fail("Invalid calendar revision.");
  }
  return input;
}

function exact(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    fail("Invalid calendar payload.");
  }
  const data = value as Record<string, unknown>;
  if (fields.length !== Object.keys(data).length ||
      fields.some((field) => !Object.hasOwn(data, field))) {
    fail("Unexpected calendar payload fields.");
  }
  return data;
}

async function bodyOf(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (type !== "application/json") fail("JSON required.");
  if (Number(request.headers.get("content-length") ?? 0) > 4096) {
    fail("Calendar payload too large.");
  }
  const body = await request.text();
  if (body.length > 4096) fail("Calendar payload too large.");
  try {
    return JSON.parse(body);
  } catch {
    return fail("Invalid calendar JSON.");
  }
}

function query(url: URL, exceptional: boolean) {
  const fields = exceptional ? ["groupId", "sessionDate"] : ["groupId"];
  if (url.searchParams.size !== fields.length ||
      fields.some((field) => url.searchParams.getAll(field).length !== 1)) {
    fail("Invalid calendar query.");
  }
  return {
    groupId: identifier(url.searchParams.get("groupId")),
    ...(exceptional ? { sessionDate: validDay(url.searchParams.get("sessionDate")) } : {}),
  };
}

function error(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: HEADERS });
}

/**
 * G-04.2b: existing athletes:view/edit is the sole gate for administration.
 * Trainer-only special-day management requires a separate reviewed scope.
 * The feature is FAIL-CLOSED until the v17 migration is separately approved.
 */
export async function registrationCalendarHttpResponse(
  request: Request,
  runtime: GeneratedPostgresApplicationRuntime,
  url: URL,
  authorize: CalendarAuthorize,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return error(405, "METHOD_NOT_ALLOWED", "Calendar accepts GET and POST.");
  }
  const exceptional = url.pathname === "/api/modules/athletes/registration-calendar/exception";
  if (!exceptional && url.pathname !== "/api/modules/athletes/registration-calendar") {
    return error(404, "CALENDAR_NOT_FOUND", "Calendar endpoint not found.");
  }
  // Authorization must precede any configuration or group-information lookup.
  const access = await authorize(
    request, runtime, url, request.method === "GET" ? "view" : "edit",
  );
  if (access instanceof Response) return access;
  if (!runtime.registrationCalendar) {
    return error(503, "CALENDAR_NOT_ENABLED", "Calendar not enabled on this database.");
  }
  const calendar = runtime.registrationCalendar;
  try {
    const data: Record<string, unknown> = request.method === "GET"
      ? query(url, exceptional)
      : exact(await bodyOf(request), exceptional
        ? ["groupId", "sessionDate", "expectedRevision", "kind"]
        : ["groupId", "expectedRevision", "schedule"]);
    const groupId = identifier(data.groupId);
    const organizationId = access.organizationId;
    const snapshot = await runtime.athleteMasterdata.readOrganizationSnapshot(organizationId);
    const group = snapshot.trainingGroups.find((item) =>
      item.id === groupId && item.organizationId === organizationId &&
      item.isActive === true &&
      (item.attendanceMode === "self_registration" ||
       item.attendanceMode === "trainer_roll_call"));
    if (!group) {
      return error(404, "CALENDAR_GROUP_NOT_FOUND", "Registration group not available.");
    }
    if (request.method === "GET") {
      if (exceptional) {
        const sessionDate = validDay(data.sessionDate);
        const found = await calendar.readException(organizationId, groupId, sessionDate);
        return Response.json({
          groupId, sessionDate, kind: found?.kind ?? null,
          revision: found?.revision ?? null,
        }, { headers: HEADERS });
      }
      const found = await calendar.readRule(organizationId, groupId);
      return Response.json({
        groupId, schedule: found?.schedule ?? null,
        revision: found?.revision ?? null,
      }, { headers: HEADERS });
    }
    if (url.searchParams.size !== 0) fail("Calendar write must not include query parameters.");
    const expected = revision(data.expectedRevision);
    if (exceptional) {
      const sessionDate = validDay(data.sessionDate);
      const kind = data.kind;
      if (kind !== null && kind !== "extra" && kind !== "cancelled") {
        fail("Invalid calendar exception kind.");
      }
      const saved = await calendar.writeException(
        organizationId, groupId, sessionDate, expected, kind,
      );
      return Response.json({ groupId, sessionDate, ...saved }, { headers: HEADERS });
    }
    const schedule = normalizeUlcRegistrationSchedule(data.schedule);
    const saved = await calendar.writeRule(organizationId, groupId, expected, schedule);
    return Response.json({ groupId, ...saved }, { headers: HEADERS });
  } catch (cause) {
    if (cause instanceof InvalidCalendarRequest ||
        cause instanceof UlcRegistrationScheduleValidationError ||
        cause instanceof UlcRegistrationCalendarDataError) {
      return error(400, "INVALID_CALENDAR_REQUEST", "Calendar input is invalid.");
    }
    if (cause instanceof UlcRegistrationCalendarConflictError) {
      return error(409, "CALENDAR_CONFLICT", "Calendar was changed; reload before saving.");
    }
    throw cause;
  }
}
