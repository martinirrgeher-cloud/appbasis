import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("N15.3 youth attendance unload warning", () => {
  it("protects dirty or saving week drafts before the tab closes", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf('window.addEventListener("beforeunload"');
    const end = ULC_LINZ_APP_SCRIPT.indexOf('elements.appNavMore?.addEventListener', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(handler).toContain("kindertrainingWeekSaving || kindertrainingWeekDirtyDates.size > 0");
    expect(handler).toContain("event.preventDefault();");
    expect(handler).toContain('event.returnValue = "";');
    expect(handler).not.toContain("saveKindertrainingWeek()");
  });
});
