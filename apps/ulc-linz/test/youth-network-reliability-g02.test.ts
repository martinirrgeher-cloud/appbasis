import { afterEach, describe, expect, it, vi } from "vitest";
import { ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_SCRIPT,
  ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";

afterEach(() => vi.useRealTimers());

describe("G-02 youth attendance: offline safety and reconnection", () => {
  it.each([
    ["u12", ULC_U12_SCRIPT],
    ["u14", ULC_U14_SCRIPT],
    ["kids", ULC_KIDS_SCRIPT],
  ] as const)("preserves safe write/CAS behavior in %s", (prefix, script) => {
    const method = prefix === "kids" ? "Kids" : prefix.toUpperCase();
    expect(script).toContain("function " + prefix + "IsOffline()");
    expect(script).toContain(prefix + "IsOffline() ||");
    expect(script).toContain("window.addEventListener(\"offline\",");
    expect(script).toContain("window.addEventListener(\"online\",");
    expect(script).toContain("window.addEventListener(\"beforeunload\",");
    expect(script).toContain("if (!" + prefix + "DirtyDates.size) return;");
    expect(script).toContain("event.preventDefault();");
    expect(script).toContain("event.returnValue = \"\";");
    expect(script).toContain("const savedVersion = " + prefix + "EditVersion;");
    expect(script).toContain(prefix + "AutoSaveFailed = true;");
    expect(script).toContain(prefix + "Conflict = true;");
    expect(script).toContain("function schedule" + method + "AutoSave()");
    expect(script).toContain("/api/modules/" + prefix + "/session");
    expect(script).toContain("Keine Internetverbindung.");
    expect(script).toContain("Ergebnis unklar;");
    expect(script).not.toContain("localStorage");
    expect(script).not.toContain("sessionStorage");
  });

  it("debounces a never-sent offline draft and resumes exactly once when online", () => {
    const source = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf("function u12IsOffline()"),
      ULC_U12_SCRIPT.indexOf("function markU12DraftDirty()"),
    );
    const connection = { onLine: false };
    const save = vi.fn();
    const schedule = new Function(
      "navigator",
      "u12AutoSaveTimer", "u12DirtyDates", "u12AutoSaveFailed",
      "u12Ready", "u12Conflict", "u12WriteAllowed", "u12Loading",
      "u12Saving", "saveU12Attendance", "u12ContentTitles",
      source + "\nreturn scheduleU12AutoSave;",
    )(
      connection, null, new Set(["2026-11-08"]), false,
      true, false, true, false, false, save, [],
    ) as () => void;

    vi.useFakeTimers();
    schedule();
    vi.advanceTimersByTime(3000);
    expect(save).not.toHaveBeenCalled();

    connection.onLine = true;
    schedule();
    vi.advanceTimersByTime(849);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenCalledOnce();
  });

  it("does not silently replay an uncertain POST or a 409 conflict", () => {
    const script = ULC_U12_SCRIPT;
    const start = script.indexOf('window.addEventListener("online",');
    const end = script.indexOf('window.addEventListener("beforeunload",', start);
    const onlineHandler = script.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(onlineHandler).toContain("!u12AutoSaveFailed");
    expect(onlineHandler).toContain("!u12Conflict");
    expect(onlineHandler).toContain("!u12Saving");
    expect(onlineHandler).toContain("!u12IsOffline()");
    const schedulerStart = script.indexOf("function scheduleU12AutoSave()");
    const schedulerEnd = script.indexOf("function markU12DraftDirty()", schedulerStart);
    const scheduler = script.slice(schedulerStart, schedulerEnd);
    expect(scheduler).toContain("u12Saving || u12IsOffline()");
    expect(scheduler).toContain("u12AutoSaveTimer = setTimeout");
    expect(scheduler).toContain("if (!u12DirtyDates.size || u12AutoSaveFailed");
    expect(scheduler).toContain("u12ContentTitles.some((title) => !title.trim())) return;");
    const saveStart = script.indexOf("async function saveU12Attendance()");
    const saveEnd = script.indexOf("async function u12FlushChanges()", saveStart);
    const saver = script.slice(saveStart, saveEnd);
    expect(saver).toContain("if (u12IsOffline())");
    expect(saver).toContain("return false;");
    expect(saver).toContain("if (error?.status === 409)");
    expect(saver).toContain("u12Conflict = true;");
    expect(saver).toContain("nach Wiederverbindung bitte manuell");
  });
});
