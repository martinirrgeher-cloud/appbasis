import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC weekly self-registration and account switching", () => {
  it("keeps sign-out directly reachable and resolves local work before revoking the session", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="app-sign-out"');
    expect(ULC_LINZ_APP_HTML).toContain('id="password-sign-out"');
    expect(ULC_LINZ_APP_HTML).toContain("Abmelden / Benutzer wechseln");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "overflow.length > 0 || elements.appSignOut !== null",
    );

    const signOutStart = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function handleSignOut()",
    );
    const signOutEnd = ULC_LINZ_APP_SCRIPT.indexOf(
      "\nasync function acceptSession",
      signOutStart,
    );
    const signOutScript = ULC_LINZ_APP_SCRIPT.slice(signOutStart, signOutEnd);
    const closeEditorIndex = signOutScript.indexOf(
      "await closeTrainingPlanEditor(false)",
    );
    const countdownDecisionIndex = signOutScript.indexOf(
      "Der Countdown läuft noch. Wirklich abmelden und den Countdown beenden?",
    );
    const revokeIndex = signOutScript.indexOf(
      'requestJson("/api/auth/sign-out", { method: "POST" })',
    );

    expect(signOutStart).toBeGreaterThanOrEqual(0);
    expect(signOutEnd).toBeGreaterThan(signOutStart);
    expect(closeEditorIndex).toBeGreaterThanOrEqual(0);
    expect(countdownDecisionIndex).toBeGreaterThan(closeEditorIndex);
    expect(revokeIndex).toBeGreaterThan(countdownDecisionIndex);
    expect(signOutScript).toContain("resetCountdown();");
    expect(signOutScript).toContain('setTrainingPlanSessionIdentity("");');
    expect(signOutScript).toContain('showView("login");');
    expect(signOutScript).not.toContain("window.location.reload();");
  });

  it("shows a Monday-to-Sunday registration week with direct week navigation", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="registration-week-prev"');
    expect(ULC_LINZ_APP_HTML).toContain('id="registration-week-next"');
    expect(ULC_LINZ_APP_HTML).toContain('id="registration-week-current"');
    expect(ULC_LINZ_APP_HTML).toContain('id="registration-week-label"');
    expect(ULC_LINZ_APP_HTML).not.toContain('id="registration-date"');
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "const dates = registrationWeekDates(weekStart);",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("Promise.all(");
    expect(ULC_LINZ_APP_SCRIPT).toContain("new Map([[probeDate, probe]])");
    expect(ULC_LINZ_APP_SCRIPT).toContain("prefetched.has(sessionDate)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Array.from({ length: 7 }");
    expect(ULC_LINZ_APP_SCRIPT).toContain("offset * 7");
    expect(ULC_LINZ_APP_CSS).toContain(".registration-week-nav {");
    expect(ULC_LINZ_APP_CSS).toContain(".registration-day__head {");
  });

  it("keys registration updates by both group and date", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "button.dataset.registrationDate = option.sessionDate;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "candidate.group.id === groupId &&\n      candidate.sessionDate === sessionDate",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "selfRegistrationSavingKey = groupId + \"|\" + sessionDate;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "sessionDate,\n        }),",
    );
  });
});
