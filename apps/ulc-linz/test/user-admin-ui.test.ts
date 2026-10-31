import { describe, expect, it } from "vitest";
import { ULC_LINZ_APP_HTML, ULC_LINZ_APP_SCRIPT } from "../worker/ui";

describe("ULC administration onboarding UI", () => {
  it("shows a mobile admin-only area linked from navigation", () => {
    expect(ULC_LINZ_APP_HTML).toContain('data-nav-view="users"');
    expect(ULC_LINZ_APP_HTML).toContain('id="user-admin-dashboard" hidden');
    expect(ULC_LINZ_APP_HTML).toContain('id="user-admin-form"');
    expect(ULC_LINZ_APP_HTML).toContain('id="user-admin-copy"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('userAdminDashboard.hidden = !userAdminReady');
    expect(ULC_LINZ_APP_SCRIPT).toContain('section === "users" && userAdminReady');
  });

  it("provisions only trainer and athlete identities through existing protected APIs", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('requestJson("/api/admin/users")');
    expect(ULC_LINZ_APP_SCRIPT).toContain('"/api/admin/trainer-users" : "/api/admin/athlete-users"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('role === "trainer"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('role === "athlete"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('requestJson("/api/modules/athletes/masterdata")');
    expect(ULC_LINZ_APP_SCRIPT).not.toContain('POST /api/admin/users');
  });

  it("edits module rights only for active trainer users through existing admin session", () => {
    expect(ULC_LINZ_APP_HTML).toContain('id="user-admin-access-editor"');
    expect(ULC_LINZ_APP_HTML).toContain('id="user-admin-access-form"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('user.sourceRole === "trainer" && user.active && !user.blocked');
    expect(ULC_LINZ_APP_SCRIPT).toContain('encodeURIComponent(snapshot.userId) + "/access"');
    expect(ULC_LINZ_APP_SCRIPT).toContain('expectedGrants: snapshot.expectedGrants');
    expect(ULC_LINZ_APP_SCRIPT).toContain('expectedRevokes: snapshot.expectedRevokes');
    expect(ULC_LINZ_APP_SCRIPT).toContain('resetUserAdminSessionState();');
  });

  it("clears temporary invitation text on logout and never sends emails automatically", () => {
    expect(ULC_LINZ_APP_SCRIPT).toContain('resetUserAdminSessionState();');
    expect(ULC_LINZ_APP_SCRIPT).toContain('userAdminInviteText = ""');
    expect(ULC_LINZ_APP_SCRIPT).toContain('navigator.clipboard.writeText(userAdminInviteText)');
    expect(ULC_LINZ_APP_HTML).toContain("kein automatischer Versand");
  });
});
