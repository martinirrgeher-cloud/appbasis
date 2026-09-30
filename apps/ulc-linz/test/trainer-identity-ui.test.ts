import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC trainer identity administration UI", () => {
  it("adds a compact trainer-user assignment workspace to Stammdaten", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-identity-admin"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-identity-load"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-identity-list"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-identity-identity"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-identity-trainer"');
    expect(ULC_LINZ_APP_HTML).toContain(
      "Die Zuordnung wird erst auf ausdrücklichen Aufruf geladen.",
    );
  });

  it("adds protected trainer-user creation with a forced first-login password change", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-username"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-password"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-trainer"');
    expect(ULC_LINZ_APP_HTML).toContain(
      "muss beim ersten Login das temporäre Passwort ändern",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/admin/trainer-users", {',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Trainer-Benutzer wurde angelegt. Beim ersten Login ist ein Passwortwechsel erforderlich.",
    );
  });

  it("uses only the existing server-authorized trainer identity API", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/admin/trainer-identities")',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/admin/trainer-identities", {',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "body: JSON.stringify({ identityId, trainerId })",
    );
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("organizationId:");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("loads administration lazily instead of probing every signed-in user", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'elements.trainerIdentityLoad?.addEventListener("click", () => void loadTrainerIdentityAdmin());',
    );
    const start = ULC_LINZ_APP_SCRIPT.indexOf("async function acceptSession(next)");
    const end = ULC_LINZ_APP_SCRIPT.indexOf("async function bootstrapKindertraining()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const acceptSession = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(acceptSession).not.toContain("/api/admin/trainer-identities");
    expect(acceptSession).not.toContain("loadTrainerIdentityAdmin");
  });

  it("handles protected and conflicting assignments without weakening server security", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Die Benutzerzuordnung ist nur für Administratoren verfügbar.",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Benutzer oder Trainer ist nicht mehr verfügbar.",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Dieser Trainer ist bereits einem anderen aktiven Benutzer zugeordnet.",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Trainer-Benutzerzuordnung wurde gespeichert.",
    );
  });

  it("does not report a committed assignment as failed when only refresh fails", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Trainer-Benutzerzuordnung wurde gespeichert, aber die aktualisierte Liste konnte nicht geladen werden. Bitte neu laden.",
    );
    const start = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function bindTrainerIdentity(event)",
    );
    const end = ULC_LINZ_APP_SCRIPT.indexOf(
      "function syncTrainerIdentitySelection()",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const bindingFlow = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(bindingFlow).toContain(
      'await requestJson("/api/admin/trainer-identities", {',
    );
    expect(bindingFlow).toContain(
      "trainerIdentityBindings = await fetchTrainerIdentityBindings();",
    );
    expect(bindingFlow).toContain("} catch {");
  });
});
