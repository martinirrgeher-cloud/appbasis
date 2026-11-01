import { describe, expect, it } from "vitest";

import {
  ULC_LINZ_APP_HTML,
  ULC_LINZ_APP_SCRIPT,
} from "../worker/ui";

describe("ULC athlete user administration UI", () => {
  it("offers protected athlete-user creation directly from the athlete overlay", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-detail-user"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-user-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-user-username"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-user-password"');
    expect(ULC_LINZ_APP_HTML).toContain(
      "Der Benutzer wird direkt mit diesem Athleten verknüpft.",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      'requestJson("/api/admin/athlete-users", {',
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "athleteId: athlete.id",
    );
  });

  it("shows archived athletes on demand with a visible count and safe restoration", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-show-inactive"');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-inactive-count"');
    expect(ULC_LINZ_APP_HTML).toContain('Inaktive anzeigen');
    expect(ULC_LINZ_APP_HTML).toContain('id="athlete-detail-reactivate"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("let masterdataShowInactiveAthletes = false;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("masterdataShowInactiveAthletes = elements.athleteShowInactive.checked;");
    expect(ULC_LINZ_APP_SCRIPT).toContain("const inactiveAthletes = snapshot.athletes.filter((athlete) => athlete.isActive === false);");
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.athleteInactiveCount.textContent = "(" + String(inactiveAthletes.length) + ")";');
    expect(ULC_LINZ_APP_SCRIPT).toContain('athlete.isActive === false ? " · inaktiv" : ""');
    expect(ULC_LINZ_APP_SCRIPT).toContain('elements.athleteDetailReactivate.hidden = athlete.isActive !== false || !masterdataCanEdit;');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/api/modules/athletes/masterdata/" + type + "/" + encodeURIComponent(id) + "/reactivate"');
    expect(ULC_LINZ_APP_SCRIPT).toContain("Frühere Gruppenzuordnungen werden nicht automatisch wiederhergestellt.");
    expect(ULC_LINZ_APP_SCRIPT).toContain("if (elements.athleteInactiveCount) elements.athleteInactiveCount.textContent = \"(0)\";");
  });

  it("does not allow the client to select a different athlete for the account", () => {
    expect(ULC_LINZ_APP_HTML).not.toContain('id="athlete-user-athlete"');
    expect(ULC_LINZ_APP_SCRIPT).not.toContain(
      "athleteUserAthlete",
    );
    expect(ULC_LINZ_APP_SCRIPT).toContain(
      "Athleten-Benutzer wurde angelegt. Beim ersten Login ist ein Passwortwechsel erforderlich.",
    );
  });
});
