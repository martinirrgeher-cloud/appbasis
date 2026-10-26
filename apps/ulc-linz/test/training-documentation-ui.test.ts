import { describe, expect, it } from "vitest";

import {
  ULC_TRAINING_DOCUMENTATION_CSS,
  ULC_TRAINING_DOCUMENTATION_HTML,
  ULC_TRAINING_DOCUMENTATION_SCRIPT,
} from "../worker/training-documentation-ui";
import {
  ULC_TRAINING_PLANS_HTML,
  ULC_TRAINING_PLANS_SCRIPT,
} from "../worker/training-plans-ui";
import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC training documentation UI", () => {
  it("is a dedicated factory-composed app section and dashboard entry", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="training-documentation"',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="training-documentation-quick-action"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      'data-app-section="training-documentation"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "bootstrapTrainingDocumentation()",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'if (section === "training-documentation") return trainingDocumentationReady;',
    );
  });

  it("supports plan handoff, explicit manual save and completion lifecycle", () => {
    expect(ULC_TRAINING_PLANS_HTML).toContain(
      'id="training-plan-document-open"',
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "openTrainingDocumentationFromPlan",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "saveTrainingPlanUntilClean()",
    );
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain(
      "openTrainingDocumentationForDay(subjectId, sessionDate)",
    );
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      'id="training-documentation-save"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      'id="training-documentation-complete"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      'id="training-documentation-reopen"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      '"/complete"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      '"/reopen"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).not.toContain(
      "scheduleTrainingDocumentationSave",
    );
  });

  it("keeps attendance import explicit and never silently overwrites it", () => {
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      'id="training-documentation-refresh-attendance"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      '"/refresh-attendance"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      "if (trainingDocumentationDirty && !(await saveTrainingDocumentation()))",
    );
  });

  it("prompts before discarding unsaved documentation", () => {
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      'id="training-documentation-leave-dialog"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_HTML).toContain(
      "Speichern &amp; verlassen",
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      "requestTrainingDocumentationLeaveDecision",
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      "prepareTrainingDocumentationForLeave",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'current === "training-documentation"',
    );
  });

  it("edits actual values separately from immutable planned labels", () => {
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      "plannedRepetitions",
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      "actualRepetitions",
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      "actualDurationMinutes",
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).toContain(
      '"Durchgeführt"',
    );
    expect(ULC_TRAINING_DOCUMENTATION_CSS).toContain(
      ".training-documentation-planned",
    );
  });

  it("never sends client-owned organization or actor scope", () => {
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).not.toContain(
      "organizationId",
    );
    expect(ULC_TRAINING_DOCUMENTATION_SCRIPT).not.toContain(
      "actorPrincipalId",
    );
  });
});
