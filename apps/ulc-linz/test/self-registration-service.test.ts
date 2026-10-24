import { describe, expect, it } from "vitest";

import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";

import {
  createUlcSelfRegistrationService,
  UlcSelfRegistrationModeError,
  UlcSelfRegistrationNotFoundError,
} from "../worker/self-registration-service";
import type {
  UlcTrainingRegistration,
} from "../worker/training-session-domain";
import type {
  UlcTrainingSessionSnapshot,
} from "../worker/training-session-postgres";

const ORGANIZATION_ID = "verein-1";
const ATHLETE_ID = "athlete-1";
const IDENTITY_ID = "identity-athlete-1";
const SELF_GROUP = "group-self";
const TRAINER_GROUP = "group-trainer";
const DATE = "2026-10-24";

function masterdata(): AthleteMasterdataSnapshot {
  return {
    trainingGroups: [
      {
        id: SELF_GROUP,
        organizationId: ORGANIZATION_ID,
        name: "U16 Selbst",
        shortName: "U16",
        description: null,
        attendanceMode: "self_registration",
        isActive: true,
        sortOrder: 10,
      },
      {
        id: TRAINER_GROUP,
        organizationId: ORGANIZATION_ID,
        name: "U18 Trainer",
        shortName: "U18",
        description: null,
        attendanceMode: "trainer_roll_call",
        isActive: true,
        sortOrder: 20,
      },
    ],
    athletes: [
      {
        id: ATHLETE_ID,
        organizationId: ORGANIZATION_ID,
        firstName: "Anna",
        lastName: "Sprint",
        birthYear: 2010,
        notes: null,
        isActive: true,
      },
    ],
    athleteContacts: [],
    trainers: [],
    athleteGroupMemberships: [
      {
        organizationId: ORGANIZATION_ID,
        athleteId: ATHLETE_ID,
        groupId: SELF_GROUP,
        startedOn: "2026-01-01",
        endedOn: null,
      },
      {
        organizationId: ORGANIZATION_ID,
        athleteId: ATHLETE_ID,
        groupId: TRAINER_GROUP,
        startedOn: "2026-01-01",
        endedOn: null,
      },
    ],
    trainerGroupMemberships: [],
  };
}

function sessionSnapshot(
  registrations: readonly UlcTrainingRegistration[] = [],
): UlcTrainingSessionSnapshot {
  return {
    session: {
      id: "session-1",
      organizationId: ORGANIZATION_ID,
      moduleId: "kindertraining",
      groupId: SELF_GROUP,
      sessionDate: DATE,
      state: "scheduled",
      note: null,
    },
    revision: "1",
    attendance: [],
    registrations,
  };
}

describe("ULC athlete self-registration service", () => {
  it("lists only active self-registration groups valid for the athlete on the date", async () => {
    const service = createUlcSelfRegistrationService({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdata();
        },
      },
      sessions: {
        async readSession(_organizationId, _moduleId, groupId) {
          expect(groupId).toBe(SELF_GROUP);
          return null;
        },
        async ensureScheduledSession() {
          throw new Error("not used");
        },
        async saveRegistration() {
          throw new Error("not used");
        },
      },
    });

    await expect(
      service.listOptions(ORGANIZATION_ID, ATHLETE_ID, DATE),
    ).resolves.toEqual([
      {
        group: { id: SELF_GROUP, name: "U16 Selbst", shortName: "U16" },
        sessionDate: DATE,
        sessionState: null,
        intention: "unknown",
        revision: null,
      },
    ]);
  });

  it("returns only the authenticated athlete registration from a session", async () => {
    const registration: UlcTrainingRegistration = {
      organizationId: ORGANIZATION_ID,
      sessionId: "session-1",
      athleteId: ATHLETE_ID,
      intention: "attending",
      revision: 3,
      updatedByIdentityId: IDENTITY_ID,
    };
    const service = createUlcSelfRegistrationService({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdata();
        },
      },
      sessions: {
        async readSession() {
          return sessionSnapshot([registration]);
        },
        async ensureScheduledSession() {
          throw new Error("not used");
        },
        async saveRegistration() {
          throw new Error("not used");
        },
      },
    });

    await expect(
      service.listOptions(ORGANIZATION_ID, ATHLETE_ID, DATE),
    ).resolves.toMatchObject([
      { intention: "attending", revision: 3 },
    ]);
  });

  it("creates or reuses the session and saves only the server-selected athlete", async () => {
    let received:
      | {
          organizationId: string;
          sessionId: string;
          athleteId: string;
          intention: string;
          expectedRevision: number | null;
          actorIdentityId: string;
        }
      | undefined;
    const service = createUlcSelfRegistrationService({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdata();
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async ensureScheduledSession(organizationId, moduleId, groupId, date) {
          expect({ organizationId, moduleId, groupId, date }).toEqual({
            organizationId: ORGANIZATION_ID,
            moduleId: "kindertraining",
            groupId: SELF_GROUP,
            date: DATE,
          });
          return sessionSnapshot();
        },
        async saveRegistration(
          organizationId,
          sessionId,
          athleteId,
          intention,
          expectedRevision,
          actorIdentityId,
        ) {
          received = {
            organizationId,
            sessionId,
            athleteId,
            intention,
            expectedRevision,
            actorIdentityId,
          };
          return {
            organizationId,
            sessionId,
            athleteId,
            intention,
            revision: 4,
            updatedByIdentityId: actorIdentityId,
          };
        },
      },
    });

    await expect(
      service.save(ORGANIZATION_ID, ATHLETE_ID, IDENTITY_ID, {
        groupId: SELF_GROUP,
        sessionDate: DATE,
        intention: "maybe",
        expectedRevision: 3,
      }),
    ).resolves.toMatchObject({
      intention: "maybe",
      revision: 4,
    });
    expect(received).toEqual({
      organizationId: ORGANIZATION_ID,
      sessionId: "session-1",
      athleteId: ATHLETE_ID,
      intention: "maybe",
      expectedRevision: 3,
      actorIdentityId: IDENTITY_ID,
    });
  });

  it("rejects trainer-roll-call groups and expired athlete memberships", async () => {
    const snapshot = masterdata();
    const service = createUlcSelfRegistrationService({
      masterdata: {
        async readOrganizationSnapshot() {
          return snapshot;
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async ensureScheduledSession() {
          throw new Error("must not create");
        },
        async saveRegistration() {
          throw new Error("must not save");
        },
      },
    });

    await expect(
      service.save(ORGANIZATION_ID, ATHLETE_ID, IDENTITY_ID, {
        groupId: TRAINER_GROUP,
        sessionDate: DATE,
        intention: "attending",
        expectedRevision: null,
      }),
    ).rejects.toBeInstanceOf(UlcSelfRegistrationModeError);

    const expired: AthleteMasterdataSnapshot = {
      ...snapshot,
      athleteGroupMemberships: snapshot.athleteGroupMemberships.map(
        (membership) =>
          membership.groupId === SELF_GROUP
            ? { ...membership, endedOn: "2026-10-23" }
            : membership,
      ),
    };
    const expiredService = createUlcSelfRegistrationService({
      masterdata: {
        async readOrganizationSnapshot() {
          return expired;
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async ensureScheduledSession() {
          throw new Error("must not create");
        },
        async saveRegistration() {
          throw new Error("must not save");
        },
      },
    });

    await expect(
      expiredService.save(ORGANIZATION_ID, ATHLETE_ID, IDENTITY_ID, {
        groupId: SELF_GROUP,
        sessionDate: DATE,
        intention: "attending",
        expectedRevision: null,
      }),
    ).rejects.toBeInstanceOf(UlcSelfRegistrationNotFoundError);
  });
});
