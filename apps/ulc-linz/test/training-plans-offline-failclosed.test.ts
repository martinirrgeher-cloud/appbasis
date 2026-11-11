import { describe, expect, it, vi } from "vitest";
import { ULC_TRAINING_PLANS_SCRIPT } from "../worker/training-plans-ui";

describe("ULC N10: offline training-plan autosave remains fail-closed", () => {
  const script = ULC_TRAINING_PLANS_SCRIPT;

  it("never queues an offline POST and resumes an unsent draft on reconnection", () => {
    const start = script.indexOf("function trainingPlanIsOffline()");
    const end = script.indexOf("\nasync function saveTrainingPlanUntilClean()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const source = script.slice(start, end);
    const timers: Array<() => void> = [];
    const navigator = { onLine: false };
    const save = vi.fn();
    const make = new Function("navigator", "timers", "save", `
      let trainingPlanAutoSaveTimer = null;
      let trainingPlanDraft = { note: "unsent", items: [] };
      let trainingPlanEditorDate = "2026-11-11";
      let trainingPlanDirty = true;
      let trainingPlansCanEdit = true;
      let trainingPlanConflict = false;
      let trainingPlanAutoSavePaused = false;
      let trainingPlanTemplateBusy = false;
      let trainingPlanSaveBackBusy = false;
      let trainingPlanPickerMode = null;
      const TRAINING_PLAN_AUTOSAVE_DELAY_MS = 850;
      const setTimeout = (fn) => { timers.push(fn); return timers.length; };
      const clearTimeout = () => {};
      function cancelTrainingPlanAutoSave() {
        if (trainingPlanAutoSaveTimer !== null) {
          clearTimeout(trainingPlanAutoSaveTimer);
          trainingPlanAutoSaveTimer = null;
        }
      }
      const saveTrainingPlan = save;
      ${source}
      return { scheduleTrainingPlanSave, trainingPlanIsOffline };
    `);
    const app = make(navigator, timers, save) as {
      scheduleTrainingPlanSave: () => void;
      trainingPlanIsOffline: () => boolean;
    };
    expect(app.trainingPlanIsOffline()).toBe(true);
    app.scheduleTrainingPlanSave();
    expect(timers).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    navigator.onLine = true;
    app.scheduleTrainingPlanSave();
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps uncertain network writes paused after reconnect and requires manual review", () => {
    const begin = script.indexOf('window.addEventListener("online",');
    const end = script.indexOf('trainingPlanElements.note?.addEventListener', begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    const source = script.slice(begin, end);
    const listeners = new Map<string, () => void>();
    const schedules: string[] = [];
    const states: string[] = [];
    const make = new Function("listeners", "schedules", "states", `
      const window = { addEventListener: (event, cb) => listeners.set(event, cb) };
      let trainingPlanDirty = true;
      let trainingPlanConflict = false;
      let trainingPlansCanEdit = true;
      let trainingPlanAutoSavePaused = true;
      let trainingPlanDraft = { note: "preserved" };
      let trainingPlanSaveBusy = false;
      const trainingPlanElements = { editorMessage: {} };
      function trainingPlanSetSaveState(state) { states.push(state); }
      function showMessage() {}
      function cancelTrainingPlanAutoSave() {}
      function scheduleTrainingPlanSave() { schedules.push("POST"); }
      ${source}
      return { setPaused: (value) => trainingPlanAutoSavePaused = value };
    `);
    const app = make(listeners, schedules, states) as { setPaused: (value: boolean) => void };
    listeners.get("online")!();
    expect(schedules).toEqual([]);
    expect(states).toContain("error");
    app.setPaused(false);
    listeners.get("online")!();
    expect(schedules).toEqual(["POST"]);
  });

  it("retains conflict CAS and explicit recovery while displaying uncertain-result warning", () => {
    expect(script).toContain('trainingPlanAutoSavePaused = true;');
    expect(script).toContain('error?.status === 409');
    expect(script).toContain('trainingPlanConflict = true;');
    expect(script).toContain('trainingPlanWriteLeaveBackup(saved);');
    expect(script).toContain('Speicherergebnis unklar.');
    expect(script).toContain('Keine Internetverbindung. Der Entwurf bleibt auf diesem Gerät erhalten.');
    expect(script).toContain('window.addEventListener("offline",');
    expect(script).toContain('if (trainingPlanIsOffline()) {');
    expect(script).not.toContain('window.addEventListener("online", () => {\n  if (!trainingPlanDirty || trainingPlanConflict || !trainingPlansCanEdit) return;\n  trainingPlanAutoSavePaused = false;');
  });
});
