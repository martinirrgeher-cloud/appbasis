import { describe, expect, it, vi } from "vitest";
import {
  registrationCalendarHttpResponse,
  type CalendarAuthorize,
} from "../worker/registration-calendar-http";
import {
  UlcRegistrationCalendarConflictError,
} from "../worker/registration-calendar-postgres";
import type { GeneratedPostgresApplicationRuntime } from "../worker/postgres";

const origin = "https://ulc.test";
const base = "/api/modules/athletes/registration-calendar";
const groupId = "gruppe-1";
const validSchedule = {
  weekdays: [1, 3, 5],
  weeksAhead: 6,
  deadline: { daysBefore: 1, localTime: "18:00" },
  lateMode: "block",
} as const;

function fixture(active = true) {
  const rule = vi.fn(async (_org: string, _group: string) => null);
  const saveRule = vi.fn(async (_org: string, _group: string,
    _rev: number | null, schedule: unknown) => ({ schedule, revision: 1 }));
  const exception = vi.fn(async () => null);
  const saveException = vi.fn(async (_org: string, _group: string, _date: string,
    _rev: number | null, kind: unknown) => ({ kind, revision: 1 }));
  const snapshot = vi.fn(async () => ({
    trainingGroups: [
      { id: groupId, organizationId: "verein", isActive: true,
        attendanceMode: "self_registration" },
      { id: "andere", organizationId: "foreign", isActive: true,
        attendanceMode: "self_registration" },
      { id: "kids", organizationId: "verein", isActive: true,
        attendanceMode: "trainer_roll_call" },
    ],
  }));
  const calendar = { readRule: rule, writeRule: saveRule,
    readException: exception, writeException: saveException };
  const runtime = {
    athleteMasterdata: { readOrganizationSnapshot: snapshot },
    registrationCalendar: active ? calendar : null,
  } as unknown as GeneratedPostgresApplicationRuntime;
  const actions: string[] = [];
  const authorize: CalendarAuthorize = async (_request, _runtime, _url, action) => {
    actions.push(action);
    return { organizationId: "verein", canEdit: action === "edit" };
  };
  return { runtime, authorize, actions, snapshot, rule, saveRule, exception, saveException };
}

function get(url: string) {
  return new Request(origin + url);
}
function post(url: string, body: unknown) {
  return new Request(origin + url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("G-04.2b calendar administration security contract", () => {
  it("fails closed before v17 runtime activation with zero DB reads", async () => {
    const a = fixture(false);
    const response = await registrationCalendarHttpResponse(
      get(base + "?groupId=" + groupId), a.runtime,
      new URL(origin + base + "?groupId=" + groupId), a.authorize,
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("CALENDAR_NOT_ENABLED");
    expect(a.snapshot).not.toHaveBeenCalled();
    expect(a.rule).not.toHaveBeenCalled();
    expect(a.actions).toEqual(["view"]);
  });

  it("checks view permission before exposing organization data", async () => {
    const a = fixture();
    const denied: CalendarAuthorize = async () =>
      Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    const request = get(base + "?groupId=" + groupId);
    const response = await registrationCalendarHttpResponse(
      request, a.runtime, new URL(request.url), denied,
    );
    expect(response.status).toBe(403);
    expect(a.snapshot).not.toHaveBeenCalled();
    expect(a.rule).not.toHaveBeenCalled();
  });

  it("reads only active same-organization self-registration groups", async () => {
    const a = fixture();
    const url = new URL(origin + base + "?groupId=" + groupId);
    const response = await registrationCalendarHttpResponse(
      get(url.pathname + url.search), a.runtime, url, a.authorize,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      groupId, schedule: null, revision: null,
    });
    expect(a.rule).toHaveBeenCalledWith("verein", groupId);
    for (const wrong of ["andere", "kids", "missing"]) {
      const bad = new URL(origin + base + "?groupId=" + wrong);
      const denied = await registrationCalendarHttpResponse(
        get(bad.pathname + bad.search), a.runtime, bad, a.authorize,
      );
      expect(denied.status).toBe(404);
    }
    expect(a.rule).toHaveBeenCalledTimes(1);
    expect(a.actions).toEqual(["view", "view", "view", "view"]);
  });

  it("requires edit permissions and exact fields for a CAS rule save", async () => {
    const a = fixture();
    const url = new URL(origin + base);
    const valid = { groupId, expectedRevision: null, schedule: validSchedule };
    const response = await registrationCalendarHttpResponse(
      post(base, valid), a.runtime, url, a.authorize,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).revision).toBe(1);
    expect(a.saveRule).toHaveBeenCalledWith("verein", groupId, null, validSchedule);
    expect(a.actions).toEqual(["edit"]);
    for (const invalid of [
      { ...valid, extra: "forbidden" },
      { ...valid, expectedRevision: 0 },
      { ...valid, schedule: { ...validSchedule, weekdays: [] } },
    ]) {
      const bad = await registrationCalendarHttpResponse(
        post(base, invalid), a.runtime, url, a.authorize,
      );
      expect(bad.status).toBe(400);
    }
    expect(a.saveRule).toHaveBeenCalledTimes(1);
  });

  it("allows extra/cancelled/reset with revision and refuses invalid dates", async () => {
    const a = fixture();
    const path = base + "/exception";
    for (const kind of ["extra", "cancelled", null] as const) {
      const url = new URL(origin + path);
      const response = await registrationCalendarHttpResponse(
        post(path, { groupId, sessionDate: "2026-11-18",
          kind, expectedRevision: kind === "extra" ? null : 1 }),
        a.runtime, url, a.authorize,
      );
      expect(response.status).toBe(200);
    }
    expect(a.saveException).toHaveBeenCalledTimes(3);
    const invalid = await registrationCalendarHttpResponse(
      post(path, { groupId, sessionDate: "2026-02-30", kind: "extra",
        expectedRevision: null }), a.runtime, new URL(origin + path), a.authorize,
    );
    expect(invalid.status).toBe(400);
    expect(a.saveException).toHaveBeenCalledTimes(3);
  });

  it("maps stale CAS conflicts to 409 without exposing records", async () => {
    const a = fixture();
    a.saveRule.mockRejectedValueOnce(new UlcRegistrationCalendarConflictError());
    const response = await registrationCalendarHttpResponse(
      post(base, { groupId, expectedRevision: 3, schedule: validSchedule }),
      a.runtime, new URL(origin + base), a.authorize,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CALENDAR_CONFLICT");
  });
});
