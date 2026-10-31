import { describe, expect, it, vi } from "vitest";
import {
  UlcLinzUserAccountService,
  UlcUserAccountError,
  type UlcUserAccountSql,
} from "../worker/user-admin-accounts";
import { ULC_USER_ADMIN_HTML, ULC_USER_ADMIN_SCRIPT } from "../worker/user-admin-ui";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ORG = "ulc-linz-preview";
const ADMIN = "org-admin-id";
const USER = "trainer-user-id";
const PASSWORD = "TemporaryPassword-2026!";

function setup(overrides: Record<string, unknown> = {}) {
  const calls: { query: string; parameters?: unknown[] }[] = [];
  const target = {
    identity_id: USER,
    username: "test.trainer",
    source_role: "trainer",
    active: true,
    banned: false,
    role: "user",
    subject_active: true,
    credential_id: "credential-1",
    disabled_at: null,
    ...overrides,
  };
  const sql: UlcUserAccountSql = {
    async unsafe() { throw new Error("Writes must be transactional"); },
    async begin<T>(
      callback: (transaction: Pick<UlcUserAccountSql, "unsafe">) => Promise<T>,
    ): Promise<T> {
      const tx: Pick<UlcUserAccountSql, "unsafe"> = {
        async unsafe(query, parameters) {
          calls.push({ query, parameters });
          if (query.includes("SELECT membership.identity_id")) return [target];
          if (query.startsWith("UPDATE account")) return [{ id: "credential-1" }];
          if (query.startsWith("UPDATE appbasis_identity_security_state")) return [{ identity_id: USER }];
          return [];
        },
      };
      return callback(tx);
    },
  };
  const hash = vi.fn(async () => "scrypt-hash-not-plaintext");
  return {
    service: new UlcLinzUserAccountService(sql, hash),
    calls, hash,
  };
}

describe("ULC org-scoped admin account actions", () => {
  it("resets only a trainer credential, forces first-login change and revokes sessions", async () => {
    const { service, calls, hash } = setup();
    await expect(service.resetTemporaryPassword(ORG, ADMIN, USER, PASSWORD))
      .resolves.toEqual({ identityId: USER, username: "test.trainer" });
    expect(hash).toHaveBeenCalledWith(PASSWORD);
    const mutation = calls.find(x => x.query.startsWith("UPDATE account"));
    expect(mutation?.parameters).toEqual(["scrypt-hash-not-plaintext", "credential-1", USER]);
    expect(calls.some(x => x.query.includes("must_change_password=true"))).toBe(true);
    expect(calls.some(x => x.query.includes("password_changed_at=NULL"))).toBe(true);
    expect(calls.some(x => x.query.includes('DELETE FROM "session"'))).toBe(true);
    expect(JSON.stringify(calls)).not.toContain(PASSWORD);
  });

  it("rejects admin targets, technical admins, disabled identities and blocked targets", async () => {
    for (const overrides of [
      { source_role: "admin" }, { role: "admin" }, { role: "user,admin" },
      { active: false }, { banned: true }, { subject_active: false },
      { disabled_at: new Date() }, { credential_id: null },
    ]) {
      const { service, calls } = setup(overrides);
      await expect(service.resetTemporaryPassword(ORG, ADMIN, USER, PASSWORD))
        .rejects.toBeInstanceOf(UlcUserAccountError);
      expect(calls.filter(x => x.query.startsWith("UPDATE"))).toHaveLength(0);
    }
  });

  it("rejects invalid passwords and attempts to reset one's own identity", async () => {
    const { service, calls, hash } = setup();
    await expect(service.resetTemporaryPassword(ORG, ADMIN, USER, "1234567"))
      .rejects.toMatchObject({ code: "INVALID" });
    await expect(service.resetTemporaryPassword(ORG, USER, USER, PASSWORD))
      .rejects.toMatchObject({ code: "INVALID" });
    expect(calls).toHaveLength(0);
    expect(hash).not.toHaveBeenCalled();
  });

  it("blocks and unblocks without changing membership; revokes all old sessions", async () => {
    const first = setup();
    await first.service.changeStatus(ORG, ADMIN, USER, "block");
    expect(first.calls.some(x => x.query.includes("banned=true"))).toBe(true);
    expect(first.calls.some(x => x.query.includes('DELETE FROM "session"'))).toBe(true);
    expect(first.calls.some(x => x.query.includes("UPDATE ulc_linz_membership"))).toBe(false);
    const second = setup({ banned: true, active: false });
    await second.service.changeStatus(ORG, ADMIN, USER, "unblock");
    expect(second.calls.some(x => x.query.includes("banned=false"))).toBe(true);
  });

  it("reactivates an inactive account only if its athlete/trainer is active, without restoring groups", async () => {
    const { service, calls } = setup({ active: false });
    await service.changeStatus(ORG, ADMIN, USER, "reactivate");
    expect(calls.some(x => x.query.includes("SET active=true, ended_at=NULL"))).toBe(true);
    expect(calls.some(x => x.query.includes("appbasis_athlete_group_membership") && x.query.startsWith("UPDATE"))).toBe(false);
    const other = setup({ active: false, subject_active: false });
    await expect(other.service.changeStatus(ORG, ADMIN, USER, "reactivate"))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("exposes only org-admin routes and mobile reset/status actions", () => {
    const source = readFileSync(fileURLToPath(new URL("../worker/index.ts", import.meta.url)), "utf8");
    expect(source).toContain("userAdminAccountsResponse(request, runtime, url)");
    expect(source).toContain("trainerIdentityAccess.assertAdminAccess(current)");
    expect(source).toContain('mode === "password-reset"');
    expect(source).toContain("runtime.userAdminAccounts.changeStatus");
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-reset-dialog"');
    expect(ULC_USER_ADMIN_HTML).toContain('id="user-admin-reset-password"');
    expect(ULC_USER_ADMIN_SCRIPT).toContain("shareUserAdminInvitation");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("saveUserAdminPasswordReset(event)");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("changeUserAdminStatus(user, action)");
    expect(ULC_USER_ADMIN_SCRIPT).toContain("userAdminResetIdentityId = null");
  });
});
