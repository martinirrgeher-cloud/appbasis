import { afterEach, describe, expect, it, vi } from "vitest";
import { ULC_U12_HTML, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

afterEach(() => vi.useRealTimers());

describe("U12, U14 and Kindertraining autosave with per-training notes", () => {
  it("exposes a scoped 3000-character training note and hides manual save unless retry is needed", () => {
    for (const [prefix, html, script] of [
      ["u12", ULC_U12_HTML, ULC_U12_SCRIPT],
      ["u14", ULC_U14_HTML, ULC_U14_SCRIPT],
      ["kids", ULC_KIDS_HTML, ULC_KIDS_SCRIPT],
    ] as const) {
      expect(html).toContain('id="' + prefix + '-notes-card"');
      expect(html).toContain('id="' + prefix + '-note" maxlength="3000"');
      expect(html).toContain('id="' + prefix + '-save"');
      expect(html).toContain('hidden disabled>Erneut versuchen</button>');
      expect(script).toContain(prefix + 'Ui.note?.addEventListener("input"');
      expect(script).toContain("note: " + prefix + "Note.trim() || null");
      expect(script).toContain(prefix + "Note = " + prefix + "Snapshot.session?.note ??");
      expect(script).toContain(prefix + "AutoSaveFailed");
      expect(script).toContain("function schedule" + (prefix === "kids" ? "Kids" : prefix.toUpperCase()) + "AutoSave()");
      expect(script).toContain("const savedVersion = " + prefix + "EditVersion");
      expect(script).toContain(prefix + "TouchedAthletes.has(person.athleteId)");
      expect(script).toContain(": person.status,");
      expect(script).toContain("if (savedVersion === " + prefix + "EditVersion)");
      expect(script).toContain("if (" + prefix + "Saving) return " + prefix + "SaveInFlight ?? false");
      expect(script).toContain("const operation = (async () =>");
      expect(script).toContain("schedule" + (prefix === "kids" ? "Kids" : prefix.toUpperCase()) + "AutoSave()");
    }
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("debounces the initial write, rather than saving an empty day on load", () => {
    const source = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf("function scheduleU12AutoSave()"),
      ULC_U12_SCRIPT.indexOf("function markU12DraftDirty()"),
    );
    const save = vi.fn();
    const schedule = new Function(
      "u12AutoSaveTimer", "u12DirtyDates", "u12AutoSaveFailed", "u12Ready",
      "u12Conflict", "u12WriteAllowed", "u12Loading", "u12Saving", "saveU12Attendance", "u12ContentTitles",
      source + "\nreturn scheduleU12AutoSave;",
    )(
      null, new Set(["2026-11-07"]), false, true, false, true, false, false, save, [],
    ) as () => void;
    vi.useFakeTimers();
    schedule();
    vi.advanceTimersByTime(849);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
    const empty = new Function(
      "u12AutoSaveTimer", "u12DirtyDates", "u12AutoSaveFailed", "u12Ready",
      "u12Conflict", "u12WriteAllowed", "u12Loading", "u12Saving", "saveU12Attendance", "u12ContentTitles",
      source + "\nreturn scheduleU12AutoSave;",
    )(null, new Set(), false, true, false, true, false, false, save, []) as () => void;
    empty();
    vi.advanceTimersByTime(900);
    expect(save).toHaveBeenCalledOnce();
  });

  it("protects recent edits while a CAS write is in flight and flushes on navigation", () => {
    expect(ULC_U12_SCRIPT).toContain("const savedVersion = u12EditVersion;");
    expect(ULC_U12_SCRIPT).toContain("if (savedVersion === u12EditVersion)");
    expect(ULC_U12_SCRIPT).toContain("u12Snapshot = payload.snapshot;");
    expect(ULC_U12_SCRIPT).toContain("if (u12Saving)");
    expect(ULC_U12_SCRIPT).toContain("await u12SaveInFlight");
    expect(ULC_U12_SCRIPT).toContain("if (!(await saveU12Attendance())) return false;");
    expect(ULC_U12_SCRIPT).toContain("u12AutoSaveFailed = true");
    expect(ULC_U12_SCRIPT).toContain("u12Conflict = true");
    expect(ULC_U12_SCRIPT).not.toContain("localStorage");
  });
});
