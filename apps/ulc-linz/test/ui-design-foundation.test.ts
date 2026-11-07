import { describe, expect, it } from "vitest";
import { ULC_DESIGN_SYSTEM_CSS } from "../worker/design-system";
import { renderAppBasisEmbeddedFoundationCss } from "../../../packages/ui/embedded-foundation";
import appTheme from "../appbasis.theme.json";
import {
  ULC_LINZ_APP_CSS, ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";
import {
  ULC_U12_CSS, ULC_U12_HTML, ULC_U12_SCRIPT,
} from "../worker/u12-ui";
import {
  ULC_U14_CSS, ULC_U14_HTML, ULC_U14_SCRIPT,
  ULC_KIDS_CSS, ULC_KIDS_HTML, ULC_KIDS_SCRIPT,
} from "../worker/youth-attendance-ui";
import { ULC_PWA_MANIFEST } from "../worker/pwa";

describe("ULC UI-01: shared brand foundation with isolated youth-page pilot", () => {
  it("reads ULC brand from the standard AppFactory theme and rejects malformed tokens", () => {
    expect(appTheme).toEqual({
      schemaVersion: 1,
      brandMark: "UL",
      accentColor: "#147a46",
    });
    expect(ULC_DESIGN_SYSTEM_CSS).toBe(
      renderAppBasisEmbeddedFoundationCss(appTheme),
    );
    expect(renderAppBasisEmbeddedFoundationCss({ accentColor: "#2563EB" }))
      .toContain("--ab-brand-primary: #2563eb;");
    for (const accentColor of ["red", "#123", "#00ff00;body{display:none}", ""]) {
      expect(() => renderAppBasisEmbeddedFoundationCss({ accentColor })).toThrow();
    }
  });

  it("uses the official PWA green as the shared interactive accent", () => {
    expect(ULC_PWA_MANIFEST.theme_color).toBe("#147a46");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-brand-primary: #147a46;");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-brand-soft: color-mix(in srgb, var(--ab-brand-primary) 12%, #ffffff);");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-state-warning-border: #d4a017;");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-state-warning-tint: #facc15;");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-state-warning-edge: #eab308;");
    expect(ULC_LINZ_APP_CSS).toContain(ULC_DESIGN_SYSTEM_CSS);
    expect(ULC_LINZ_APP_CSS).toContain("--accent: var(--ab-brand-primary);");
    expect(ULC_LINZ_APP_CSS).toContain("--accent-foreground: var(--ab-brand-contrast);");
    expect(ULC_LINZ_APP_CSS).toContain("--page: var(--ab-surface-page);");
    expect(ULC_LINZ_APP_CSS).toContain("--card: var(--ab-surface-card);");
    // Countdown's "prepare" blue is a state color, not global navigation branding.
    expect(ULC_LINZ_APP_CSS).toContain("--prepare: #1d4ed8;");
  });

  it("uses the existing PWA logo rather than a disconnected text placeholder", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      '<img class="app-brand__mark" src="/icon-192.png" alt="" aria-hidden="true" width="40" height="40" />',
    );
    expect(ULC_LINZ_APP_HTML).toContain('aria-label="ULC Linz Startseite"');
    expect(ULC_LINZ_APP_CSS).toContain("object-fit: contain;");
  });

  it("keeps the previously accepted primary navigation and accessible active states", () => {
    for (const view of ["home", "attendance", "training-documentation"]) {
      expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="' + view + '"');
    }
    expect(ULC_LINZ_APP_HTML).toContain('id="app-nav-more"');
    expect(ULC_LINZ_APP_HTML).toContain('id="app-sign-out"');
    expect(ULC_LINZ_APP_CSS).toContain(
      ".app-nav__link.is-active { background: var(--ab-brand-soft); color: var(--ab-brand-primary); }",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      '#app-nav-attendance[aria-expanded="true"] { background: var(--ab-brand-soft);',
    );
  });

  it("provides coherent page-header, panel and touch-target primitives", () => {
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-space-2: 8px;");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-radius-card: 12px;");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("--ab-touch-target: 44px;");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain(".ab-page-header {");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain(".ab-page-header__copy h1 {");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain(".ab-icon-button {");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain(".ab-surface {");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain(".ab-surface--warning {");
    expect(ULC_DESIGN_SYSTEM_CSS).toContain("@media (prefers-reduced-motion: reduce)");
    expect(ULC_LINZ_APP_CSS).toContain("--touch: 44px;");
  });

  it("uses exactly the same pilot design in U12, U14 and Kindertraining", () => {
    for (const [prefix, html, css, script] of [
      ["u12", ULC_U12_HTML, ULC_U12_CSS, ULC_U12_SCRIPT],
      ["u14", ULC_U14_HTML, ULC_U14_CSS, ULC_U14_SCRIPT],
      ["kids", ULC_KIDS_HTML, ULC_KIDS_CSS, ULC_KIDS_SCRIPT],
    ] as const) {
      expect(html).toContain('class="' + prefix + '-head ab-page-header"');
      expect(html).toContain('class="' + prefix + '-head__title ab-page-header__copy"');
      expect(html).toContain('class="' + prefix + '-date-toolbar ab-surface"');
      expect(html).toContain('class="card ' + prefix + '-savebar ab-surface"');
      expect(html).toContain('class="' + prefix + '-content-card ab-surface"');
      expect(html).toContain('class="' + prefix + '-notes-card ab-surface"');
      expect(html).toContain('class="' + prefix + '-trainers-card ab-surface"');
      expect(html).toContain('class="' + prefix + '-category-shortcut ab-icon-button"');
      expect(css).toContain('font-size:var(--ab-page-title-size)');
      expect(css).toContain('min-height:var(--ab-touch-target)');
      expect(css).toContain('border-color:var(--ab-state-warning-border)');
      expect(css).toContain('var(--ab-state-warning-edge)');
      expect(script).toContain(prefix + 'Ui.contentCard?.classList.toggle("' +
        prefix + '-reminder-pending", missing.content)');
      expect(script).toContain(prefix + 'Ui.trainersCard?.classList.toggle("' +
        prefix + '-reminder-pending", missing.trainers)');
      expect(script).toContain('trainerIds: [...' + prefix + 'TrainerPresent].sort()');
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it("does not touch the existing page order or client-side navigation/saving functions", () => {
    const html = ULC_U12_HTML;
    const date = html.indexOf('id="u12-date"');
    const savebar = html.indexOf('id="u12-save-state"');
    const content = html.indexOf('id="u12-content-card"');
    const notes = html.indexOf('id="u12-notes-card"');
    const trainers = html.indexOf('id="u12-trainers-card"');
    const roster = html.indexOf('id="u12-days"');
    expect([date, savebar, content, notes, trainers, roster]).toEqual(
      [...[date, savebar, content, notes, trainers, roster]].sort((a, b) => a - b),
    );
    expect(ULC_U12_SCRIPT).toContain("function scheduleU12AutoSave()");
    expect(ULC_U12_SCRIPT).toContain("function u12MissingTrainingDetails()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("setAppNavMoreOpen(false)");
  });
});
