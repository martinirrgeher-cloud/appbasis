import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

type Mode = "trainer_roll_call" | "self_registration";
type Group = { id: string; name: string; attendanceMode: Mode };

function lookup(groups: Group[], ready = true) {
  const start = ULC_LINZ_APP_SCRIPT.indexOf("function findAttendanceTrainingGroup(kind) {");
  const end = ULC_LINZ_APP_SCRIPT.indexOf(
    "\nfunction syncKindertrainingCategoryShortcut() {", start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const implementation = ULC_LINZ_APP_SCRIPT.slice(start, end);
  const factory = new Function(
    "kindertrainingGroups", "kindertrainingReady",
    implementation + "\nreturn findAttendanceTrainingGroup;",
  ) as (groups: Group[], ready: boolean) => (kind: string) => Group | null;
  return factory(groups, ready);
}

const irrgeher = (attendanceMode: Mode): Group =>
  ({ id: "irrgeher-test", name: "Gruppe Irrgeher", attendanceMode });

describe("G-04.7 attendance navigation preserves Irrgeher in both group modes", () => {
  it.each(["trainer_roll_call", "self_registration"] as const)(
    "keeps Irrgeher visible in Anwesenheit when mode=%s",
    mode => {
      const groups = [
        { id: "kids", name: "Kindertraining", attendanceMode: "self_registration" as const },
        irrgeher(mode),
      ];
      expect(lookup(groups)("irrgeher")).toEqual(irrgeher(mode));
      expect(lookup(groups)("kindertraining")?.id).toBe("kids");
    },
  );

  it("does not invent access or select a different group", () => {
    expect(lookup([{ id: "other", name: "Andere Gruppe",
      attendanceMode: "self_registration" }])("irrgeher")).toBeNull();
    expect(lookup([irrgeher("self_registration")], false)("irrgeher")).toBeNull();
    expect(lookup([irrgeher("trainer_roll_call")])("unrelated")).toBeNull();
  });

  it("keeps coach attendance separate from athlete self-registration", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-group="irrgeher"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="registration"');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'findAttendanceTrainingGroup(choice.dataset.attendanceGroup || "") !== null',
    );
    const start = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function navigateToAttendanceGroup(kind) {",
    );
    const end = ULC_LINZ_APP_SCRIPT.indexOf(
      "\nfunction setAppNavMoreOpen(open) {", start,
    );
    const nav = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(nav).toContain('navigateAppSection("kindertraining")');
    expect(nav).toContain("handleKindertrainingWeekGroupChange()");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'group?.attendanceMode === "self_registration"',
    );
  });
});
