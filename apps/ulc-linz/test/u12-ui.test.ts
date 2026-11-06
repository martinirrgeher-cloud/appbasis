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

describe("ULC A03 U12 weekly attendance vertical slice", () => {
  it("adds a U12 surface without changing the three fixed navigation items", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-app-section="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('data-dashboard-view="u12" hidden');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="u12"');
    expect(ULC_LINZ_APP_HTML).toContain('id="u12-week"');
    expect(ULC_LINZ_APP_HTML).toContain('id="u12-group"');
    expect(ULC_LINZ_APP_HTML).toContain('id="u12-save"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="home"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="kindertraining"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="training-documentation"');
    expect(ULC_LINZ_APP_HTML).toContain('id="kindertraining-week-save"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (section === "u12") return u12Ready;');
    expect(ULC_LINZ_APP_SCRIPT).toContain('card.hidden = !isAppNavigationAvailable(card.dataset.dashboardView || "")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('if (target === "u12") prepareU12View();');
    expect(ULC_LINZ_APP_SCRIPT).toContain('    bootstrapU12(),');
    expect(ULC_LINZ_APP_SCRIPT).toContain('  resetU12SessionState();');
  });

  it("handles seven ISO dates, server-side roster, optimistic CAS and fail-closed access", () => {
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12")');
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12/session?groupId="');
    expect(ULC_U12_SCRIPT).toContain('requestJson("/api/modules/u12/session", {');
    expect(ULC_U12_SCRIPT).toContain('const dates = registrationWeekDates(weekStart);');
    expect(ULC_U12_SCRIPT).toContain('Promise.allSettled(dates.map(');
    expect(ULC_U12_SCRIPT).toContain('expectedRevision: entry.snapshot.session?.revision ?? null');
    expect(ULC_U12_SCRIPT).toContain('attendance: entry.draft.participants.map(');
    expect(ULC_U12_SCRIPT).toContain('error?.status === 409');
    expect(ULC_U12_SCRIPT).toContain('u12Conflict = true;');
    expect(ULC_U12_SCRIPT).toContain('u12WriteAllowed = false;');
    expect(ULC_U12_SCRIPT).toContain('if (generation !== attendanceSessionGeneration)');
    expect(ULC_U12_SCRIPT).toContain('window.confirm("Ungespeicherte U12-Änderungen verwerfen');
  });

  it("preserves edits when navigating or signing out and avoids cached personal data", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('current === "u12" && section !== "u12"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('u12DirtyDates.size > 0 && !(await u12FlushChanges())');
    expect(ULC_U12_SCRIPT).toContain('u12AutoTimer = window.setTimeout');
    expect(ULC_U12_SCRIPT).toContain('u12DirtyDates.delete(date)');
    expect(ULC_U12_SCRIPT).not.toMatch(/localStorage|sessionStorage|indexedDB/);
    expect(ULC_U12_SCRIPT).toContain('label.textContent = person.lastName + " " + person.firstName;');
    expect(ULC_LINZ_APP_CSS).toContain(ULC_U12_CSS);
  });

  it("keeps the mobile note editor mounted during autosave and retries concurrent edits", () => {
    const start = ULC_U12_SCRIPT.indexOf("async function saveU12Week()");
    const end = ULC_U12_SCRIPT.indexOf("async function u12FlushChanges()", start);
    const saveBody = ULC_U12_SCRIPT.slice(start, end);
    // The normal save path must not replace the focused editor. A forced
    // redraw is appropriate only when the backend revokes write access.
    const normalSaveBody = saveBody.slice(0, saveBody.indexOf("} catch (error) {"));
    const saveFinally = saveBody.slice(saveBody.lastIndexOf("} finally {"));
    expect(normalSaveBody).not.toContain("renderU12Week()");
    expect(saveFinally).not.toContain("renderU12Week()");
    expect(saveBody).toContain("u12WriteAllowed = false;");
    expect(saveBody).toContain("renderU12Week();");
    expect(saveBody).toContain("refreshU12Controls()");
    expect(saveBody).toContain("const outgoingDraft = JSON.stringify(entry.draft)");
    expect(saveBody).toContain("JSON.stringify(entry.draft) === outgoingDraft");
    expect(saveBody).toContain("u12DirtyDates.add(date)");
    expect(saveBody).toContain("u12AutoTimer = window.setTimeout");
    const noteHandler = ULC_U12_SCRIPT.slice(ULC_U12_SCRIPT.indexOf('u12Ui.days?.addEventListener("input"'));
    expect(noteHandler).toContain("if (!date || !u12WriteAllowed || u12Conflict) return;");
    expect(noteHandler).not.toContain("if (!date || !u12WriteAllowed || u12Saving || u12Conflict)");
    expect(ULC_U12_SCRIPT).toContain('querySelectorAll("[data-u12-note-date]")');
    expect(ULC_U12_SCRIPT).toContain("note.disabled = !u12WriteAllowed || u12Conflict");
  });

  it("compiles into the existing browser JS and keeps stable responsive HTML", () => {
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
    expect(ULC_U12_HTML).toContain('aria-live="polite"');
    expect(ULC_U12_CSS).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(ULC_U12_CSS).toContain('max-width: 100%');
  });
});
