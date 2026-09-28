import { describe, expect, it } from "vitest";

import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";

import {
  createUlcKindertrainingService,
  UlcKindertrainingNotFoundError,
} from "../worker/kindertraining-service";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import type {
  UlcTrainingSessionSnapshot,
} from "../worker/training-session-postgres";

const ORGANIZATION_ID = "verein-1";
const GROUP_ID = "gruppe-1";
const DATE = "2026-09-27";

function masterdataSnapshot(): AthleteMasterdataSnapshot {
  return {
    trainingGroups: [
      {
        id: GROUP_ID,
        organizationId: ORGANIZATION_ID,
        name: "Kindertraining",
        shortName: "KT",
        description: null,
        isActive: true,
        sortOrder: 10,
      },
    ],
    athletes: [
      {
        id: "athlete-2",
        organizationId: ORGANIZATION_ID,
        firstName: "Berta",
        lastName: "Zeller",
        birthYear: 2016,
        notes: null,
        isActive: true,
      },
      {
        id: "athlete-1",
        organizationId: ORGANIZATION_ID,
        firstName: "Anna",
        lastName: "Auer",
        birthYear: 2017,
        notes: null,
        isActive: true,
      },
      {
        id: "athlete-old",
        organizationId: ORGANIZATION_ID,
        firstName: "Franz",
        lastName: "Alt",
        birthYear: 2015,
        notes: null,
        isActive: false,
      },
    ],
    trainers: [],
    athleteGroupMemberships: [
      {
        organizationId: ORGANIZATION_ID,
        athleteId: "athlete-1",
        groupId: GROUP_ID,
        startedOn: "2026-01-01",
        endedOn: null,
      },
      {
        organizationId: ORGANIZATION_ID,
        athleteId: "athlete-2",
        groupId: GROUP_ID,
        startedOn: "2026-09-01",
        endedOn: "2026-10-31",
      },
      {
        organizationId: ORGANIZATION_ID,
        athleteId: "athlete-old",
        groupId: GROUP_ID,
        startedOn: "2025-01-01",
        endedOn: "2026-08-31",
      },
    ],
    trainerGroupMemberships: [],
  };
}

function storedSession(): UlcTrainingSessionSnapshot {
  return {
    session: {
      id: "session-1",
      organizationId: ORGANIZATION_ID,
      moduleId: "kindertraining",
      groupId: GROUP_ID,
      sessionDate: DATE,
      state: "scheduled",
      note: "Halle",
    },
    revision: "41",
    attendance: [
      {
        organizationId: ORGANIZATION_ID,
        sessionId: "session-1",
        athleteId: "athlete-1",
        status: "present",
      },
      {
        organizationId: ORGANIZATION_ID,
        sessionId: "session-1",
        athleteId: "athlete-2",
        status: "excused",
      },
    ],
  };
}

describe("ULC Kindertraining service", () => {
  it("lists only active groups from the server-owned organization snapshot", async () => {
    const snapshot = masterdataSnapshot();
    const service = createUlcKindertrainingService({
      masterdata: {
        async readOrganizationSnapshot(organizationId) {
          expect(organizationId).toBe(ORGANIZATION_ID);
          return {
            ...snapshot,
            trainingGroups: [
              ...snapshot.trainingGroups,
              {
                id: "inactive-group",
                organizationId: ORGANIZATION_ID,
                name: "Altgruppe",
                shortName: null,
                description: null,
                isActive: false,
                sortOrder: 20,
              },
            ],
          };
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async saveSession() {
          throw new Error("not used");
        },
      },
    });

    await expect(service.listGroups(ORGANIZATION_ID)).resolves.toEqual([
      {
        id: GROUP_ID,
        name: "Kindertraining",
        shortName: "KT",
      },
    ]);
  });

  it("builds the participant snapshot from the athletes module at the training date", async () => {
    const service = createUlcKindertrainingService({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      sessions: {
        async readSession() {
          return storedSession();
        },
        async saveSession() {
          throw new Error("not used");
        },
      },
    });

    await expect(
      service.readSnapshot(ORGANIZATION_ID, GROUP_ID, DATE),
    ).resolves.toEqual({
      group: {
        id: GROUP_ID,
        name: "Kindertraining",
        shortName: "KT",
      },
      sessionDate: DATE,
      session: {
        id: "session-1",
        revision: "41",
        state: "scheduled",
        note: "Halle",
      },
      participants: [
        {
          athleteId: "athlete-1",
          firstName: "Anna",
          lastName: "Auer",
          birthYear: 2017,
          status: "present",
        },
        {
          athleteId: "athlete-2",
          firstName: "Berta",
          lastName: "Zeller",
          birthYear: 2016,
          status: "excused",
        },
      ],
    });
  });

  it("forces Kindertraining and saves only an exact participant set", async () => {
    let received:
      | {
          organizationId: string;
          moduleId: string;
          groupId: string;
          sessionDate: string;
          attendance: readonly unknown[];
          expectedRevision: string | null;
        }
      | undefined;

    const service = createUlcKindertrainingService({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async saveSession(organizationId, input, attendance, expectedRevision) {
          received = {
            organizationId,
            moduleId: input.moduleId,
            groupId: input.groupId,
            sessionDate: input.sessionDate,
            attendance,
            expectedRevision,
          };
          return {
            session: {
              id: "session-new",
              organizationId,
              moduleId: input.moduleId,
              groupId: input.groupId,
              sessionDate: input.sessionDate,
              state: input.state ?? "scheduled",
              note: input.note ?? null,
            },
            revision: "42",
            attendance: attendance.map((entry) => ({
              organizationId,
              sessionId: "session-new",
              athleteId: entry.athleteId,
              status: entry.status,
            })),
          };
        },
      },
    });

    const result = await service.saveSession(ORGANIZATION_ID, {
      groupId: GROUP_ID,
      sessionDate: DATE,
      note: "  Halle  ",
      expectedRevision: "41",
      attendance: [
        { athleteId: "athlete-1", status: "present" },
        { athleteId: "athlete-2", status: "absent" },
      ],
    });

    expect(received).toMatchObject({
      organizationId: ORGANIZATION_ID,
      moduleId: "kindertraining",
      groupId: GROUP_ID,
      sessionDate: DATE,
      expectedRevision: "41",
    });
    expect(result.session?.id).toBe("session-new");
    expect(result.participants.map((entry) => entry.status)).toEqual([
      "present",
      "absent",
    ]);
  });

  it("rejects omitted, foreign and duplicate participant attendance", async () => {
    const service = createUlcKindertrainingService({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async saveSession() {
          throw new Error("must not save invalid input");
        },
      },
    });

    for (const attendance of [
      [{ athleteId: "athlete-1", status: "present" as const }],
      [
        { athleteId: "athlete-1", status: "present" as const },
        { athleteId: "foreign", status: "present" as const },
      ],
      [
        { athleteId: "athlete-1", status: "present" as const },
        { athleteId: "athlete-1", status: "absent" as const },
      ],
    ]) {
      await expect(
        service.saveSession(ORGANIZATION_ID, {
          groupId: GROUP_ID,
          sessionDate: DATE,
          expectedRevision: null,
          attendance,
        }),
      ).rejects.toBeInstanceOf(UlcTrainingValidationError);
    }
  });

  it("fails closed for missing or inactive groups on save", async () => {
    const snapshot = masterdataSnapshot();
    const inactive: AthleteMasterdataSnapshot = {
      ...snapshot,
      trainingGroups: snapshot.trainingGroups.map((group) => ({
        ...group,
        isActive: false,
      })),
    };
    const service = createUlcKindertrainingService({
      masterdata: {
        async readOrganizationSnapshot() {
          return inactive;
        },
      },
      sessions: {
        async readSession() {
          return null;
        },
        async saveSession() {
          throw new Error("must not save");
        },
      },
    });

    await expect(
      service.saveSession(ORGANIZATION_ID, {
        groupId: GROUP_ID,
        sessionDate: DATE,
        expectedRevision: null,
        attendance: [],
      }),
    ).rejects.toBeInstanceOf(UlcKindertrainingNotFoundError);
  });
});
