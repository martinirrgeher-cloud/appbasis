import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML } from "../worker/ui";

describe("ULC start help", () => {
  it("keeps the help within the authenticated start view and exposes five native disclosure topics", () => {
    const homeStart = ULC_LINZ_APP_HTML.indexOf('data-app-section="home"');
    const helpStart = ULC_LINZ_APP_HTML.indexOf('id="ulc-quick-help"');
    const masterdataStart = ULC_LINZ_APP_HTML.indexOf('data-app-section="masterdata"');
    expect(homeStart).toBeGreaterThan(0);
    expect(helpStart).toBeGreaterThan(homeStart);
    expect(helpStart).toBeLessThan(masterdataStart);

    const help = ULC_LINZ_APP_HTML.slice(helpStart, masterdataStart);
    for (const topic of ["Anmeldung", "Anwesenheit", "Planung", "Doku", "Benutzer und Stammdaten"]) {
      expect(help).toContain('<summary>' + topic + '</summary>');
    }
    expect((help.match(/<details>/g) ?? []).length).toBe(5);
    expect((help.match(/<\/details>/g) ?? []).length).toBe(5);
    expect(help).toContain("Berechtigungen");
    expect(help).toContain("Speicherstatus");
  });

  it("does not introduce save controls, new routes or personal data to the quick help", () => {
    const help = ULC_LINZ_APP_HTML.split('id="ulc-quick-help"')[1]?.split('data-app-section="masterdata"')[0] ?? "";
    expect(help).not.toMatch(/<form|<input|fetch\(|data-nav-view=|data-open-view=/);
    expect(help).toContain('aria-labelledby="ulc-quick-help-title"');
  });
});
