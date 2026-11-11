import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("N15 attendance save feedback", () => {
  it("keeps failed day drafts dirty and prevents silent POST retries", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf("async function saveKindertrainingWeek()");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("async function bootstrapCountdown()", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const save = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(save).toContain("Promise.allSettled(");
    expect(save).toContain("kindertrainingWeekDirtyDates.delete(sessionDate);");
    expect(save).toContain("if (result.status === \"fulfilled\")");
    expect(save).toContain("result.reason?.status === 409");
    expect(save).toContain("Nicht bestätigt gespeichert: ");
    expect(save).toContain("Die Entwürfe bleiben markiert.");
    expect(save).toContain("Bitte nicht mehrfach auf Speichern drücken");
    expect(save).not.toContain("setTimeout(() => saveKindertrainingWeek()");
  });
});
