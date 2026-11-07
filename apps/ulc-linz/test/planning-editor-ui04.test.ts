import { describe, expect, it } from "vitest";

import {
  ULC_TRAINING_PLANS_HTML,
  ULC_TRAINING_PLANS_CSS,
  ULC_TRAINING_PLANS_SCRIPT,
} from "../worker/training-plans-ui";

describe("ULC UI-04.1: training content first and consistent mobile controls", () => {
  it("shows plan exercises and blocks before optional notes without remounting fields", () => {
    const html = ULC_TRAINING_PLANS_HTML;
    const positions = [
      html.indexOf('id="training-plan-items"'),
      html.indexOf('id="training-plan-note"'),
      html.indexOf('class="training-plan-footer"'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const id of ["training-plan-items", "training-plan-note", "training-plan-save"]) {
      expect(html.split('id="' + id + '"')).toHaveLength(2);
    }
    expect(html).toContain('id="training-plan-add-exercise"');
    expect(html).toContain('id="training-plan-add-block"');
    expect(html).toContain('id="training-plan-editor-meta"');
  });

  it("uses shared minimum 44px touch targets on mobile without hiding actions", () => {
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-week-nav .button { min-width: var(--touch); min-height: var(--touch);",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-mode-tabs button,\n  .training-plan-day-tab,\n  .training-plan-add-button { min-height: var(--touch); }",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-save-icon { min-width: var(--touch); width: var(--touch); min-height: var(--touch); }",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-icon-close { min-width: var(--touch); width: var(--touch); min-height: var(--touch); padding-inline: 0; }",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-header-actions {\n    justify-content: flex-start;\n    flex-wrap: wrap;",
    );
    expect(ULC_TRAINING_PLANS_CSS).toContain(
      ".training-plan-distribute-button,\n  .training-plan-document-button {\n    display: inline-flex;\n    min-width: var(--touch);",
    );
    for (const id of [
      "training-plan-prev-athlete",
      "training-plan-next-athlete",
      "training-plan-distribute-open",
      "training-plan-document-open",
      "training-plan-save",
      "training-plan-close",
    ]) {
      expect(ULC_TRAINING_PLANS_HTML).toContain('id="' + id + '"');
    }
  });

  it("retains manual save, leave confirmation, group and athlete selection", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-leave-save"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-leave-discard"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-overview-group"');
    expect(ULC_TRAINING_PLANS_HTML).toContain('id="training-plan-subject"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'trainingPlanElements.note?.addEventListener("input"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      'trainingPlanElements.save?.addEventListener("click"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("trainingPlanDraft.note =");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("trainingPlanConflict");
  });
});
