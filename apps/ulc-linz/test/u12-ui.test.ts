import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";
import {
  ULC_U12_HTML,
  ULC_U12_CSS,
  ULC_U12_SCRIPT,
} from "../worker/u12-ui";

describe("ULC A03: one training date, one binary trainer name list", () => {
  it("keeps the existing navigation and module permission gate", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-dashboard-view="u12" hidden');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="home"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="kindertraining"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="training-documentation"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-save"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (section === "u12") return u12Ready;');
    expect(ULC_LINZ_APP_SCRIPT).toContain('card.hidden = !isAppNavigationAvailable(card.dataset.dashboardView || "")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (target === "u12") prepareU12View();');
    expect(ULC_LINZ_APP_SCRIPT).toContain("    bootstrapU12(),");
    expect(ULC_LINZ_APP_SCRIPT).toContain("  resetU12SessionState();");
  });

  it("shows only date, name, anwesenheit checkbox and save; no week or 4-state editor", () => {
    expect(ULC_U12_HTML).toContain('id="u12-group"');
    expect(ULC_U12_HTML).toContain('type="date" id="u12-date"');
    expect(ULC_U12_HTML).toContain('id="u12-prev"');
    expect(ULC_U12_HTML).toContain('id="u12-next"');
    expect(ULC_U12_HTML).toContain('id="u12-reload"');
    expect(ULC_U12_HTML).toContain('id="u12-save"');
    expect(ULC_U12_HTML).toContain("Liste speichern");
    expect(ULC_U12_HTML).toContain('id="u12-count"');
    expect(ULC_U12_HTML).not.toContain('id="u12-week-label"');
    expect(ULC_U12_HTML).not.toContain("Tagesnotiz");
    expect(ULC_U12_HTML).not.toContain("Wochenmatrix");
    expect(ULC_U12_SCRIPT).toContain('input.type = "checkbox"');
    expect(ULC_U12_SCRIPT).toContain('input.dataset.u12AthleteId = person.athleteId');
    expect(ULC_U12_SCRIPT).toContain('status.textContent = input.checked ? "Ja" : "Nein"');
    expect(ULC_U12_SCRIPT).toContain('label.className = "u12-person"');
    expect(ULC_U12_SCRIPT).not.toContain('registrationWeekDates(');
    expect(ULC_U12_SCRIPT).not.toContain('u12AutoTimer');
    expect(ULC_U12_SCRIPT).not.toContain("Promise.allSettled(");
  });

  it("reads exactly one training date and saves a full yes/no list with CAS", () => {
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12")');
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12/session?groupId="');
    expect(ULC_U12_SCRIPT).toContain('encodeURIComponent(groupId) + "&sessionDate=" + encodeURIComponent(date)');
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12/session", {');
    expect(ULC_U12_SCRIPT).toContain('expectedRevision: u12Snapshot.session?.revision ?? null');
    expect(ULC_U12_SCRIPT).toContain('status: u12Present.get(person.athleteId) === true ? "present" : "absent"');
    expect(ULC_U12_SCRIPT).toContain('state: u12Snapshot.session?.state ?? "scheduled"');
    expect(ULC_U12_SCRIPT).toContain('note: u12Snapshot.session?.note ?? null');
    expect(ULC_U12_SCRIPT).toContain('error?.status === 409');
    expect(ULC_U12_SCRIPT).toContain("u12Conflict = true;");
    expect(ULC_U12_SCRIPT).toContain("u12WriteAllowed = false;");
    expect(ULC_U12_SCRIPT).toContain('u12Snapshot.session?.state === "cancelled"');
    expect(ULC_U12_SCRIPT).toContain('if (generation !== attendanceSessionGeneration || loadId !== u12LoadId)');
    expect(ULC_U12_SCRIPT).toContain('u12Snapshot.session === null ? "Noch nicht erfasst');
    expect(ULC_U12_SCRIPT).toContain("u12DirtyDates.clear();");
  });

  it("does not silently persist a completely unchecked first visit", () => {
    // The initial state is a draft only. Save is enabled explicitly, and
    // marking every unchecked name absent requires a deliberate trainer save.
    const bootstrap = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf("async function bootstrapU12()"),
      ULC_U12_SCRIPT.indexOf("function refreshU12Controls()"),
    );
    expect(bootstrap).toContain("await loadU12Attendance()");
    expect(bootstrap).not.toContain("saveU12Attendance()");
    const changeHandler = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf('u12Ui.days?.addEventListener("change"'),
    );
    expect(changeHandler).toContain("u12DirtyDates.add(u12LoadedDate)");
    expect(changeHandler).not.toContain("saveU12Attendance()");
    expect(ULC_U12_SCRIPT).toContain("u12DirtyDates.size === 0 && u12Snapshot?.session !== null");
  });

  it("guards unsaved rows on navigation, date changes, reload and sign-out", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('current === "u12" && section !== "u12"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("u12DirtyDates.size > 0 && !(await u12FlushChanges())");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (u12Saving || u12DirtyDates.size > 0)");
    expect(ULC_U12_SCRIPT).toContain('window.confirm("Ungespeicherte U12-Häkchen verwerfen');
    expect(ULC_U12_SCRIPT).toContain("if (!(await u12FlushChanges())) return;");
    expect(ULC_U12_SCRIPT).toContain("if (!(await u12FlushChanges())) {");
    expect(ULC_U12_SCRIPT).toContain('u12Ui.reload?.addEventListener("click"');
    expect(ULC_U12_SCRIPT).not.toMatch(/localStorage|sessionStorage|indexedDB|innerHTML/);
  });

  it("keeps checkboxes mounted while toggling and saving on mobile", () => {
    const saveBody = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf("async function saveU12Attendance()"),
      ULC_U12_SCRIPT.indexOf("async function u12FlushChanges()"),
    );
    expect(saveBody).not.toContain("renderU12Attendance()");
    expect(saveBody).toContain("refreshU12Controls()");
    const changeHandler = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf('u12Ui.days?.addEventListener("change"'),
    );
    expect(changeHandler).toContain("refreshU12Controls()");
    expect(changeHandler).not.toContain("renderU12Attendance()");
    expect(ULC_U12_CSS).toContain("min-height: 44px");
    expect(ULC_U12_CSS).toContain("max-width: 100%");
    expect(ULC_U12_CSS).not.toContain("grid-template-columns: repeat(4");
    expect(ULC_LINZ_APP_CSS).toContain(ULC_U12_CSS);
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });
});
