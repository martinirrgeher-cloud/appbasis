import { describe, expect, it } from "vitest";

import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";

import {
  createUlcU12Service,
  UlcU12NotFoundError,
} from "../worker/u12-service";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import type {
  UlcTrainingSessionSnapshot,
} from "../worker/training-session-postgres";

const ORGANIZATION_ID = "verein-1";
const GROUP_ID = "gruppe-1";
const DATE = "2026-09-27";

function moduleGroups(groupId: string | null = GROUP_ID) {
  return {
    async readGroupId(
      organizationId: string,
      moduleId: "kindertraining" | "u12" | "u14",
    ) {
      expect(organizationId).toBe(ORGANIZATION_ID);
      expect(moduleId).toBe("u12");
      return groupId;
    },
  };
}

function masterdataSnapshot(): AthleteMasterdataSnapshot {
  return {
    trainingGroups: [
      {
        id: GROUP_ID,
        organizationId: ORGANIZATION_ID,
        name: "U12",
        shortName: "KT",
        description: null,
        attendanceMode: "trainer_roll_call",
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
    athleteContacts: [],
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
      moduleId: "u12",
      groupId: GROUP_ID,
      sessionDate: DATE,
      state: "scheduled",
      note: "Halle",
    },
    revision: "41",
    registrations: [],
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

describe("ULC U12 service", () => {
  it("lists only the configured active U12 group from the server-owned organization snapshot", async () => {
    const snapshot = masterdataSnapshot();
    const service = createUlcU12Service({
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
                attendanceMode: "trainer_roll_call",
                isActive: false,
                sortOrder: 20,
              },
            ],
          };
        },
      },
      moduleGroups: moduleGroups(),
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
        name: "U12",
        shortName: "KT",
      },
    ]);
  });

  it("builds the participant snapshot from the athletes module at the training date", async () => {
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      moduleGroups: moduleGroups(),
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
        name: "U12",
        shortName: "KT",
      },
      sessionDate: DATE,
      contentTitles: [],
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
          notes: null,
          contacts: [],
          status: "present",
          contentSlots: [],
        },
        {
          athleteId: "athlete-2",
          firstName: "Berta",
          lastName: "Zeller",
          birthYear: 2016,
          notes: null,
          contacts: [],
          status: "excused",
          contentSlots: [],
        },
      ],
    });
  });

  it("returns notes and contacts only for roster athletes in the configured group", async () => {
    const snapshot = masterdataSnapshot();
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          return {
            ...snapshot,
            athletes: snapshot.athletes.map((athlete) =>
              athlete.id === "athlete-1" ? { ...athlete, notes: "Allergie" } : athlete),
            athleteContacts: [
              {
                id: "contact-a", organizationId: ORGANIZATION_ID,
                athleteId: "athlete-1", contactName: "Mutter",
                relationship: "Mutter", phone: "+43 123", isEmergency: true,
                priority: 1, notes: "Nur abends",
              },
              {
                id: "contact-foreign", organizationId: ORGANIZATION_ID,
                athleteId: "athlete-old", contactName: "Nicht im Kader",
                relationship: null, phone: "123", isEmergency: true,
                priority: 1, notes: null,
              },
            ],
          };
        },
      },
      moduleGroups: moduleGroups(),
      sessions: {
        async readSession() { return storedSession(); },
        async saveSession() { throw new Error("not used"); },
      },
    });
    const roster = await service.readSnapshot(ORGANIZATION_ID, GROUP_ID, DATE);
    expect(roster.participants).toHaveLength(2);
    expect(roster.participants[0]?.notes).toBe("Allergie");
    expect(roster.participants[0]?.contacts).toEqual([{
      id: "contact-a", contactName: "Mutter",
      relationship: "Mutter", phone: "+43 123",
      isEmergency: true, notes: "Nur abends",
    }]);
    expect(JSON.stringify(roster)).not.toContain("Nicht im Kader");
    expect(JSON.stringify(roster)).not.toContain("contact-foreign");
  });

  it("forces U12 and saves only an exact participant set", async () => {
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

    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      moduleGroups: moduleGroups(),
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
            registrations: [],
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
      moduleId: "u12",
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
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      moduleGroups: moduleGroups(),
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

  it("stays unavailable until an U12 group is explicitly configured", async () => {
    let masterdataReads = 0;
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          masterdataReads += 1;
          return masterdataSnapshot();
        },
      },
      moduleGroups: moduleGroups(null),
      sessions: {
        async readSession() {
          throw new Error("not used");
        },
        async saveSession() {
          throw new Error("not used");
        },
      },
    });

    await expect(service.listGroups(ORGANIZATION_ID)).resolves.toEqual([]);
    expect(masterdataReads).toBe(0);
    await expect(
      service.readSnapshot(ORGANIZATION_ID, GROUP_ID, DATE),
    ).rejects.toBeInstanceOf(UlcU12NotFoundError);
  });

  it("does not read or write a different active training group", async () => {
    let sessionCalls = 0;
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          return masterdataSnapshot();
        },
      },
      moduleGroups: moduleGroups(GROUP_ID),
      sessions: {
        async readSession() {
          sessionCalls += 1;
          return null;
        },
        async saveSession() {
          sessionCalls += 1;
          throw new Error("must not save");
        },
      },
    });

    await expect(
      service.readSnapshot(ORGANIZATION_ID, "gruppe-fremd", DATE),
    ).rejects.toBeInstanceOf(UlcU12NotFoundError);
    await expect(
      service.saveSession(ORGANIZATION_ID, {
        groupId: "gruppe-fremd",
        sessionDate: DATE,
        expectedRevision: null,
        attendance: [],
      }),
    ).rejects.toBeInstanceOf(UlcU12NotFoundError);
    expect(sessionCalls).toBe(0);
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
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() {
          return inactive;
        },
      },
      moduleGroups: moduleGroups(),
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
    ).rejects.toBeInstanceOf(UlcU12NotFoundError);
  });
  it("saves a bounded content list with assignments and restores it for the same group", async () => {
    let observedTitles: readonly string[] | undefined;
    let observedSlots: readonly number[] | undefined;
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() { return masterdataSnapshot(); },
      },
      moduleGroups: moduleGroups(),
      sessions: {
        async readSession() { return null; },
        async saveSession(organizationId, input, attendance, expectedRevision, titles) {
          expect(expectedRevision).toBe("41");
          expect(input.moduleId).toBe("u12");
          observedTitles = titles;
          observedSlots = attendance[0]?.contentSlots;
          return {
            ...storedSession(),
            attendance: attendance.map((entry) => ({
              organizationId,
              sessionId: "session-1",
              athleteId: entry.athleteId,
              status: entry.status,
            })),
            trainingContentTitles: titles ?? [],
            trainingContentAssignments: attendance.map((entry) => ({
              athleteId: entry.athleteId,
              slots: entry.contentSlots ?? [],
            })),
          };
        },
      },
    });
    const saved = await service.saveSession(ORGANIZATION_ID, {
      groupId: GROUP_ID,
      sessionDate: DATE,
      expectedRevision: "41",
      contentTitles: ["Sprint", "Koordination"],
      attendance: [
        { athleteId: "athlete-1", status: "present", contentSlots: [1, 2] },
        { athleteId: "athlete-2", status: "absent", contentSlots: [] },
      ],
    });
    expect(observedTitles).toEqual(["Sprint", "Koordination"]);
    expect(observedSlots).toEqual([1, 2]);
    expect(saved.contentTitles).toEqual(["Sprint", "Koordination"]);
    expect(saved.participants.map(({ contentSlots }) => contentSlots)).toEqual([[1, 2], []]);
  });

  it("rejects blank, excessive and wrongly assigned contents before touching the store", async () => {
    let calls = 0;
    const service = createUlcU12Service({
      masterdata: {
        async readOrganizationSnapshot() { return masterdataSnapshot(); },
      },
      moduleGroups: moduleGroups(),
      sessions: {
        async readSession() { return null; },
        async saveSession() { calls++; throw new Error("invalid input must not reach storage"); },
      },
    });
    const testCases = [
      { contentTitles: ["  "], firstSlots: [1], secondSlots: [] },
      { contentTitles: ["1", "2", "3", "4", "5", "6"], firstSlots: [], secondSlots: [] },
      { contentTitles: ["Sprint"], firstSlots: [2], secondSlots: [] },
      { contentTitles: ["Sprint"], firstSlots: [1, 1], secondSlots: [] },
      { contentTitles: ["Sprint"], firstSlots: [1], secondSlots: [1] },
    ];
    for (const item of testCases) {
      await expect(service.saveSession(ORGANIZATION_ID, {
        groupId: GROUP_ID,
        sessionDate: DATE,
        expectedRevision: null,
        contentTitles: item.contentTitles,
        attendance: [
          { athleteId: "athlete-1", status: "present", contentSlots: item.firstSlots },
          { athleteId: "athlete-2", status: "absent", contentSlots: item.secondSlots },
        ],
      })).rejects.toBeInstanceOf(UlcTrainingValidationError);
    }
    expect(calls).toBe(0);
  });

});
