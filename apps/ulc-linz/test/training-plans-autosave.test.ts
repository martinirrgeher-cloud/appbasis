import { describe, expect, it } from "vitest";
import { ULC_TRAINING_PLANS_SCRIPT, ULC_TRAINING_PLANS_HTML } from "../worker/training-plans-ui";
import { readFileSync } from "node:fs";

describe("ULC N07 debounced training-plan autosave", () => {
  const script = ULC_TRAINING_PLANS_SCRIPT;

  function editorScheduler() {
    const begin = script.indexOf("function markTrainingPlanDirty(render)");
    const end = script.indexOf("\nasync function saveTrainingPlanUntilClean()", begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const section = script.slice(begin, end);
    let nextId = 1;
    const timers = new Map<number, () => void>();
    const backupWrites: string[] = [];
    const saves: number[] = [];
    const make = new Function("setTimeout", "clearTimeout", "backupWrites", "saves", `
      let trainingPlanDraft = { note: "", items: [] };
      let trainingPlansCanEdit = true;
      let trainingPlanConflict = false;
      let trainingPlanDirty = false;
      let trainingPlanChangeVersion = 0;
      let trainingPlanAutoSavePaused = false;
      let trainingPlanEditorDate = "2026-11-10";
      let trainingPlanAutoSaveTimer = null;
      let trainingPlanTemplateBusy = false;
      let trainingPlanSaveBackBusy = false;
      let trainingPlanPickerMode = null;
      const TRAINING_PLAN_AUTOSAVE_DELAY_MS = 850;
      const trainingPlanSelected = null;
      function trainingPlanWriteLeaveBackup() { backupWrites.push("saved"); }
      function trainingPlanSetSaveState() {}
      function refreshTrainingPlanSaveBackButtons() {}
      function refreshTrainingPlanEditorState() {}
      function renderTrainingPlanItems() {}
      async function saveTrainingPlan() { saves.push(trainingPlanChangeVersion); return true; }
      ${section}
      return { markTrainingPlanDirty, scheduleTrainingPlanSave, cancelTrainingPlanAutoSave,
        getVersion: () => trainingPlanChangeVersion,
        getDirty: () => trainingPlanDirty,
        setConflict: v => { trainingPlanConflict = v; },
        setPaused: v => { trainingPlanAutoSavePaused = v; },
        setTemplateBusy: v => { trainingPlanTemplateBusy = v; },
        setPickerMode: v => { trainingPlanPickerMode = v; },
      };
    `);
    const app = make(
      (callback: () => void, delay: number) => {
        expect(delay).toBe(850);
        const id = nextId++;
        timers.set(id, callback);
        return id;
      },
      (id: number) => timers.delete(id),
      backupWrites,
      saves,
    ) as {
      markTrainingPlanDirty: () => void;
      scheduleTrainingPlanSave: () => void;
      cancelTrainingPlanAutoSave: () => void;
      getVersion: () => number;
      getDirty: () => boolean;
      setConflict: (value: boolean) => void;
      setPaused: (value: boolean) => void;
      setTemplateBusy: (value: boolean) => void;
      setPickerMode: (value: string | null) => void;
    };
    return {
      ...app, timers, backupWrites, saves,
      fire() {
        const [id, fn] = [...timers.entries()][0]!;
        timers.delete(id);
        fn();
      },
    };
  }

  it("debounces rapid field edits to one network attempt while backing up every change", () => {
    const run = editorScheduler();
    run.markTrainingPlanDirty();
    run.markTrainingPlanDirty();
    run.markTrainingPlanDirty();
    expect(run.getVersion()).toBe(3);
    expect(run.getDirty()).toBe(true);
    expect(run.backupWrites).toHaveLength(3);
    expect(run.timers.size).toBe(1);
    run.fire();
    expect(run.saves).toEqual([3]);
  });

  it("never schedules a conflicting draft and waits for an in-flight template operation", () => {
    const run = editorScheduler();
    run.markTrainingPlanDirty();
    run.setTemplateBusy(true);
    run.fire();
    expect(run.saves).toHaveLength(0);
    expect(run.timers.size).toBe(1);
    run.setTemplateBusy(false);
    run.fire();
    expect(run.saves).toEqual([1]);
    run.setConflict(true);
    run.scheduleTrainingPlanSave();
    expect(run.timers.size).toBe(0);
  });

  it("defers persistence until a structural exercise picker is closed", () => {
    const run = editorScheduler();
    run.markTrainingPlanDirty();
    run.setPickerMode("exercise");
    run.fire();
    expect(run.saves).toHaveLength(0);
    expect(run.timers.size).toBe(1);
    run.setPickerMode(null);
    run.fire();
    expect(run.saves).toEqual([1]);
    expect(script).toContain("if (!item || !trainingPlanDraft || trainingPlanSaveBusy) return;");
    expect(script).toContain("if (!trainingPlanDraft || trainingPlanSaveBusy) return;");
  });

  it("joins simultaneous save callers, only starts one writer, then queues remaining edits", async () => {
    const begin = script.indexOf("function saveTrainingPlan() {");
    const end = script.indexOf("\nasync function performTrainingPlanSave()", begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const wrapper = script.slice(begin, end);
    let resolveWrite: ((value: boolean) => void) | undefined;
    const writes: number[] = [];
    const schedules: number[] = [];
    const make = new Function("writes", "schedules", "defer", `
      let trainingPlanSessionGeneration = 1;
      let trainingPlanSaveInFlight = null;
      let trainingPlanDirty = true;
      let trainingPlanConflict = false;
      let trainingPlanAutoSavePaused = false;
      function cancelTrainingPlanAutoSave() {}
      function scheduleTrainingPlanSave() { schedules.push(1); }
      function performTrainingPlanSave() { writes.push(1); return defer(); }
      ${wrapper}
      return { saveTrainingPlan, setDirty: v => { trainingPlanDirty = v; },
        changeSession: () => { trainingPlanSessionGeneration++; } };
    `);
    const app = make(writes, schedules, () => new Promise<boolean>(resolve => {
      resolveWrite = resolve;
    })) as {
      saveTrainingPlan: () => Promise<boolean>;
      setDirty: (value: boolean) => void;
      changeSession: () => void;
    };
    const a = app.saveTrainingPlan();
    const b = app.saveTrainingPlan();
    expect(writes).toHaveLength(1);
    expect(resolveWrite).toBeTypeOf("function");
    resolveWrite!(true);
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(schedules).toHaveLength(1);
  });

  it("does not resume an old user's queue after the session generation changes", async () => {
    expect(script).toContain("if (!isCurrent()) return false;");
    expect(script).toContain("identityId === trainingPlanSessionIdentityId");
    expect(script).toContain("draft === trainingPlanDraft");
    expect(script).toContain("if (generation !== trainingPlanSessionGeneration) return;");
    expect(script).toContain("trainingPlanWriteLeaveBackup(saved);");
    expect(script).toContain("trainingPlanClearLeaveBackup(subjectId, planDate);");
    expect(script).toContain("if (trainingPlanDirty && !trainingPlanConflict && !trainingPlanAutoSavePaused)");
    expect(script).toContain("trainingPlanAutoSavePaused = true;");
    expect(script).toContain("trainingPlanElements.editor.inert = false;");
  });

  it("requires the server autosave contract and preserves explicit conflict recovery", () => {
    const http = readFileSync(new URL("../worker/training-plans-http.ts", import.meta.url), "utf8");
    expect(http).toContain("autosave: true,");
    expect(http).toContain("manualSave: true,");
    expect(http).toContain("confirmOnLeave: true,");
    expect(script).toContain("expectedRevision: existing.currentRevision");
    expect(script).toContain('"TRAINING_PLAN_CONFLICT"');
    expect(script).toContain('"TRAINING_PLAN_TARGET_OCCUPIED"');
    expect(script).toContain("requestTrainingPlanLeaveDecision()");
    expect(script).toContain("await saveTrainingPlanUntilClean();");
    expect(ULC_TRAINING_PLANS_HTML).toContain("Änderungen werden automatisch gespeichert.");
  });
});
