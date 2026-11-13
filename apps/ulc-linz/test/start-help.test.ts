import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_CSS, ULC_LINZ_APP_HTML } from "../worker/ui";

describe("ULC start help", () => {
  const homeStart = ULC_LINZ_APP_HTML.indexOf('data-app-section="home"');
  const helpStart = ULC_LINZ_APP_HTML.indexOf('id="ulc-quick-help"');
  const masterdataStart = ULC_LINZ_APP_HTML.indexOf('data-app-section="masterdata"');
  const help = ULC_LINZ_APP_HTML.slice(helpStart, masterdataStart);

  it("renders five detailed topics within authenticated home without new actions", () => {
    expect(homeStart).toBeGreaterThan(0);
    expect(helpStart).toBeGreaterThan(homeStart);
    expect(helpStart).toBeLessThan(masterdataStart);
    for (const topic of ["Anmeldung", "Anwesenheit", "Trainingsplanung", "Trainingsdokumentation", "Stammdaten &amp; Benutzer"]) {
      expect(help).toContain("<strong>" + topic + "</strong>");
    }
    expect((help.match(/<details /g) ?? []).length).toBe(5);
    expect((help.match(/<\/details>/g) ?? []).length).toBe(5);
    expect((help.match(/<ol>/g) ?? []).length).toBe(5);
    expect((help.match(/<li>/g) ?? []).length).toBeGreaterThanOrEqual(24);
    expect(help).not.toMatch(/<form|<input|fetch\(|data-nav-view=|data-open-view=/);
    expect(help).toContain('aria-labelledby="ulc-quick-help-title"');
  });

  it("distinguishes autosave in planning from manual documentation save", () => {
    expect(help).toContain("Die Planung speichert Änderungen <strong>automatisch</strong>");
    expect(help).toContain("Tippe auf <strong>Speichern</strong>");
    expect(help).toContain("<strong>Inhalte zuordnen</strong>");
    expect(help).toContain("<strong>Erneut versuchen</strong>");
    expect(help).toContain("temporäres Passwort");
  });

  it("uses scoped theme-based styles and accessible mobile disclosures", () => {
    expect(ULC_LINZ_APP_CSS).toContain(".ulc-help__header");
    expect(ULC_LINZ_APP_CSS).toContain("var(--ab-brand-soft)");
    expect(ULC_LINZ_APP_CSS).toContain(".ulc-help__summary:focus-visible");
    expect(ULC_LINZ_APP_CSS).toContain("@media (max-width: 400px)");
    expect(ULC_LINZ_APP_CSS).toContain("prefers-reduced-motion");
    expect(help).toContain("ab-disclosure");
  });
});
