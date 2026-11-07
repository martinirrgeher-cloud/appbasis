import { describe, expect, it, vi } from "vitest";
import { ULC_U12_CSS, ULC_U12_HTML, ULC_U12_SCRIPT } from "../worker/u12-ui";

function extract(fromMarker: string, toMarker: string) {
  const start = ULC_U12_SCRIPT.indexOf(fromMarker);
  const end = ULC_U12_SCRIPT.indexOf(toMarker, start + fromMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return ULC_U12_SCRIPT.slice(start, end);
}

type SummaryNode = {
  dataset: { u12SummaryId: string };
  hidden: boolean;
  children: Array<{ className: string; textContent: string }>;
  replaceChildren: () => void;
  append: (...items: Array<{ className: string; textContent: string }>) => void;
};

function makeSummary(id: string): SummaryNode {
  const node: SummaryNode = {
    dataset: { u12SummaryId: id },
    hidden: false,
    children: [],
    replaceChildren() { this.children = []; },
    append(...items) { this.children.push(...items); },
  };
  return node;
}

describe("ULC U12 content assignment overlay and roster summary", () => {
  it("opens the existing matrix from the contents card, not inline under the roster", () => {
    expect(ULC_U12_HTML).toContain('id="u12-content-assign" aria-haspopup="dialog"');
    expect(ULC_U12_HTML).toContain('<dialog class="u12-details-dialog u12-matrix-dialog" id="u12-assignment-section"');
    expect(ULC_U12_HTML).toContain('aria-labelledby="u12-assignment-heading"');
    expect(ULC_U12_HTML).toContain('id="u12-assignment-matrix"');
    expect(ULC_U12_HTML).toContain('id="u12-assignment-close"');
    expect(ULC_U12_HTML).toContain('id="u12-assignment-done"');
    expect(ULC_U12_HTML).toContain('Die Zuordnungen werden automatisch gespeichert.');
    expect(ULC_U12_HTML).not.toContain('class="card u12-matrix-card"');
    expect(ULC_U12_CSS).toContain('.u12-matrix-dialog {');
    expect(ULC_U12_CSS).toContain('max-height:calc(100dvh - 24px)');
    expect(ULC_U12_CSS).toContain('overflow-x:auto');
    expect(ULC_U12_SCRIPT).toContain('u12Ui.contentAssign?.addEventListener("click", () => openU12AssignmentDialog())');
    expect(ULC_U12_SCRIPT).toContain('u12Ui.assignmentClose?.addEventListener("click", () => u12Ui.matrixSection?.close())');
    expect(ULC_U12_SCRIPT).toContain('u12Ui.assignmentDone?.addEventListener("click", () => u12Ui.matrixSection?.close())');
  });

  it("does not open for missing data, empty contents, busy state, or a second time", () => {
    const source = extract("function openU12AssignmentDialog() {", "\nfunction renderU12AssignmentMatrix() {");
    const create = new Function(
      "u12Ui", "u12Snapshot", "u12Ready", "u12Loading", "u12Saving",
      "u12ContentTitles", "renderU12AssignmentMatrix", "refreshU12MatrixControls",
      source + "\nreturn openU12AssignmentDialog;",
    ) as (...args: unknown[]) => () => void;

    const dialog = { open: false, showModal: vi.fn() };
    const matrix = vi.fn();
    const refresh = vi.fn();
    const make = (titles: string[], snapshot: unknown, loading = false) =>
      create({ matrixSection: dialog }, snapshot, true, loading, false, titles, matrix, refresh);
    make(["Sprint"], { participants: [] })();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(matrix).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    make([], { participants: [] })();
    make(["Sprint"], null)();
    make(["Sprint"], { participants: [] }, true)();
    expect(dialog.showModal).toHaveBeenCalledOnce();
    dialog.open = true;
    make(["Sprint"], { participants: [] })();
    expect(dialog.showModal).toHaveBeenCalledOnce();
  });

  it("shows assigned content names below each present athlete and hides absent athletes", () => {
    const source = extract("function refreshU12AssignmentSummaries() {", "\nfunction openU12AssignmentDialog() {");
    const ann = makeSummary("anna");
    const ben = makeSummary("ben");
    const clara = makeSummary("clara");
    const rows = [ann, ben, clara];
    const nodes = {
      days: { querySelectorAll: () => rows },
    };
    const createElement = vi.fn(() => ({ className: "", textContent: "" }));
    const factory = new Function(
      "u12Ui", "u12Present", "u12ContentTitles", "u12ContentAssignments", "document", "u12ContentItems",
      source + "\nreturn refreshU12AssignmentSummaries;",
    ) as (...args: unknown[]) => () => void;
    const render = factory(
      nodes,
      new Map([["anna", true], ["ben", false], ["clara", true]]),
      ["Sprint", "Sprung", "Koordination"],
      new Map([["anna", new Set([1, 3])], ["ben", new Set([2])], ["clara", new Set<number>()]]),
      { createElement },
      [{ code: "sprint", detail: "4 × 30 m" }, { code: "jump", detail: "" }, { code: "coordination", detail: "" }],
    );
    render();
    expect(ann.hidden).toBe(false);
    expect(ann.children.map((c) => c.textContent)).toEqual([
      "Inhalte:", "1. Sprint · 4 × 30 m", "3. Koordination",
    ]);
    expect(ben.hidden).toBe(true);
    expect(ben.children).toHaveLength(0);
    expect(clara.hidden).toBe(false);
    expect(clara.children.map((c) => c.textContent)).toEqual([
      "Inhalte:", "keine zugeordnet",
    ]);
    render();
    expect(ann.children).toHaveLength(3);
  });

  it("updates labels directly from the draft without rebuilding the roster or saving on modal close", () => {
    expect(ULC_U12_SCRIPT).toContain('summary.dataset.u12SummaryId = person.athleteId;');
    expect(ULC_U12_SCRIPT).toContain('row.append(summary);');
    expect(ULC_U12_SCRIPT).toContain('refreshU12AssignmentSummaries();');
    expect(ULC_U12_SCRIPT).toContain('markU12DraftDirty();');
    expect(ULC_U12_SCRIPT).toContain('u12ContentAssignments.set(athleteId, selected);');
    const onChange = ULC_U12_SCRIPT.slice(ULC_U12_SCRIPT.indexOf('u12Ui.matrix?.addEventListener("change"'));
    expect(onChange).toContain('changeU12MatrixColumn(');
    expect(onChange).toContain('changeU12MatrixAssignment(');
    expect(onChange).not.toContain('saveU12Attendance()');
    expect(ULC_U12_SCRIPT).toContain('if (u12Ui.matrixSection?.open) u12Ui.matrixSection.close();');
    expect(ULC_U12_SCRIPT).toContain("expectedRevision: u12Snapshot.session?.revision ?? null");
    expect(ULC_U12_SCRIPT).not.toMatch(/localStorage|sessionStorage|indexedDB|innerHTML/);
  });
});
