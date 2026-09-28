import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC E4E-D trainer user administration UI", () => {
  it("keeps trainer-user creation inside the explicitly opened admin workspace", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-username"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-display-name"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-contact-email"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-password"');
    expect(ULC_LINZ_APP_HTML).toContain('id="trainer-user-profile"');
    expect(ULC_LINZ_APP_HTML).toContain(
      "Beim ersten Login muss das temporäre Passwort geändert werden.",
    );

    const workspace = ULC_LINZ_APP_HTML.indexOf(
      'id="trainer-identity-workspace" hidden',
    );
    const form = ULC_LINZ_APP_HTML.indexOf('id="trainer-user-form"', workspace);
    expect(workspace).toBeGreaterThanOrEqual(0);
    expect(form).toBeGreaterThan(workspace);
  });

  it("posts only trainer-user input and never client-owned organization scope", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function createTrainerUser(event)",
    );
    const end = ULC_LINZ_APP_SCRIPT.indexOf(
      "function syncTrainerIdentitySelection()",
      start,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const flow = ULC_LINZ_APP_SCRIPT.slice(start, end);

    expect(flow).toContain('requestJson("/api/admin/trainer-users", {');
    expect(flow).toContain("username,");
    expect(flow).toContain("displayName,");
    expect(flow).toContain("contactEmail,");
    expect(flow).toContain("temporaryPassword,");
    expect(flow).toContain("profile,");
    expect(flow).not.toContain("organizationId");
    expect(flow).not.toContain("actorPrincipalId");
    expect(ULC_LINZ_APP_SCRIPT).not.toContain("innerHTML");
  });

  it("refreshes server bindings after creation and preselects the new account for trainer mapping", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "trainerIdentityBindings = await fetchTrainerIdentityBindings();",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "elements.trainerIdentityIdentity.value = createdIdentityId;",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Beim ersten Login muss das temporäre Passwort geändert werden.",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Trainer-Benutzer wurde angelegt, aber die aktualisierte Benutzerliste konnte nicht geladen werden. Bitte neu laden.",
    );
  });

  it("never renders or echoes the submitted temporary password", () => {
    const start = ULC_LINZ_APP_SCRIPT.indexOf(
      "async function createTrainerUser(event)",
    );
    const end = ULC_LINZ_APP_SCRIPT.indexOf(
      "function syncTrainerIdentitySelection()",
      start,
    );
    const flow = ULC_LINZ_APP_SCRIPT.slice(start, end);
    expect(flow).toContain(
      'if (elements.trainerUserPassword) elements.trainerUserPassword.value = "";',
    );
    expect(flow).not.toContain("textContent = temporaryPassword");
    expect(flow).not.toContain("showMessage(elements.trainerIdentitySuccess, temporaryPassword");
  });
});
