import { describe, expect, it, vi } from "vitest";
import { ULC_U12_SCRIPT } from "../worker/u12-ui";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("U12 quick-create return navigation", () => {
  it("opens the existing authorized athlete dialog over U12 without switching to Stammdaten", async () => {
    const start = ULC_U12_SCRIPT.indexOf("async function openU12NewAthlete() {");
    const end = ULC_U12_SCRIPT.indexOf("\nfunction prepareU12View()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const source = ULC_U12_SCRIPT.slice(start, end);
    expect(source).not.toContain('showAppSection("masterdata")');
    expect(source).not.toContain('showMasterdataTab("athletes")');
    const flush = vi.fn(async () => true);
    const load = vi.fn(async () => true);
    const open = vi.fn();
    const create = new Function(
      "u12Ui", "masterdataReady", "masterdataCanEdit", "u12Ready",
      "u12Groups", "u12FlushChanges", "loadMasterdata",
      "showMessage", "openNewMasterdataAthlete",
      source + "\nreturn openU12NewAthlete;",
    ) as (...args: unknown[]) => () => Promise<void>;
    const openFromU12 = create(
      { group: { value: "group-u12" }, date: { value: "2026-11-07" } },
      true, true, true, [{ id: "group-u12" }],
      flush, load, vi.fn(), open,
    );
    await openFromU12();
    expect(flush).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith({
      source: "u12", groupId: "group-u12", startedOn: "2026-11-07",
    });
  });

  it("still blocks creation when the existing athlete edit permission is absent", async () => {
    const start = ULC_U12_SCRIPT.indexOf("async function openU12NewAthlete() {");
    const end = ULC_U12_SCRIPT.indexOf("\nfunction prepareU12View()", start);
    const create = new Function(
      "u12Ui", "masterdataReady", "masterdataCanEdit", "u12Ready",
      "u12Groups", "u12FlushChanges", "loadMasterdata",
      "showMessage", "openNewMasterdataAthlete",
      ULC_U12_SCRIPT.slice(start, end) + "\nreturn openU12NewAthlete;",
    ) as (...args: unknown[]) => () => Promise<void>;
    const load = vi.fn(async () => true);
    const open = vi.fn();
    await create(
      { group: { value: "group-u12" }, date: { value: "2026-11-07" } },
      true, false, true, [{ id: "group-u12" }],
      vi.fn(async () => true), load, vi.fn(), open,
    )();
    expect(load).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("portals only the U12 dialog and restores its original parent and focus on X/Zurück", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain("let masterdataAthleteOverlayHome = null;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (fromYouth && elements.athleteOverlay && !masterdataAthleteOverlayHome)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("document.body.append(elements.athleteOverlay);");
    expect(ULC_LINZ_APP_SCRIPT).toContain("parent.insertBefore(");
    expect(ULC_LINZ_APP_SCRIPT).toContain('document.querySelector(\'[data-app-section="' + "'" + ' + youthSource + ' + "'" + '"]:not([hidden])\')');
    expect(ULC_LINZ_APP_SCRIPT).toContain("add?.focus();");
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.athleteOverlayClose?.addEventListener("click", closeMasterdataAthleteOverlay)');
    expect(ULC_LINZ_APP_SCRIPT).toContain("else closeMasterdataAthleteOverlay();");
    expect(ULC_LINZ_APP_SCRIPT).toContain("await loadU12Attendance();");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain('      showAppSection("u12");\n      showMessage(u12Ui.success, refreshed');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/api/modules/athletes/masterdata/athletes/create-complete"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (masterdataQuickCreateSaving || !masterdataCanEdit || !masterdataReady) return;");
  });
});
