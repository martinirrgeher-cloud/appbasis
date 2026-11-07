import { describe, expect, it, vi } from "vitest";
import type { AthleteMasterdataSnapshot } from "@appbasis/athletes";
import { createUlcYouthAreaService, UlcYouthAreaMappingError } from "../worker/youth-area-service";
import {
  ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";
import { ULC_U12_HTML, ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import type { UlcU12SessionStore } from "../worker/u12-service";
import type { UlcLinzTrainingModuleGroupReader } from "../worker/training-module-group-postgres";

function store(): UlcU12SessionStore {
  return {
    async readSession() { return null; },
    async saveSession() { throw new Error("No real DB in this unit test."); },
  };
}

function setup(groups = [
  { id: "u14-group", organizationId: "org", name: "U14", shortName: "U14",
    isActive: true, attendanceMode: "trainer_roll_call" },
  { id: "kids-group", organizationId: "org", name: "Kindertraining", shortName: null,
    isActive: true, attendanceMode: "self_registration" },
  { id: "irrgeher-group", organizationId: "org", name: "Gruppe Irrgeher", shortName: null,
    isActive: true, attendanceMode: "trainer_roll_call" },
]) {
  const snapshot = {
    trainingGroups: groups,
    athletes: [{ id: "athlete-1", organizationId: "org", firstName: "A", lastName: "B",
      birthYear: 2014, notes: null }],
    athleteGroupMemberships: [
      { organizationId: "org", groupId: "u14-group", athleteId: "athlete-1",
        startedOn: "2025-01-01", endedOn: null },
      { organizationId: "org", groupId: "kids-group", athleteId: "athlete-1",
        startedOn: "2025-01-01", endedOn: null },
    ],
    athleteContacts: [],
    trainers: [],
    trainerGroupMemberships: [],
  } as unknown as AthleteMasterdataSnapshot;
  const masterdata = { readOrganizationSnapshot: vi.fn(async () => snapshot) };
  const moduleGroups: UlcLinzTrainingModuleGroupReader = {
    readGroupId: vi.fn(async (_org, area) => area === "u14" ? "u14-group" : "irrgeher-group"),
  };
  const categories = { validateSessionContents: vi.fn(async () => {}) };
  return { masterdata, moduleGroups, categories, sessions: store() };
}

describe("U14/Kindertraining detailed attendance service", () => {
  it("resolves only the correct group, never the legacy Irrgeher mapping", async () => {
    const env = setup();
    const u14 = createUlcYouthAreaService({ ...env, area: "u14" });
    const kids = createUlcYouthAreaService({ ...env, area: "kindertraining" });
    expect(await u14.listGroups("org")).toEqual([
      { id: "u14-group", name: "U14", shortName: "U14" },
    ]);
    expect(await kids.listGroups("org")).toEqual([
      { id: "kids-group", name: "Kindertraining", shortName: null },
    ]);
    const snapshot = await kids.readSnapshot("org", "kids-group", "2026-11-07");
    expect(snapshot.participants).toHaveLength(1);
    expect(snapshot.participants[0]?.contacts).toEqual([]);
    await expect(kids.readSnapshot("org", "irrgeher-group", "2026-11-07"))
      .rejects.toThrow();
    expect(env.moduleGroups.readGroupId).toHaveBeenCalledWith("org", "u14");
    expect(env.moduleGroups.readGroupId).toHaveBeenCalledWith("org", "kindertraining");
  });

  it("refuses multiple matching child groups rather than selecting one arbitrarily", async () => {
    const env = setup([
      { id: "kids-one", organizationId: "org", name: "Kindertraining", shortName: null,
        isActive: true, attendanceMode: "trainer_roll_call" },
      { id: "kids-two", organizationId: "org", name: "Kindertraining", shortName: null,
        isActive: true, attendanceMode: "trainer_roll_call" },
    ]);
    await expect(createUlcYouthAreaService({ ...env, area: "kindertraining" })
      .listGroups("org")).rejects.toThrow(UlcYouthAreaMappingError);
  });
});

describe("U14/Kindertraining UI parity", () => {
  it("uses distinct HTML ids and complete category/attendance/statistics controls", () => {
    for (const [prefix, html, script, css] of [
      ["u14", ULC_U14_HTML, ULC_U14_SCRIPT, ULC_U14_CSS],
      ["kids", ULC_KIDS_HTML, ULC_KIDS_SCRIPT, ULC_KIDS_CSS],
    ] as const) {
      expect(html).toContain('data-app-section="' + prefix + '"');
      expect(html).toContain('id="' + prefix + '-date"');
      expect(html).toContain('id="' + prefix + '-content-add"');
      expect(html).toContain('id="' + prefix + '-content-assign"');
      expect(html).toContain('id="' + prefix + '-statistics-open"');
      expect(html).toContain('id="' + prefix + '-add-athlete"');
      expect(html).toContain('id="' + prefix + '-assignment-matrix"');
      expect(script).toContain("function bootstrap" +
        (prefix === "kids" ? "Kids" : "U14") + "()");
      expect(css).toContain("." + prefix + "-content-row");
      expect(() => new Function(script)).not.toThrow();
    }
    expect(ULC_U14_SCRIPT).toContain('refreshYouthCategoryCatalog("u14")');
    expect(ULC_KIDS_SCRIPT).toContain('refreshYouthCategoryCatalog("kindertraining")');
    expect(ULC_U14_HTML).toContain('data-youth-category-area="u14"');
    expect(ULC_KIDS_HTML).toContain('data-youth-category-area="kindertraining"');
    expect(ULC_U12_HTML).toContain('data-app-section="u12"');
    expect(ULC_U12_SCRIPT).toContain('const U12_SERVER_STATUSES');
  });

  it("keeps the legacy Kindertraining/Irrgeher route while showing separate youth pages", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="kindertraining"');
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="kids"');
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="u14"');
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-target="kids"');
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-target="u14"');
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-group="irrgeher"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("bootstrapU14()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("bootstrapKids()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("resetU14SessionState()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("resetKidsSessionState()");
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });
});
