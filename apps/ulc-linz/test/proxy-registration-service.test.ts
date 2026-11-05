import { describe, expect, it } from "vitest";
import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";
import {
  createUlcSelfRegistrationService,
  UlcSelfRegistrationModeError,
  UlcSelfRegistrationNotFoundError,
} from "../worker/self-registration-service";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import type { UlcTrainingSessionSnapshot } from "../worker/training-session-postgres";

const ORG = "verein-1";
const GROUP = "performance-1";
const ACTOR = "athlete-actor";
const TARGET = "athlete-target";
const DATE = "2026-11-04";
const IDENTITY = "identity-actor";

function fixture(): AthleteMasterdataSnapshot {
  const person = (id: string, isActive = true, org = ORG) => ({
    id,
    organizationId: org,
    firstName: id,
    lastName: "Sport",
    birthYear: 2010,
    notes: null,
    isActive,
  });
  const membership = (athleteId: string, groupId = GROUP, endedOn: string | null = null) => ({
    organizationId: ORG, athleteId, groupId, startedOn: "2026-01-01", endedOn,
  });
  return {
    trainingGroups: [
      { id: GROUP, organizationId: ORG, name: "Leistungsgruppe",
        shortName: "LG", description: null, attendanceMode: "self_registration",
        isActive: true, sortOrder: 1 },
      { id: "other", organizationId: ORG, name: "Andere",
        shortName: null, description: null, attendanceMode: "self_registration",
        isActive: true, sortOrder: 2 },
      { id: "trainer", organizationId: ORG, name: "Trainer",
        shortName: null, description: null, attendanceMode: "trainer_roll_call",
        isActive: true, sortOrder: 3 },
    ],
    athletes: [
      person(ACTOR), person(TARGET), person("athlete-expired"),
      person("athlete-inactive", false), person("athlete-other"),
      person("athlete-foreign", true, "other-org"),
    ],
    athleteGroupMemberships: [
      membership(ACTOR), membership(TARGET), membership("athlete-expired", GROUP, "2026-10-31"),
      membership("athlete-inactive"), membership("athlete-other", "other"),
      membership("athlete-foreign"),
    ],
    trainers: [],
    trainerGroupMemberships: [],
    athleteContacts: [],
  };
}

function storedSession(
  state: "scheduled" | "cancelled" = "scheduled",
): UlcTrainingSessionSnapshot {
  return {
    session: {
      id: "session-1",
      organizationId: ORG,
      moduleId: "kindertraining",
      groupId: GROUP,
      sessionDate: DATE,
      state,
      note: null,
    },
    revision: "1",
    attendance: [],
    registrations: [{
      organizationId: ORG, sessionId: "session-1",
      athleteId: TARGET, intention: "maybe", revision: 3,
      updatedByIdentityId: "identity-target",
    }],
  };
}

describe("A02.2 athlete colleague proxy registration", () => {
  it("lists only active same-group colleagues on the requested training date", async () => {
    const service = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return fixture(); } },
      sessions: {
        async readSession(org, module, group, date) {
          expect([org, module, group, date]).toEqual([ORG, "kindertraining", GROUP, DATE]);
          return storedSession();
        },
        async ensureScheduledSession() { throw new Error("read must not write"); },
        async saveRegistration() { throw new Error("read must not write"); },
      },
    });
    await expect(service.listProxyOptions(ORG, ACTOR, GROUP, DATE)).resolves.toEqual({
      group: { id: GROUP, name: "Leistungsgruppe", shortName: "LG" },
      sessionDate: DATE,
      sessionState: "scheduled",
      options: [{
        athlete: { id: TARGET, firstName: TARGET, lastName: "Sport" },
        intention: "maybe",
        revision: 3,
      }],
    });
  });

  it("writes a colleague revision under the real actor identity and actor athlete scope", async () => {
    const calls: unknown[] = [];
    const service = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return fixture(); } },
      sessions: {
        async readSession() { return storedSession(); },
        async ensureScheduledSession() { return storedSession(); },
        async saveRegistration(...args) {
          calls.push(args);
          return {
            organizationId: ORG, sessionId: "session-1", athleteId: TARGET,
            intention: "attending" as const, revision: 4,
            updatedByIdentityId: IDENTITY,
          };
        },
      },
    });
    await expect(service.saveProxy(ORG, ACTOR, IDENTITY, {
      groupId: GROUP, targetAthleteId: TARGET, sessionDate: DATE,
      intention: "attending", expectedRevision: 3,
    })).resolves.toEqual({
      athlete: { id: TARGET, firstName: TARGET, lastName: "Sport" },
      intention: "attending", revision: 4,
    });
    expect(calls).toEqual([[
      ORG, "session-1", TARGET, "attending", 3, IDENTITY, ACTOR, undefined,
    ]]);
  });

  it("rejects expired, inactive, foreign, self and cross-group targets before DB writes", async () => {
    let writes = 0;
    const service = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return fixture(); } },
      sessions: {
        async readSession() { return null; },
        async ensureScheduledSession() { writes++; throw new Error("should never write"); },
        async saveRegistration() { writes++; throw new Error("should never write"); },
      },
    });
    for (const targetAthleteId of [
      ACTOR, "athlete-expired", "athlete-inactive", "athlete-other",
      "athlete-foreign", "does-not-exist",
    ]) {
      await expect(service.saveProxy(ORG, ACTOR, IDENTITY, {
        groupId: GROUP, targetAthleteId, sessionDate: DATE,
        intention: "attending", expectedRevision: null,
      })).rejects.toBeInstanceOf(UlcSelfRegistrationNotFoundError);
    }
    await expect(service.saveProxy(ORG, ACTOR, IDENTITY, {
      groupId: "trainer", targetAthleteId: TARGET, sessionDate: DATE,
      intention: "attending", expectedRevision: null,
    })).rejects.toBeInstanceOf(UlcSelfRegistrationNotFoundError);
    expect(writes).toBe(0);
  });

  it("fails closed if the actor's membership expired or a session belongs to another group", async () => {
    const original = fixture();
    const expired: AthleteMasterdataSnapshot = {
      ...original,
      athleteGroupMemberships: original.athleteGroupMemberships.map((member) =>
        member.athleteId === ACTOR ? { ...member, endedOn: "2026-11-03" } : member),
    };
    const service = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return expired; } },
      sessions: {
        async readSession() { return null; },
        async ensureScheduledSession() { throw new Error("should not write"); },
        async saveRegistration() { throw new Error("should not write"); },
      },
    });
    await expect(service.listProxyOptions(ORG, ACTOR, GROUP, DATE))
      .rejects.toBeInstanceOf(UlcSelfRegistrationNotFoundError);
    const wrongSession = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return original; } },
      sessions: {
        async readSession() {
          return { ...storedSession(), session: { ...storedSession().session, groupId: "other" } };
        },
        async ensureScheduledSession() { throw new Error("not used"); },
        async saveRegistration() { throw new Error("not used"); },
      },
    });
    await expect(wrongSession.listProxyOptions(ORG, ACTOR, GROUP, DATE))
      .rejects.toBeInstanceOf(UlcTrainingValidationError);
  });

  it("never changes a cancelled session, even if the target is eligible", async () => {
    const service = createUlcSelfRegistrationService({
      masterdata: { async readOrganizationSnapshot() { return fixture(); } },
      sessions: {
        async readSession() { return storedSession("cancelled"); },
        async ensureScheduledSession() { throw new Error("cancelled sessions cannot be scheduled"); },
        async saveRegistration() { throw new Error("never save cancelled"); },
      },
    });
    await expect(service.listProxyOptions(ORG, ACTOR, GROUP, DATE))
      .resolves.toMatchObject({ sessionState: "cancelled" });
    await expect(service.saveProxy(ORG, ACTOR, IDENTITY, {
      groupId: GROUP, targetAthleteId: TARGET, sessionDate: DATE,
      intention: "maybe", expectedRevision: 3,
    })).rejects.toThrow("cancelled sessions");
  });
});
