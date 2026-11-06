import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

const DASHBOARD_VIEWS = Object.freeze([
  "masterdata", "registration", "users", "kindertraining", "u12",
  "training-plans", "training-documentation",
  "exercise-catalog", "training-blocks", "countdown",
]);

describe("ULC A10: role-aware home without altering server permissions", () => {
  const start = ULC_LINZ_APP_HTML.indexOf(
    '<section class="dashboard-grid" aria-label="ULC Linz Funktionen">',
  );
  const end = ULC_LINZ_APP_HTML.indexOf(
    '<section class="app-section" data-app-section="masterdata"',
    start,
  );
  const home = ULC_LINZ_APP_HTML.slice(start, end);

  it("starts all shortcut cards hidden and permits exactly the documented sections", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const cards = [...home.matchAll(
      /<article\s+[^>]*data-dashboard-view="([^"]+)"[^>]*>/g,
    )];
    expect(cards.map((m) => m[1]).sort()).toEqual(
      [...DASHBOARD_VIEWS].sort(),
    );
    for (const [, view] of cards) {
      expect(view).toBeTruthy();
    }
    for (const card of cards) {
      expect(card[0]).toMatch(/\shidden(?:\s|>)/);
    }
    expect(ULC_LINZ_APP_CSS).toContain("[hidden] { display: none !important; }");
    expect(home).not.toContain("Weitere Bereiche folgen");
  });

  it("uses the existing navigation availability source, not a second role policy", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'card.hidden = !isAppNavigationAvailable(card.dataset.dashboardView || "")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'document.querySelectorAll("[data-dashboard-view]")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'if (section === "masterdata") return masterdataReady',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'if (section === "users") return userAdminReady',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'if (section === "registration") return selfRegistrationReady',
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain(
      "elements.registrationDashboard.hidden = false",
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain(
      "elements.userAdminDashboard.hidden = !userAdminReady",
    );
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("keeps existing navigation and sign-out while removing developer branding", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="home"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="kindertraining"');
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="training-documentation"');
    expect(ULC_LINZ_APP_HTML).toContain('id="app-sign-out"');
    expect(ULC_LINZ_APP_HTML).toContain('id="app-install"');
    expect(ULC_LINZ_APP_HTML).not.toContain('class="app-badge"');
    expect(ULC_LINZ_APP_HTML).not.toContain(">AppBasis</span>");
    expect(ULC_LINZ_APP_HTML).toContain('id="user-admin-dashboard"');
  });
});
