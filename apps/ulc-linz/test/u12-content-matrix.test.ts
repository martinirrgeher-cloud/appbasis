import { describe, expect, it, vi } from "vitest";

import { ULC_U12_HTML, ULC_U12_SCRIPT } from "../worker/u12-ui";

type Person = { athleteId: string };

type MatrixHarness = {
  changeU12MatrixAssignment: (athleteId: string, slot: number, checked: boolean) => void;
  changeU12MatrixColumn: (slot: number, checked: boolean) => void;
  u12PresentAthletes: () => Person[];
};

function createMatrixHarness({
  present = ["a", "b"],
  editable = true,
}: {
  present?: string[];
  editable?: boolean;
} = {}) {
  const persons = ["a", "b", "c"].map((athleteId) => ({ athleteId }));
  const assignments = new Map<string, Set<number>>();
  for (const person of persons) assignments.set(person.athleteId, new Set());
  const dirty = vi.fn();
  const start = ULC_U12_SCRIPT.indexOf("function u12PresentAthletes() {");
  const end = ULC_U12_SCRIPT.indexOf("\nfunction renderU12Attendance() {", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const source = ULC_U12_SCRIPT.slice(start, end);
  const create = new Function(
    "u12Snapshot", "u12Present", "u12ContentAssignments",
    "u12ContentTitles", "u12Ui", "u12Ready", "u12WriteAllowed",
    "u12Conflict", "u12Loading", "u12Saving", "markU12DraftDirty",
    source + "\nreturn { u12PresentAthletes, changeU12MatrixAssignment, changeU12MatrixColumn };",
  ) as (...args: unknown[]) => MatrixHarness;
  const controls = create(
    { participants: persons, session: { state: "scheduled" } },
    new Map(persons.map((person) => [person.athleteId, present.includes(person.athleteId)])),
    assignments,
    ["Koordination", "Sprint", "Sprung"],
    { matrix: null },
    true, editable, false, false, false,
    dirty,
  );
  return { ...controls, assignments, dirty };
}

describe("ULC U12: training-content matrix", () => {
  it("renders only attendees and never assumes all roster members attended", () => {
    const h = createMatrixHarness();
    expect(h.u12PresentAthletes().map((person) => person.athleteId)).toEqual(["a", "b"]);
    expect(ULC_U12_HTML).toContain("Nur anwesende Athleten");
    expect(ULC_U12_HTML).toContain('id="u12-assignment-matrix"');
  });

  it("assigns and removes exactly one content slot for all present children", () => {
    const h = createMatrixHarness();
    h.changeU12MatrixColumn(2, true);
    expect([...h.assignments.get("a")!]).toEqual([2]);
    expect([...h.assignments.get("b")!]).toEqual([2]);
    expect([...h.assignments.get("c")!]).toEqual([]);
    expect(h.dirty).toHaveBeenCalledOnce();
    h.changeU12MatrixColumn(2, false);
    expect([...h.assignments.get("a")!]).toEqual([]);
    expect([...h.assignments.get("b")!]).toEqual([]);
    expect([...h.assignments.get("c")!]).toEqual([]);
    expect(h.dirty).toHaveBeenCalledTimes(2);
  });

  it("preserves other individual checkboxes when setting a column for all", () => {
    const h = createMatrixHarness();
    h.changeU12MatrixAssignment("a", 1, true);
    h.changeU12MatrixAssignment("a", 3, true);
    h.changeU12MatrixColumn(2, true);
    expect([...h.assignments.get("a")!].sort()).toEqual([1, 2, 3]);
    expect([...h.assignments.get("b")!]).toEqual([2]);
    h.changeU12MatrixColumn(2, false);
    expect([...h.assignments.get("a")!].sort()).toEqual([1, 3]);
    expect([...h.assignments.get("b")!]).toEqual([]);
  });

  it("rejects absent athletes, invalid slots and read-only or empty-group writes", () => {
    const h = createMatrixHarness();
    h.changeU12MatrixAssignment("c", 1, true);
    h.changeU12MatrixAssignment("unknown", 1, true);
    h.changeU12MatrixAssignment("a", 0, true);
    h.changeU12MatrixAssignment("a", 4, true);
    h.changeU12MatrixColumn(6, true);
    expect(h.dirty).not.toHaveBeenCalled();
    const readOnly = createMatrixHarness({ editable: false });
    readOnly.changeU12MatrixColumn(1, true);
    expect(readOnly.dirty).not.toHaveBeenCalled();
    const noPresent = createMatrixHarness({ present: [] });
    noPresent.changeU12MatrixColumn(1, true);
    expect(noPresent.dirty).not.toHaveBeenCalled();
  });

  it("keeps current save, conflict, and attendance clearing semantics", () => {
    expect(ULC_U12_SCRIPT).toContain("expectedRevision: u12Snapshot.session?.revision ?? null");
    expect(ULC_U12_SCRIPT).toContain('if (error?.status === 409)');
    expect(ULC_U12_SCRIPT).toContain('if (!input.checked) u12ContentAssignments.set(athleteId, new Set());');
    expect(ULC_U12_SCRIPT).toContain('contentSlots: u12Present.get(person.athleteId) === true');
    expect(ULC_U12_SCRIPT).toContain('renderU12AssignmentMatrix();');
    expect(ULC_U12_SCRIPT).not.toContain("openU12ContentAssignments(");
  });
});
