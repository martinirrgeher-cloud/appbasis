import { describe, expect, it } from "vitest";

import {
  ULC_TRAINING_BLOCKS_HTML,
  ULC_TRAINING_BLOCKS_CSS,
  ULC_TRAINING_BLOCKS_SCRIPT,
} from "../worker/training-blocks-ui";

describe("UI-03.2: responsive block details and version comparison", () => {
  it("keeps the exercise overlay header and tabs reachable while only its body scrolls", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain(
      'class="training-block-info-dialog" role="dialog" aria-modal="true"',
    );
    expect(ULC_TRAINING_BLOCKS_HTML).toContain(
      'id="training-block-info-close" type="button" aria-label="Übungsdetails schließen"',
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toMatch(
      /\.training-block-info-dialog\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s,
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toMatch(
      /\.training-block-info-dialog > \.training-block-header\s*\{[^}]*position:\s*relative;[^}]*flex:\s*0 0 auto;/s,
    );
    expect(ULC_TRAINING_BLOCKS_CSS).toMatch(
      /\.training-block-info-body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(ULC_TRAINING_BLOCKS_CSS).not.toContain("top: 73px;");
    expect(ULC_TRAINING_BLOCKS_CSS).not.toContain(".training-block-info-tabs { top: 62px; }");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("height: 92dvh;");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("max-height: 92dvh;");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain("#training-block-info-close {");
  });

  it("retains all existing detail tabs, private videos and resets scroll when switching tabs", () => {
    for (const tab of ["basis", "hinweise", "zuordnung", "parameter", "videos"]) {
      expect(ULC_TRAINING_BLOCKS_HTML).toContain('data-training-block-info-tab="' + tab + '"');
    }
    const begin = ULC_TRAINING_BLOCKS_SCRIPT.indexOf("function setTrainingBlockInfoTab(tab) {");
    const end = ULC_TRAINING_BLOCKS_SCRIPT.indexOf("\nfunction appendTrainingBlockInfoCard(", begin);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const switching = ULC_TRAINING_BLOCKS_SCRIPT.slice(begin, end);
    expect(switching).toContain("renderTrainingBlockExerciseInfo();");
    expect(switching).toContain("trainingBlockElements.infoBody.scrollTop = 0;");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("trainingBlockInfoPrivateMediaAvailable");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('video.preload = "metadata";');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('video.controls = true;');
  });

  it("makes version history readable on mobile while preserving the view and compare actions", () => {
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-history-row > button { min-height: 44px; }");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-history-row > div { min-width: 0; overflow-wrap: anywhere; }");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('button.dataset.trainingBlockRevisionOpen = String(revision.revision)');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("renderTrainingBlockRevisionSelect(trainingBlockElements.compareFrom, sorted)");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("renderTrainingBlockRevisionSelect(trainingBlockElements.compareTo, sorted)");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("await Promise.all([");
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("isCurrentTrainingBlockSelection(blockId, requestId)");
  });

  it("compares the same revision fields and renders before/after in separately readable containers", () => {
    const start = ULC_TRAINING_BLOCKS_SCRIPT.indexOf(
      "function addTrainingBlockComparisonRow(container, title, before, after) {",
    );
    const end = ULC_TRAINING_BLOCKS_SCRIPT.indexOf("\nfunction revisionExerciseLabel(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const renderRow = ULC_TRAINING_BLOCKS_SCRIPT.slice(start, end);
    expect(renderRow).toContain('oldValue.textContent = "Vorher: " + (before || "—");');
    expect(renderRow).toContain('newValue.textContent = "Nachher: " + (after || "—");');
    expect(renderRow).toContain('values.className = "training-block-comparison-values";');
    expect(renderRow).toContain("values.append(oldValue, newValue);");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-comparison-before { background: var(--muted); }");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-comparison-after { background: var(--card); }");
    expect(ULC_TRAINING_BLOCKS_CSS).toContain(".training-block-comparison-values { grid-template-columns: minmax(0, 1fr); }");

    const comparison = ULC_TRAINING_BLOCKS_SCRIPT.slice(
      ULC_TRAINING_BLOCKS_SCRIPT.indexOf("function renderTrainingBlockComparison("),
      ULC_TRAINING_BLOCKS_SCRIPT.indexOf("\nasync function compareTrainingBlockRevisions()"),
    );
    for (const field of ["Name", "Kategorie", "Trainingsgruppen", "Dauer", "Notiz"]) {
      expect(comparison).toContain('"' + field + '"');
    }
    for (const action of ["Übung hinzugefügt", "Übung entfernt", "Reihenfolge", "Übung", "Notiz"]) {
      expect(comparison).toContain(action);
    }
    expect(comparison).toContain("const keys = new Set([...beforeOverrides.keys(), ...afterOverrides.keys()]);");
    expect(comparison).toContain('count.className = "training-block-change-count";');
    expect(comparison).toContain('changes === 1 ? " Änderung" : " Änderungen"');
    expect(comparison).toContain("Keine fachlichen Änderungen zwischen diesen Versionen.");
  });

  it("keeps save, permissions and editor semantics unchanged", () => {
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-save" type="button"');
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('id="training-block-compare" type="button"');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('trainingBlockElements.save?.addEventListener("click", () => void saveTrainingBlock())');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('trainingBlockElements.compare?.addEventListener("click", () => void compareTrainingBlockRevisions())');
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain("trainingBlockSaveBusy");
  });
});
