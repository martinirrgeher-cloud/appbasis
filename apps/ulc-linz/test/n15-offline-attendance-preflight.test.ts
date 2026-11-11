import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("N15.2 offline attendance save guard", () => {
  it("preflights offline state before dispatching attendance POST", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("async function saveKindertrainingWeek()");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("async function bootstrapCountdown()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const save = ULC_LINZ_APP_SCRIPT.slice(start, end);
    const offline = save.indexOf('navigator.onLine === false');
    const dispatch = save.indexOf('requestJson("/api/modules/kindertraining/session"');
    expect(offline).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(offline);
    expect(save.slice(offline, dispatch)).toContain("return false;");
    expect(save).toContain("Nach Wiederherstellung der Verbindung bewusst speichern");
    expect(save).toContain("kindertrainingWeekDirtyDates.delete(sessionDate);");
  });
});
