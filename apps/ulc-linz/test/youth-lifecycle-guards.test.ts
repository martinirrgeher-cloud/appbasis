import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("ULC youth attendance unsaved-change lifecycle", () => {
  it("warns before browser refresh when U12, U14 or Kindertraining has dirty/saving state", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf('window.addEventListener("beforeunload"');
    const end = ULC_LINZ_APP_SCRIPT.indexOf('elements.appNavMore?.addEventListener', start);
    const handler = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    for (const area of ["u12", "u14", "kids"]) {
      expect(handler).toContain(area + "Saving");
      expect(handler).toContain(area + "DirtyDates.size > 0");
    }
    expect(handler).toContain("event.preventDefault()");
    expect(handler).toContain('event.returnValue = ""');
  });

  it("flushes each youth area before switching away, and blocks on save failure", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("async function navigateAppSection(section)");
    const end = ULC_LINZ_APP_SCRIPT.indexOf('for (const control of document.querySelectorAll("[data-nav-view]"))', start);
    const navigation = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    for (const area of ["u12", "u14", "kids"]) {
      expect(navigation).toContain(
        'current === "' + area + '" && section !== "' + area + '" &&',
      );
      expect(navigation).toContain("!(await " + area + "FlushChanges())) return false;");
    }
    expect(navigation).toContain("showAppSection(section);");
  });

  it("prevents sign-out while youth data loads/saves, flushes all drafts before session reset", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("async function handleSignOut()");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("if (masterdataExchangeBusy", start);
    const protection = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    for (const area of ["u12", "u14", "kids"]) {
      expect(protection).toContain(area + "Saving");
      expect(protection).toContain(area + "Loading");
      expect(protection).toContain(area + "DirtyDates.size > 0");
      expect(protection).toContain("!(await " + area + "FlushChanges())");
    }
  });
});
