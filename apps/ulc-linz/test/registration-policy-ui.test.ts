import { describe, expect, it } from "vitest";
import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_CSS,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("A02.4 mobile group schedule editor", () => {
  it("provides all seven weekdays, cutoff controls, and direct save/cancel actions", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="group-detail-schedule"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-policy-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-policy-deadline-enabled"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-policy-weeks"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-policy-late-mode"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-policy-submit"');
    for (let day = 1; day <= 7; day += 1) {
      expect(ULC_LINZ_APP_HTML).toContain(
        'name="group-policy-weekday" value="' + day + '"',
      );
    }
    expect(ULC_LINZ_APP_CSS).toContain(".group-policy-weekdays");
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("adds a separate, mobile-friendly exception editor without changing shared masterdata", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="group-detail-extra"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-extra-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-extra-date" type="date"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-extra-approve"');
    expect(ULC_LINZ_APP_HTML).toContain('id="group-extra-revoke"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("async function loadMasterdataExtraDay()");
    expect(ULC_LINZ_APP_SCRIPT).toContain("async function saveMasterdataExtraDay(approved)");
    expect(ULC_LINZ_APP_SCRIPT).toContain("expectedRevision: state.revision");
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/athletes/registration-extra-day", {',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("extraDayDraft?.saving");
    expect(ULC_LINZ_APP_SCRIPT).toContain("extraDayRequestId += 1");
    expect(ULC_LINZ_APP_SCRIPT).toContain("Sondertrainingstag-Freigabe zurücknehmen?");
    expect(() => new Function(ULC_LINZ_APP_SCRIPT)).not.toThrow();
  });

  it("uses a server-authorized policy endpoint and versioned updates", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      '"/api/modules/athletes/registration-policy?groupId="',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/modules/athletes/registration-policy", {',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain("expectedRevision: state.revision");
    expect(ULC_LINZ_APP_SCRIPT).toContain("groupPolicyDraft.baseline");
    expect(ULC_LINZ_APP_SCRIPT).toContain("masterdataCanEdit");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("groupPolicyDraft.organizationId");
  });

  it("protects unsaved rules and in-progress saves on cancel, close and sign-out", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "function isMasterdataGroupPolicyDirty()",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Ungespeicherte Anmelderegeln verwerfen?",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Ungespeicherte Anmelderegeln verwerfen und abmelden?",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "if (groupPolicyDraft?.saving)",
    );
    const signOutStart = ULC_LINZ_APP_SCRIPT.indexOf("async function handleSignOut()");
    const signOutEnd = ULC_LINZ_APP_SCRIPT.indexOf("async function acceptSession(", signOutStart);
    const signOut = ULC_LINZ_APP_SCRIPT.slice(signOutStart, signOutEnd);
    expect(signOut.indexOf("groupPolicyDraft?.saving")).toBeLessThan(
      signOut.indexOf('requestJson("/api/auth/sign-out"'),
    );
    expect(signOut).toContain("isMasterdataGroupPolicyDirty()");
  });
});
