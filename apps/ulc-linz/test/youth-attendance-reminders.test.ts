import { describe, expect, it } from "vitest";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";

type Reminders = { content: boolean; trainers: boolean };

function reminders(
  participants: readonly string[] | null,
  present: readonly string[],
  titles: readonly string[],
  trainerIds: readonly string[],
  state: "scheduled" | "cancelled" = "scheduled",
): Reminders {
  const begin = ULC_U12_SCRIPT.indexOf("function u12MissingTrainingDetails() {");
  const end = ULC_U12_SCRIPT.indexOf("\nfunction refreshU12Controls()", begin);
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const source = ULC_U12_SCRIPT.slice(begin, end);
  const evaluate = new Function(
    "u12Snapshot", "u12Present", "u12ContentTitles", "u12TrainerPresent",
    source + "\nreturn u12MissingTrainingDetails();",
  ) as (
    snapshot: { session: { state: string }; participants: { athleteId: string }[] } | null,
    values: Map<string, boolean>,
    contents: readonly string[],
    trainers: Set<string>,
  ) => Reminders;
  return evaluate(
    participants === null ? null : {
      session: { state },
      participants: participants.map((athleteId) => ({ athleteId })),
    },
    new Map((participants ?? []).map((id) => [id, present.includes(id)])),
    titles,
    new Set(trainerIds),
  );
}

describe("youth attendance documentation reminders", () => {
  it("does not warn on unloaded, absent or cancelled sessions", () => {
    expect(reminders(null, [], [], [])).toEqual({ content: false, trainers: false });
    expect(reminders(["anna"], [], [], [])).toEqual({ content: false, trainers: false });
    expect(reminders(["anna"], ["anna"], [], [], "cancelled")).toEqual({
      content: false, trainers: false,
    });
  });

  it("warns on both empty sections once any athlete is present", () => {
    expect(reminders(["anna", "berta"], ["anna"], [], [])).toEqual({
      content: true, trainers: true,
    });
  });

  it("clears each warning independently on valid input and restores on removal", () => {
    expect(reminders(["anna"], ["anna"], ["Sprint"], [])).toEqual({
      content: false, trainers: true,
    });
    expect(reminders(["anna"], ["anna"], [], ["trainer-1"])).toEqual({
      content: true, trainers: false,
    });
    expect(reminders(["anna"], ["anna"], ["Sprint"], ["trainer-1"])).toEqual({
      content: false, trainers: false,
    });
    expect(reminders(["anna"], ["anna"], ["Sprint", "  "], ["trainer-1"])).toEqual({
      content: true, trainers: false,
    });
    expect(reminders(["anna"], [], [], [])).toEqual({
      content: false, trainers: false,
    });
  });

  it("shares visible yellow reminders and compact, accessible trainer controls across all three pages", () => {
    for (const [prefix, html, css, script] of [
      ["u12", ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT],
      ["u14", ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT],
      ["kids", ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT],
    ] as const) {
      expect(html).toContain('id="' + prefix + '-trainers-card"');
      expect(html).toContain('class="' + prefix + '-trainers-summary" aria-label="Traineranwesenheit"');
      expect(html).toContain('id="' + prefix + '-trainers-count"');
      expect(css).toContain('.' + prefix + '-content-card.' + prefix + '-reminder-pending');
      expect(css).toContain('.' + prefix + '-trainers-card.' + prefix + '-reminder-pending');
      expect(css).toContain('background:color-mix(in srgb, var(--ulc-warning-tint) 23%, var(--card))');
      expect(css).toContain('min-height:40px');
      expect(css).toContain('grid-template-columns:repeat(auto-fit');
      expect(script).toContain('function ' + prefix + 'MissingTrainingDetails()');
      expect(script).toContain(prefix + 'Ui.contentCard?.classList.toggle("' +
        prefix + '-reminder-pending", missing.content)');
      expect(script).toContain(prefix + 'Ui.trainersCard?.classList.toggle("' +
        prefix + '-reminder-pending", missing.trainers)');
      expect(script).toContain('label.append(input, name)');
      expect(script).toContain('" · offen"');
      expect(() => new Function(script)).not.toThrow();
    }
  });
});
