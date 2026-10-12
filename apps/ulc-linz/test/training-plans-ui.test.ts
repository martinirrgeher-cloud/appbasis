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

describe("ULC E7B4 training plan week UI", () => {
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
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      "grid-template-columns: repeat(7, minmax(0, 1fr));",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain("overflow-x: auto;");
    expect(ULC_TRAINING_PLANS_CSS).toContain("min-height: var(--touch);");
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

  it("autosaves with explicit optimistic concurrency and stops on conflicts", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "expectedRevision: existing.currentRevision",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"TRAINING_PLAN_CONFLICT"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"TRAINING_PLAN_TARGET_OCCUPIED"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "delay === undefined ? 550 : delay",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanSaveBusy",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'window.confirm("Ungespeicherte Änderungen verwerfen?")',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'window.addEventListener("beforeunload"',
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
      "trainingPlanWeekPlans = payload.plans.slice();\n    trainingPlanWeekLoaded = true;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "button.disabled = trainingPlanWeekLoading || !trainingPlanWeekLoaded;",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      '"Woche ist derzeit nicht verfügbar."',
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

  it("keeps active draft inputs mounted when typing continues during autosave", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "trainingPlanChangeVersion === version\n    ) {\n      renderTrainingPlanItems();",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "trainingPlanChangeVersion === version ||\n      !trainingPlanSavePending",
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

  it("preserves snapshot provenance while keeping E7B4 independent of block templates and attendance", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceExerciseId");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceBlockId");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("sourceBlockRevision");
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain(
      "/api/modules/training-blocks",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("attendance");
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain("innerHTML");
  });
});
