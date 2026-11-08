import { describe, expect, it } from "vitest";
import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";
import {
  createUlcSelfRegistrationService,
  UlcSelfRegistrationWindowError,
  type UlcSelfRegistrationSessionStore,
} from "../worker/self-registration-service";
import { normalizeUlcRegistrationSchedule } from "../worker/registration-schedule-policy";

const ORG = "verein-policy";
const GROUP = "leistungsgruppe";
const ATHLETE = "athlete-1";
const COLLEAGUE = "athlete-2";

function viennaToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (name: string) => parts.find((part) => part.type === name)?.value ?? "";
  return value("year") + "-" + value("month") + "-" + value("day");
}

function plusDays(day: string, offset: number): string {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function isoWeekday(day: string) {
  return new Date(day + "T12:00:00Z").getUTCDay() || 7;
}

function masterdata(): AthleteMasterdataSnapshot {
  const athlete = (id: string) => ({
    id, organizationId: ORG, firstName: id, lastName: "Sprint",
    birthYear: null, notes: null, isActive: true,
  });
  return {
    trainingGroups: [{
      id: GROUP, organizationId: ORG,
      name: "Leistungsgruppe", shortName: "LG", description: null,
      isActive: true, attendanceMode: "self_registration", sortOrder: 1,
    }],
    athletes: [athlete(ATHLETE), athlete(COLLEAGUE)],
    athleteContacts: [],
    trainers: [],
    athleteGroupMemberships: [ATHLETE, COLLEAGUE].map((athleteId) => ({
      organizationId: ORG, groupId: GROUP, athleteId,
      startedOn: "2020-01-01", endedOn: null,
    })),
    trainerGroupMemberships: [],
  };
}

describe("G-04.2a self-registration policy integration", () => {
  it("filters closed weekdays and prevents both own and proxy session creation", async () => {
    const allowedDay = plusDays(viennaToday(), 7);
    const deniedDay = plusDays(allowedDay, 1);
    const schedule = normalizeUlcRegistrationSchedule({
      weekdays: [isoWeekday(allowedDay)],
      weeksAhead: 26,
      deadline: null,
      lateMode: "allow",
    });
    const calls: string[] = [];
    const store: UlcSelfRegistrationSessionStore = {
      async readSession() { return null; },
      async ensureScheduledSession(_org, _module, groupId, sessionDate) {
        calls.push("create:" + sessionDate);
        return {
          session: {
            id: "session-" + sessionDate, organizationId: ORG,
            moduleId: "kindertraining", groupId, sessionDate,
            state: "scheduled", note: null,
          },
          revision: "1", attendance: [], registrations: [],
        };
      },
      async saveRegistration(_org, sessionId, athleteId, intention, _expected, actor) {
        calls.push("save:" + sessionId);
        return {
          organizationId: ORG, sessionId, athleteId, intention,
          revision: 1, updatedByIdentityId: actor,
        };
      },
      async withRegistrationTransaction(callback) {
        calls.push("begin");
        const value = await callback(store);
        calls.push("commit");
        return value;
      },
    };
    const service = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return masterdata(); } },
      sessions: store,
      registrationCalendar: {
        async readRule(organizationId, groupId) {
          expect([organizationId, groupId]).toEqual([ORG, GROUP]);
          return { schedule, revision: 1 };
        },
        async readException() { return null; },
      },
    });

    expect(await service.listOptions(ORG, ATHLETE, deniedDay)).toEqual([]);
    const open = await service.listOptions(ORG, ATHLETE, allowedDay);
    expect(open).toHaveLength(1);
    expect(open[0]?.registrationWindow).toMatchObject({
      visible: true, mayEdit: true, reason: "open",
    });
    await expect(service.save(ORG, ATHLETE, "actor", {
      groupId: GROUP, sessionDate: deniedDay,
      intention: "attending", expectedRevision: null,
    })).rejects.toBeInstanceOf(UlcSelfRegistrationWindowError);
    await expect(service.saveProxy(ORG, ATHLETE, "actor", {
      groupId: GROUP, targetAthleteId: COLLEAGUE, sessionDate: deniedDay,
      intention: "attending", expectedRevision: null,
    })).rejects.toBeInstanceOf(UlcSelfRegistrationWindowError);
    expect(calls).toEqual([]);
    await expect(service.save(ORG, ATHLETE, "actor", {
      groupId: GROUP, sessionDate: allowedDay,
      intention: "attending", expectedRevision: null,
    })).resolves.toMatchObject({
      intention: "attending", revision: 1,
    });
    expect(calls).toEqual([
      "begin", "create:" + allowedDay, "save:session-" + allowedDay, "commit",
    ]);
  });
});
