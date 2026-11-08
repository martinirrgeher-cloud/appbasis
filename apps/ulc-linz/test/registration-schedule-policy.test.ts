import { describe, expect, it } from "vitest";
import {
  evaluateUlcRegistrationSchedule,
  normalizeUlcRegistrationSchedule,
  UlcRegistrationScheduleValidationError,
} from "../worker/registration-schedule-policy";

function policy(overrides: Record<string, unknown> = {}) {
  return normalizeUlcRegistrationSchedule({
    weekdays: [1, 3, 5],
    weeksAhead: 4,
    deadline: { daysBefore: 1, localTime: "18:00" },
    lateMode: "block",
    ...overrides,
  });
}

function eligibility(sessionDate: string, overrides: Record<string, unknown> = {}) {
  return evaluateUlcRegistrationSchedule({
    schedule: policy(),
    sessionDate,
    serverNow: new Date("2026-11-05T12:00:00Z"),
    sessionState: null,
    hasExistingRegistration: false,
    calendarException: null,
    ...overrides,
  });
}

describe("G-04 registration day and deadline policy (not runtime activated)", () => {
  it("preserves all seven days and edits for groups without configured policy", () => {
    const result = eligibility("2026-11-10", { schedule: null });
    expect(result).toMatchObject({
      visible: true, scheduledWeekday: true, mayEdit: true,
      reason: "open", deadlineLocal: null,
    });
  });

  it("uses ISO Monday–Sunday weekdays and shows only configured training days", () => {
    expect(eligibility("2026-11-06")).toMatchObject({ visible: true, scheduledWeekday: true });
    expect(eligibility("2026-11-07")).toMatchObject({
      visible: false, mayEdit: false, reason: "non-training-day",
    });
    expect(eligibility("2026-11-08", { schedule: policy({ weekdays: [7] }) }))
      .toMatchObject({ visible: true, scheduledWeekday: true });
  });

  it("keeps exceptional sessions or existing registrations visible on other days", () => {
    expect(eligibility("2026-11-07", { sessionState: "scheduled" }))
      .toMatchObject({ visible: true, exceptionalTrainingDay: false,
        mayEdit: false, reason: "non-training-day" });
    expect(eligibility("2026-11-07", { hasExistingRegistration: true }))
      .toMatchObject({ visible: true, exceptionalTrainingDay: false,
        mayEdit: false, reason: "non-training-day" });
    expect(eligibility("2026-11-07", { calendarException: "extra" }))
      .toMatchObject({ visible: true, exceptionalTrainingDay: true, mayEdit: true });
    expect(eligibility("2026-11-07", { sessionState: "cancelled" }))
      .toMatchObject({ visible: true, mayEdit: false, reason: "cancelled" });
    expect(eligibility("2026-11-07", { calendarException: "cancelled" }))
      .toMatchObject({ visible: true, mayEdit: false, reason: "cancelled" });
    expect(eligibility("2026-11-06", { calendarException: "cancelled" }))
      .toMatchObject({ visible: true, scheduledWeekday: true, mayEdit: false,
        reason: "cancelled" });
  });

  it("keeps past days readable but locked when a policy is configured", () => {
    expect(eligibility("2026-11-04", { hasExistingRegistration: true }))
      .toMatchObject({ visible: true, mayEdit: false, reason: "past-training-day" });
    expect(eligibility("2026-11-04", { schedule: null }))
      .toMatchObject({ visible: true, mayEdit: true });
  });

  it("honors forward booking window by ISO week, not arbitrary day count", () => {
    expect(eligibility("2026-11-30")).toMatchObject({ reason: "open" });
    expect(eligibility("2026-12-07")).toMatchObject({
      mayEdit: false, reason: "too-far-ahead",
    });
  });

  it("closes at the defined Vienna local clock deadline", () => {
    const close = { daysBefore: 1, localTime: "18:00" };
    const schedule = policy({ deadline: close });
    expect(eligibility("2026-11-06", {
      schedule, serverNow: new Date("2026-11-05T16:59:00Z"),
    })).toMatchObject({ isLate: false, mayEdit: true });
    expect(eligibility("2026-11-06", {
      schedule, serverNow: new Date("2026-11-05T17:01:00Z"),
    })).toMatchObject({ isLate: true, mayEdit: false, reason: "deadline-passed" });
  });

  it("uses winter/summer Vienna time rather than the host timezone", () => {
    const beforeSummerCutoff = new Date("2026-07-02T15:59:00Z"); // 17:59 Vienna
    const afterSummerCutoff = new Date("2026-07-02T16:01:00Z"); // 18:01 Vienna
    const schedule = policy({ weekdays: [5], weeksAhead: 26 });
    expect(eligibility("2026-07-03", { schedule, serverNow: beforeSummerCutoff }))
      .toMatchObject({ isLate: false });
    expect(eligibility("2026-07-03", { schedule, serverNow: afterSummerCutoff }))
      .toMatchObject({ isLate: true });
  });

  it("never reopens registration during the repeated Vienna autumn hour", () => {
    const schedule = policy({
      weekdays: [1], weeksAhead: 26,
      deadline: { daysBefore: 1, localTime: "02:30" },
    });
    const values = (at: string) => eligibility("2026-10-26", {
      schedule, serverNow: new Date(at),
    });
    expect(values("2026-10-25T00:29:00Z")).toMatchObject({ isLate: false });
    expect(values("2026-10-25T00:31:00Z")).toMatchObject({ isLate: true });
    expect(values("2026-10-25T01:15:00Z")).toMatchObject({ isLate: true });
  });

  it("closes nonexistent spring-forward times at the first valid clock minute", () => {
    const schedule = policy({
      weekdays: [1], weeksAhead: 26,
      deadline: { daysBefore: 1, localTime: "02:30" },
    });
    const values = (at: string) => eligibility("2026-03-30", {
      schedule, serverNow: new Date(at),
    });
    expect(values("2026-03-29T00:59:00Z")).toMatchObject({ isLate: false });
    expect(values("2026-03-29T01:01:00Z")).toMatchObject({ isLate: true });
  });

  it("can permit late registration while still returning the late marker", () => {
    expect(eligibility("2026-11-06", {
      schedule: policy({ lateMode: "allow" }),
      serverNow: new Date("2026-11-05T19:00:00Z"),
    })).toMatchObject({ isLate: true, mayEdit: true, reason: "open" });
  });

  it("blocks edits to cancelled training regardless of late-mode settings", () => {
    expect(eligibility("2026-11-06", {
      schedule: policy({ lateMode: "allow", deadline: null }),
      sessionState: "cancelled",
    })).toMatchObject({ mayEdit: false, reason: "cancelled" });
  });

  it("rejects forged calendar overrides and preserves cancellation precedence", () => {
    expect(() => eligibility("2026-11-06", {
      calendarException: "freebie",
    })).toThrow(UlcRegistrationScheduleValidationError);
    expect(eligibility("2026-11-07", {
      calendarException: "extra", sessionState: "cancelled",
    })).toMatchObject({ visible: true, mayEdit: false, reason: "cancelled" });
  });

  it("rejects malformed, unordered, duplicate, empty or excessive policy values", () => {
    for (const overrides of [
      { weekdays: [] }, { weekdays: [1, 1, 2] },
      { weekdays: [5, 1] }, { weekdays: [0, 7] },
      { weeksAhead: -1 }, { weeksAhead: 27 },
      { lateMode: "maybe" }, { deadline: { daysBefore: 99, localTime: "12:00" } },
      { deadline: { daysBefore: 1, localTime: "25:00" } },
      { secret: "unexpected" },
    ]) {
      expect(() => policy(overrides)).toThrow(UlcRegistrationScheduleValidationError);
    }
    expect(() => eligibility("2026-02-30")).toThrow(UlcRegistrationScheduleValidationError);
  });
});
