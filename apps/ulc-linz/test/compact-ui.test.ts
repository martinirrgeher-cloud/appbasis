import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC E4D.5 compact mobile layout", () => {
  it("keeps only three permission-aware primary navigation items and moves the rest under Mehr", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="app-nav-primary"');
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="home" data-nav-priority="0">Start',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="kindertraining" data-nav-priority="1" hidden disabled>Training',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="exercise-catalog" data-nav-priority="2" hidden disabled>Übungen',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'id="app-nav-more" type="button" aria-expanded="false"',
    );
    expect(ULC_LINZ_APP_HTML).toContain('id="app-nav-overflow"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("const primary = available.slice(0, 3);");
    expect(ULC_LINZ_APP_SCRIPT).toContain("const overflow = available.slice(3);");
    expect(ULC_LINZ_APP_SCRIPT).toContain("isAppNavigationAvailable");
    expect(ULC_LINZ_APP_SCRIPT).toContain("setAppNavMoreOpen(false);");
    expect(ULC_LINZ_APP_CSS).toContain(".app-nav__overflow {");
    expect(ULC_LINZ_APP_CSS).toContain("bottom: calc(100% + 6px);");
  });

  it("reduces vertical chrome without shrinking core touch targets below 44px", () => {
    expect(ULC_LINZ_APP_CSS).toContain("--touch: 44px;");
    expect(ULC_LINZ_APP_CSS).toContain(
      ".content { width: min(100%, 52rem); margin: 0 auto; padding: 12px 12px 86px; }",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".masterdata-row__action {\n  min-height: var(--touch);",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".kindertraining-status {\n  min-height: 44px;",
    );
  });

  it("uses compact two-column mobile layouts where fields remain usable", () => {
    expect(ULC_LINZ_APP_CSS).toContain(
      ".masterdata-form .settings-grid {\n  grid-template-columns: repeat(2, minmax(0, 1fr));",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".kindertraining-selector .settings-grid {\n  grid-template-columns: minmax(0, 1.25fr) minmax(120px, .75fr);",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".kindertraining-session-card .settings-grid {\n  grid-template-columns: minmax(104px, .55fr) minmax(0, 1.45fr);",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      "@media (max-width: 359px) {",
    );
  });

  it("adds compact E6F4A athlete exchange downloads without client-owned scope", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="masterdata-template"');
    expect(ULC_LINZ_APP_HTML).toContain('id="masterdata-export"');
    expect(ULC_LINZ_APP_CSS).toContain(".masterdata-exchange-actions {");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/template.xlsx"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/export.xlsx"',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("downloadMasterdataWorkbook");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain(
      'organizationId: "verein-server"',
    );
  });

  it("keeps masterdata actions beside row content on normal phone widths", () => {
    expect(ULC_LINZ_APP_CSS).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".masterdata-row__actions { grid-column: 2; grid-row: 1 / 3;",
    );
  });
});
