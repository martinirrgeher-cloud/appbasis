import { describe, expect, it } from "vitest";

import {
  ULC_TRAINING_PLANS_CSS,
  ULC_TRAINING_PLANS_HTML,
  ULC_TRAINING_PLANS_SCRIPT,
} from "../worker/training-plans-ui";
import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC E7B6 training plan block template UI", () => {
  it("adds planning as the second training-focused primary navigation candidate", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="training-plans" data-nav-priority="2" hidden disabled>Planung',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="training-plan-quick-action"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"training-plans",\n  "exercise-catalog"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("bootstrapTrainingPlans()");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'if (section === "training-plans") return trainingPlansReady;',
    );
  });

  it("renders one mobile-friendly seven-day week with a focused editor overlay", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'data-app-section="training-plans"',
    );
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-week"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-editor" hidden');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-add-exercise"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-add-block"');
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-attendance-filter"',
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      "grid-template-columns: repeat(7, minmax(0, 1fr));",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain("overflow-x: auto;");
    expect(ULC_TRAINING_PLANS_CSS).toContain("min-height: var(--touch);");
  });

  it("adds the old group-week overview inside the existing training-plans module", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-overview-group"',
    );
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-overview"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "features?.groupWeekOverview !== true",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "!Array.isArray(payload?.overviewGroups)",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"/api/modules/training-plans/overview?groupId="',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanOverview.rows",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "cell.durationMinutes",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "cell.exerciseCount",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "openTrainingPlanFromOverview",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "/api/modules/training-registration",
    );
  });

  it("uses a group-first mobile planning flow with day tabs and a separate athlete view", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain('data-training-plan-mode="group"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('data-training-plan-mode="athlete"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-overview-days"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-group-panel"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-athlete-panel"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('let trainingPlanViewMode = "group";');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("showTrainingPlanMode");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("training-plan-group-row");
    expect(ULC_TRAINING_PLANS_CSS).toContain(".training-plan-day-tabs");
    expect(ULC_TRAINING_PLANS_CSS).toContain("height: 100dvh");
  });

  it("keeps the add picker open for multi-add and offers exercise category filtering", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-picker-category"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("renderTrainingPlanPickerCategories");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('item.categoryKey === categoryKey');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("Die Auswahl bleibt offen");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("trainingPlanItemCompactSummary");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"/api/modules/training-plans/day?subjectId="',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "openTrainingPlanEditor(date, payload.plan)",
    );
  });

  it("supports attendance-focused group planning, athlete navigation and plan distribution", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-overview-attendance-filter"',
    );
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-prev-athlete"',
    );
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-next-athlete"',
    );
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-distribute"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanAttendanceCompactLabel",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "cell.attendanceStatuses.includes",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "navigateTrainingPlanGroupAthlete",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"/copy"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"TRAINING_PLAN_TARGET_OCCUPIED"',
    );
  });

  it("loads only Monday-based week data without client-owned organization scope", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"/api/modules/training-plans/week?subjectId="',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "let trainingPlanWeekStart = trainingPlanMonday(new Date());",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanAddDays(trainingPlanWeekStart, 6)",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("organizationId");
  });

  it("uses manual save, saves on controlled leave and keeps optimistic concurrency", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-save"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "expectedRevision: existing.currentRevision",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"TRAINING_PLAN_CONFLICT"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"TRAINING_PLAN_TARGET_OCCUPIED"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "scheduleTrainingPlanSave",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "async function saveTrainingPlanUntilClean()",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "while (trainingPlanDirty)",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'window.addEventListener("pagehide", persistTrainingPlanOnPageHide)',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("keepalive: true");
  });

  it("discards stale group overview responses and reloads the current week", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSelectedOverviewGroupId !== groupId ||\n      trainingPlanWeekStart !== weekStart",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "requestOutdated &&\n      trainingPlanViewMode === \"group\"",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "void loadTrainingPlanOverview();",
    );
  });

  it("blocks stale week cards while a new subject or week is loading", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "button.disabled = trainingPlanWeekLoading || !trainingPlanWeekLoaded;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'if (trainingPlanWeekLoading || !trainingPlanWeekLoaded) return;\n  const control = event.target?.closest?.("[data-training-plan-day]");',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'trainingPlanWeekLoading\n      ? "Woche wird geladen …"',
    );
  });

  it("keeps week cards disabled when the authoritative week load failed", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "let trainingPlanWeekLoaded = false;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanWeekPlans = payload.plans.slice();\n    trainingPlanWeekAttendance = payload.attendance.slice();\n    trainingPlanWeekLoaded = true;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "button.disabled = trainingPlanWeekLoading || !trainingPlanWeekLoaded;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"Woche ist derzeit nicht verfügbar."',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      ': "Anwesenheit nicht verfügbar"',
    );
  });

  it("re-renders week cards only after clearing the loading flag", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "finally {\n    trainingPlanWeekLoading = false;\n    refreshTrainingPlanControls();\n    renderTrainingPlanWeek();\n  }",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "trainingPlanWeekPlans = payload.plans.slice();\n    renderTrainingPlanWeek();",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "trainingPlanWeekPlans = [];\n    renderTrainingPlanWeek();\n    showMessage(",
    );
  });

  it("keeps active draft inputs mounted across successful manual save", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanApplySavedIds(trainingPlanDraft, saved.revision.items);",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "trainingPlanDraft = trainingPlanDraftFromSnapshot(saved);",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "if (trainingPlanConflict) {\n      renderTrainingPlanItems();\n    }",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "trainingPlanChangeVersion === version\n    ) {\n      renderTrainingPlanItems();",
    );
  });

  it("fails closed if saved item identity shape cannot be reconciled", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'if (draft.items.length !== savedItems.length) {\n    throw new Error("INVALID_TRAINING_PLAN_SAVE");',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'item.exercises.length !== saved.exercises.length',
    );
  });

  it("preserves the conflicting dirty draft when a reload fails", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "const reloaded = await loadTrainingPlanWeek();",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "if (!reloaded) {\n    trainingPlanConflict = true;\n    trainingPlanDirty = true;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "Deine Änderungen bleiben erhalten.",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanConflict = false;\n  trainingPlanDirty = false;\n  trainingPlanChangeVersion = 0;",
    );
  });

  it("requires the explicit read-only attendance contract for E7B5", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "features?.attendanceSummary !== true",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "features?.attendanceFilter !== true",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "!Array.isArray(payload?.attendance)",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "!payload.attendance.every(isTrainingPlanAttendance)",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanWeekAttendance = payload.attendance.slice();",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("organizationId");
  });

  it("offers all attendance filters and applies them locally without writes", () => {
    for (const option of [
      '<option value="all">Alle</option>',
      '<option value="present">Anwesend</option>',
      '<option value="excused">Entschuldigt</option>',
      '<option value="absent">Abwesend</option>',
      '<option value="open">Offen</option>',
      '<option value="none">Kein Eintrag</option>',
    ]) {
      expect(ULC_TRAINING_PLANS_HTML).toContain(option);
    }
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'if (trainingPlanAttendanceFilter === "none") return entries.length === 0;',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "return entries.some(\n    (entry) => entry.status === trainingPlanAttendanceFilter,\n  );",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'trainingPlanElements.attendanceFilter?.addEventListener("change"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "renderTrainingPlanWeek();\n});\ntrainingPlanElements.week?.addEventListener",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "/api/modules/training-attendance",
    );
  });

  it("shows compact status badges and preserves planning provenance safely", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanAttendanceSummaryElement(attendance)",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'for (const status of ["present", "excused", "absent", "open"])',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '(count > 1 ? " ×" + String(count) : "")',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceExerciseId");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceBlockId");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceBlockRevision");
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "/api/modules/training-blocks",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("innerHTML");
  });
  it("renders and validates the block template picker contract", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-block-template"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-add-template"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("features?.blockTemplateAdoption !== true");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("!Array.isArray(payload?.blockTemplates)");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("!payload.blockTemplates.every(isTrainingPlanBlockTemplateSummary)");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("trainingPlanBlockTemplates = payload.blockTemplates.slice();");
  });

  it("loads an exact template revision and clones independent plan item ids", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('"/api/modules/training-plans/block-templates/"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('"?revision="');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("template.currentRevision !== summary.currentRevision");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceBlockId: template.item.sourceBlockId");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceBlockRevision: template.item.sourceBlockRevision");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("itemId: null");
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("/api/modules/training-blocks");
  });

  it("serializes template adoption without triggering background saves", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("let trainingPlanTemplateBusy = false;");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSaveBusy ||\n    trainingPlanTemplateBusy ||\n    trainingPlanSaveBackBusy",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "editable &&\n    !trainingPlanSaveBusy &&\n    !trainingPlanTemplateBusy &&\n    !trainingPlanSaveBackBusy;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("trainingPlanBlockDraftFromTemplate(template)");
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("scheduleTrainingPlanSave");
  });


  it("offers E7B7 save-back only for a clean persisted block", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-save-template"',
    );
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      "Als neue Vorlage speichern",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "features?.blockTemplateSaveBack !== true",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "!trainingPlanDirty",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSelected !== null",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'typeof item.itemId === "string"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'saveTemplate.textContent = "Als Vorlage speichern";',
    );
  });

  it("loads server-authorized groups and sends only save-back references, not block content", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"/api/modules/training-plans/block-template-save-options"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"/api/modules/training-plans/block-templates"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "planId: selectedPlan.id",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "blockItemId: itemId",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "expectedRevision: selectedPlan.currentRevision",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "audienceId,\n          name,",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "organizationId",
    );
  });

  it("adds a successfully created template to the live picker without mutating the current plan", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "currentRevision: template.currentRevision",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "renderTrainingPlanBlockTemplates();",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'trainingPlanSetSaveState("saved", "Vorlage angelegt");',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "trainingPlanDraft.items.push(template",
    );
  });

  it("guards save-back option and create races with an operation token", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "let trainingPlanSaveBackOperation = 0;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "const operation = ++trainingPlanSaveBackOperation;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "operation !== trainingPlanSaveBackOperation",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSaveBackOperation += 1;",
    );
  });


  it("enables save-back after manual save assigns a previously missing block item id", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "saveTemplate.dataset.trainingPlanSaveTemplateIndex = String(itemIndex);",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanDraft?.items[itemIndex]",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "button.dataset.trainingPlanSaveTemplate = item.itemId;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanApplySavedIds(trainingPlanDraft, saved.revision.items);",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "refreshTrainingPlanSaveBackButtons();",
    );
  });


  it("re-enables block-template adoption controls after save-back completes", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSaveBackBusy = false;\n  trainingPlanSaveBackItemId = null;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'showMessage(trainingPlanElements.saveTemplateMessage, "");\n  refreshTrainingPlanTemplateControls();',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSaveBackBusy = true;\n  refreshTrainingPlanTemplateControls();",
    );
  });

});
