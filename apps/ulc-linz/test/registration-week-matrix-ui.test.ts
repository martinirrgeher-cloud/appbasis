import { describe, expect, it } from "vitest";

import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

/**
 * Execute only the matrix's presentation function with a tiny test DOM.
 * It must not have an API request, change an attendance draft or derive a
 * subject from another group: the authorized week data is its sole input.
 */
function testNode(tag: string) {
  const element: any = {
    tag,
    children: [] as any[],
    dataset: {} as Record<string, string>,
    attributes: {} as Record<string, string>,
    hidden: false,
    disabled: false,
    textContent: "",
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    append(...children: any[]) {
      this.children.push(...children);
    },
    replaceChildren(...children: any[]) {
      this.children = [...children];
    },
  };
  return element;
}

const sourceStart = ULC_LINZ_APP_SCRIPT.indexOf(
  "function renderKindertrainingRegistrationMatrix() {",
);
const sourceEnd = ULC_LINZ_APP_SCRIPT.indexOf(
  "\nfunction renderKindertrainingWeek() {",
  sourceStart,
);

function matrixHarness({
  selectedGroupId = "group-a",
  loadedGroupId = "group-a",
  attendanceMode = "self_registration",
  snapshots = weekSnapshots(),
  open = true,
}: {
  selectedGroupId?: string;
  loadedGroupId?: string;
  attendanceMode?: "self_registration" | "trainer_roll_call";
  snapshots?: ReturnType<typeof weekSnapshots>;
  open?: boolean;
} = {}) {
  if (sourceStart < 0 || sourceEnd <= sourceStart) {
    throw new Error("Matrix function not found in the bundled UI script.");
  }
  const toggle = testNode("button");
  const panel = testNode("section");
  const scroll = testNode("div");
  const elements = {
    kindertrainingGroup: { value: selectedGroupId },
    kindertrainingMatrixToggle: toggle,
    kindertrainingRegistrationMatrix: panel,
    kindertrainingRegistrationMatrixScroll: scroll,
  };
  const dates = (start: string) =>
    Array.from({ length: 7 }, (_, offset) => {
      const d = new Date(start + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    });
  const program = ULC_LINZ_APP_SCRIPT.slice(sourceStart, sourceEnd) +
    "\nreturn renderKindertrainingRegistrationMatrix;";
  const factory = new Function(
    "elements", "kindertrainingGroups", "kindertrainingReady",
    "kindertrainingLoading", "kindertrainingLoadedGroupId",
    "kindertrainingWeekSnapshots", "kindertrainingWeekStart",
    "kindertrainingWeekSaving", "kindertrainingMatrixOpen",
    "registrationWeekDates", "localWeekStart", "germanDate",
    "germanWeekday", "kindertrainingRegistrationLabel", "document", program,
  ) as (...args: any[]) => () => void;
  const render = factory(
    elements, [{ id: selectedGroupId, attendanceMode }], true, false,
    loadedGroupId, snapshots, "2026-11-02", false, open,
    dates, () => "2026-11-02", (date: string) => date,
    (date: string) => date, (intention: string) => intention,
    { createElement: testNode },
  );
  render();
  return { toggle, panel, scroll, snapshots };
}

function weekSnapshots() {
  return [
    {
      sessionDate: "2026-11-02",
      draftState: "scheduled",
      participants: [
        { athleteId: "a", lastName: "Bauer", firstName: "Anna", intention: "attending" },
        { athleteId: "b", lastName: "Huber", firstName: "Ben", intention: "maybe" },
      ],
    },
    {
      sessionDate: "2026-11-03",
      draftState: "cancelled",
      participants: [
        { athleteId: "a", lastName: "Bauer", firstName: "Anna", intention: "attending" },
        { athleteId: "b", lastName: "Huber", firstName: "Ben", intention: "not_attending" },
      ],
    },
    {
      sessionDate: "2026-11-04",
      draftState: "scheduled",
      participants: [
        { athleteId: "a", lastName: "Bauer", firstName: "Anna", intention: "not_attending" },
      ],
    },
  ];
}

describe("A02 trainer registration week matrix", () => {
  it("renders seven accessible days using only the authorized group week", () => {
    const { toggle, panel, scroll, snapshots } = matrixHarness();
    expect(toggle.hidden).toBe(false);
    expect(toggle.attributes["aria-expanded"]).toBe("true");
    expect(panel.hidden).toBe(false);
    expect(scroll.children).toHaveLength(1);
    const table = scroll.children[0];
    expect(table.tag).toBe("table");
    const [caption, head, body, foot] = table.children;
    expect(caption.textContent).toContain("2026-11-02");
    expect(head.children[0].children).toHaveLength(8);
    expect(body.children).toHaveLength(2);
    expect(body.children[0].children[0].textContent).toBe("Bauer, Anna");
    expect(body.children[0].children[1].textContent).toBe("Ja");
    expect(body.children[0].children[1].dataset.intention).toBe("attending");
    expect(body.children[0].children[2].textContent).toBe("Entfällt");
    expect(body.children[0].children[3].textContent).toBe("Nein");
    expect(body.children[0].children[4].textContent).toBe("–");
    expect(body.children[1].children[3].textContent).toBe("–");
    expect(foot.children[0].children[1].textContent).toBe("1");
    expect(foot.children[0].children[2].textContent).toBe("Entfällt");
    expect(foot.children[0].children[4].textContent).toBe("–");
    expect(snapshots[0]?.participants[0]?.intention).toBe("attending");
  });

  it("never shows previous group's snapshot after selecting a different group", () => {
    const { toggle, panel, scroll } = matrixHarness({
      selectedGroupId: "group-other", loadedGroupId: "group-a",
    });
    expect(toggle.hidden).toBe(true);
    expect(toggle.attributes["aria-expanded"]).toBe("false");
    expect(panel.hidden).toBe(true);
    expect(scroll.children).toHaveLength(0);
  });

  it("remains unavailable for groups without athlete self-registration", () => {
    const { toggle, panel, scroll } = matrixHarness({
      attendanceMode: "trainer_roll_call",
    });
    expect(toggle.hidden).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(scroll.children).toHaveLength(0);
  });

  it("closes without clearing or altering the daily attendance data", () => {
    const { toggle, panel, scroll, snapshots } = matrixHarness({ open: false });
    expect(toggle.hidden).toBe(false);
    expect(toggle.attributes["aria-expanded"]).toBe("false");
    expect(panel.hidden).toBe(true);
    expect(scroll.children).toHaveLength(0);
    expect(snapshots[0]?.participants).toHaveLength(2);
  });
});
