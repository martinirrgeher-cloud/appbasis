import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import { ULC_TRAINING_PLANS_SCRIPT } from "../worker/training-plans-ui";

describe("G-02.2 registration and planning save/leave safety contracts", () => {
  it("warns on registration drafts and every registration write in progress", () => {
    const before = ULC_LINZ_APP_SCRIPT.indexOf('window.addEventListener("beforeunload", (event) => {');
    const after = ULC_LINZ_APP_SCRIPT.indexOf('elements.appNavMore?.addEventListener("click"', before);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before);
    const handler = ULC_LINZ_APP_SCRIPT.slice(before, after);
    for (const guard of [
      "selfRegistrationSavingKeys.size > 0",
      "selfRegistrationProxy?.saving",
      "selfRegistrationNoteDrafts.size > 0",
      "(selfRegistrationProxy?.noteDrafts?.size || 0) > 0",
      "u12Saving || u12DirtyDates.size > 0",
      "u14Saving || u14DirtyDates.size > 0",
      "kidsSaving || kidsDirtyDates.size > 0",
    ]) expect(handler).toContain(guard);
    expect(handler).toContain("event.preventDefault();");
    expect(handler).toContain('event.returnValue = "";');
    expect(handler).not.toContain("requestJson");
    expect(handler).not.toContain("localStorage");
    expect(ULC_LINZ_APP_SCRIPT).toContain("selfRegistrationConflictReloadPending");
    expect(ULC_LINZ_APP_SCRIPT).toContain("selfRegistrationNoteDrafts.clear();");
  });

  it("preserves the existing plan leave, retry and concurrency contracts", () => {
    const source = ULC_TRAINING_PLANS_SCRIPT;
    expect(source).toContain("function requestTrainingPlanLeaveDecision()");
    expect(source).toContain("function resolveTrainingPlanLeaveDecision(decision)");
    expect(source).toContain('queueMicrotask(() => trainingPlanElements.leaveSave?.focus());');
    expect(source).toContain("if (decision === \"stay\") return false;");
    expect(source).toContain('error?.code === "TRAINING_PLAN_CONFLICT"');
    expect(source).toContain("trainingPlanConflict = true;");
    expect(source).toContain("trainingPlanDirty = true;");
    expect(source).toContain("trainingPlanClearLeaveBackup(subjectId, planDate);");
    expect(source).toContain('window.addEventListener("beforeunload", (event) => {');
    expect(source).toContain("function trainingPlanWriteLeaveBackup(existing)");
    expect(source).toContain("value.identityId !== trainingPlanSessionIdentityId");
  });
});
