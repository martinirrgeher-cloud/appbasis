import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC E4D.5 compact mobile layout", () => {
  it("hides unauthorized navigation items and lets the remaining items fill the bar", () => {
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="masterdata" hidden disabled',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="kindertraining" hidden disabled',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="countdown" hidden disabled',
    );
    expect(ULC_LINZ_APP_HTML).toContain(
      'data-nav-view="settings" hidden disabled',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("control.hidden = !countdownReady");
    expect(ULC_LINZ_APP_SCRIPT).toContain("control.hidden = !masterdataReady");
    expect(ULC_LINZ_APP_SCRIPT).toContain("control.hidden = !kindertrainingReady");
    expect(ULC_LINZ_APP_CSS).toContain("grid-auto-flow: column;");
    expect(ULC_LINZ_APP_CSS).toContain(
      "grid-auto-columns: minmax(0, 1fr);",
    );
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

  it("keeps masterdata actions beside row content on normal phone widths", () => {
    expect(ULC_LINZ_APP_CSS).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;",
    );
    expect(ULC_LINZ_APP_CSS).toContain(
      ".masterdata-row__actions { grid-column: 2; grid-row: 1 / 3;",
    );
  });
});
