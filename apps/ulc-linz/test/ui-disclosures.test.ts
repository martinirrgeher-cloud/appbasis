import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ULC_DESIGN_SYSTEM_CSS } from "../worker/design-system";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_CSS, ULC_LINZ_APP_SCRIPT } from "../worker/ui";
import { ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT } from "../worker/u12-ui";
import {
  ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT,
  ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";
import { ULC_TRAINING_PLANS_SCRIPT, ULC_TRAINING_PLANS_CSS } from "../worker/training-plans-ui";
import { ULC_TRAINING_BLOCKS_SCRIPT, ULC_TRAINING_BLOCKS_HTML } from "../worker/training-blocks-ui";
import { ULC_USER_ADMIN_SCRIPT } from "../worker/user-admin-ui";

describe("UI-02.1: shared leading disclosure arrows", () => {
  it("makes the standard arrow lead and rotate for expanded details in both Factory CSS consumers", async () => {
    const stylesheet = await readFile(
      new URL("../../../packages/ui/foundation.css", import.meta.url),
      "utf8",
    );
    for (const css of [ULC_DESIGN_SYSTEM_CSS, stylesheet]) {
      expect(css).toContain(".ab-disclosure::before,");
      expect(css).toContain(".ab-disclosure-toggle::before {");
      expect(css).toContain('content: "";');
      expect(css).toContain("transform: rotate(-45deg)");
      expect(css).toContain("details[open] > .ab-disclosure::before,");
      expect(css).toContain('.ab-disclosure-toggle[aria-expanded="true"]::before');
      expect(css).toContain("transform: rotate(45deg)");
      expect(css).toContain("prefers-reduced-motion: reduce");
    }
  });

  it("uses the left arrow and places notes after the roster for all youth areas", () => {
    for (const [prefix, html, css, script] of [
      ["u12", ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT],
      ["u14", ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT],
      ["kids", ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT],
    ] as const) {
      const positions = [
        html.indexOf('id="' + prefix + '-date"'),
        html.indexOf('id="' + prefix + '-save-state"'),
        html.indexOf('id="' + prefix + '-content-card"'),
        html.indexOf('id="' + prefix + '-trainers-card"'),
        html.indexOf('id="' + prefix + '-days"'),
        html.indexOf('id="' + prefix + '-notes-card"'),
      ];
      expect(positions.every((i) => i > 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(html).toContain('class="' + prefix + '-content-summary ab-disclosure"');
      expect(html).toContain('class="' + prefix + '-trainers-summary ab-disclosure"');
      expect(html).toContain('<summary class="ab-disclosure">Notizen zum Training');
      expect(html).not.toContain('class="' + prefix + '-trainers-chevron"');
      expect(html).not.toContain('<span aria-hidden="true">⌄</span>');
      expect(css).toContain('min-height:44px');
      expect(css).toContain('margin-left:auto; white-space:nowrap;');
      expect(script).toContain('summary.className = "ab-disclosure"');
      expect(script).toContain("function schedule" + prefix.charAt(0).toUpperCase() + prefix.slice(1) + "AutoSave()");
      expect(script).toContain(prefix + 'Ui.contentCard?.classList.toggle("'+prefix+'-reminder-pending"');
      expect(script).toContain(prefix + 'Ui.trainersCard?.classList.toggle("'+prefix+'-reminder-pending"');
    }
  });

  it("puts the group-navigation and legacy weekly expand arrows on the left", () => {
    expect(ULC_LINZ_APP_HTML).toContain('<summary class="ab-disclosure">Trainingsinhalte</summary>');
    expect(ULC_LINZ_APP_HTML).toContain('<summary class="ab-disclosure">Verwaltung</summary>');
    expect(ULC_LINZ_APP_CSS).not.toContain('.app-nav__group summary::after');
    expect(ULC_LINZ_APP_SCRIPT).toContain('toggle.className = "kindertraining-day-toggle ab-disclosure-toggle"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('toggle.setAttribute("aria-expanded", expanded ? "true" : "false")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('toggle.append(title, registrationSummary);');
    expect(ULC_LINZ_APP_CSS).toContain('grid-template-columns: 14px minmax(80px, .8fr)');
    expect(ULC_LINZ_APP_SCRIPT).not.toContain('marker.className = "kindertraining-day-marker"');
  });

  it("removes duplicate arrows in training planning while preserving details and editing", () => {
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('summary.className = "training-plan-item-summary ab-disclosure"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('summary.className = "training-plan-child-summary ab-disclosure"');
    expect(ULC_TRAINING_PLANS_SCRIPT).not.toContain('chevron.textContent = "▾"');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("summary.append(summaryMain);");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain("summary.append(main);");
    expect(ULC_TRAINING_PLANS_CSS).toContain("grid-template-columns: 12px minmax(0, 1fr);");
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('card.open = item.itemId === null');
    expect(ULC_TRAINING_PLANS_SCRIPT).toContain('child.open = exercise.itemId === null');
  });

  it("keeps overflow actions as intentional three-dot menus, not accordions", () => {
    expect(ULC_TRAINING_BLOCKS_SCRIPT).toContain('editorSummary.className = "ab-disclosure"');
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('<details class="training-block-more">');
    expect(ULC_TRAINING_BLOCKS_HTML).toContain('title="Weitere Aktionen">•••</summary>');
    expect(ULC_USER_ADMIN_SCRIPT).toContain('menu.className = "user-admin-actions-menu"');
    expect(ULC_USER_ADMIN_SCRIPT).toContain('summary.textContent = "⋯"');
  });
});
