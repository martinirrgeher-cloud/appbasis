import { describe, expect, it, vi } from "vitest";
import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";
import { createUlcU12Service } from "../worker/u12-service";
import { UlcTrainingValidationError } from "../worker/training-session-domain";
import type { UlcTrainingSessionSnapshot } from "../worker/training-session-postgres";
import { ULC_U12_HTML, ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_U14_HTML, ULC_U14_SCRIPT, ULC_KIDS_HTML, ULC_KIDS_SCRIPT } from "../worker/youth-attendance-ui";

const groupId = "gruppe-u12";
const organizationId = "verein-1";
const date = "2026-11-07";
function masterdata(): AthleteMasterdataSnapshot {
  return {
    trainingGroups: [{ id: groupId, organizationId, name: "U12", shortName: null,
      description: null, attendanceMode: "trainer_roll_call", isActive: true, sortOrder: 1 }],
    athletes: [], athleteContacts: [], athleteGroupMemberships: [],
    trainers: [
      { id: "trainer-a", organizationId, firstName: "Anna", lastName: "Auer",
        isActive: true, email: null, phone: null, notes: null },
      { id: "trainer-b", organizationId, firstName: "Berta", lastName: "Zeller",
        isActive: true, email: null, phone: null, notes: null },
      { id: "trainer-inactive", organizationId, firstName: "Alt", lastName: "Alt",
        isActive: false, email: null, phone: null, notes: null },
      { id: "trainer-other", organizationId: "other-org", firstName: "Foreign",
        lastName: "Trainer", isActive: true, email: null, phone: null, notes: null },
    ],
    trainerGroupMemberships: [
      { organizationId, groupId, trainerId: "trainer-a" },
      { organizationId, groupId, trainerId: "trainer-b" },
      { organizationId, groupId, trainerId: "trainer-inactive" },
      { organizationId: "other-org", groupId, trainerId: "trainer-other" },
      { organizationId, groupId: "other-group", trainerId: "trainer-other" },
    ],
  };
}

function session(ids: readonly string[]): UlcTrainingSessionSnapshot {
  return {
    session: { id: "session-1", organizationId, moduleId: "u12",
      groupId, sessionDate: date, state: "scheduled", note: null },
    revision: "7", attendance: [], registrations: [], trainingContentTitles: [],
    trainingContentItems: [], trainingContentAssignments: [],
    trainingTrainerIds: ids,
  };
}

describe("group scoped youth trainer attendance", () => {
  it("shows only active trainers assigned to the exact group and existing selected state", async () => {
    const service = createUlcU12Service({
      masterdata: { async readOrganizationSnapshot() { return masterdata(); } },
      moduleGroups: { async readGroupId() { return groupId; } },
      sessions: {
        async readSession() { return session([]); },
        async readTrainerPresence() { return ["trainer-a", "trainer-inactive"]; },
        async saveSession() { return session([]); },
      },
    });
    const snapshot = await service.readSnapshot(organizationId, groupId, date);
    expect(snapshot.trainers).toEqual([
      { trainerId: "trainer-a", firstName: "Anna", lastName: "Auer", present: true },
      { trainerId: "trainer-b", firstName: "Berta", lastName: "Zeller", present: false },
    ]);
  });

  it("rejects foreign, unassigned, duplicate and inactive trainer IDs before any write", async () => {
    const save = vi.fn(async () => session(["trainer-a"]));
    const service = createUlcU12Service({
      masterdata: { async readOrganizationSnapshot() { return masterdata(); } },
      moduleGroups: { async readGroupId() { return groupId; } },
      sessions: { async readSession() { return null; }, saveSession: save },
    });
    for (const trainerIds of [
      ["trainer-a", "trainer-a"], ["trainer-inactive"], ["trainer-other"], ["missing"],
    ]) {
      await expect(service.saveSession(organizationId, {
        groupId, sessionDate: date, expectedRevision: null,
        attendance: [], contentTitles: [], contentItems: [], trainerIds,
      })).rejects.toBeInstanceOf(UlcTrainingValidationError);
    }
    expect(save).not.toHaveBeenCalled();
    const saved = await service.saveSession(organizationId, {
      groupId, sessionDate: date, expectedRevision: null,
      attendance: [], contentTitles: [], contentItems: [], trainerIds: ["trainer-a"],
    });
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[6]).toEqual(["trainer-a"]);
    expect(save.mock.calls[0]?.[7]).toEqual(["trainer-a", "trainer-b"]);
    expect(saved.trainers.find((trainer) => trainer.trainerId === "trainer-a")?.present).toBe(true);
  });

  it("uses its own mobile checkbox roster and autosave in all three youth areas", () => {
    for (const [prefix, html, script] of [
      ["u12", ULC_U12_HTML, ULC_U12_SCRIPT],
      ["u14", ULC_U14_HTML, ULC_U14_SCRIPT],
      ["kids", ULC_KIDS_HTML, ULC_KIDS_SCRIPT],
    ] as const) {
      expect(html).toContain('id="' + prefix + '-trainers-card"');
      expect(html).toContain('id="' + prefix + '-trainers-rows"');
      expect(script).toContain("trainerIds: [..." + prefix + "TrainerPresent].sort()");
      expect(script).toContain("input.dataset." + prefix + "TrainerId");
      expect(script).toContain("mark" + (prefix === "kids" ? "Kids" : prefix.toUpperCase()) + "DraftDirty()");
      expect(script).not.toContain("innerHTML");
    }
  });
});
