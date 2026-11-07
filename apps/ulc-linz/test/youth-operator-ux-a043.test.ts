import { afterEach, describe, expect, it, vi } from "vitest";

import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";

afterEach(() => vi.useRealTimers());

describe("Operator refinement: youth attendance and navigation", () => {
  it("orders the attendance group links Kids, U12, U14, Irrgeher without repetitive captions", () => {
    const section = ULC_LINZ_APP_HTML.slice(
      ULC_LINZ_APP_HTML.indexOf('id="app-nav-attendance-menu"'),
      ULC_LINZ_APP_HTML.indexOf('id="app-nav-overflow"'),
    );
    const targets = [
      'data-attendance-target="kids"',
      'data-attendance-target="u12"',
      'data-attendance-target="u14"',
      'data-attendance-target="kindertraining"',
    ];
    expect(targets.map((target) => section.indexOf(target)))
      .toEqual([...targets.map((target) => section.indexOf(target))].sort((a, b) => a - b));
    expect(targets.every((target) => section.includes(target))).toBe(true);
    expect(section).not.toMatch(/<small>Anwesenheit/);
    expect(ULC_LINZ_APP_SCRIPT).toContain('choice.hidden = !available;');
    expect(ULC_LINZ_APP_SCRIPT).toContain('choice.disabled = !available;');
  });

  it("keeps all permitted More links immediately visible in clear noncollapsible groups", () => {
    const more = ULC_LINZ_APP_HTML.slice(
      ULC_LINZ_APP_HTML.indexOf('id="app-nav-overflow"'),
      ULC_LINZ_APP_HTML.indexOf('id="app-sign-out"'),
    );
    expect(more).toContain('data-nav-group="training"');
    expect(more).toContain('data-nav-group="administration"');
    expect(more).toContain('<h3 class="app-nav__group-title">Trainingsinhalte</h3>');
    expect(more).toContain('<h3 class="app-nav__group-title">Verwaltung</h3>');
    expect(more).not.toContain('<details');
    expect(more).not.toContain('<summary');
    expect(ULC_LINZ_APP_CSS).toContain('border-left:2px solid var(--border-strong)');
    expect(ULC_LINZ_APP_SCRIPT).toContain('group.hidden = !hasVisibleItems;');
    expect(ULC_LINZ_APP_SCRIPT).not.toContain('group.open =');
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.appSignOut !== null');
  });

  it("puts notes directly beneath trainers, and simplifies content matrix across three areas", () => {
    for (const { prefix, html, css, script } of [
      { prefix: "u12", html: ULC_U12_HTML, css: ULC_U12_CSS, script: ULC_U12_SCRIPT },
      { prefix: "u14", html: ULC_U14_HTML, css: ULC_U14_CSS, script: ULC_U14_SCRIPT },
      { prefix: "kids", html: ULC_KIDS_HTML, css: ULC_KIDS_CSS, script: ULC_KIDS_SCRIPT },
    ]) {
      const positions = ["trainers-card", "notes-card", "attendance-toolbar", "days"].map((id) =>
        html.indexOf(prefix + "-" + id));
      expect(positions.every((position) => position > 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(html).toContain('id="' + prefix + '-group-label" hidden');
      expect(script).toContain(prefix + 'Ui.groupLabel.hidden = !active ||');
      expect(html).toContain('Häkchen pro Kind setzen oder oben „Alle“ wählen.');
      expect(html).not.toContain('Die Zuordnungen werden automatisch gespeichert.');
      expect(html).not.toContain('Die Zuordnung erscheint sofort in der Anwesenheitsliste.');
      expect(css).toContain(prefix + '-person__answer:has(input:checked)');
      expect(css).toContain(prefix + '-person__answer:has(input:focus-visible)');
      expect(script).toContain('input.type = "checkbox"');
      expect(script).toContain('input.dataset.' + prefix + 'AthleteId');
    }
  });

  it("pauses autosave for unselected categories and resumes after selection", () => {
    const source = ULC_U12_SCRIPT.slice(
      ULC_U12_SCRIPT.indexOf("function scheduleU12AutoSave()"),
      ULC_U12_SCRIPT.indexOf("function markU12DraftDirty()"),
    );
    const pendingTitles = [""];
    const save = vi.fn();
    const schedule = new Function(
      "u12AutoSaveTimer", "u12DirtyDates", "u12AutoSaveFailed", "u12Ready",
      "u12Conflict", "u12WriteAllowed", "u12Loading", "u12Saving",
      "saveU12Attendance", "u12ContentTitles", source + "\nreturn scheduleU12AutoSave;",
    )(
      null, new Set(["2026-11-07"]), false, true, false, true, false, false,
      save, pendingTitles,
    ) as () => void;
    vi.useFakeTimers();
    schedule();
    vi.advanceTimersByTime(2500);
    expect(save).not.toHaveBeenCalled();
    pendingTitles[0] = "Beweglichkeit";
    schedule();
    vi.advanceTimersByTime(849);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
    expect(ULC_U12_SCRIPT).toContain('u12DirtyDates.size > 0 && u12ContentTitles.some');
    expect(ULC_U12_SCRIPT).toContain('u12ContentTitles[index] = standard.label;');
    expect(ULC_U12_SCRIPT).toContain('markU12DraftDirty();');
    expect(ULC_U12_SCRIPT).toContain('if (!(await saveU12Attendance())) return false;');
  });
});
