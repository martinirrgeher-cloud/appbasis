import { describe, expect, it, vi } from "vitest";

import {
  ULC_USER_ADMIN_HTML,
  ULC_USER_ADMIN_CSS,
  ULC_USER_ADMIN_SCRIPT,
} from "../worker/user-admin-ui";

type ShareResult = "shared" | "copied" | "cancelled" | "unavailable";

function shareWith(navigator: object) {
  const start = ULC_USER_ADMIN_SCRIPT.indexOf("async function shareUserAdminText(");
  const end = ULC_USER_ADMIN_SCRIPT.indexOf("async function shareUserAdminInvitation()", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const functionSource = ULC_USER_ADMIN_SCRIPT.slice(start, end);
  return new Function("navigator", functionSource + "\nreturn shareUserAdminText;")(navigator) as (
    text: string, title: string
  ) => Promise<ShareResult>;
}

function renderedTargetOptions(
  role: "trainer" | "athlete",
  accounts: readonly Record<string, unknown>[],
  targets: Record<string, unknown>[],
) {
  const start = ULC_USER_ADMIN_SCRIPT.indexOf("function renderUserAdminTargets() {");
  const end = ULC_USER_ADMIN_SCRIPT.indexOf("\nfunction updateUserAdminControls()", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const source = ULC_USER_ADMIN_SCRIPT.slice(start, end);
  const select = {
    value: "",
    options: [] as { value: string; textContent: string; disabled: boolean }[],
    replaceChildren() { this.options = []; },
    append(option: { value: string; textContent: string; disabled: boolean }) {
      this.options.push(option);
    },
  };
  const render = new Function(
    "document", "userAdminElements", "userAdminUsers", "userAdminTargets",
    source + "\nreturn renderUserAdminTargets;",
  )(
    { createElement: () => ({ value: "", textContent: "", disabled: false }) },
    { target: select, role: { value: role } },
    accounts,
    role === "trainer" ? { trainers: targets, athletes: [] } : { trainers: [], athletes: targets },
  ) as () => void;
  render();
  return select.options;
}

describe("ULC user invitations and mobile account search", () => {
  it("offers mobile share plus clipboard fallback, with a clear security notice", () => {
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-share"');
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-copy"');
    expect(ULC_USER_ADMIN_HTML).toContain("temporäre Passwort");
    expect(ULC_USER_ADMIN_HTML).toContain("sicheren Kanal");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("userAdminInviteText =");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("clearUserAdminInvitation();");
    expect(ULC_USER_ADMIN_SCRIPT).toContain(
      'userAdminElements.share?.addEventListener("click", () => void shareUserAdminInvitation())',
    );
  });

  it("sends the invitation through the Android/native share interface", async () => {
    const share = vi.fn(async () => {});
    const clipboard = { writeText: vi.fn(async () => {}) };
    const fn = shareWith({ share, clipboard });
    await expect(fn("Temporäres Passwort: secret", "ULC Linz Testzugang"))
      .resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "ULC Linz Testzugang",
      text: "Temporäres Passwort: secret",
    });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("keeps the invitation on user cancellation without copying credentials", async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    const fn = shareWith({
      share: vi.fn(async () => { throw { name: "AbortError" }; }),
      clipboard,
    });
    await expect(fn("credential text", "Test")).resolves.toBe("cancelled");
    expect(clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard if sharing is unsupported or denied", async () => {
    const clipboard = { writeText: vi.fn(async () => {}) };
    await expect(shareWith({ clipboard })("invitation", "Test")).resolves.toBe("copied");
    expect(clipboard.writeText).toHaveBeenCalledWith("invitation");
    const denied = shareWith({
      share: vi.fn(async () => { throw { name: "NotAllowedError" }; }),
      clipboard,
    });
    await expect(denied("invitation again", "Test")).resolves.toBe("copied");
    expect(clipboard.writeText).toHaveBeenCalledWith("invitation again");
    await expect(shareWith({})("invitation", "Test")).resolves.toBe("unavailable");
  });

  it("shares only the login link for existing accounts, never their password", () => {
    const start = ULC_USER_ADMIN_SCRIPT.indexOf("async function shareExistingUserAdminLogin(");
    const end = ULC_USER_ADMIN_SCRIPT.indexOf("async function copyUserAdminInvitation()", start);
    expect(start).toBeGreaterThanOrEqual(0);
    const source = ULC_USER_ADMIN_SCRIPT.slice(start, end);
    expect(source).toContain("window.location.origin");
    expect(source).toContain("Benutzername:");
    expect(source).toContain("bestehenden Passwort");
    expect(source).not.toContain("temporaryPassword");
    expect(source).not.toContain("userAdminInviteText");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("const canLink = user.active && !user.blocked && !incomplete && !retired");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("shareExistingUserAdminLogin(user.username)");
  });

  it("blocks duplicate onboarding for already linked active, blocked, and inactive accounts", () => {
    const subjects = ["trainer-active", "trainer-blocked", "trainer-inactive", "trainer-new"];
    const accounts = [
      { identityId: "u1", username: "trainer.aktiv", sourceRole: "trainer",
        subjectId: subjects[0], active: true, blocked: false },
      { identityId: "u2", username: "trainer.gesperrt", sourceRole: "trainer",
        subjectId: subjects[1], active: true, blocked: true },
      { identityId: "u3", username: "trainer.inaktiv", sourceRole: "trainer",
        subjectId: subjects[2], active: false, blocked: false },
      // A different role must not erroneously block a trainer target.
      { identityId: "u4", username: "athlete.other", sourceRole: "athlete",
        subjectId: subjects[3], active: true, blocked: false },
    ];
    const targets = subjects.map((id) => ({ id, firstName: "Demo", lastName: id, isActive: true }));
    const options = renderedTargetOptions("trainer", accounts, targets);
    expect(options).toHaveLength(5); // Includes the empty placeholder.
    expect(options[1]).toMatchObject({ value: subjects[0], disabled: true });
    expect(options[1]!.textContent).toContain("Konto aktiv");
    expect(options[2]).toMatchObject({ value: subjects[1], disabled: true });
    expect(options[2]!.textContent).toContain("Konto gesperrt");
    expect(options[3]).toMatchObject({ value: subjects[2], disabled: true });
    expect(options[3]!.textContent).toContain("Konto inaktiv");
    expect(options[4]).toMatchObject({ value: subjects[3], disabled: false });
    expect(options[2]!.textContent).toContain("in der Benutzerliste verwalten");
    expect(ULC_USER_ADMIN_HTML).toContain("nicht erneut anlegen");
  });

  it("hides inactive athletes and prevents a second athlete account for the same person", () => {
    const options = renderedTargetOptions("athlete", [
      { username: "athlete.one", sourceRole: "athlete",
        subjectId: "athlete-linked", active: false, blocked: true },
    ], [
      { id: "athlete-linked", firstName: "Test", lastName: "Athlet", isActive: true },
      { id: "athlete-archived", firstName: "Inaktiv", lastName: "Athlet", isActive: false },
      { id: "athlete-available", firstName: "Neu", lastName: "Athlet", isActive: true },
    ]);
    expect(options.map(option => option.value)).toEqual(["", "athlete-linked", "athlete-available"]);
    expect(options[1]).toMatchObject({ disabled: true });
    expect(options[1]!.textContent).toContain("gesperrt");
    expect(options[2]).toMatchObject({ disabled: false });
  });

  it("filters user records locally and clears the filter on session reset", () => {
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-search"');
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-status-filter"');
    expect(ULC_USER_ADMIN_SCRIPT).toContain('userAdminElements.search?.addEventListener("input", renderUserAdminList)');
    expect(ULC_USER_ADMIN_SCRIPT).toContain('userAdminElements.statusFilter?.addEventListener("change", renderUserAdminList)');
    expect(ULC_USER_ADMIN_SCRIPT).toContain("const filtered = userAdminUsers.filter((user) =>");
    expect(ULC_USER_ADMIN_SCRIPT).toContain('if (userAdminElements.search) userAdminElements.search.value = ""');
    expect(ULC_USER_ADMIN_SCRIPT).toContain('if (userAdminElements.statusFilter) userAdminElements.statusFilter.value = "all"');
    expect(ULC_USER_ADMIN_CSS).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
