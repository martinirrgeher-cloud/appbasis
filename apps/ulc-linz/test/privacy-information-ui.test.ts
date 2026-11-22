import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML, generatedUiResponse } from "../worker/ui";
import { ULC_LINZ_PRIVACY_HTML } from "../worker/privacy-info-ui";

const response = (path: string, method: string = "GET") =>
  generatedUiResponse(new Request("https://ulc.example.test" + path, { method }));

describe("ULC T02: static pre-login privacy information", () => {
  it("is accessible without authentication as a self-contained HTML page", async () => {
    const res = response("/datenschutz");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res!.headers.get("cache-control")).toBe("no-store");
    expect(res!.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res!.headers.get("x-frame-options")).toBe("DENY");
    expect(res!.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(await res!.text()).toBe(ULC_LINZ_PRIVACY_HTML);
    expect(response("/datenschutz/")?.status).toBe(200);
  });

  it("provides a mobile-compatible, readable official app privacy notice", () => {
    for (const expected of [
      'lang="de"',
      'name="viewport"',
      '<h1>Datenschutzinformation</h1>',
      "ULC Linz Oberbank",
      "martin.irrgeher@gmail.com",
      "Art. 6 Abs. 1 lit. b DSGVO",
      "Art. 6 Abs. 1 lit. f DSGVO",
      "Erziehungsberechtigte",
      "Speicherziele",
      "österreichischen Datenschutzbehörde",
      'href="/"',
    ]) {
      expect(ULC_LINZ_PRIVACY_HTML).toContain(expected);
    }
    expect(ULC_LINZ_PRIVACY_HTML).not.toContain("<script");
    expect(ULC_LINZ_PRIVACY_HTML).not.toContain("office@ulc-linz.at");
    expect(ULC_LINZ_PRIVACY_HTML).not.toContain("Schnupperkinder werden");
  });

  it("links the notice before login and from the authenticated More menu", () => {
    expect(ULC_LINZ_APP_HTML).toContain('<a href="/datenschutz">Datenschutzinformation</a>');
    expect(ULC_LINZ_APP_HTML).toContain(
      '<a class="app-nav__link" href="/datenschutz">Datenschutzinformation</a>',
    );
    expect(ULC_LINZ_APP_HTML).toContain('id="app-sign-out"');
    for (const view of ["home", "attendance", "training-documentation"]) {
      expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="' + view + '"');
    }
  });

  it("has an empty HEAD body and never captures writes or private API routes", async () => {
    const head = response("/datenschutz", "HEAD");
    expect(head?.status).toBe(200);
    expect(await head?.text()).toBe("");
    expect(response("/datenschutz", "POST")).toBeNull();
    expect(response("/api/auth/session")).toBeNull();
    expect(response("/api/modules/athletes")).toBeNull();
  });
});
