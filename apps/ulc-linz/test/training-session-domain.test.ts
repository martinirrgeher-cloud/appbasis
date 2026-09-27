import { describe, expect, it } from "vitest";

import {
  UlcTrainingValidationError,
  createUlcTrainingAttendance,
  createUlcTrainingSession,
  normalizeUlcTrainingAttendanceSet,
} from "../worker/training-session-domain";

describe("ULC training session domain", () => {
  it("normalizes the shared Kindertraining/U12/U14 session contract", () => {
    expect(
      createUlcTrainingSession(
        {
          moduleId: "kindertraining",
          groupId: "group-1",
          sessionDate: "2026-09-27",
          note: " Halle ",
        },
        { id: "session-1", organizationId: "verein-1" },
      ),
    ).toEqual({
      id: "session-1",
      organizationId: "verein-1",
      moduleId: "kindertraining",
      groupId: "group-1",
      sessionDate: "2026-09-27",
      state: "scheduled",
      note: "Halle",
    });
  });

  it("supports every persisted attendance state from the accepted legacy contract", () => {
    for (const status of ["open", "present", "excused", "absent"] as const) {
      expect(
        createUlcTrainingAttendance({
          organizationId: "verein-1",
          sessionId: "session-1",
          athleteId: `athlete-${status}`,
          status,
        }).status,
      ).toBe(status);
    }
  });

  it("rejects unsupported modules, dates, states and oversized notes", () => {
    expect(() =>
      createUlcTrainingSession(
        {
          moduleId: "performance" as "kindertraining",
          groupId: "group-1",
          sessionDate: "2026-02-31",
        },
        { id: "session-1", organizationId: "verein-1" },
      ),
    ).toThrow(UlcTrainingValidationError);

    expect(() =>
      createUlcTrainingSession(
        {
          moduleId: "u12",
          groupId: "group-1",
          sessionDate: "2026-09-27",
          state: "done" as "scheduled",
        },
        { id: "session-1", organizationId: "verein-1" },
      ),
    ).toThrow(UlcTrainingValidationError);

    expect(() =>
      createUlcTrainingSession(
        {
          moduleId: "u14",
          groupId: "group-1",
          sessionDate: "2026-09-27",
          note: "x".repeat(3001),
        },
        { id: "session-1", organizationId: "verein-1" },
      ),
    ).toThrow(UlcTrainingValidationError);
  });

  it("rejects duplicate athletes in one attendance snapshot", () => {
    expect(() =>
      normalizeUlcTrainingAttendanceSet([
        {
          organizationId: "verein-1",
          sessionId: "session-1",
          athleteId: "athlete-1",
          status: "present",
        },
        {
          organizationId: "verein-1",
          sessionId: "session-1",
          athleteId: "athlete-1",
          status: "absent",
        },
      ]),
    ).toThrow(/duplicate athlete/);
  });
});
