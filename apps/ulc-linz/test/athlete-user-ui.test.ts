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
