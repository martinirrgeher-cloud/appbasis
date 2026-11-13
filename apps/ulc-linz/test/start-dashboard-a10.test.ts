import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_CSS, ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("ULC A10 compact start dashboard", () => {
  const start = ULC_LINZ_APP_HTML.indexOf('data-app-section="home"');
  const end = ULC_LINZ_APP_HTML.indexOf('data-app-section="masterdata"', start);
  const home = ULC_LINZ_APP_HTML.slice(start, end);

  it("keeps accessible DOM order in training-first, admin-last layout", () => {
    const views = [...home.matchAll(/<article class="card dashboard-card[^>]*data-dashboard-view="([^"]+)"/g)]
      .map(match => match[1]);
    expect(views).toEqual([
      "registration", "attendance", "training-plans", "training-documentation",
      "exercise-catalog", "training-blocks", "countdown", "masterdata", "users",
    ]);
    expect(home).toContain('dashboard-grid dashboard-grid--home');
    expect(home).toContain('id="ulc-quick-help"');
  });

  it("only exposes modules already permitted by the existing navigation checks", () => {
    for (const view of [
      "registration", "attendance", "training-plans", "training-documentation",
      "exercise-catalog", "training-blocks", "countdown", "masterdata", "users",
    ]) {
      expect(home).toMatch(new RegExp('<article[^>]*(?:data-dashboard-view="' + view + '"[^>]*hidden|hidden[^>]*data-dashboard-view="' + view + '")'));
    }
    expect(ULC_LINZ_APP_SCRIPT).toContain('card.hidden = !isAppNavigationAvailable(card.dataset.dashboardView || "")');
    expect(home).not.toMatch(/data-role=|data-new-permission=|data-dashboard-role=/);
  });

  it("uses the shared theme and compact mobile layout without duplicate developer badges", () => {
    expect(ULC_LINZ_APP_CSS).toContain(".dashboard-grid--home");
    expect(ULC_LINZ_APP_CSS).toContain("repeat(2, minmax(0, 1fr))");
    expect(ULC_LINZ_APP_CSS).toContain("@media (max-width: 360px)");
    expect(ULC_LINZ_APP_CSS).toContain("@media (min-width: 700px)");
    expect(home).toContain("Änderungen werden automatisch gespeichert");
    expect(home).not.toContain("Testzugänge anlegen");
    expect(home).not.toContain("AppBasis-Entwickler");
    expect(home).toContain('id="registration-quick-action"');
    expect(home).toContain('id="attendance-quick-action"');
  });
});
