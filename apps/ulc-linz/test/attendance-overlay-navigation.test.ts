import { describe, expect, it, vi } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

type TrainingGroup = {
  id: string;
  name: string;
  attendanceMode: "trainer_roll_call" | "self_registration";
};

function extractRuntimeFunction(start: string, next: string) {
  const from = ULC_LINZ_APP_SCRIPT.indexOf(start);
  const to = ULC_LINZ_APP_SCRIPT.indexOf(next, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return ULC_LINZ_APP_SCRIPT.slice(from, to);
}

const trainingGroups: TrainingGroup[] = [
  { id: "group-irrgeher", name: "Gruppe Irrgeher", attendanceMode: "trainer_roll_call" },
  { id: "group-kinder", name: "Kindertraining", attendanceMode: "trainer_roll_call" },
  { id: "group-self", name: "Preview Selbstanmeldung", attendanceMode: "self_registration" },
];

describe("ULC attendance: group overlay instead of an intermediate page", () => {
  it("keeps the bottom navigation and opens an accessible, mobile-sized overlay", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="app-nav-attendance"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="attendance"');
    expect(ULC_LINZ_APP_HTML).toContain('aria-controls="app-nav-attendance-menu"');
    expect(ULC_LINZ_APP_HTML).toContain('aria-expanded="false"');
    expect(ULC_LINZ_APP_HTML).toContain('id="app-nav-attendance-menu"');
    expect(ULC_LINZ_APP_HTML).not.toContain('data-app-section="attendance"');
    expect(ULC_LINZ_APP_HTML).toContain('id="attendance-quick-action" type="button" data-open-attendance-menu');
    expect(ULC_LINZ_APP_CSS).toContain(".app-nav__attendance-menu[hidden]");
    expect(ULC_LINZ_APP_CSS).toContain("width: min(320px, calc(100vw - 16px))");
    expect(ULC_LINZ_APP_SCRIPT).toContain('setAppNavAttendanceOpen(!appNavAttendanceOpen)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (appNavAttendanceOpen) setAppNavAttendanceOpen(false)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('event.target?.closest?.("[data-open-attendance-menu]")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (open) setAppNavAttendanceOpen(false);');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (attendanceWasOpen) elements.appNavAttendance?.focus();');
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("lists U12, U14, Kindertraining and Irrgeher as separate attendance choices", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-target="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-target="kids"');
    expect(ULC_LINZ_APP_HTML).toContain('data-attendance-group="irrgeher"');
    expect(ULC_LINZ_APP_HTML).toContain("<strong>Gruppe Irrgeher</strong>");
    expect(ULC_LINZ_APP_HTML).toContain("<strong>U14</strong><small>Anwesenheit, Inhalte und Statistik</small>");
    expect(ULC_LINZ_APP_HTML).toContain('data-youth-category-area="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-youth-category-area="u14"');
    expect(ULC_LINZ_APP_HTML).toContain('data-youth-category-area="kindertraining"');
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="kindertraining"');
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="registration"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('findAttendanceTrainingGroup(choice.dataset.attendanceGroup || "")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('choice.hidden = !available');
    expect(ULC_LINZ_APP_SCRIPT).toContain('choice.disabled = !available');
    expect(ULC_LINZ_APP_SCRIPT).toContain('void navigateToAttendanceGroup(control.dataset.attendanceGroup || "")');
  });

  it("finds Irrgeher only from the authorized trainer roster, never from a fixed ID or self-registration group", () => {
    const source = extractRuntimeFunction(
      "function findAttendanceTrainingGroup(kind) {",
      "\nfunction setAppNavAttendanceOpen(open)",
    );
    const makeLookup = new Function(
      "kindertrainingGroups",
      "kindertrainingReady",
      source + "\nreturn findAttendanceTrainingGroup;",
    ) as (groups: TrainingGroup[], ready: boolean) =>
      (kind: string) => TrainingGroup | null;

    const lookup = makeLookup(trainingGroups, true);
    expect(lookup("irrgeher")?.id).toBe("group-irrgeher");
    expect(lookup("kindertraining")?.id).toBe("group-kinder");
    expect(lookup("unknown")).toBeNull();

    const denied = makeLookup(trainingGroups, false);
    expect(denied("irrgeher")).toBeNull();
    const wrongMode = makeLookup([
      { id: "self-irrgeher", name: "Gruppe Irrgeher", attendanceMode: "self_registration" },
    ], true);
    expect(wrongMode("irrgeher")).toBeNull();
  });

  it("opens the existing group attendance handler and respects an aborted navigation", async () => {
    const source = extractRuntimeFunction(
      "async function navigateToAttendanceGroup(kind) {",
      "\nfunction setAppNavMoreOpen(open)",
    );
    const makeNavigate = new Function(
      "findAttendanceTrainingGroup", "kindertrainingLoading", "kindertrainingWeekSaving",
      "elements", "navigateAppSection", "handleKindertrainingWeekGroupChange",
      "kindertrainingLoadedGroupId", "loadKindertrainingWeek",
      source + "\nreturn navigateToAttendanceGroup;",
    ) as (
      find: (kind: string) => TrainingGroup | null,
      loading: boolean,
      saving: boolean,
      elements: { kindertrainingGroup: { value: string } },
      navigate: (section: string) => Promise<boolean>,
      onChange: () => Promise<void>,
      loadedId: string,
      load: () => Promise<void>,
    ) => (kind: string) => Promise<void>;

    const elements = { kindertrainingGroup: { value: "previous" } };
    const navigate = vi.fn(async () => true);
    const handleChange = vi.fn(async () => undefined);
    const load = vi.fn(async () => undefined);
    const find = (kind: string) => trainingGroups.find((g) =>
      kind === "irrgeher" && g.id === "group-irrgeher") || null;

    await makeNavigate(find, false, false, elements, navigate, handleChange, "", load)("irrgeher");
    expect(navigate).toHaveBeenCalledWith("kindertraining");
    expect(elements.kindertrainingGroup.value).toBe("group-irrgeher");
    expect(handleChange).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();

    elements.kindertrainingGroup.value = "previous";
    navigate.mockResolvedValueOnce(false);
    handleChange.mockClear();
    await makeNavigate(find, false, false, elements, navigate, handleChange, "", load)("irrgeher");
    expect(elements.kindertrainingGroup.value).toBe("previous");
    expect(handleChange).not.toHaveBeenCalled();
  });
});
